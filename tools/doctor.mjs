#!/usr/bin/env node
// Preflight: verifies the machine can reproduce the project environment. Exit 1 on blocking problems.
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const env = createRequire(import.meta.url)('./load-env.cjs');
const preInstall = process.argv.includes('--pre-install');
let failed = false;
const ok = (m) => console.log(`  ok    ${m}`);
const warn = (m) => console.log(`  warn  ${m}`);
const bad = (m) => { failed = true; console.log(`  FAIL  ${m}`); };

console.log('Sourcify environment check');
const [maj] = process.versions.node.split('.').map(Number);

maj === 24
  ? ok(`Node ${process.versions.node} (required 24.x, see .nvmrc)`)
  : bad(
      `Node ${process.versions.node}: need Node 24.x. ` +
      'Activate the project environment.'
    );
  
try { const n = Number(execSync('npm -v').toString().split('.')[0]); n >= 10 ? ok(`npm ${n}.x`) : bad('npm >= 10 required'); } catch { bad('npm not found'); }
for (const d of ['contracts', 'web']) existsSync(join(env.root, d, 'package-lock.json')) ? ok(`${d}/package-lock.json present`) : bad(`${d}/package-lock.json missing`);
for (const d of ['contracts', 'web']) existsSync(join(env.root, d, 'node_modules')) ? ok(`${d} dependencies installed`) : (preInstall ? ok(`${d} dependencies will be installed next`) : warn(`${d} dependencies not installed — run \`npm run setup\``));

const free = (port) => new Promise((res) => { const s = createServer().once('error', () => res(false)).once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });
for (const [name, port] of [['chain RPC', env.ports.rpc], ['IPFS API', env.ports.ipfsApi], ['IPFS gateway', env.ports.gateway], ['web dev server', env.ports.web]]) {
  (await free(port)) ? ok(`port ${port} free (${name})`) : warn(`port ${port} is in use (${name}). If it is not an earlier Sourcify run, change it in .env (see .env.example).`);
}
try { execSync('docker --version', { stdio: 'ignore' }); ok('docker available (optional: real IPFS node)'); } catch { warn('docker not found — the built-in IPFS stand-in will be used'); }
console.log(failed ? '\nBlocking problems found.' : '\nReady.');
process.exit(failed ? 1 : 0);
