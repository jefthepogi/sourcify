# Sourcify contributor setup guide

This guide describes how a contributor can clone the repository and reproduce the local development environments.

The primary supported workflow is:

```text
Windows
  ↓
Git Bash
  ↓
Miniforge / Conda
  ↓
Node.js 24
  ↓
Sourcify repository
```

Persistent infrastructure additionally uses:

```text
Windows
  ↓
WSL2
  ↓
Docker Engine
  ↓
Geth + Kubo containers
```

The repository supports two local EVM modes:

```text
Development mode
  Hardhat
  127.0.0.1:8545

Persistent mode
  Geth in Docker
  127.0.0.1:7545
```

IPFS uses:

```text
API      127.0.0.1:5001
Gateway  127.0.0.1:8080
```

---

## 1. Prerequisites

A Windows contributor should install:

- Git for Windows with Git Bash;
- Miniforge or Conda;
- Docker Desktop with WSL2 integration, when using persistent mode;
- a Chromium- or Firefox-based browser.

MetaMask is optional.

The repository expects Node.js 24.x.

---

## 2. Clone the repository

Open Git Bash:

```bash
git clone <REPOSITORY_URL>
cd sourcify
```

Check the repository:

```bash
git status
git branch --show-current
```

The repository's main branch is:

```text
master
```

---

## 3. Create the Conda environment

The repository includes:

```text
environment.yml
```

Create the environment:

```bash
conda env create -f environment.yml
```

Activate it:

```bash
conda activate sourcify-cl
```

Verify:

```bash
node --version
node -p "process.execPath"
npm --version
```

Node should report a 24.x version.

The repository also contains:

```text
.nvmrc
.node-version
```

both of which specify Node 24.

---

## 4. Verify that Git Bash is using the correct Node

A common Windows problem is having multiple Node installations.

Check:

```bash
type -a node
type -a npm
which node
which npm
```

Also check:

```bash
node -p "process.execPath"
```

The selected executable should come from the active Conda environment.

Do not permanently hard-code a Conda path into `.bashrc` to work around an incorrect environment.

Conda activation should provide the correct path dynamically.

---

## 5. Create the local environment file

Copy the template:

```bash
cp .env.example .env
```

The normal configuration is:

```env
SOURCIFY_DEVELOPMENT_RPC_PORT=8545
SOURCIFY_PERSISTENT_RPC_PORT=7545
SOURCIFY_CHAIN_ID=1337
IPFS_API_PORT=5001
IPFS_GATEWAY_PORT=8080
INSTITUTION_NAME=SOURCE
```

The `.env` file is local configuration and should not be committed.

---

## 6. Install repository dependencies

Run:

```bash
npm run setup
```

The setup command performs the repository preflight checks and installs:

```text
contracts/package-lock.json
web/package-lock.json
```

using `npm ci`.

Manual installation is also possible:

```bash
npm --prefix contracts ci
npm --prefix web ci
```

For reproducibility, prefer `npm ci` when installing from the committed lockfiles.

---

## 7. Run the repository doctor

Run:

```bash
npm run doctor
```

The doctor verifies the local development prerequisites and checks the configured services.

This should be done before debugging application-level failures.

---

# Development mode

## 8. Start disposable development mode

Run:

```bash
npm run dev
```

The development launcher manages the disposable runtime.

Conceptually it performs:

```text
Hardhat
   ↓
deployment
   ↓
IPFS/mock IPFS
   ↓
seed
   ↓
Angular
```

The expected services are:

```text
Hardhat RPC  http://127.0.0.1:8545
IPFS API     http://127.0.0.1:5001
IPFS Gateway http://127.0.0.1:8080
Angular      http://127.0.0.1:4200
```

Application URLs:

```text
Issuer:
http://127.0.0.1:4200/issuer

Verifier:
http://127.0.0.1:4200/verify
```

---

## 9. Development chain behavior

Development mode is intentionally disposable.

The Hardhat chain is a local runtime intended for:

- UI development;
- contract development;
- automated testing;
- deterministic demonstrations.

Do not use development chain state as persistent project data.

When the development node is restarted, the deployment/seed sequence rebuilds the local state.

---

# Persistent mode

## 10. Why persistent mode exists

Persistent mode is intended for development sessions where blockchain and IPFS data should survive container restarts.

It uses:

```text
Geth
+
Kubo
+
Docker named volumes
```

instead of the in-memory Hardhat node and IPFS mock.

---

## 11. Windows architecture

The expected Windows architecture is:

```text
Windows
   │
   ├── Git Bash
   │     └── npm / Sourcify tools
   │
   └── WSL2
         └── Docker Engine
               ├── Geth
               └── Kubo
```

The repository's persistent scripts use WSL Docker where required.

Confirm WSL is installed:

```bash
wsl --status
```

List available distributions:

```bash
wsl -l -v
```

Docker must be available from the WSL environment.

---

## 12. Verify Docker from WSL

From Git Bash, run:

```bash
wsl docker --version
```

Then:

```bash
wsl docker compose version
```

Both commands should succeed.

Also verify containers can be listed:

```bash
wsl docker ps
```

The exact list may be empty before starting the Sourcify services.

---

## 13. Start the persistent Docker services

The repository defines the persistent stack in:

```text
docker-compose.dev.yml
```

Start it manually with:

```bash
wsl docker compose -f docker-compose.dev.yml up -d
```

Then inspect the services:

```bash
wsl docker compose -f docker-compose.dev.yml ps
```

You should see the Sourcify containers:

```text
sourcify-geth
sourcify-ipfs
```

---

## 14. Persistent Docker services

### Geth

The Geth container runs its HTTP RPC on container port:

```text
8545
```

Docker publishes it to the Windows/WSL host as:

```text
7545
```

Therefore the application connects to:

```text
http://127.0.0.1:7545
```

### Kubo

Kubo publishes:

```text
5001 → API
8080 → Gateway
4001 → Swarm
```

The Angular application uses:

```text
http://127.0.0.1:5001
```

for API operations and:

```text
http://127.0.0.1:8080/ipfs
```

for gateway access.

---

## 15. Persistent Docker volumes

The compose file defines:

```text
sourcify-geth-data
sourcify-ipfs-data
```

These are named Docker volumes.

Inspect them with:

```bash
wsl docker volume ls
```

You should see:

```text
sourcify-geth-data
sourcify-ipfs-data
```

The volumes are what provide persistence across normal container stop/start cycles.

---

## 16. Start the complete persistent environment

Once Docker is working, the simplest command is:

```bash
npm run dev:persistent
```

This starts the persistent environment and then runs the application workflow.

Conceptually:

```text
Docker Geth
      ↓
Docker Kubo
      ↓
wait for services
      ↓
deploy/reuse persistent registry
      ↓
seed deterministic data
      ↓
Angular
```

The application should then be available at:

```text
http://127.0.0.1:4200
```

---

## 17. Persistent deployment record

Persistent deployment state is stored in:

```text
web/public/deployment/persistent.json
```

The active client deployment is also written to:

```text
web/public/deployment/deployment.json
```

When restarting the persistent environment, the deployment script checks the recorded address.

If bytecode is still present at that address, the existing registry is reused.

This is important because restarting Docker should not normally mean deploying a new contract.

---

## 18. Persistent seeding

Seed persistent demo data with:

```bash
npm run seed:persistent
```

The seed process checks the selected registry before issuing deterministic demo records.

This means repeated seeding should not continually create duplicate certificates for the same document hashes.

---

# Running persistent mode manually

## 19. Start only Docker

You can separate infrastructure from application startup.

Start Docker services:

```bash
wsl docker compose -f docker-compose.dev.yml up -d
```

Check:

```bash
wsl docker compose -f docker-compose.dev.yml ps
```

Then deploy:

```bash
npm run deploy:persistent
```

Then seed:

```bash
npm run seed:persistent
```

Finally start the web application:

```bash
npm run web
```

This workflow is useful when debugging a particular layer independently.

---

## 20. Check the Geth RPC

From Git Bash:

```bash
curl http://127.0.0.1:7545
```

A raw HTTP request may return an error because JSON-RPC expects a POST body. The important check is that the endpoint is reachable.

The persistent smoke test is a better application-level validation:

```bash
node tools/smoke.mjs --mode persistent
```

---

## 21. Check Kubo

Check whether the API is reachable:

```bash
curl http://127.0.0.1:5001/api/v0/version
```

A healthy Kubo API should return version information.

Check the gateway:

```bash
curl http://127.0.0.1:8080
```

---

## 22. Kubo CORS configuration

The repository includes:

```text
docker/ipfs-init/001-cors.sh
```

This configures the Kubo API to allow the local Angular application origins:

```text
http://127.0.0.1:4200
http://localhost:4200
```

The configured methods include:

```text
GET
POST
OPTIONS
```

The script is mounted into the Kubo initialization directory through Docker Compose.

---

# Switching between modes

## 23. Important RPC distinction

Never treat these as interchangeable:

```text
Development:
127.0.0.1:8545

Persistent:
127.0.0.1:7545
```

The two ports intentionally identify different EVM runtimes.

If you deploy to development, the resulting deployment belongs to:

```text
development.json
```

If you deploy to persistent, the resulting deployment belongs to:

```text
persistent.json
```

---

## 24. Do not run both EVM modes against the same RPC

The purpose of the architecture is:

```text
Hardhat
   → 8545

Geth
   → 7545
```

Do not change the configuration so both modes use the same EVM RPC endpoint.

The separate ports are part of the environment isolation strategy.

---

# Stopping services

## 25. Stop persistent mode without deleting data

Run:

```bash
npm run stop:persistent
```

This is intended to stop the persistent services without removing their named volumes.

You can also use Docker Compose directly:

```bash
wsl docker compose -f docker-compose.dev.yml stop geth ipfs
```

---

## 26. Restart persistent mode

Start the services again:

```bash
npm run dev:persistent
```

or:

```bash
wsl docker compose -f docker-compose.dev.yml up -d
```

The existing volumes should still contain the previous blockchain/IPFS data.

---

## 27. Destructive persistent reset

Use:

```bash
npm run reset:persistent
```

This removes the Docker Compose environment and its volumes.

Treat this as destructive.

It is the equivalent of starting the persistent infrastructure again from empty storage.

Do not use it as a normal stop command.

---

# Testing

## 28. Unit tests

Run:

```bash
npm run test
```

This executes the contract and web test suites.

---

## 29. Development smoke test

Run:

```bash
npm run smoke
```

This exercises the disposable development environment.

---

## 30. Persistent smoke test

First ensure Geth and Kubo are running:

```bash
wsl docker compose -f docker-compose.dev.yml ps
```

Then run:

```bash
node tools/smoke.mjs --mode persistent
```

The persistent smoke test does not own the Docker lifecycle. It expects the persistent services to already be running.

---

# Cleanup

## 31. Normal development cleanup

Use:

```bash
npm run clean
```

This removes disposable generated state such as:

```text
Hardhat artifacts/cache
mock IPFS runtime data
web build output
generated development deployment data
generated runtime config
```

Persistent deployment information should not be treated as disposable development state.

---

## 32. Reset disposable development mode

Use:

```bash
npm run reset
```

This performs the normal cleanup and starts the development environment again.

---

# Windows shell considerations

## 33. Avoid shell-based path concatenation

Windows paths can contain spaces.

Repository tools should therefore prefer process argument arrays over command strings.

When debugging Windows failures, prefer:

```bash
npm run ...
```

over manually constructing shell commands that concatenate full Windows paths.

---

## 34. Verify Node and npm again when debugging

When a command works in one shell but not another, check:

```bash
node --version
node -p "process.execPath"
npm --version
```

Then:

```bash
type -a node
type -a npm
```

The correct Conda environment should be active.

---

# Common problems

## `docker: command not found`

On Windows Git Bash, try:

```bash
wsl docker --version
```

The repository's persistent tooling can use WSL Docker.

If that also fails, Docker/WSL integration has not been configured correctly.

---

## Docker commands work in WSL but not Git Bash

This can be normal.

The project supports the WSL form:

```bash
wsl docker ...
```

Use that form for persistent Docker management when the Git Bash `docker` command is unavailable.

---

## `EADDRINUSE`

A service is already listening on the requested port.

Check the configured endpoints:

```text
4200
5001
8080
8545
7545
```

Run:

```bash
npm run doctor
```

before changing configuration.

---

## Persistent chain appears empty after restart

First inspect Docker volumes:

```bash
wsl docker volume ls
```

Then verify:

```text
sourcify-geth-data
```

still exists.

Check that Geth is running:

```bash
wsl docker compose -f docker-compose.dev.yml ps
```

Then inspect:

```text
web/public/deployment/persistent.json
```

The recorded registry address should still contain contract bytecode.

Do not immediately run `reset:persistent`, because that intentionally destroys the data you are trying to recover.

---

## Persistent IPFS content appears missing

Check:

```text
sourcify-ipfs-data
```

and verify Kubo is running:

```bash
wsl docker compose -f docker-compose.dev.yml ps
```

Then verify the API:

```bash
curl http://127.0.0.1:5001/api/v0/version
```

---

## Angular loads but cannot reach the chain

Inspect:

```text
web/public/config.json
```

and verify that the active runtime points to the correct endpoint.

The expected values are:

```text
development → http://127.0.0.1:8545
persistent   → http://127.0.0.1:7545
```

Do not make manual edits to the generated config. Use the project launcher/config generator instead.

---

## `npm ci` fails

First check:

```bash
node --version
npm --version
```

Then:

```bash
npm run doctor
```

The repository expects Node 24.x and uses committed lockfiles.

Do not delete a lockfile simply to make installation succeed.

---

# Recommended clean-clone validation

A new contributor should be able to perform:

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

Then start development:

```bash
npm run dev
```

To validate persistent infrastructure:

```bash
npm run dev:persistent
```

and in another terminal:

```bash
node tools/smoke.mjs --mode persistent
```

---

# Contributor checklist

Before considering a new clone ready:

```text
[ ] Conda environment created
[ ] Node 24.x active
[ ] npm available
[ ] .env created
[ ] npm run doctor passes
[ ] npm run setup passes
[ ] contract tests pass
[ ] web tests pass
[ ] development smoke test passes
[ ] development UI loads
[ ] persistent Docker services start
[ ] persistent smoke test passes
```

Before committing changes:

```bash
npm run test
npm run smoke
git status
```

Do not commit:

```text
node_modules/
.env
Docker runtime data
Hardhat runtime data
mock IPFS runtime data
machine-specific credentials
```

---

# Architecture reference

For the rationale behind the current architecture, including the changes from the original Figma/SPMP/SRS baseline, see:

```text
docs/ARCHITECTURE_LOG.md
```

The most important runtime distinction is:

```text
                 SOURCIFY LOCAL RUNTIMES

        DEVELOPMENT              PERSISTENT
        -----------              ----------
        Hardhat                  Docker Geth
        RPC :8545                RPC :7545
        disposable               volume-backed

                 \                /
                  \              /
                   \            /
                    Angular UI
                      :4200

                 Shared IPFS
                   :5001
                   :8080
```

This separation is intentional and should be preserved when modifying the local development tooling.