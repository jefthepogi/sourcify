#!/usr/bin/env node

import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractsDir = join(ROOT, 'contracts');
const webDir = join(ROOT, 'web');

const require = createRequire(import.meta.url);
const e = require('./load-env.cjs');

const RPC = `${e.rpcUrl("persistent")}`;
const IPFS = `http://127.0.0.1:${e.ports.ipfsApi}`;

const procs = [];

/* ------------------------------------------------------- */
/* npm resolution: same approach as working dev.mjs       */
/* ------------------------------------------------------- */

function getNpmCli() {
  const npmExecPath = process.env.npm_execpath;

  if (npmExecPath) {
    return npmExecPath;
  }

  const candidates = [
    join(
      dirname(process.execPath),
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js'
    ),
    join(
      dirname(process.execPath),
      '..',
      'lib',
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js'
    )
  ];

  const result = candidates.find((file) => existsSync(file));

  if (!result) {
    throw new Error(
      `Could not locate npm CLI for Node runtime:\n${process.execPath}`
    );
  }

  return result;
}

const npmCli = getNpmCli();

const env = {
  ...process.env,
  SOURCIFY_MODE: 'persistent',
  PATH:
    `${dirname(process.execPath)};` +
    `${process.env.PATH ?? ''}`
};

/* ------------------------------------------------------- */
/* process helpers                                          */
/* ------------------------------------------------------- */

function run(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });

  child.stdout.on('data', (data) => {
    for (const line of data.toString().split(/\r?\n/)) {
      if (line.trim()) {
        console.log(`[${name}] ${line}`);
      }
    }
  });

  child.stderr.on('data', (data) => {
    for (const line of data.toString().split(/\r?\n/)) {
      if (line.trim()) {
        console.error(`[${name}] ${line}`);
      }
    }
  });

  child.on('error', (error) => {
    console.error(`[${name}] ${error.message}`);
  });

  procs.push(child);
  return child;
}

function npmRun(name, cwd, script, waitForExit = false) {
  const childArgs = [npmCli, 'run', script];

  if (waitForExit) {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = run(
        name,
        process.execPath,
        childArgs,
        { cwd }
      );

      child.once('exit', (code) => {
        if (code === 0) {
          resolvePromise();
        } else {
          rejectPromise(
            new Error(`${name} exited with code ${code}`)
          );
        }
      });
    });
  }

  return run(
    name,
    process.execPath,
    childArgs,
    { cwd }
  );
}

/* ------------------------------------------------------- */
/* HTTP health checks                                       */
/* ------------------------------------------------------- */

async function up(url, init = {}) {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(800)
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function wait(label, probe, maxRetries = 60) {
  for (let i = 0; i < maxRetries; i++) {
    if (await probe()) {
      return;
    }

    process.stdout.write('.');
    await sleep(500);
  }

  throw new Error(
    `Timeout: ${label} did not respond after ${maxRetries * 0.5}s.`
  );
}

/* ------------------------------------------------------- */
/* shutdown                                                 */
/* ------------------------------------------------------- */

function shutdown() {
  for (const child of procs) {
    if (!child.killed) {
      child.kill();
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

/* ------------------------------------------------------- */
/* startup                                                   */
/* ------------------------------------------------------- */

console.log(`[dev:persistent] Node: ${process.execPath}`);
console.log(`[dev:persistent] npm: ${npmCli}`);
console.log(`[dev:persistent] RPC: ${RPC}`);
console.log(`[dev:persistent] IPFS: ${IPFS}`);

/* 1. Regenerate configuration */
await new Promise((resolvePromise, rejectPromise) => {
  const child = run(
    'config',
    process.execPath,
    [
      join(ROOT, 'tools', 'write-config.mjs'),
      '--mode',
      'persistent'
    ],
    { cwd: ROOT }
  );

  child.once('exit', (code) => {
    if (code === 0) {
      resolvePromise();
    } else {
      rejectPromise(
        new Error(`config exited with code ${code}`)
      );
    }
  });
});

/* 2. Start persistent Docker services */
console.log('\n🐳 Starting persistent Docker services...');

const composeArgs =
  process.platform === 'win32'
    ? [
        'docker',
        'compose',
        '-f',
        'docker-compose.dev.yml',
        'up',
        '-d'
      ]
    : [
        'compose',
        '-f',
        'docker-compose.dev.yml',
        'up',
        '-d'
      ];

if (process.platform === 'win32') {
  execFileSync(
    'wsl',
    composeArgs,
    {
      cwd: ROOT,
      stdio: 'inherit'
    }
  );
} else {
  execFileSync(
    'docker',
    composeArgs.slice(1),
    {
      cwd: ROOT,
      stdio: 'inherit'
    }
  );
}

/* 3. Wait for Geth */
console.log(`\n Waiting for Geth at ${RPC}...`);

await wait(
  'Geth RPC',
  () =>
    up(RPC, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: []
      })
    })
);

console.log('\n✅ Geth RPC is live');

/* 4. Wait for Kubo */
console.log(`\n📦 Waiting for IPFS at ${IPFS}/api/v0/version...`);

await wait(
  'IPFS API',
  () =>
    up(`${IPFS}/api/v0/version`, {
      method: 'POST'
    })
);

console.log('\n✅ IPFS API is live');

/* 5. Deploy */
console.log('\n📜 Deploying SourcifyRegistry...');

await npmRun(
  'deploy',
  contractsDir,
  'deploy:persistent',
  true
);

/* 6. Seed */
if (process.env.SEED !== '0') {
  console.log('\n🌱 Seeding demo credentials...');

  await npmRun(
    'seed',
    contractsDir,
    'seed:persistent',
    true
  );
}

/* 7. Frontend */
console.log('\n🚀 Starting web client...');

npmRun(
  'web',
  webDir,
  'start'
);

console.log(
  `\nSourcify persistent environment is running → ` +
  `Issuer: http://127.0.0.1:${e.ports.web}/issuer   ` +
  `Verifier: http://127.0.0.1:${e.ports.web}/verify\n`
);