# Sourcify — certificate signing and verification prototype

Issuers anchor a Keccak-256 hash of a certificate on a local EVM chain and pin the file plus a metadata manifest to IPFS. Anyone can verify a certificate by scanning its QR code, pasting the hash, or dropping the file. The UI follows the Figma file *SoftEng — Sourcify*.

> Read [`docs/ARCHITECTURE_LOG.md`](docs/ARCHITECTURE_LOG.md) first. It lists every deviation from the design and states that the SPMP/SRS were **not** available when this was built.

## Stack
| Layer | Choice |
|---|---|
| Contract | Solidity 0.8.24, OpenZeppelin 5 (`AccessControlDefaultAdminRules`), Hardhat 2 (Mocha/Chai) |
| Chain | Hardhat node, chain ID 1337, port 7545, zero base fee |
| Storage | IPFS via Kubo HTTP API (`docker-compose.yml`) or `tools/ipfs-mock.mjs` |
| Web | Angular 21 (standalone, signals, lazy routes), ethers v6, Lucide, `qrcode`, `jsqr`, Inter and Roboto Mono (self-hosted) |

## Quick start
Requires Node ≥ 22.12.
```bash
npm run setup          # installs contracts/ and web/
npm run dev            # chain → deploy → IPFS (mock if no daemon) → seed → web
```
Open **http://127.0.0.1:4200/issuer** (issuer console) and **/verify** (mobile verifier; best on a phone-sized window).

If `binaries.soliditylang.org` is blocked, run `SOLCJS=1 npm run dev`. For a real IPFS node run `docker compose up -d` first; `npm run dev` then reuses it.

Manual steps: `npm run chain`, `npm run ipfs:mock`, `npm run deploy`, `npm run seed`, `npm run web`.

### Wallets and roles
Dev mode uses the node's unlocked accounts; use the wallet menu to switch. Account #0 is the **owner** (can authorise issuers and revoke any record). Authorise another account on *Issuer access*, then issue from it. MetaMask is supported when installed (the app adds chain 1337).

## Layout
```
contracts/   SourcifyRegistry.sol, tests, deploy/seed scripts, slither.config.json
web/         Angular app (core/ services, features/issuer, features/verifier)
tools/       dev.mjs, ipfs-mock.mjs, bench-ipfs.mjs, kubo-init.sh
docs/        ARCHITECTURE_LOG.md
```
Runtime settings live in `web/public/config.json`. The deploy script writes `web/public/deployment/deployment.json` (address and ABI).

## Flow
```
Issuer: choose file → keccak256 → preview CIDs (only-hash) → review → pin file + manifest → sign tx → mint → QR
Verifier: QR/hash/file → registry.verify() → manifest.docHash == anchored hash → re-hash pinned file → result
```

## Tests
`npm test` runs both suites. `npm run bench:ipfs` measures retrieval latency. Static analysis: `npm --prefix contracts run slither` (needs Slither).

## Known gaps
Logo is a placeholder wordmark (export the vector from Figma). MetaMask, camera scanning and a real Kubo node were not exercised in the build sandbox. No authentication beyond wallet roles. Manifests are public; see A-07.
