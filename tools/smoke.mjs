#!/usr/bin/env node

// Headless end-to-end Sourcify environment check.
//
// Usage:
//   node tools/smoke.mjs
//   node tools/smoke.mjs --mode development
//   node tools/smoke.mjs --mode persistent
//
// Development mode:
//   starts Hardhat + IPFS mock, deploys, seeds, verifies, then cleans up.
//
// Persistent mode:
//   assumes Geth + Kubo are already running, deploys/reuses, seeds,
//   verifies, and leaves the persistent infrastructure untouched.

import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const envConfig = require('./load-env.cjs');

const {
  JsonRpcProvider,
  Contract,
  keccak256,
  toUtf8Bytes,
} = require(
  join(
    envConfig.root,
    'contracts/node_modules/ethers'
  )
);

const ROOT = envConfig.root;
const contractsDir = join(ROOT, 'contracts');

function getMode() {
  const args = process.argv.slice(2);
  const index = args.indexOf('--mode');

  if (index === -1) {
    return 'development';
  }

  const mode = args[index + 1];

  if (!mode) {
    throw new Error(
      'Missing value for --mode. Use "development" or "persistent".'
    );
  }

  if (
    mode !== 'development' &&
    mode !== 'persistent'
  ) {
    throw new Error(
      `Invalid mode "${mode}". Use "development" or "persistent".`
    );
  }

  return mode;
}

const mode = getMode();

const RPC =
  mode === 'development'
    ? envConfig.rpcUrl('development')
    : envConfig.rpcUrl('persistent');

const IPFS =
  `http://127.0.0.1:${envConfig.ports.ipfsApi}`;

const GATEWAY =
  `http://127.0.0.1:${envConfig.ports.gateway}/ipfs`;

const deploymentFile =
  mode === 'development'
    ? 'development.json'
    : 'persistent.json';

const deploymentPath = join(
  ROOT,
  'web/public/deployment',
  deploymentFile
);

const children = [];

function getNpmCli() {
  if (process.env.npm_execpath) {
    return process.env.npm_execpath;
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
    ),
  ];

  const result = candidates.find(
    (file) => {
      try {
        return require('node:fs').existsSync(file);
      } catch {
        return false;
      }
    }
  );

  if (!result) {
    throw new Error(
      `Could not locate npm CLI for Node runtime:\n${process.execPath}`
    );
  }

  return result;
}

const npmCli = getNpmCli();

const childEnv = {
  ...process.env,
  SOURCIFY_MODE: mode,
  PATH:
    `${dirname(process.execPath)};` +
    `${process.env.PATH ?? ''}`,
};

function spawnProcess(
  name,
  command,
  args,
  options = {}
) {
  const child = spawn(
    command,
    args,
    {
      cwd: ROOT,
      env: childEnv,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }
  );

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
    console.error(
      `[${name}] ${error.message}`
    );
  });

  children.push(child);

  return child;
}

function npmRun(
  name,
  cwd,
  script,
  waitForExit = false
) {
  const args = [
    npmCli,
    'run',
    script,
  ];

  if (!waitForExit) {
    return spawnProcess(
      name,
      process.execPath,
      args,
      { cwd }
    );
  }

  return new Promise(
    (resolvePromise, rejectPromise) => {
      const child = spawnProcess(
        name,
        process.execPath,
        args,
        { cwd }
      );

      child.once(
        'exit',
        (code) => {
          if (code === 0) {
            resolvePromise();
          } else {
            rejectPromise(
              new Error(
                `${name} exited with code ${code}`
              )
            );
          }
        }
      );
    }
  );
}

async function waitFor(label, probe) {
  for (let i = 0; i < 80; i++) {
    try {
      if (await probe()) {
        return;
      }
    } catch {
      // Continue waiting.
    }

    await sleep(500);
  }

  throw new Error(
    `${label} did not become ready`
  );
}

async function rpcReady() {
  const response = await fetch(
    RPC,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: [],
      }),
    }
  );

  return response.ok;
}

async function ipfsReady() {
  const response = await fetch(
    `${IPFS}/api/v0/version`,
    {
      method: 'POST',
    }
  );

  return response.ok;
}

async function killProcessTree(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      execFile(
        'taskkill',
        [
          '/pid',
          String(child.pid),
          '/t',
          '/f',
        ],
        () => resolve()
      );
    });

    return;
  }

  try {
    child.kill('SIGTERM');
  } catch {
    // Process may already be gone.
  }
}

async function stopChildren() {
  const running = children.filter(
    (child) =>
      child &&
      child.exitCode === null
  );

  if (running.length === 0) {
    return;
  }

  await Promise.all(
    running.map((child) =>
      killProcessTree(child)
    )
  );

  // Wait briefly for child exit events / sockets to close.
  await Promise.all(
    running.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null) {
            resolve();
            return;
          }

          const timer = setTimeout(
            resolve,
            1500
          );

          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });

          child.once('error', () => {
            clearTimeout(timer);
            resolve();
          });
        })
    )
  );
}

function expectedDemo() {
  return [
    {
      name: 'Amara Okafor',
      program:
        'MSc Data Science · Distinction',
      date: '2026-09-18',
      expectedStatus: 1,
      seed: 0,
    },
    {
      name: 'Luis Moreno',
      program:
        'Research Fellowship · Applied Cryptography',
      date: '2026-09-18',
      expectedStatus: 1,
      seed: 1,
    },
    {
      name: 'Marcus Reed',
      program:
        'Laboratory Safety Certification',
      date: '2026-09-17',
      expectedStatus: 2,
      seed: 2,
    },
  ];
}

function docHashFor(entry) {
  return keccak256(
    toUtf8Bytes(
      `DEMO CERTIFICATE\n` +
      `${entry.name}\n` +
      `${entry.program}\n` +
      `${entry.date}\n` +
      `seed-${entry.seed}`
    )
  );
}

function readDeployment() {
  return JSON.parse(
    readFileSync(
      deploymentPath,
      'utf8'
    )
  );
}

async function writeConfig() {
  await new Promise(
    (resolvePromise, rejectPromise) => {
      const child = spawnProcess(
        'config',
        process.execPath,
        [
          join(
            ROOT,
            'tools',
            'write-config.mjs'
          ),
          '--mode',
          mode,
        ],
        {
          cwd: ROOT,
        }
      );

      child.once(
        'exit',
        (code) => {
          if (code === 0) {
            resolvePromise();
          } else {
            rejectPromise(
              new Error(
                `write-config exited with code ${code}`
              )
            );
          }
        }
      );
    }
  );
}

async function main() {

  await writeConfig();

  console.log(
    `Sourcify smoke test (${mode})`
  );

  console.log(
    `RPC: ${RPC}`
  );

  if (mode === 'development') {
    console.log(
      '\nStarting development Hardhat node...'
    );

    npmRun(
      'chain',
      contractsDir,
      'node'
    );

    await waitFor(
      'development RPC',
      rpcReady
    );

    console.log(
      'Development RPC ready.'
    );

    console.log(
      'Starting development IPFS mock...'
    );

    spawnProcess(
      'ipfs',
      process.execPath,
      [
        join(
          ROOT,
          'tools',
          'ipfs-mock.mjs'
        ),
      ],
      { cwd: ROOT }
    );

    await waitFor(
      'development IPFS',
      ipfsReady
    );
  } else {
    console.log(
      '\nUsing existing persistent services...'
    );

    await waitFor(
      'persistent Geth',
      rpcReady
    );

    await waitFor(
      'persistent IPFS',
      ipfsReady
    );
  }

  // // Generate config for this runtime.
  // await npmRun(
  //   'config',
  //   ROOT,
  //   // write-config is a root-level tool, so invoke Node directly.
  //   // This placeholder is not used through npm.
  //   'noop',
  //   false
  // );

  // Deploy/Seed Verification
  console.log('\nDeploying/reusing registry...');

  await npmRun(
    'deploy',
    contractsDir,
    mode === 'persistent'
      ? 'deploy:persistent'
      : 'deploy',
    true
  );
  
  console.log('\nSeeding demo credentials...');
  
  await npmRun(
    'seed',
    contractsDir,
    mode === 'persistent'
      ? 'seed:persistent'
      : 'seed',
    true
  );
  
  const deployment = readDeployment();
  
  const provider =
    new JsonRpcProvider(RPC);
  
  const registry =
    new Contract(
      deployment.address,
      deployment.abi,
      provider
    );
  
  const demo = expectedDemo();
  const rows = [];
  
  for (const entry of demo) {
    const hash = docHashFor(entry);
  
    const [
      status,
      certificate,
    ] = await registry.verify(hash);
  
    if (
      Number(status) !==
      entry.expectedStatus
    ) {
      throw new Error(
        `${entry.name}: expected status ` +
        `${entry.expectedStatus}, got ${status}`
      );
    }
  
    const response = await fetch(
      `${GATEWAY}/${certificate.metadataCID}`
    );
  
    if (!response.ok) {
      throw new Error(
        `${entry.name}: failed to fetch IPFS metadata ` +
        `(${response.status})`
      );
    }
  
    const manifest =
      await response.json();
  
    if (manifest.docHash !== hash) {
      throw new Error(
        `${entry.name}: metadata/docHash mismatch`
      );
    }
  
    rows.push([
      hash,
      certificate.metadataCID,
      Number(status),
    ]);
  
    console.log(
      `  ok    ${entry.name} → status ${status}`
    );
  }
  
  const fingerprint =
    createHash('sha256')
      .update(
        JSON.stringify([
          deployment.address,
          rows,
        ])
      )
      .digest('hex')
      .slice(0, 16);
  
  console.log(
    `\nPASS  ${mode} smoke test`
  );
  
  console.log(
    `PASS  fingerprint ${fingerprint}`
  );
  
  await stopChildren();
}

main().catch(async (error) => {
  console.error(
    `\nFAIL  ${
      error instanceof Error
        ? error.message
        : String(error)
    }`
  );

  await stopChildren();
  process.exit(1);
});