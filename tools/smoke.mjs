#!/usr/bin/env node
// Headless end-to-end check of the environment: chain → deploy → IPFS → seed → read everything back.
// Prints a fingerprint of the deterministic outputs; two runs on any machine must print the same value.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const e = require('./load-env.cjs');
const { JsonRpcProvider, Contract } = require(join(e.root, 'contracts/node_modules/ethers'));
const RPC = `http://127.0.0.1:${e.ports.rpc}`, IPFS = `http://127.0.0.1:${e.ports.ipfsApi}`;
const EXPECTED_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'; // hardhat account #0, nonce 0
const kids = [];
const quiet = process.env.SMOKE_VERBOSE ? 'inherit' : 'ignore';
const spawnK = (cmd, args, opts = {}) => { const p = spawn(cmd, args, { stdio: ['ignore', quiet, quiet], shell: process.platform === 'win32', ...opts }); kids.push(p); return p; };
const step = (label, fn) => fn().then((r) => { console.log(`  ok    ${label}`); return r; });
const once = (cmd, args, opts) => new Promise((res, rej) => spawnK(cmd, args, opts).on('exit', (c) => (c === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exited ${c}`)))));
const wait = async (label, probe) => { for (let i = 0; i < 80; i++) { try { if (await probe()) return; } catch { /* retry */ } await sleep(500); } throw new Error(`${label} did not start`); };
const stop = () => kids.forEach((k) => k.kill());
process.on('SIGINT', () => { stop(); process.exit(130); });

let code = 0;
try {
  console.log('Sourcify smoke test');
  await once('node', ['tools/write-config.mjs']);
  spawnK('node', ['tools/hardhat-node.cjs']);
  await step('chain started', () => wait('chain', async () => (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' })).ok));
  spawnK('node', ['tools/ipfs-mock.mjs']);
  await step('IPFS (mock) started', () => wait('ipfs', async () => (await fetch(`${IPFS}/api/v0/version`, { method: 'POST' })).ok));
  await step('contract deployed', () => once('npm', ['--prefix', 'contracts', 'run', 'deploy']));
  await step('demo data seeded', () => once('npm', ['--prefix', 'contracts', 'run', 'seed']));

  const dep = JSON.parse(readFileSync(join(e.root, 'web/public/deployment/deployment.json'), 'utf8'));
  if (dep.address !== EXPECTED_ADDRESS) throw new Error(`deployment address ${dep.address} differs from the deterministic ${EXPECTED_ADDRESS}`);
  const provider = new JsonRpcProvider(RPC);
  const registry = new Contract(dep.address, dep.abi, provider);
  const logs = await registry.queryFilter(registry.filters.CertificateIssued());
  if (logs.length !== 3) throw new Error(`expected 3 seeded credentials, found ${logs.length}`);

  const rows = [];
  for (const l of logs) {
    const [status, cert] = await registry.verify(l.args.docHash);
    const manifest = await (await fetch(`http://127.0.0.1:${e.ports.gateway}/ipfs/${cert.metadataCID}`)).json();
    if (manifest.docHash !== l.args.docHash) throw new Error('manifest/docHash mismatch');
    rows.push([l.args.docHash, cert.metadataCID, Number(status)]);
  }
  await step(`3 credentials verified on-chain and cross-checked with IPFS (statuses ${rows.map((r) => r[2]).join(',')})`, async () => {});
  if (rows.map((r) => r[2]).join() !== '1,1,2') throw new Error('unexpected statuses (want valid, valid, revoked)');
  const fingerprint = createHash('sha256').update(JSON.stringify([dep.address, rows])).digest('hex').slice(0, 16);
  console.log(`\nPASS  fingerprint ${fingerprint}`);
} catch (err) {
  console.error(`\nFAIL  ${err.message}`); code = 1;
} finally { stop(); await sleep(300); process.exit(code); }
