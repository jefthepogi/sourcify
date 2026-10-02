#!/usr/bin/env node
// Generates web/public/config.json (git-ignored) from .env so the browser app and the CLI tools always agree.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const e = createRequire(import.meta.url)('./load-env.cjs');
const cfg = {
  rpcUrl: `http://127.0.0.1:${e.ports.rpc}`,
  chainId: e.chainId,
  chainName: 'Local Hardhat',
  ipfsApi: `http://127.0.0.1:${e.ports.ipfsApi}`,
  ipfsGateway: `http://127.0.0.1:${e.ports.gateway}/ipfs`,
  serviceTimeoutMs: 3500,
  healthIntervalMs: 10000,
};
mkdirSync(join(e.root, 'web/public'), { recursive: true });
writeFileSync(join(e.root, 'web/public/config.json'), JSON.stringify(cfg, null, 2) + '\n');
console.log(`[config] web/public/config.json → RPC :${e.ports.rpc}, IPFS :${e.ports.ipfsApi}/:${e.ports.gateway}, chain ${e.chainId}`);
