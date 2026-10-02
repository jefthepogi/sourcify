// Starts the local chain on the configured port (npm scripts can't portably read env defaults on Windows).
const { spawn } = require("child_process");
const path = require("path");
const env = require("./load-env.cjs");
const bin = path.join(env.root, "contracts/node_modules/.bin", process.platform === "win32" ? "hardhat.cmd" : "hardhat");
const p = spawn(bin, ["node", "--hostname", "127.0.0.1", "--port", String(env.ports.rpc)], { stdio: "inherit", cwd: path.join(env.root, "contracts"), shell: process.platform === "win32" });
p.on("exit", (c) => process.exit(c ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => p.kill());
