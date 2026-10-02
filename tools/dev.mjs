#!/usr/bin/env node
// One-command local stack: chain (7545) → deploy → IPFS (mock unless a daemon already answers on :5001) → seed → web (4200).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const procs = [];
const run = (name, cmd, args, opts = {}) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32', ...opts });
  const tag = (d) => d.toString().split('\n').filter(Boolean).forEach((l) => console.log(`[${name}] ${l}`));
  p.stdout.on('data', tag); p.stderr.on('data', tag); procs.push(p); return p;
};
const once = (name, cmd, args, opts = {}) => new Promise((res, rej) => run(name, cmd, args, opts).on('exit', (c) => (c === 0 ? res() : rej(new Error(`${name} exited ${c}`)))));
const up = async (url, init) => { try { return (await fetch(url, { ...init, signal: AbortSignal.timeout(800) })).ok; } catch { return false; } };
const wait = async (label, probe) => { for (let i = 0; i < 60; i++) { if (await probe()) return; await sleep(500); } throw new Error(`${label} did not start`); };
const env = { ...process.env, SOLCJS: process.env.SOLCJS ?? '' };
if (!env.SOLCJS) delete env.SOLCJS;

process.on('SIGINT', () => { procs.forEach((p) => p.kill()); process.exit(0); });

run('chain', 'npm', ['--prefix', 'contracts', 'run', 'node'], { env });
await wait('chain', () => up('http://127.0.0.1:7545', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' }));
if (!(await up('http://127.0.0.1:5001/api/v0/version', { method: 'POST' }))) { run('ipfs', 'node', ['tools/ipfs-mock.mjs']); await wait('ipfs', () => up('http://127.0.0.1:5001/api/v0/version', { method: 'POST' })); }
else console.log('[dev] Using the IPFS daemon already listening on :5001');
await once('deploy', 'npm', ['--prefix', 'contracts', 'run', 'deploy'], { env });
if (process.env.SEED !== '0') await once('seed', 'npm', ['--prefix', 'contracts', 'run', 'seed'], { env });
run('web', 'npm', ['--prefix', 'web', 'start']);
console.log('\nSourcify is starting → Issuer: http://127.0.0.1:4200/issuer   Verifier: http://127.0.0.1:4200/verify\n');
