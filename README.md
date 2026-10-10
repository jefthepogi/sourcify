# Sourcify — certificate signing and verification prototype

Sourcify is a local hybrid certificate issuance and verification prototype. An Issuer creates a Keccak-256 document hash, stores certificate metadata through IPFS, and anchors the document hash plus metadata CID in the Sourcify registry smart contract. A Verifier can query the on-chain record and retrieve the referenced IPFS metadata.

> For implementation decisions and documented deviations from the original design, see [`docs/ARCHITECTURE_LOG.md`](docs/ARCHITECTURE_LOG.md).

---

## Quick start

### Development mode

Development mode uses a disposable Hardhat local blockchain.

```bash
conda activate sourcify-cl
npm run setup
npm run dev
```

The application will be available at:

```text
Issuer:   http://127.0.0.1:4200/issuer
Verifier: http://127.0.0.1:4200/verify
```

Run the development end-to-end smoke test with:

```bash
npm run smoke
```

Development mode uses:

```text
Hardhat RPC   http://127.0.0.1:8545
IPFS API      http://127.0.0.1:5001
IPFS Gateway  http://127.0.0.1:8080
Angular       http://127.0.0.1:4200
```

The development blockchain is disposable. Restarting it produces a fresh local chain.

When no real IPFS daemon is available, the development launcher can use the repository's built-in IPFS mock.

---

## Persistent local mode

Persistent mode uses Docker-backed services running inside WSL2.

The persistent environment contains:

| Service | Host endpoint | Container endpoint | Storage |
|---|---|---|---|
| Geth | `127.0.0.1:7545` | `8545` | `sourcify-geth-data` |
| Kubo API | `127.0.0.1:5001` | `5001` | `sourcify-ipfs-data` |
| Kubo Gateway | `127.0.0.1:8080` | `8080` | `sourcify-ipfs-data` |
| Kubo Swarm | `127.0.0.1:4001` | `4001` | `sourcify-ipfs-data` |

Start the persistent environment with:

```bash
npm run dev:persistent
```

The persistent launcher is responsible for:

```text
start Docker services
       ↓
wait for Geth
       ↓
wait for Kubo
       ↓
deploy/reuse SourcifyRegistry
       ↓
seed deterministic demo credentials
       ↓
start Angular application
```

The Geth and Kubo data are stored in Docker volumes so that restarting the containers does not normally erase the local registry or IPFS data.

The complete contributor setup, including Docker + WSL2 configuration on Windows, is documented in [`docs/SETUP.md`](docs/SETUP.md).

---

# Runtime modes

Sourcify intentionally has two separate local EVM modes.

| Concern | Development mode | Persistent mode |
|---|---|---|
| EVM | Hardhat local node | Dockerized Geth |
| RPC | `127.0.0.1:8545` | `127.0.0.1:7545` |
| Chain state | Disposable | Docker volume-backed |
| Chain ID | `1337` by default | `1337` by default |
| Deployment record | `development.json` | `persistent.json` |
| Active deployment | `deployment.json` | `deployment.json` |
| IPFS | Mock by default / Kubo may be reused | Dockerized Kubo |
| IPFS API | `127.0.0.1:5001` | `127.0.0.1:5001` |
| IPFS gateway | `127.0.0.1:8080` | `127.0.0.1:8080` |

The RPC ports are deliberately different.

```text
Development → 8545
Persistent   → 7545
```

This separation prevents the disposable Hardhat environment from accidentally operating against the persistent Geth chain.

The IPFS API and gateway are shared because both application modes use the same local IPFS interface.

For a completely isolated disposable development session, stop the persistent Docker services before starting `npm run dev`.

---

# Deployment records

Deployment is network-aware.

Development:

```bash
npm run deploy
```

writes:

```text
web/public/deployment/development.json
```

Persistent:

```bash
npm run deploy:persistent
```

writes:

```text
web/public/deployment/persistent.json
```

Both modes also maintain:

```text
web/public/deployment/deployment.json
```

as the active deployment record consumed by the Angular application.

The mode-specific deployment files are the authoritative records for their respective environments.

In persistent mode, the deployment script checks whether the previously recorded contract address still contains contract bytecode. When it does, the existing registry is reused instead of deploying another registry.

A fresh deployment can be forced with:

```bash
DEPLOY_FORCE=1 npm run deploy:persistent
```

---

# Deterministic seed data

The seed script creates a fixed set of demo credentials.

The development environment can therefore be rebuilt from scripts rather than depending on manually created local blockchain state.

In persistent mode, the seed operation is idempotent with respect to existing document hashes. Existing records are detected on-chain and are not issued again.

This makes the persistent environment suitable for stop/start cycles without repeatedly creating duplicate records.

---

# Environment configuration

Local environment settings are centralized in `.env`.

Create the file from the repository example:

```bash
cp .env.example .env
```

The main settings are:

```env
SOURCIFY_DEVELOPMENT_RPC_PORT=8545
SOURCIFY_PERSISTENT_RPC_PORT=7545
SOURCIFY_CHAIN_ID=1337
IPFS_API_PORT=5001
IPFS_GATEWAY_PORT=8080
INSTITUTION_NAME=SOURCE
```

The environment loader in `tools/load-env.cjs` is the shared source used by the local tooling.

The selected runtime mode is exposed to the browser through the generated:

```text
web/public/config.json
```

The config file should be generated by the tooling rather than manually edited.

Do not commit your local `.env`.

---

# Common commands

| Command | Purpose |
|---|---|
| `npm run doctor` | Check Node/npm, dependencies, ports, and Docker availability |
| `npm run setup` | Run preflight checks and install locked dependencies |
| `npm run dev` | Start disposable development mode |
| `npm run smoke` | Run the development end-to-end smoke test |
| `node tools/smoke.mjs --mode persistent` | Smoke-test an already-running persistent environment |
| `npm run dev:persistent` | Start the Docker-backed persistent environment |
| `npm run deploy` | Deploy to the development Hardhat network |
| `npm run seed` | Seed development demo data |
| `npm run deploy:persistent` | Deploy/reuse the persistent registry |
| `npm run seed:persistent` | Seed persistent demo data |
| `npm run stop:persistent` | Stop persistent services without deleting volumes |
| `npm run reset:persistent` | Destroy persistent Docker containers and volumes |
| `npm run clean` | Remove disposable generated artifacts |
| `npm run reset` | Clean disposable state and restart development mode |
| `npm run test` | Run contract and web tests |
| `npm run bench:ipfs` | Benchmark local IPFS retrieval |

---

# Architecture

The local system has four main layers:

```text
                         ┌─────────────────────┐
                         │     Web Browser     │
                         │  Issuer / Verifier  │
                         └──────────┬──────────┘
                                    │
                              HTTP :4200
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Angular Client    │
                         │ runtime config.json │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┴────────────────┐
                    │                                │
                    ▼                                ▼
          ┌────────────────────┐           ┌────────────────────┐
          │    EVM runtime     │           │   IPFS runtime     │
          │                    │           │                    │
          │ Hardhat :8545 OR  │           │ API :5001           │
          │ Geth :7545         │           │ Gateway :8080       │
          └─────────┬──────────┘           └─────────┬──────────┘
                    │                                │
                    │ docHash + metadata CID        │ metadata/document
                    └──────────────┬─────────────────┘
                                   ▼
                          Verification result
```

The EVM stores the registry/proof information.

IPFS stores the larger off-chain document and metadata payload.

The browser reads the generated runtime configuration and connects to the selected local EVM endpoint.

---

# Data flow

The Issuer flow is conceptually:

```text
Certificate/document
        │
        ▼
Keccak-256 document hash
        │
        ├──────────────► SourcifyRegistry
        │                  ├─ document hash
        │                  ├─ metadata CID
        │                  ├─ issuer
        │                  └─ lifecycle state
        │
        ▼
IPFS
  ├─ document
  └─ metadata manifest
```

The Verifier flow is:

```text
QR / document hash / file
        │
        ▼
SourcifyRegistry
        │
        ├─ record exists?
        ├─ status?
        └─ metadata CID
                │
                ▼
              IPFS
                │
                ▼
         metadata/document
                │
                ▼
       cryptographic validation
```

The design keeps larger certificate content off the public blockchain while retaining an on-chain cryptographic proof and lifecycle state.

---

# Roles

### Issuer

The Issuer:

- prepares certificate data;
- computes the document hash;
- pins the document and metadata;
- submits the issuance transaction;
- receives a transaction receipt and verification information;
- can revoke records when authorized.

### Verifier

The Verifier:

- scans a QR code or provides a document hash;
- can also provide the certificate file;
- queries the Sourcify registry;
- retrieves the referenced IPFS content;
- validates the relationship between the presented certificate, IPFS metadata, and on-chain record.

---

# Smart contract

The main contract is:

```text
contracts/contracts/SourcifyRegistry.sol
```

The contract uses:

- Solidity `0.8.24`;
- OpenZeppelin access control;
- `AccessControlDefaultAdminRules`;
- `ISSUER_ROLE`;
- certificate lifecycle states;
- issuance timestamps;
- optional expiry;
- revocation state;
- IPFS metadata CID.

The registry stores cryptographic and lifecycle information rather than the complete human-readable certificate payload.

---

# Repository layout

```text
sourcify/
├── package.json
├── .env.example
├── .nvmrc
├── .node-version
├── environment.yml
│
├── contracts/
│   ├── contracts/
│   │   └── SourcifyRegistry.sol
│   ├── scripts/
│   │   ├── deploy.js
│   │   └── seed.js
│   ├── test/
│   ├── hardhat.config.js
│   ├── package.json
│   └── package-lock.json
│
├── web/
│   ├── src/
│   ├── public/
│   │   ├── config.json
│   │   └── deployment/
│   ├── package.json
│   └── package-lock.json
│
├── tools/
│   ├── dev.mjs
│   ├── dev-persistent.mjs
│   ├── doctor.mjs
│   ├── smoke.mjs
│   ├── clean.mjs
│   ├── load-env.cjs
│   ├── write-config.mjs
│   ├── ipfs-mock.mjs
│   └── bench-ipfs.mjs
│
├── docker-compose.dev.yml
│
├── docker/
│   └── ipfs-init/
│       └── 001-cors.sh
│
├── docs/
│   ├── ARCHITECTURE_LOG.md
│   └── SETUP.md
│
└── .github/
    └── workflows/
```

---

# Docker and WSL2

The persistent infrastructure is defined in:

```text
docker-compose.dev.yml
```

It starts:

```text
sourcify-geth
sourcify-ipfs
```

with persistent volumes:

```text
sourcify-geth-data
sourcify-ipfs-data
```

On Windows, the repository's launcher uses WSL Docker when appropriate.

The contributor setup guide explains the expected Windows architecture and the commands required to validate it:

[`docs/SETUP.md`](docs/SETUP.md)

---

# Persistence rules

`npm run stop:persistent` is non-destructive.

It stops the persistent services but leaves the Docker volumes intact.

Do not use:

```bash
npm run reset:persistent
```

unless you intentionally want to destroy the persistent blockchain and IPFS data.

That command uses Docker Compose volume removal and therefore resets the persistent environment.

The normal development cleanup should also leave:

```text
web/public/deployment/persistent.json
```

untouched.

---

# Testing

Run the complete test suite with:

```bash
npm run test
```

The project also provides the end-to-end smoke test:

```bash
npm run smoke
```

Development smoke test:

```bash
npm run smoke
```

Persistent smoke test:

```bash
node tools/smoke.mjs --mode persistent
```

The persistent smoke test assumes that the Docker-backed Geth and Kubo services are already running.

---

# Reproducibility

The repository pins the main local toolchain:

```text
Node.js       24.x
Solidity      0.8.24
Hardhat       2.29.x
ethers        6.17.0
OpenZeppelin  5.x
```

The project also commits package lockfiles and uses deterministic development seed data.

For a fresh checkout, the recommended validation sequence is:

```bash
npm run doctor
npm run setup
npm run test
npm run smoke
```

---

# Wallet testing

Development can use the local node's unlocked accounts.

The local accounts are transaction identities only. They are not themselves certificate records.

MetaMask is optional for development testing.

When using MetaMask, connect it to the RPC endpoint for the runtime you are testing:

```text
Development: http://127.0.0.1:8545
Persistent:  http://127.0.0.1:7545
```

The chain ID is taken from the local project configuration and defaults to:

```text
1337
```

Local development accounts and private keys must never be treated as production credentials.

---

# Troubleshooting

Run:

```bash
npm run doctor
```

first.

Typical issues include:

### Port already in use

Check:

```text
8545
7545
5001
8080
4200
```

Development needs the Hardhat RPC on `8545`.

Persistent mode needs Geth on `7545`.

Both modes use IPFS ports `5001` and `8080`.

### Persistent services are unavailable

Check Docker/WSL:

```bash
wsl docker ps
```

Then inspect:

```bash
wsl docker compose -f docker-compose.dev.yml ps
```

### Persistent registry appears to have changed

Check:

```text
web/public/deployment/persistent.json
```

and verify that Geth still has bytecode at the recorded address.

Also check that the Docker volume still exists:

```bash
wsl docker volume ls
```

### Development connects to the wrong chain

Confirm the runtime mode:

```text
development → 8545
persistent   → 7545
```

The generated browser configuration is:

```text
web/public/config.json
```

Do not manually replace the RPC URL there; regenerate it through the repository tooling.

---

# Contribution workflow

For a new contributor:

```bash
git clone <REPOSITORY_URL>
cd sourcify

conda env create -f environment.yml
conda activate sourcify-cl

cp .env.example .env

npm run doctor
npm run setup
npm run test
npm run smoke
```

For normal application development:

```bash
npm run dev
```

For persistent Docker-backed development:

```bash
npm run dev:persistent
```

Before submitting changes:

```bash
npm run test
npm run smoke
git status
```

Keep generated runtime data, local environment files, node modules, chain data, and IPFS data out of version control.

---

# Known limitations

Sourcify remains a local prototype.

The project does not treat a local blockchain or local IPFS daemon as production infrastructure.

Public IPFS metadata has residual privacy implications because IPFS content is addressable by CID.

Hardware- and browser-specific integrations such as real camera QR scanning and MetaMask should be validated on the target development machine.

The architecture and implementation are documented further in:

[`docs/ARCHITECTURE_LOG.md`](docs/ARCHITECTURE_LOG.md)
[`docs/SETUP.md`](docs/SETUP.md)
