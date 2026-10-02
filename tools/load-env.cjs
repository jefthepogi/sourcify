// Single source of truth for local-environment settings. Reads <repo>/.env (never overrides real env vars).
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const file = path.join(root, ".env");
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
const get = (k, d) => process.env[k] ?? d;

module.exports = {
  root,
  chainId: Number(get("SOURCIFY_CHAIN_ID", "1337")),
  ports: {
    rpc: Number(get("SOURCIFY_RPC_PORT", "7545")),
    ipfsApi: Number(get("IPFS_API_PORT", "5001")),
    gateway: Number(get("IPFS_GATEWAY_PORT", "8080")),
    web: 4200,
  },
  institution: get("INSTITUTION_NAME", "Northbridge University"),
};
