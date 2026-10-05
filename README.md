# Sourcify — certificate signing and verification prototype

Issuers anchor a Keccak-256 hash of a certificate on a local EVM chain and pin the file plus a metadata manifest to IPFS. Anyone can verify a certificate by scanning its QR code, pasting the hash, or dropping the file.

> Read [`docs/ARCHITECTURE_LOG.md`](docs/ARCHITECTURE_LOG.md) for every deviation from the design and the project plan.

## Quick start
```bash
nvm use                # Node 24 (see .nvmrc); fnm/volta also read it
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


# Sourcify Prototype — Full Local Setup & Implementation Guide

This guide starts from a fresh Git clone and walks through the complete local environment for the Sourcify prototype:

- Windows + Git Bash
- Miniforge/Conda
- Node.js 24.x
- npm-managed frontend and contract dependencies
- Hardhat local EVM
- local/mock IPFS
- Angular web application
- optional MetaMask integration
- tests, smoke checks, and troubleshooting

The repository is designed around two functional sides: an Issuer flow for credential creation/issuance/revocation and a Verifier flow for QR/hash-based verification. The underlying design separates the on-chain proof/registry state from off-chain credential metadata stored through IPFS.

---

## 1. Prerequisites

Install these on Windows before cloning:

1. **Git for Windows** with Git Bash.
2. **Miniforge/Conda**.
3. **Docker Desktop** if you want the real local Kubo IPFS daemon. The prototype can use its built-in IPFS stand-in when Docker is unavailable.
4. A modern Chromium/Firefox browser.
5. MetaMask is optional for wallet-based issuance testing.

The repository should not depend on a user's global Node installation. Node is expected to come from the active Conda environment (or another version manager configured to provide the required Node version).

---

## 2. Clone the repository

Open **Git Bash**:

```bash
git clone <REPOSITORY_URL>
cd sourcify-prototype
```

Verify:

```bash
git status
git branch --show-current
```

---

## 3. Create the Conda environment

Use the repository's `environment.yml` so the environment definition travels with the source code.

```bash
conda env create -f environment.yml
```

Then activate the environment named in the file. If the file says `name: sourcify`, use:

```bash
conda activate sourcify-cl
```

If your repository intentionally uses another environment name such as `sourcify-cl`, use that exact name instead.

### Verify Node

```bash
node --version
node -p "process.execPath"
npm --version
```

The repository standard is **Node 24.x**. The root package currently declares:

```json
"engines": {
  "node": ">=24 <25",
  "npm": ">=10"
}
```

If `node --version` shows Node 22 or Node 26, **do not change the repository to accommodate that installation**. Fix the shell/environment selection first.

---

## 4. Git Bash + Conda + multiple Node installations

If the machine also has `nvm`, `fnm`, or another Node installation, Git Bash may resolve the wrong `node` executable.

Check:

```bash
type -a node
type -a npm
which node
which npm
```

When the Sourcify Conda environment is active, the first Node should be the Conda environment's Node 24 installation.

You do **not** need to hardcode the Conda environment into `.bashrc` with a line such as:

```bash
export PATH="$CONDA_PREFIX:$CONDA_PREFIX/Scripts:$PATH"
```

Conda activation is responsible for dynamically changing the current shell's environment.

If the shell contains a global `node` alias, inspect it with:

```bash
alias node 2>/dev/null
type -a node
```

Remove a conflicting `winpty node.exe` alias from your Bash startup configuration if one exists.

After changing shell startup files, close all Git Bash windows, open a new one, and run:

```bash
conda activate sourcify
node --version
node -p "process.execPath"
```

---

## 5. Ensure the repository lockfiles exist

A reproducible clone should contain both:

```text
contracts/package-lock.json
web/package-lock.json
```

The repository's setup command uses `npm ci`, so those lockfiles must already be committed.

Verify:

```bash
ls contracts/package-lock.json
ls web/package-lock.json
```

If `contracts/package-lock.json` is missing in the repository you cloned, the repository is not yet ready for a clean `npm run setup`. A maintainer should generate it and commit it before other users rely on the bootstrap process.

---

## 6. Install JavaScript dependencies

The root project separates the frontend and contract packages. The root package defines scripts for setup, testing, development, deployment, seeding, cleanup, and smoke testing.

The normal setup command is:

```bash
npm run setup
```

This performs the repository's environment check and then installs the contract and web dependencies with npm.

If you want to install them manually:

```bash
npm ci --prefix contracts
npm ci --prefix web
```

For reproducible installs, prefer `npm ci` over `npm install` after the lockfiles have been committed.

---

## 7. npm install-script approvals

This project contains dependencies that execute native/build-related install scripts, including packages such as:

### Web

```text
@parcel/watcher
esbuild
lmdb
msgpackr-extract
```

### Contracts

```text
keccak
secp256k1
```

The repository should commit the `allowScripts` policy in each package's `package.json` after the dependency scripts have been reviewed.

Check the current approval state:

```bash
npm --prefix web install-scripts ls
npm --prefix contracts install-scripts ls
```

A clean repository checkout should not require each developer to rediscover the same approvals manually.

If approvals are missing during development, review them first:

```bash
cd web
npm install-scripts ls
cd ../contracts
npm install-scripts ls
cd ..
```

Do not globally approve every install script merely to bypass the check.

---

## 8. Run the repository doctor

After the environment is activated and dependencies are installed, run:

```bash
npm run doctor
```

The doctor checks Node/npm, lockfiles, dependency directories, required local ports, and Docker availability.

The expected local service ports are:

| Service | Port |
|---|---:|
| Hardhat RPC | 7545 |
| IPFS API | 5001 |
| IPFS gateway | 8080 |
| Web development server | 4200 |

The IPFS stand-in is allowed when Docker is unavailable.

### Important maintainer check

The version of `tools/doctor.mjs` committed to the repository must agree with the Node version in `package.json`. If `package.json` requires Node 24 but `doctor.mjs` still checks for Node 22, fix the doctor script before distributing the repository.

---

## 9. Build and test before starting the full stack

Run:

```bash
npm run test
npm run smoke
```

If your repository includes a clean-clone validation job, the intended sequence is the same: install from the lockfiles, then build/test from a fresh checkout.

---

## 10. Start the complete local development stack

The normal one-command development entry point is:

```bash
npm run dev
```

The development launcher is intended to start the local stack in this order:

```text
Hardhat local chain
        ↓
contract deployment
        ↓
IPFS / mock IPFS
        ↓
seed data
        ↓
web application
```

The web application is expected at:

```text
http://127.0.0.1:4200
```

Issuer:

```text
http://127.0.0.1:4200/issuer
```

Verifier:

```text
http://127.0.0.1:4200/verify
```

---

## 11. What `npm run dev` should provide

When the stack is healthy, you should have:

```text
Hardhat RPC      http://127.0.0.1:7545
IPFS API         http://127.0.0.1:5001
IPFS gateway     http://127.0.0.1:8080
Web app          http://127.0.0.1:4200
```

The repository can use the built-in IPFS stand-in if no local daemon is listening on the configured IPFS API port.

If using Docker/Kubo instead, start the real IPFS service separately before starting the web stack. The current repository does not provide `infra:*` npm scripts.

---

## 12. Real IPFS mode (optional)

The current repository does not include an `infra/` directory or `infra:*` npm scripts. Docker/Kubo is therefore an external optional service rather than something started by the repository.

If Docker Desktop is installed and running, start your Kubo/IPFS container using your own Docker Compose or Kubo setup, then verify Docker:

```bash
docker --version
docker compose version
```

The local Kubo instance is exposed through the project's configured API/gateway ports.

If the real daemon is unavailable, the development launcher can fall back to the mock IPFS implementation.

---

## 13. Hardhat local blockchain

The project uses a local Hardhat EVM for prototype execution. The contracts package provides a `node` script that starts:

```text
hardhat node --hostname 127.0.0.1 --port 7545
```

You normally do not need to start it manually when using:

```bash
npm run dev
```

For manual debugging:

```bash
npm run chain
```

Keep that terminal running.

In another terminal, with the same Conda environment active, you can deploy with:

```bash
npm run deploy
```

and seed sample data with:

```bash
npm run seed
```

---

## 14. MetaMask setup (optional wallet testing)

MetaMask is only necessary when testing wallet-based issuer transactions.

Add a custom network using the project's configured local RPC:

```text
Network name: Sourcify Local
RPC URL:      http://127.0.0.1:7545
Chain ID:     <value from the project's .env/load-env configuration>
Currency:     ETH
```

The current Hardhat configuration reads the chain ID from the project environment configuration and documents a default of `1337`; use the actual value resolved by your local configuration rather than assuming it if `.env` overrides it.

Import one of the **Hardhat development accounts** into MetaMask if the prototype expects a wallet signer.

These accounts are for local development only.

---

## 15. Understanding the data model

Do not expect the local accounts themselves to contain credential names.

A development account is an Ethereum address used to sign transactions. It is not the credential record.

A credential is split conceptually into:

```text
Credential metadata
        ↓
canonical serialization
        ↓
Keccak-256 document hash
        ↓
on-chain proof/registry record
```

and:

```text
Credential metadata JSON
        ↓
IPFS
        ↓
CID
```

The verifier uses the document hash to locate/check the on-chain record and uses the stored CID to retrieve the off-chain metadata.

This matches the system requirements: the Issuer creates the document hash, pins metadata to IPFS, and anchors the document hash/IPFS CID on-chain; the Verifier queries the on-chain state and retrieves metadata for validation.

---

## 16. Where sample data comes from

When the complete development stack starts, deployment and seed scripts create the local development state.

The important distinction is:

```text
Hardhat accounts
    = transaction identities

Seed/deployment scripts
    = sample blockchain records

IPFS/mock IPFS
    = human-readable metadata payloads
```

If the UI shows only hexadecimal hashes or addresses, that does not by itself mean the data is missing. It may be showing the proof/identity layer rather than the dereferenced metadata layer.

To debug a specific sample credential, inspect:

```text
contracts/scripts/seed.js
contracts/scripts/deploy.js
tools/ipfs-mock.mjs
```

and the verifier service/component that consumes the stored IPFS CID.

---

## 17. Test the Issuer flow

Open:

```text
http://127.0.0.1:4200/issuer
```

Exercise:

1. Enter/edit credential information.
2. Confirm the document hash changes when the source data changes.
3. Open the review/preflight step.
4. Confirm the immutable-action acknowledgement.
5. Submit the issuance transaction.
6. Confirm the receipt/progress state.
7. Capture the generated verification QR/hash.

For wallet mode, verify that the connected wallet address is the expected local development account.

---

## 18. Test the Verifier flow

Open:

```text
http://127.0.0.1:4200/verify
```

Test both:

```text
QR scan
```

and:

```text
manual document-hash entry
```

For a valid credential, verify that the application shows the human-readable credential data together with the proof information returned from the chain.

---

## 19. Test revocation

From the Issuer interface:

1. Select a known credential.
2. Submit a revocation reason.
3. Confirm the transaction.
4. Return to the Verifier.
5. Verify the same document hash again.

The verifier should show the credential as revoked rather than valid.

The contract's role/access controls should prevent an unauthorized account from performing issuer-only actions.

---

## 20. Test account switching correctly

Switching MetaMask accounts should primarily affect **who signs transactions**.

It does not inherently change read-only queries for an already-known document hash.

To validate account switching:

```text
Account A
  ↓
connect wallet
  ↓
record connected address
  ↓
send issuer transaction
```

Then repeat with Account B.

The expected difference is the transaction signer/address and any authorization checks—not a change to the stored credential metadata simply because the wallet account changed.

---

## 21. Test failure/recovery behavior

The prototype exposes local-service health diagnostics.

### Hardhat failure

Stop the local chain process and observe the UI's blockchain diagnostic state.

Restart:

```bash
npm run chain
```

### IPFS failure

Stop the local IPFS daemon or mock service and observe the IPFS diagnostic state.

If you are using a real local Kubo/IPFS daemon, stop and restart that external service using its own Docker/Kubo commands. There is no `npm run infra:down` or `npm run infra:up` script in the current repository.

### Port conflict

The doctor checks the expected ports before starting. If a port is occupied by an unrelated application, stop it or change the project environment configuration.

---

## 22. Reset the development state

Use the repository's cleanup/reset command rather than Windows `rmdir`/`del` commands.

```bash
npm run clean
```

For a complete local reset/restart:

```bash
npm run reset
```

If you are using Docker-backed IPFS and need to reset its local data, reset the Kubo/IPFS data using your external Docker/Kubo configuration. The current repository has no `npm run infra:reset` script.

---

## 23. Recommended daily developer workflow

Open Git Bash and run:

```bash
conda activate sourcify
node --version
npm --version
```

Then:

```bash
npm run doctor
```

If the environment is healthy:

```bash
npm run dev
```

For development/test changes:

```bash
npm run test
npm run smoke
```

---

## 24. Recommended clean-clone workflow for a new developer

From a completely fresh clone:

```bash
git clone <REPOSITORY_URL>
cd sourcify-prototype

conda env create -f environment.yml
conda activate sourcify

node --version
npm --version

npm run doctor
npm run setup

npm run test
npm run smoke
```

Then launch:

```bash
npm run dev
```

Open:

```text
Issuer:   http://127.0.0.1:4200/issuer
Verifier: http://127.0.0.1:4200/verify
```

---

## 25. Common problems

### `node --version` shows Node 26

This means Git Bash is resolving nvm/another Node installation before the Conda environment.

Run:

```bash
conda activate sourcify
type -a node
which node
node -p "process.execPath"
```

The executable should come from the Conda environment.

Do not hardcode the Conda path into `.bashrc` just to hide the problem.

---

### `doctor` rejects Node 24

Check `tools/doctor.mjs`.

The Node requirement in the doctor must agree with the root `package.json`. If the doctor still contains a `major === 22` check, it is stale and must be updated to accept Node 24.x.

---

### `contracts/package-lock.json missing`

The repository is missing a required lockfile.

A maintainer should generate it:

```bash
npm --prefix contracts install
```

and commit:

```text
contracts/package-lock.json
```

Do not rely on each clone generating its own lockfile if reproducibility is a project requirement.

---

### `'hardhat' is not recognized`

First verify the local binary:

```bash
npm --prefix contracts exec -- hardhat --version
ls -la contracts/node_modules/.bin/hardhat*
```

Then verify the package script:

```bash
cat contracts/package.json
```

The `node` script should invoke the local Hardhat command directly, for example:

```json
"node": "hardhat node --hostname 127.0.0.1 --port 7545"
```

Avoid globally installing Hardhat just to bypass the local dependency resolution.

---

### `'E:\...\BSCS' is not recognized as a command`

This usually indicates a Windows shell/path quoting problem involving a project path containing spaces.

Prefer the repository's npm scripts and Node-based launcher rather than shell wrappers that interpolate a Windows path as a command.

The repository path itself can contain spaces; the launcher should pass paths as process arguments instead of concatenating them into shell command strings.

---

### `Cannot find type definition file for 'node'`

The Angular project requires the Node type declarations if its TypeScript configuration explicitly requests them.

Verify the web package contains:

```text
@types/node
```

and that the TypeScript configuration is consistent with the package dependencies.

---

### npm reports unapproved install scripts

Inspect:

```bash
npm --prefix web install-scripts ls
npm --prefix contracts install-scripts ls
```

The repository should contain its reviewed `allowScripts` configuration.

Avoid approving all packages indiscriminately.

---

## 26. Files that should be committed for reproducibility

At minimum, commit these project-definition files:

```text
package.json
.nvmrc
environment.yml
contracts/package.json
contracts/package-lock.json
web/package.json
web/package-lock.json
contracts/hardhat.config.js
tools/doctor.mjs
tools/dev.mjs
```

Do **not** commit:

```text
node_modules/
Hardhat runtime state
IPFS runtime data
local secrets
machine-specific configuration
```

Use the repository's ignored `config.local.json` / `.env` pattern for developer-specific values where provided.

---

## 27. CI/reproducibility expectations

A clean CI job should be able to:

```text
checkout repository
      ↓
install Node version from .nvmrc
      ↓
npm ci using committed lockfiles
      ↓
Hardhat tests
      ↓
Angular build
      ↓
Slither audit
```

The local development environment and CI environment do not have to use the same environment manager. What must match is the project's declared Node/dependency/compiler/toolchain contract.

---

## 28. Final verification checklist

Before declaring a new clone ready:

```bash
conda activate sourcify
node --version
npm --version

npm run doctor
npm run setup
npm run test
npm run smoke
npm run dev
```

Then manually verify:

```text
Issuer page loads
Verifier page loads
Wallet connection can be established
Credential can be issued
QR/hash can be verified
Credential can be revoked
Revoked state is visible to verifier
Manual hash verification works
Service failure diagnostics work
```

---

## 29. Architecture summary

The local prototype is intentionally structured as:

```text
                    ┌───────────────────┐
                    │ Angular Web App   │
                    │ Issuer / Verifier │
                    └─────────┬─────────┘
                              │
              ┌───────────────┴────────────────┐
              │                                │
              ▼                                ▼
       ┌──────────────┐                  ┌──────────────┐
       │ Hardhat EVM  │                  │ IPFS / Mock  │
       │ proof/state  │                  │ metadata     │
       └──────┬───────┘                  └──────┬───────┘
              │                                  │
              │ docHash + CID                    │ JSON metadata
              └────────────────┬─────────────────┘
                               ▼
                       Verifier integrity check
```

This reflects the project's requirements for a hybrid on-chain/off-chain credential record: hash/proof and status are anchored in the local EVM, while the larger metadata payload is retrieved through IPFS.

---

## 30. Maintainer note before publishing the repository

Before using this guide as the official clone/setup instructions, verify these repository consistency points:

1. `package.json`, `web/package.json`, `contracts/package.json`, `.nvmrc`, `environment.yml`, and `tools/doctor.mjs` all agree on Node 24.x.
2. Both package lockfiles are committed.
3. `allowScripts` approvals are committed and reviewed.
4. `contracts/package.json` invokes the local Hardhat CLI rather than a path-sensitive helper.
5. `tools/dev.mjs` passes paths as process arguments and does not depend on the caller's global Node selection for child processes.
6. The CI workflow uses the same Node version contract and performs clean installs.
7. Developer-specific addresses/configuration are not written into tracked source files.

Once those conditions are satisfied, a new developer's machine setup becomes a reproducible repository bootstrap rather than a collection of machine-specific fixes.
