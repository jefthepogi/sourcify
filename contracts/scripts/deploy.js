// Deploys SourcifyRegistry and publishes address + ABI where the web app can read them.
const fs = require("fs");
const path = require("path");
const { ethers, artifacts } = require("hardhat");

const OUT_DIR = path.resolve(__dirname, "../../web/public/deployment");

const DEPLOYMENT_FILE = path.resolve(
  __dirname,
  "../../web/public/deployment/deployment.json"
);

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  // Reuse existing contract, if any
  const force = process.env.DEPLOY_FORCE === "1";

  if (!force && fs.existsSync(DEPLOYMENT_FILE)) {
    const existing = JSON.parse(
      fs.readFileSync(DEPLOYMENT_FILE, "utf8")
    );

    if (Number(existing.chainId) === Number(network.chainId)) {
      const code = await ethers.provider.getCode(existing.address);

      if (code !== "0x") {
        console.log(
          `Reusing SourcifyRegistry at ${existing.address} ` +
          `(chain ${network.chainId})`
        );
        return;
      }
    }
  }

  // Create and deploy a new smart contract
  const name = require("../../tools/load-env.cjs").institution;

  const registry = await (await ethers.getContractFactory("SourcifyRegistry")).deploy(deployer.address, name, 0);
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  const receipt = await registry.deploymentTransaction().wait();
  const artifact = await artifacts.readArtifact("SourcifyRegistry");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "deployment.json"),
    JSON.stringify(
      { chainId: Number(network.chainId), address, owner: deployer.address, deployedAtBlock: receipt.blockNumber, abi: artifact.abi },
      null,
      2,
    ),
  );
  console.log(`SourcifyRegistry deployed at ${address} (chain ${network.chainId}, block ${receipt.blockNumber})`);
  console.log(`Wrote ${path.relative(process.cwd(), path.join(OUT_DIR, "deployment.json"))}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
