# Sourcify — certificate signing and verification prototype

Issuers anchor a Keccak-256 hash of a certificate on a local EVM chain and pin the file plus a metadata manifest to IPFS. Anyone can verify a certificate by scanning its QR code, pasting the hash, or dropping the file. The UI follows the Figma file *SoftEng — Sourcify*.

> Read [`docs/ARCHITECTURE_LOG.md`](docs/ARCHITECTURE_LOG.md) for every deviation from the design and the project plan.

## Quick start
```bash
nvm use                # Node 22 (see .nvmrc); fnm/volta also read it
npm run setup          # preflight check, then `npm ci` for contracts/ and web/
npm run dev            # chain → deploy → IPFS → seed → web
```
Open **http://127.0.0.1:4200/issuer** (issuer console) and **/verify** (mobile verifier). Verify the setup at any time with `npm run smoke`.

## Reproducible environment
A new contributor should get the same toolchain, the same ports, and the same demo data on any machine. The layers:

| Concern | How it is pinned | Check |
|---|---|---|
| Node / npm | `.nvmrc`, `engines` + `engine-strict` in each package | `npm run doctor` |
| Dependencies | exact versions in `package.json`, committed `package-lock.json`, installed with `npm ci` | CI `npm ci` |
| Solidity compiler | `0.8.24` in `hardhat.config.js`; identical `solc` npm package is the automatic fallback when the native download is blocked | `npm test` |
| Ethers.js | exact `6.17.0` in both packages | lockfile |
| Ports, chain ID, institution name | `.env` (copy `.env.example`); one loader feeds Hardhat, tools and the web app (`web/public/config.json` is generated) | `npm run doctor` reports conflicts |
| Chain state and demo data | Hardhat's fixed development accounts; the seed uses no randomness, so the contract address, hashes and CIDs are identical on every clone | `npm run smoke` prints a fingerprint that must match |
| IPFS | Kubo image pinned in `docker-compose.yml`, or the built-in stand-in (`npm run ipfs:mock`) | `npm run smoke` |
| Line endings / style | `.gitattributes` (LF), `.editorconfig` | |
| Vulnerable dependencies | weekly `npm audit` workflow, Dependabot, pinned overrides (see log A-12) | `npm --prefix web audit` |
| Static analysis | Slither and solc-select pinned in `tools/requirements-audit.txt` | CI |

**Expected smoke fingerprint** (default `.env`): `c003f018a3adad3b`. If yours differs, something in your environment differs; start with `npm run doctor`.

Optional: open the folder in a Dev Container (`.devcontainer/`) to get Node 22 and the VS Code extensions without installing anything locally. A real IPFS node: `docker compose up -d`; `npm run dev` then reuses it.

### Everyday commands
| Command | Purpose |
|---|---|
| `npm run dev` | whole stack with seeded demo data |
| `npm run reset` | wipe generated chain/IPFS/build state and start fresh (local data is disposable) |
| `npm run clean -- --all` | also remove `node_modules` |
| `npm test` | contract and web unit tests |
| `npm run smoke` | headless end-to-end environment check |
| `npm run bench:ipfs` | IPFS retrieval latency |

### Setup and troubleshooting log
| Symptom | Cause | Fix |
|---|---|---|
| `EADDRINUSE` / chain won't start | another tool owns 7545, 5001 or 8080 | set a free port in `.env`; `npm run doctor` lists conflicts |
| `Unsupported engine` from npm | wrong Node version | `nvm use` |
| Compiler download fails | blocked network | nothing to do; the pinned `solc` package is used automatically (`SOLCJS=1` forces it) |
| `npm ci` says lockfile out of sync | edited `package.json` by hand | run `npm install` inside that package and commit the lockfile |
| `npm install` crashes with `edgesOut` in `web/` | npm 10 resolver bug with an optional peer (jsdom → `@exodus/bytes` vs ethers); `web/.npmrc` sets `legacy-peer-deps=true` to avoid it | keep the `.npmrc`; revisit on npm ≥ 11 |
| Recovery modal in the UI | chain, IPFS or deployment missing | `npm run dev`, or start the missing piece and press Retry |
| Seeded data missing after chain restart | the local chain is in-memory | `npm run dev` redeploys and reseeds |

## Stack
Solidity 0.8.24 · OpenZeppelin 5 · Hardhat 2 (Mocha/Chai) · Angular 21 (standalone, signals) · ethers v6 · Lucide · `qrcode` · `jsqr` · Inter and Roboto Mono (self-hosted).

## Layout
```
contracts/   SourcifyRegistry.sol, tests, deploy/seed scripts
web/         Angular app (core/ services, features/issuer, features/verifier)
tools/       dev, doctor, smoke, clean, ipfs-mock, bench, env loader
docs/        ARCHITECTURE_LOG.md
.github/     CI, weekly audit, Dependabot
```

## Wallets and roles
Dev mode uses the node's unlocked accounts (wallet menu to switch). Account #0 is the owner: it can authorise issuers and revoke any record. MetaMask works when installed (the app adds the local chain and follows account/network switches).

**Names instead of addresses.** The local accounts map to fictional demo profiles (`web/src/app/core/profiles.ts`). MetaMask cannot share account names with a web page, so use the *Display name* box in the wallet menu to label any account; it is stored in your browser only. Names are cosmetic: permissions come from the on-chain role.

## Known gaps
Logo is a placeholder wordmark. MetaMask, camera scanning, Docker/Kubo and the Dev Container were not exercised in the build sandbox. Windows was not tested. The Slither CI step is configured but not yet run.
