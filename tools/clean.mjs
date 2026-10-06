#!/usr/bin/env node

// Cleans disposable development artifacts.
//
// Default:
//   removes development build/cache/mock-IPFS state.
//
// --persistent:
//   additionally removes the persistent deployment metadata file.
//
// IMPORTANT:
//   This script never deletes Docker volumes.
//   Use reset:persistent for that.

import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(
  import.meta.dirname,
  '..'
);

const full =
  process.argv.includes('--all');

const persistent =
  process.argv.includes('--persistent');

const targets = [
  '.ipfs-mock',
  'contracts/cache',
  'contracts/artifacts',
  'web/dist',
  'web/.angular',
  'web/public/deployment/development.json',
  'web/public/config.json',
];

if (persistent) {
  targets.push(
    'web/public/deployment/persistent.json'
  );
}

if (full) {
  targets.push(
    'node_modules',
    'contracts/node_modules',
    'web/node_modules'
  );
}

for (const target of targets) {
  rmSync(
    join(root, target),
    {
      recursive: true,
      force: true,
    }
  );

  console.log(
    'removed',
    target
  );
}

console.log(
  persistent
    ? 'Persistent deployment metadata removed; Docker volumes were not touched.'
    : 'Development state cleaned; persistent deployment metadata was preserved.'
);