#!/usr/bin/env node

// Generates web/public/config.json for the selected local runtime.
// Usage:
//   node tools/write-config.mjs --mode development
//   node tools/write-config.mjs --mode persistent
//
// SOURCIFY_MODE may also be used by child processes such as Angular's
// npm "prestart" hook. Command-line --mode takes precedence.

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const e = createRequire(import.meta.url)('./load-env.cjs');

function getMode() {
  const args = process.argv.slice(2);
  const modeIndex = args.indexOf('--mode');

  if (modeIndex !== -1) {
    const mode = args[modeIndex + 1];

    if (!mode) {
      throw new Error(
        'Missing value for --mode. Use "development" or "persistent".'
      );
    }

    return mode;
  }

  return process.env.SOURCIFY_MODE || 'development';
}

const mode = getMode();

if (mode !== 'development' && mode !== 'persistent') {
  throw new Error(
    `Invalid Sourcify mode "${mode}". Use "development" or "persistent".`
  );
}

const rpcPort =
  mode === 'development'
    ? e.ports.development_rpc
    : e.ports.persistent_rpc;

const cfg = {
  mode,
  rpcUrl: `http://127.0.0.1:${rpcPort}`,
  chainId: e.chainId,
  chainName:
    mode === 'development'
      ? 'Local Hardhat'
      : 'Local Persistent Geth',
  ipfsApi: `http://127.0.0.1:${e.ports.ipfsApi}`,
  ipfsGateway: `http://127.0.0.1:${e.ports.gateway}/ipfs`,
  serviceTimeoutMs: 3500,
  healthIntervalMs: 10000,
};

const outputDir = join(e.root, 'web', 'public');
const outputFile = join(outputDir, 'config.json');

mkdirSync(outputDir, { recursive: true });

writeFileSync(
  outputFile,
  JSON.stringify(cfg, null, 2) + '\n'
);

console.log(
  `[config] mode=${mode} ` +
  `RPC=:${rpcPort}, ` +
  `IPFS=:${e.ports.ipfsApi}/:${e.ports.gateway}, ` +
  `chain=${e.chainId}`
);