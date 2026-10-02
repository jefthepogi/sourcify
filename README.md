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
Dev mode uses the node's unlocked accounts (wallet menu to switch). Account #0 is the owner: it can authorise issuers and revoke any record. MetaMask works when installed (the app adds the local chain).

## Known gaps
Logo is a placeholder wordmark. MetaMask, camera scanning, Docker/Kubo and the Dev Container were not exercised in the build sandbox. Windows was not tested. The Slither CI step is configured but not yet run.


# Contributor's Local Development Environment Guide

## 1. System Prerequisites

Ensure your local machine has the following tools installed before beginning the setup process:

* **Node.js & npm:** The project utilizes Node.js development environments, tracked via version configuration files (`.nvmrc` and `.node-version`).


* **Docker & Docker Compose:** Required if you plan to run persistent instances of the local IPFS daemon and Ethereum node.


* **Git:** Required to pull the source code.

## 2. Cloning & Initial Setup

Pull the project directly from the source repository and initialize the root configuration.

1. **Clone the repository:**
```bash
git clone 
cd sourcify

```


2. **Configure Environment Variables:**
Copy the sample environment file to create your active, local configuration file.


```bash
cp .env.example .env

```


3. **Install Dependencies:**
Install the required Node.js modules for the entire monorepo. This handles dependencies for the root infrastructure, the Angular frontend (`web/`), and the Hardhat environment (`contracts/`).


```bash
npm install

```



## 3. Running the Local Infrastructure

The repository includes an orchestration script that spins up all necessary services for rapid local development testing.

1. **Start the Development Servers:**
Run the core development command from the root directory.


```bash
npm run dev

```


This utilizes the `tools/dev.mjs` script to automatically initialize three primary systems:


* The local, in-memory Hardhat Ethereum node (`tools/hardhat-node.cjs`).


* The local IPFS mock server (`tools/ipfs-mock.mjs`) for off-chain payload storage.


* The Angular development server (`web/`) to serve the UI frontend.





## 4. Deploying Smart Contracts & Seeding Data

Because the standard `npm run dev` process utilizes an in-memory EVM network, the blockchain state (including deployed contracts and issued certificates) resets every time the server terminates. You must explicitly deploy the smart contracts on every fresh boot.

1. Open a **new terminal window** while the `npm run dev` process continues to run in the background.
2. Navigate to the smart contracts subdirectory:


```bash
cd contracts

```


3. **Deploy the Contract:**
Execute the deployment script to compile and push the `SourcifyRegistry.sol` contract to your active local node.


```bash
npx hardhat run scripts/deploy.js --network localhost

```


4. **Seed Test Certificates (Recommended):**
Run the provided seeding utility to automatically populate the blockchain with dummy data and test wallets, ensuring the frontend dashboard is immediately usable for UI testing.


```bash
npx hardhat run scripts/seed.js --network localhost

```



## 5. Alternative Setup: Persistent Infrastructure via Docker

If you require your locally issued certificates to persist across server reboots, bypass the in-memory Node.js scripts and utilize the included containerized infrastructure.

1. Start the infrastructure via Docker Compose from the root directory:


```bash
docker-compose up -d

```


This command orchestrates a standardized environment, utilizing `tools/kubo-init.sh` to initialize the IPFS daemon, and writes the blockchain state and pinned files to persistent Docker volumes so data is not lost upon exit.
