#!/usr/bin/env node
// Headless end-to-end check of the environment:
// chain → deploy → IPFS → seed → read everything back.
//
// Prints a fingerprint of the deterministic outputs;
// two runs on any machine must print the same value.

import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);

const e = require('./load-env.cjs');

const {
  JsonRpcProvider,
  Contract,
} = require(join(e.root, 'contracts/node_modules/ethers'));

const RPC = `http://127.0.0.1:${e.ports.rpc}`;
const IPFS = `http://127.0.0.1:${e.ports.ipfsApi}`;

const EXPECTED_ADDRESS =
  '0x5FbDB2315678afecb367f032d93F642f64180aa3';

const kids = [];

const quiet = process.env.SMOKE_VERBOSE
  ? 'inherit'
  : 'ignore';

/*
 * Windows needs shell:true when launching npm/npm.cmd.
 * We therefore clean up the complete process tree with
 * taskkill instead of relying only on child.kill().
 */
const spawnK = (cmd, args, opts = {}) => {
  const p = spawn(cmd, args, {
    stdio: ['ignore', quiet, quiet],

    // npm on Windows needs a shell.
    shell: process.platform === 'win32',

    ...opts,
  });

  kids.push(p);

  return p;
};

const step = async (label, fn) => {
  const result = await fn();
  console.log(`  ok    ${label}`);
  return result;
};

const once = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const p = spawnK(cmd, args, opts);

    p.once('error', (err) => {
      reject(
        new Error(
          `${cmd} ${args.join(' ')} failed to start: ${err.message}`
        )
      );
    });

    p.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${cmd} ${args.join(' ')} exited with code ${code}` +
            (signal ? ` (${signal})` : '')
        )
      );
    });
  });

const wait = async (label, probe) => {
  for (let i = 0; i < 80; i++) {
    try {
      if (await probe()) {
        return;
      }
    } catch {
      // Service is not ready yet; retry.
    }

    await sleep(500);
  }

  throw new Error(`${label} did not start`);
};

/*
 * Kill a process and its entire child tree.
 *
 * This is important on Windows because:
 *
 * smoke.mjs
 *   └── npm
 *       └── hardhat/node
 *
 * Killing only npm can leave Hardhat running in the background.
 */
const killProcessTree = async (child) => {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      execFile(
        'taskkill',
        ['/pid', String(child.pid), '/t', '/f'],
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
};

const stop = async () => {
  const running = kids.filter(
    (child) =>
      child &&
      child.exitCode === null
  );

  if (running.length === 0) {
    return;
  }

  /*
   * Kill all process trees.
   */
  await Promise.all(
    running.map((child) =>
      killProcessTree(child)
    )
  );

  /*
   * Give the OS a moment to reap the processes.
   */
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
};

let shuttingDown = false;

const shutdown = async (exitCode) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  await stop();

  process.exit(exitCode);
};

process.on('SIGINT', () => {
  void shutdown(130);
});

process.on('SIGTERM', () => {
  void shutdown(143);
});

let code = 0;

try {
  console.log('Sourcify smoke test');

  /*
   * Generate/update configuration.
   */
  await once(
    'node',
    ['tools/write-config.mjs']
  );

  /*
   * Start Hardhat using the SAME command declared
   * in package.json:
   *
   * "chain": "npm --prefix contracts run node"
   */
  spawnK(
    'npm',
    [
      '--prefix',
      'contracts',
      'run',
      'node',
    ]
  );

  /*
   * Wait until the JSON-RPC endpoint responds.
   */
  await step(
    'chain started',
    () =>
      wait('chain', async () => {
        const response = await fetch(RPC, {
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
        });

        return response.ok;
      })
  );

  /*
   * Start mock IPFS.
   */
  spawnK(
    'node',
    ['tools/ipfs-mock.mjs']
  );

  /*
   * Wait until IPFS responds.
   */
  await step(
    'IPFS (mock) started',
    () =>
      wait('ipfs', async () => {
        const response = await fetch(
          `${IPFS}/api/v0/version`,
          {
            method: 'POST',
          }
        );

        return response.ok;
      })
  );

  /*
   * Deploy contract.
   */
  await step(
    'contract deployed',
    () =>
      once(
        'npm',
        [
          '--prefix',
          'contracts',
          'run',
          'deploy',
        ]
      )
  );

  /*
   * Seed demo data.
   */
  await step(
    'demo data seeded',
    () =>
      once(
        'npm',
        [
          '--prefix',
          'contracts',
          'run',
          'seed',
        ]
      )
  );

  /*
   * Read deployment information.
   */
  const dep = JSON.parse(
    readFileSync(
      join(
        e.root,
        'web/public/deployment/deployment.json'
      ),
      'utf8'
    )
  );

  /*
   * Verify deterministic deployment address.
   */
  if (dep.address !== EXPECTED_ADDRESS) {
    throw new Error(
      `deployment address ${dep.address} differs from the deterministic ${EXPECTED_ADDRESS}`
    );
  }

  /*
   * Connect to the local chain.
   */
  const provider = new JsonRpcProvider(RPC);

  const registry = new Contract(
    dep.address,
    dep.abi,
    provider
  );

  /*
   * Read CertificateIssued events.
   */
  const logs =
    await registry.queryFilter(
      registry.filters.CertificateIssued()
    );

  if (logs.length !== 3) {
    throw new Error(
      `expected 3 seeded credentials, found ${logs.length}`
    );
  }

  const rows = [];

  /*
   * Verify every seeded certificate and
   * cross-check the IPFS manifest.
   */
  for (const l of logs) {
    const [status, cert] =
      await registry.verify(
        l.args.docHash
      );

    const manifestResponse =
      await fetch(
        `http://127.0.0.1:${e.ports.gateway}/ipfs/${cert.metadataCID}`
      );

    if (!manifestResponse.ok) {
      throw new Error(
        `failed to fetch IPFS manifest for ${cert.metadataCID}: ${manifestResponse.status}`
      );
    }

    const manifest =
      await manifestResponse.json();

    if (
      manifest.docHash !==
      l.args.docHash
    ) {
      throw new Error(
        'manifest/docHash mismatch'
      );
    }

    rows.push([
      l.args.docHash,
      cert.metadataCID,
      Number(status),
    ]);
  }

  await step(
    `3 credentials verified on-chain and cross-checked with IPFS (statuses ${rows
      .map((r) => r[2])
      .join(',')})`,
    async () => {}
  );

  /*
   * Expected:
   *
   * 1 = valid
   * 1 = valid
   * 2 = revoked
   */
  if (
    rows.map((r) => r[2]).join() !==
    '1,1,2'
  ) {
    throw new Error(
      'unexpected statuses (want valid, valid, revoked)'
    );
  }

  /*
   * Produce deterministic fingerprint.
   */
  const fingerprint =
    createHash('sha256')
      .update(
        JSON.stringify([
          dep.address,
          rows,
        ])
      )
      .digest('hex')
      .slice(0, 16);

  console.log(
    `\nPASS  fingerprint ${fingerprint}`
  );
} catch (err) {
  console.error(
    `\nFAIL  ${
      err instanceof Error
        ? err.message
        : String(err)
    }`
  );

  code = 1;
} finally {
  /*
   * IMPORTANT:
   * Kill Hardhat + npm + IPFS before exiting.
   */
  await stop();

  await sleep(100);

  process.exit(code);
}