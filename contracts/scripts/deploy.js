// Deploys SourcifyRegistry and publishes a deployment record for the
// selected local runtime.
//
// Network mapping:
//   localhost   -> development -> Hardhat
//   persistent  -> persistent  -> Docker Geth
//
// Files:
//   web/public/deployment/development.json
//   web/public/deployment/persistent.json
//
// deployment.json is also written as the active deployment consumed by
// the web application.

const fs = require("fs");
const path = require("path");

const hre = require("hardhat");
const { ethers, artifacts } = hre;

const env = require("../../tools/load-env.cjs");

const OUT_DIR = path.resolve(
  __dirname,
  "../../web/public/deployment"
);

function getMode() {
  switch (hre.network.name) {
    case "localhost":
      return "development";

    case "persistent":
      return "persistent";

    default:
      throw new Error(
        `Unsupported deployment network "${hre.network.name}". ` +
        `Use --network localhost for development or ` +
        `--network persistent for persistent mode.`
      );
  }
}

function getRpcUrl(mode) {
  const port =
    mode === "persistent"
      ? env.ports.persistent_rpc
      : env.ports.development_rpc;

  return `http://127.0.0.1:${port}`;
}

function getDeploymentPath(mode) {
  return path.join(
    OUT_DIR,
    `${mode}.json`
  );
}

function getActiveDeploymentPath() {
  return path.join(
    OUT_DIR,
    "deployment.json"
  );
}

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(file, "utf8")
  );
}

function writeJson(file, value) {
  fs.writeFileSync(
    file,
    JSON.stringify(value, null, 2) + "\n"
  );
}

async function main() {
  const mode = getMode();
  const rpcUrl = getRpcUrl(mode);

  const deploymentPath =
    getDeploymentPath(mode);

  const activeDeploymentPath =
    getActiveDeploymentPath();

  const [deployer] =
    await ethers.getSigners();

  const network =
    await ethers.provider.getNetwork();

  const chainId =
    Number(network.chainId);

  const artifact =
    await artifacts.readArtifact(
      "SourcifyRegistry"
    );

  console.log(
    `[deploy] mode=${mode}`
  );

  console.log(
    `[deploy] network=${hre.network.name}`
  );

  console.log(
    `[deploy] RPC=${rpcUrl}`
  );

  console.log(
    `[deploy] chainId=${chainId}`
  );

  /*
   * Reuse the deployment belonging to THIS mode.
   *
   * This is what preserves the persistent registry across
   * stop/start cycles.
   */
  const force =
    process.env.DEPLOY_FORCE === "1";

  if (
    !force &&
    fs.existsSync(deploymentPath)
  ) {
    try {
      const existing =
        readJson(deploymentPath);

      const sameChain =
        Number(existing.chainId) === chainId;

      if (
        sameChain &&
        ethers.isAddress(existing.address)
      ) {
        const code =
          await ethers.provider.getCode(
            existing.address
          );

        if (code !== "0x") {
          console.log(
            `[deploy] Reusing existing ${mode} ` +
            `SourcifyRegistry at ${existing.address}`
          );

          const deployment = {
            ...existing,
            mode,
            network: hre.network.name,
            chainId,
            rpcUrl,
            abi: artifact.abi,
          };

          fs.mkdirSync(
            OUT_DIR,
            { recursive: true }
          );

          /*
           * Refresh both the mode-specific record
           * and the active deployment pointer.
           */
          writeJson(
            deploymentPath,
            deployment
          );

          writeJson(
            activeDeploymentPath,
            deployment
          );

          console.log(
            `[deploy] ${path.relative(
              process.cwd(),
              deploymentPath
            )}`
          );

          console.log(
            `[deploy] active deployment → ` +
            `${path.relative(
              process.cwd(),
              activeDeploymentPath
            )}`
          );

          return;
        }

        console.log(
          `[deploy] Existing ${mode} deployment ` +
          `at ${existing.address} has no bytecode; redeploying.`
        );
      }
    } catch (error) {
      console.warn(
        `[deploy] Could not reuse ${deploymentPath}: ` +
        `${error instanceof Error ? error.message : String(error)}`
      );

      console.log(
        "[deploy] A fresh deployment will be created."
      );
    }
  }

  /*
   * No valid deployment exists for this mode.
   * Deploy a new registry.
   */
  const name =
    env.institution;

  console.log(
    `[deploy] Deploying new SourcifyRegistry for ${mode}...`
  );

  const registry =
    await (
      await ethers.getContractFactory(
        "SourcifyRegistry"
      )
    ).deploy(
      deployer.address,
      name,
      0
    );

  await registry.waitForDeployment();

  const address =
    await registry.getAddress();

  const deploymentTx =
    registry.deploymentTransaction();

  if (!deploymentTx) {
    throw new Error(
      "Deployment transaction was not available."
    );
  }

  const receipt =
    await deploymentTx.wait();

  if (!receipt) {
    throw new Error(
      "Deployment transaction receipt was not available."
    );
  }

  const deployment = {
    mode,
    network: hre.network.name,
    chainId,
    rpcUrl,
    address,
    owner: deployer.address,
    deployedAtBlock: receipt.blockNumber,
    abi: artifact.abi,
  };

  fs.mkdirSync(
    OUT_DIR,
    { recursive: true }
  );

  /*
   * Permanent record for this runtime.
   */
  writeJson(
    deploymentPath,
    deployment
  );

  /*
   * Active record consumed by the browser.
   * This points at whichever environment was most
   * recently launched.
   */
  writeJson(
    activeDeploymentPath,
    deployment
  );

  console.log(
    `[deploy] SourcifyRegistry deployed at ${address}`
  );

  console.log(
    `[deploy] mode=${mode}, ` +
    `network=${hre.network.name}, ` +
    `chain=${chainId}, ` +
    `block=${receipt.blockNumber}`
  );

  console.log(
    `[deploy] wrote ${path.relative(
      process.cwd(),
      deploymentPath
    )}`
  );

  console.log(
    `[deploy] active deployment → ${path.relative(
      process.cwd(),
      activeDeploymentPath
    )}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});