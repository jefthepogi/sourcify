require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-network-helpers");
const env = require("../tools/load-env.cjs");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

const SOLC_VERSION = "0.8.24"; // keep in sync with `solc` in package.json and the pragma

// Compiler: native solc is downloaded by Hardhat; if that is impossible (offline, proxy, blocked host) we
// fall back to the exact same version shipped in the pinned `solc` npm package (solc-js). Force it with SOLCJS=1.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, _hre, runSuper) => {
  if (args.solcVersion !== SOLC_VERSION) return runSuper();
  const solcJs = () => ({
    compilerPath: require.resolve("solc/soljson.js"),
    isSolcJs: true,
    version: SOLC_VERSION,
    longVersion: require("solc/package.json").version,
  });
  if (process.env.SOLCJS === "1") return solcJs();
  try {
    return await runSuper();
  } catch {
    console.warn(`[sourcify] could not download native solc ${SOLC_VERSION}; using the pinned solc-js package instead`);
    return solcJs();
  }
});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: SOLC_VERSION, // pinned to avoid compiler drift
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks: {
    hardhat: {
      chainId: env.chainId, // default 1337, matches the approved UI design
      initialBaseFeePerGas: 0, // zero-cost local network
      allowBlocksWithSameTimestamp: true,
    },
    
    localhost: {
      url: env.rpcUrl("development"),
      chainId: env.chainId,
    },
    
    persistent: {
      url: env.rpcUrl("persistent"),
      chainId: env.chainId,
    },
  },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
  mocha: { timeout: 60000 },
};
