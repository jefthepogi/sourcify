#!/usr/bin/env node
// Returns the working tree to a pristine, rebuildable state (SPMP TR-32: local chain/IPFS data is disposable).
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const full = process.argv.includes('--all');
const targets = ['.ipfs-mock', 'contracts/cache', 'contracts/artifacts', 'web/dist', 'web/.angular', 'web/public/deployment/deployment.json', 'web/public/config.json'];
if (full) targets.push('node_modules', 'contracts/node_modules', 'web/node_modules');
for (const t of targets) { rmSync(join(root, t), { recursive: true, force: true }); console.log('removed', t); }
