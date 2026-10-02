#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractsDir = join(ROOT, 'contracts');
const webDir = join(ROOT, 'web');

const require = createRequire(import.meta.url);
const e = require('./load-env.cjs');

const RPC = `http://127.0.0.1:${e.ports.rpc}`;
const IPFS = `http://127.0.0.1:${e.ports.ipfsApi}`;

const procs = [];

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

  const fs = require('node:fs');

  const result = candidates.find((file) => fs.existsSync(file));

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

  // Make the Node runtime that started this script win
  // for all child processes.
  PATH:
    `${dirname(process.execPath)};` +
    `${process.env.PATH ?? ''}`
};

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
  const args = [
    npmCli,
    'run',
    script
  ];

  if (waitForExit) {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = run(name, process.execPath, args, { cwd });

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

  return run(name, process.execPath, args, { cwd });
}

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

async function wait(label, probe) {
  for (let i = 0; i < 60; i++) {
    if (await probe()) {
      return;
    }

    await sleep(500);
  }

  throw new Error(`${label} did not start`);
}

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

console.log(`[dev] Node: ${process.execPath}`);
console.log(`[dev] npm: ${npmCli}`);

// Write application configuration.
await new Promise((resolvePromise, rejectPromise) => {
  const child = run(
    'config',
    process.execPath,
    [join(ROOT, 'tools', 'write-config.mjs')],
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

// Start Hardhat through npm.
npmRun('chain', contractsDir, 'node');

await wait('chain', () =>
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

// Start mock IPFS if a real daemon isn't already running.
if (
  !(await up(`${IPFS}/api/v0/version`, {
    method: 'POST'
  }))
) {
  run(
    'ipfs',
    process.execPath,
    [join(ROOT, 'tools', 'ipfs-mock.mjs')],
    { cwd: ROOT }
  );

  await wait('ipfs', () =>
    up(`${IPFS}/api/v0/version`, {
      method: 'POST'
    })
  );
} else {
  console.log(
    `[dev] Using IPFS daemon on port ${e.ports.ipfsApi}`
  );
}

// Deploy through npm.
await npmRun(
  'deploy',
  contractsDir,
  'deploy',
  true
);

// Seed through npm.
if (process.env.SEED !== '0') {
  await npmRun(
    'seed',
    contractsDir,
    'seed',
    true
  );
}

// Start frontend through npm.
npmRun('web', webDir, 'start');

console.log(
  '\nSourcify is starting → ' +
  'Issuer: http://127.0.0.1:4200/issuer   ' +
  'Verifier: http://127.0.0.1:4200/verify\n'
);