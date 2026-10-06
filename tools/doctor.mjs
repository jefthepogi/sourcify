#!/usr/bin/env node

// Preflight checks for the Sourcify local development environments.
//
// Usage:
//   node tools/doctor.mjs
//   node tools/doctor.mjs --mode development
//   node tools/doctor.mjs --mode persistent

import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const env = createRequire(import.meta.url)('./load-env.cjs');

const preInstall = process.argv.includes('--pre-install');

function getMode() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--mode');

  if (i === -1) {
    return 'all';
  }

  const mode = args[i + 1];

  if (!mode) {
    throw new Error(
      'Missing value for --mode. Use "development" or "persistent".'
    );
  }

  if (!['development', 'persistent', 'all'].includes(mode)) {
    throw new Error(
      `Invalid mode "${mode}". Use "development", "persistent", or "all".`
    );
  }

  return mode;
}

const mode = getMode();

let failed = false;

const ok = (message) => {
  console.log(`  ok    ${message}`);
};

const warn = (message) => {
  console.log(`  warn  ${message}`);
};

const bad = (message) => {
  failed = true;
  console.log(`  FAIL  ${message}`);
};

console.log('Sourcify environment check');
console.log(`Mode: ${mode}`);

const [major] = process.versions.node.split('.').map(Number);

if (major === 24) {
  ok(`Node ${process.versions.node} (required 24.x)`);
} else {
  bad(
    `Node ${process.versions.node}: need Node 24.x. ` +
    'Activate the Sourcify project environment.'
  );
}

try {
  const npmMajor = Number(
    execSync('npm -v').toString().trim().split('.')[0]
  );

  npmMajor >= 10
    ? ok(`npm ${npmMajor}.x`)
    : bad('npm >= 10 required');
} catch {
  bad('npm not found');
}

for (const directory of ['contracts', 'web']) {
  const lockFile = join(
    env.root,
    directory,
    'package-lock.json'
  );

  existsSync(lockFile)
    ? ok(`${directory}/package-lock.json present`)
    : bad(`${directory}/package-lock.json missing`);
}

for (const directory of ['contracts', 'web']) {
  const nodeModules = join(
    env.root,
    directory,
    'node_modules'
  );

  if (existsSync(nodeModules)) {
    ok(`${directory} dependencies installed`);
  } else if (preInstall) {
    ok(`${directory} dependencies will be installed next`);
  } else {
    warn(
      `${directory} dependencies not installed — ` +
      'run "npm run setup"'
    );
  }
}

const free = (port) =>
  new Promise((resolve) => {
    const server = createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, '127.0.0.1');
  });

async function checkPort(name, port) {
  if (await free(port)) {
    ok(`port ${port} free (${name})`);
  } else {
    warn(`port ${port} is in use (${name})`);
  }
}

if (mode === 'development' || mode === 'all') {
  await checkPort(
    'development RPC',
    env.ports.development_rpc
  );
}

if (mode === 'persistent' || mode === 'all') {
  await checkPort(
    'persistent RPC',
    env.ports.persistent_rpc
  );
}

await checkPort(
  'IPFS API',
  env.ports.ipfsApi
);

await checkPort(
  'IPFS gateway',
  env.ports.gateway
);

await checkPort(
  'web dev server',
  env.ports.web
);

// Docker is only required for persistent mode.
// In development mode the local IPFS mock is sufficient.
if (mode === 'persistent' || mode === 'all') {
  let dockerAvailable = false;

  try {
    execSync('docker --version', {
      stdio: 'ignore'
    });

    dockerAvailable = true;
  } catch {
    // Windows + WSL2 Docker Engine.
    try {
      execSync('wsl docker --version', {
        stdio: 'ignore'
      });

      dockerAvailable = true;
    } catch {
      // Leave false.
    }
  }

  dockerAvailable
    ? ok('Docker available')
    : bad('Docker is required for persistent mode');
} else {
  warn(
    'Docker check skipped — development mode uses the local IPFS mock'
  );
}

console.log(
  failed
    ? '\nBlocking problems found.'
    : '\nReady.'
);

process.exit(failed ? 1 : 0);