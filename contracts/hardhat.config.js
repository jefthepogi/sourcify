require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-network-helpers");
const path = require("path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

const SOLC_VERSION = "0.8.24";

// Offline / restricted-network fallback: compile with the pinned `solc` npm package (solc-js)
// instead of downloading a native compiler. Enable with `SOLCJS=1`.
if (process.env.SOLCJS) {
  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, _hre, runSuper) => {
    if (args.solcVersion !== SOLC_VERSION) return runSuper();
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: SOLC_VERSION,
      longVersion: require("solc/package.json").version,
    };
  });
}

const RPC_PORT = process.env.SOURCIFY_RPC_PORT || "7545";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: SOLC_VERSION, // pinned to avoid compiler drift
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks: {
    hardhat: {
      chainId: 1337, // matches the chain ID shown in the approved UI design
      initialBaseFeePerGas: 0, // zero-cost local network
      allowBlocksWithSameTimestamp: true,
    },
    localhost: { url: `http://127.0.0.1:${RPC_PORT}`, chainId: 1337 },
  },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
  mocha: { timeout: 60000 },
};
