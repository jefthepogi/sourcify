// Deploys SourcifyRegistry and publishes address + ABI where the web app can read them.
const fs = require("fs");
const path = require("path");
const { ethers, artifacts } = require("hardhat");

const OUT_DIR = path.resolve(__dirname, "../../web/public/deployment");

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
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
