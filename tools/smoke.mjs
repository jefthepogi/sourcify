#!/usr/bin/env node

// Headless end-to-end Sourcify environment check.
//
// Usage:
//   node tools/smoke.mjs
//   node tools/smoke.mjs --mode development
//   node tools/smoke.mjs --mode persistent
//
// Development mode:
//   starts Hardhat + IPFS mock,
//   deploys, seeds, verifies, then cleans up.
//
// Persistent mode:
//   assumes Geth + Kubo are already running,
//   deploys/reuses, seeds, verifies,
//   and leaves the persistent infrastructure alone.

import {
  spawn,
  execFile,
} from "node:child_process";

import {
  createRequire,
} from "node:module";

import {
  createHash,
} from "node:crypto";

import {
  readFileSync,
  existsSync,
} from "node:fs";

import {
  dirname,
  join,
  resolve,
  delimiter,
} from "node:path";

import {
  fileURLToPath,
} from "node:url";

import {
  setTimeout as sleep,
} from "node:timers/promises";

const require =
  createRequire(
    import.meta.url
  );

const e =
  require(
    "./load-env.cjs"
  );

const ROOT =
  resolve(
    dirname(
      fileURLToPath(
        import.meta.url
      )
    ),
    ".."
  );

const contractsDir =
  join(
    ROOT,
    "contracts"
  );

const {
  JsonRpcProvider,
  Contract,
  keccak256,
  toUtf8Bytes,
} =
  require(
    join(
      ROOT,
      "contracts",
      "node_modules",
      "ethers"
    )
  );

function getMode() {
  const args =
    process.argv.slice(2);

  const index =
    args.indexOf(
      "--mode"
    );

  if (
    index === -1
  ) {
    return "development";
  }

  const mode =
    args[index + 1];

  if (!mode) {
    throw new Error(
      'Missing value for --mode. ' +
      'Use "development" or "persistent".'
    );
  }

  if (
    mode !== "development" &&
    mode !== "persistent"
  ) {
    throw new Error(
      `Invalid mode "${mode}". ` +
      `Use "development" or "persistent".`
    );
  }

  return mode;
}

const mode =
  getMode();

const RPC =
  e.rpcUrl(mode);

const IPFS =
  `http://127.0.0.1:${e.ports.ipfsApi}`;

const GATEWAY =
  `http://127.0.0.1:${e.ports.gateway}/ipfs`;

const deploymentFile =
  mode === "development"
    ? "development.json"
    : "persistent.json";

const deploymentPath =
  join(
    ROOT,
    "web",
    "public",
    "deployment",
    deploymentFile
  );

const childEnv = {
  ...process.env,

  SOURCIFY_MODE:
    mode,

  PATH:
    `${dirname(process.execPath)}` +
    `${delimiter}` +
    `${process.env.PATH ?? ""}`,
};

const serviceChildren = [];

function getNpmCli() {
  const npmExecPath =
    process.env.npm_execpath;

  if (
    npmExecPath
  ) {
    return npmExecPath;
  }

  const candidates = [
    join(
      dirname(
        process.execPath
      ),
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js"
    ),

    join(
      dirname(
        process.execPath
      ),
      "..",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js"
    ),
  ];

  const result =
    candidates.find(
      (file) =>
        existsSync(file)
    );

  if (!result) {
    throw new Error(
      `Could not locate npm CLI for Node runtime:\n${process.execPath}`
    );
  }

  return result;
}

const npmCli =
  getNpmCli();

function attachOutput(
  name,
  child
) {
  child.stdout.on(
    "data",
    (data) => {
      for (
        const line
        of data
          .toString()
          .split(/\r?\n/)
      ) {
        if (
          line.trim()
        ) {
          console.log(
            `[${name}] ${line}`
          );
        }
      }
    }
  );

  child.stderr.on(
    "data",
    (data) => {
      for (
        const line
        of data
          .toString()
          .split(/\r?\n/)
      ) {
        if (
          line.trim()
        ) {
          console.error(
            `[${name}] ${line}`
          );
        }
      }
    }
  );

  child.on(
    "error",
    (error) => {
      console.error(
        `[${name}] ${error.message}`
      );
    }
  );
}

function startService(
  name,
  command,
  args,
  options = {}
) {
  const spawnOptions = {
    cwd:
      ROOT,

    env:
      childEnv,

    shell:
      false,

    stdio: [
      "ignore",
      "pipe",
      "pipe",
    ],

    ...options,
  };

  /*
   * On POSIX systems, create a separate
   * process group for each service.
   *
   * That lets cleanup terminate the entire
   * descendant group rather than just the
   * immediate process.
   */
  if (
    process.platform !== "win32"
  ) {
    spawnOptions.detached =
      true;
  }

  const child =
    spawn(
      command,
      args,
      spawnOptions
    );

  attachOutput(
    name,
    child
  );

  serviceChildren.push(
    child
  );

  return child;
}

function runNpm(
  name,
  cwd,
  script
) {
  return new Promise(
    (
      resolvePromise,
      rejectPromise
    ) => {
      const child =
        spawn(
          process.execPath,
          [
            npmCli,
            "run",
            script,
          ],
          {
            cwd,
            env:
              childEnv,
            shell:
              false,
            stdio: [
              "ignore",
              "pipe",
              "pipe",
            ],
          }
        );

      attachOutput(
        name,
        child
      );

      child.once(
        "error",
        (error) => {
          rejectPromise(
            new Error(
              `${name} failed to start: ` +
              `${error.message}`
            )
          );
        }
      );

      child.once(
        "exit",
        (code) => {
          if (
            code === 0
          ) {
            resolvePromise();
          } else {
            rejectPromise(
              new Error(
                `${name} exited with code ${code}`
              )
            );
          }
        }
      );
    }
  );
}

async function writeConfig() {
  await new Promise(
    (
      resolvePromise,
      rejectPromise
    ) => {
      const child =
        spawn(
          process.execPath,
          [
            join(
              ROOT,
              "tools",
              "write-config.mjs"
            ),

            "--mode",
            mode,
          ],
          {
            cwd:
              ROOT,

            env:
              childEnv,

            shell:
              false,

            stdio: [
              "ignore",
              "pipe",
              "pipe",
            ],
          }
        );

      attachOutput(
        "config",
        child
      );

      child.once(
        "error",
        (error) => {
          rejectPromise(
            error
          );
        }
      );

      child.once(
        "exit",
        (code) => {
          if (
            code === 0
          ) {
            resolvePromise();
          } else {
            rejectPromise(
              new Error(
                `write-config exited with code ${code}`
              )
            );
          }
        }
      );
    }
  );
}

function resolveHardhatCli() {
  const packageFile =
    join(
      contractsDir,
      "node_modules",
      "hardhat",
      "package.json"
    );

  if (
    !existsSync(
      packageFile
    )
  ) {
    throw new Error(
      `Hardhat package not found:\n${packageFile}`
    );
  }

  const packageJson =
    JSON.parse(
      readFileSync(
        packageFile,
        "utf8"
      )
    );

  const bin =
    packageJson.bin;

  const relativeBin =
    typeof bin === "string"
      ? bin
      : bin?.hardhat;

  if (
    !relativeBin
  ) {
    throw new Error(
      "Could not resolve Hardhat CLI entry point."
    );
  }

  return join(
    contractsDir,
    "node_modules",
    "hardhat",
    relativeBin
  );
}

function startHardhat() {
  const hardhatCli =
    resolveHardhatCli();

  return startService(
    "chain",
    process.execPath,
    [
      hardhatCli,
      "node",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(
        e.ports.development_rpc
      ),
    ],
    {
      cwd:
        contractsDir,
    }
  );
}

function startIpfsMock() {
  return startService(
    "ipfs",
    process.execPath,
    [
      join(
        ROOT,
        "tools",
        "ipfs-mock.mjs"
      ),
    ],
    {
      cwd:
        ROOT,
    }
  );
}

async function waitFor(
  label,
  probe,
  maxRetries = 80
) {
  for (
    let i = 0;
    i < maxRetries;
    i++
  ) {
    try {
      if (
        await probe()
      ) {
        return;
      }
    } catch {
      // Not ready yet.
    }

    await sleep(
      500
    );
  }

  throw new Error(
    `${label} did not become ready.`
  );
}

async function rpcReady() {
  const response =
    await fetch(
      RPC,
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/json",
        },

        body:
          JSON.stringify({
            jsonrpc:
              "2.0",

            id:
              1,

            method:
              "eth_chainId",

            params: [],
          }),
      }
    );

  return response.ok;
}

async function ipfsReady() {
  const response =
    await fetch(
      `${IPFS}/api/v0/version`,
      {
        method:
          "POST",
      }
    );

  return response.ok;
}

function readDeployment() {
  if (
    !existsSync(
      deploymentPath
    )
  ) {
    throw new Error(
      `Deployment file not found:\n${deploymentPath}`
    );
  }

  return JSON.parse(
    readFileSync(
      deploymentPath,
      "utf8"
    )
  );
}

function expectedDemo() {
  return [
    {
      name:
        "Amara Okafor",

      program:
        "MSc Data Science · Distinction",

      date:
        "2026-09-18",

      expectedStatus:
        1,

      seed:
        0,
    },

    {
      name:
        "Luis Moreno",

      program:
        "Research Fellowship · Applied Cryptography",

      date:
        "2026-09-18",

      expectedStatus:
        1,

      seed:
        1,
    },

    {
      name:
        "Marcus Reed",

      program:
        "Laboratory Safety Certification",

      date:
        "2026-09-17",

      expectedStatus:
        2,

      seed:
        2,
    },
  ];
}

function docHashFor(
  entry
) {
  return keccak256(
    toUtf8Bytes(
      [
        "DEMO CERTIFICATE",
        entry.name,
        entry.program,
        entry.date,
        `seed-${entry.seed}`,
      ].join("\n")
    )
  );
}

async function stopServices() {
  const running =
    serviceChildren.filter(
      (child) =>
        child &&
        child.exitCode === null
    );

  /*
   * Stop all service process trees.
   */
  for (
    const child
    of running
  ) {
    if (
      process.platform ===
      "win32"
    ) {
      await new Promise(
        (resolvePromise) => {
          execFile(
            "taskkill",
            [
              "/pid",
              String(child.pid),
              "/t",
              "/f",
            ],
            () =>
              resolvePromise()
          );
        }
      );
    } else {
      /*
       * Because the child was launched detached,
       * its PID is the process-group leader.
       */
      try {
        process.kill(
          -child.pid,
          "SIGTERM"
        );
      } catch {
        // Already gone.
      }
    }
  }

  /*
   * Let sockets and child processes close.
   */
  await sleep(
    300
  );

  /*
   * Force remaining POSIX process groups.
   */
  if (
    process.platform !==
    "win32"
  ) {
    for (
      const child
      of running
    ) {
      if (
        child.exitCode !==
        null
      ) {
        continue;
      }

      try {
        process.kill(
          -child.pid,
          "SIGKILL"
        );
      } catch {
        // Already gone.
      }
    }
  }

  serviceChildren.length =
    0;
}

let shuttingDown =
  false;

async function shutdown(
  exitCode
) {
  if (
    shuttingDown
  ) {
    return;
  }

  shuttingDown =
    true;

  try {
    await stopServices();
  } finally {
    process.exit(
      exitCode
    );
  }
}

process.on(
  "SIGINT",
  () => {
    void shutdown(130);
  }
);

process.on(
  "SIGTERM",
  () => {
    void shutdown(143);
  }
);

async function main() {
  try {
    console.log(
      `Sourcify smoke test (${mode})`
    );

    console.log(
      `RPC: ${RPC}`
    );

    await writeConfig();

    /*
     * Development owns and cleans up its services.
     */
    if (
      mode ===
      "development"
    ) {
      console.log(
        "\nStarting development Hardhat..."
      );

      startHardhat();

      await waitFor(
        "development RPC",
        rpcReady
      );

      console.log(
        "Development RPC ready."
      );

      console.log(
        "\nStarting development IPFS mock..."
      );

      startIpfsMock();

      await waitFor(
        "development IPFS",
        ipfsReady
      );

      console.log(
        "Development IPFS ready."
      );
    } else {
      /*
       * Persistent smoke never owns the
       * Docker service lifecycle.
       */
      console.log(
        "\nUsing existing persistent services..."
      );

      await waitFor(
        "persistent Geth",
        rpcReady
      );

      console.log(
        "Persistent Geth ready."
      );

      await waitFor(
        "persistent IPFS",
        ipfsReady
      );

      console.log(
        "Persistent IPFS ready."
      );
    }

    /*
     * Deploy/reuse.
     */
    console.log(
      "\nDeploying/reusing registry..."
    );

    await runNpm(
      "deploy",
      contractsDir,
      mode ===
        "persistent"
        ? "deploy:persistent"
        : "deploy"
    );

    /*
     * Seed.
     */
    console.log(
      "\nSeeding demo credentials..."
    );

    await runNpm(
      "seed",
      contractsDir,
      mode ===
        "persistent"
        ? "seed:persistent"
        : "seed"
    );

    /*
     * Load deployment for this mode.
     */
    const deployment =
      readDeployment();

    if (
      deployment.mode !==
      mode
    ) {
      throw new Error(
        `Deployment mode mismatch: ` +
        `expected ${mode}, ` +
        `found ${deployment.mode}`
      );
    }

    /*
     * Connect directly to selected RPC.
     */
    const provider =
      new JsonRpcProvider(
        RPC
      );

    const registry =
      new Contract(
        deployment.address,
        deployment.abi,
        provider
      );

    const demo =
      expectedDemo();

    const rows =
      [];

    for (
      const entry
      of demo
    ) {
      const hash =
        docHashFor(
          entry
        );

      const [
        status,
        certificate,
      ] =
        await registry.verify(
          hash
        );

      const actualStatus =
        Number(
          status
        );

      if (
        actualStatus !==
        entry.expectedStatus
      ) {
        throw new Error(
          `${entry.name}: expected status ` +
          `${entry.expectedStatus}, ` +
          `got ${actualStatus}`
        );
      }

      if (
        !certificate.metadataCID
      ) {
        throw new Error(
          `${entry.name}: registry returned no metadata CID`
        );
      }

      const response =
        await fetch(
          `${GATEWAY}/${certificate.metadataCID}`
        );

      if (
        !response.ok
      ) {
        throw new Error(
          `${entry.name}: failed to fetch IPFS metadata ` +
          `(${response.status})`
        );
      }

      const manifest =
        await response.json();

      if (
        manifest.docHash !==
        hash
      ) {
        throw new Error(
          `${entry.name}: metadata/docHash mismatch`
        );
      }

      rows.push([
        hash,
        certificate.metadataCID,
        actualStatus,
      ]);

      console.log(
        `  ok    ${entry.name} → status ${actualStatus}`
      );
    }

    const fingerprint =
      createHash(
        "sha256"
      )
        .update(
          JSON.stringify([
            deployment.address,
            rows,
          ])
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          16
        );

    console.log(
      `\nPASS  ${mode} smoke test`
    );

    console.log(
      `PASS  fingerprint ${fingerprint}`
    );
  } finally {
    /*
     * Development:
     * kill Hardhat + IPFS mock.
     *
     * Persistent:
     * serviceChildren is empty,
     * so Docker remains running.
     */
    await stopServices();
  }
}

main().catch(
  async (error) => {
    console.error(
      `\nFAIL  ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );

    /*
     * main() has already executed its finally block,
     * so just report the failure.
     */
    process.exitCode =
      1;
  }
);