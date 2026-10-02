# Sourcify — Architecture Change Log

| Field | Value |
|---|---|
| Document | Architecture Change Log (design deviations and decisions) |
| Version | 0.2 (adds A-12, plan cross-check) |
| Date | 2026-10-02 |
| Format | Change-request style after Pressman (*Software Engineering: A Practitioner's Approach*, SCM chapter): ID, source, finding, change, rationale, impact, status. Design views follow the spirit of IEEE 1016; requirement wording follows ISO/IEC/IEEE 29148 (successor to IEEE 830). |

## 0. Scope and what has been checked

The Figma design was read first (file `L40rFobuk8btnwXiHzzB4U`). The SPMP and SRS arrived later and **only the parts that bear on the environment, tooling and hashing were read** (SPMP §5.3, the risk register entries TR-04/09/19/20/32/42 and PR-14, the tool lists; the SRS glossary and the issuance and verification use cases). A full requirement-by-requirement traceability review has **not** been done; §3 marks which rows are filled and which are pending.

Where an entry conflicts with a documented requirement, the document wins and the entry should be reverted or the document amended through change control.

## 1. Baseline derived from the Figma design

| Area | Observed in Figma | Implemented as |
|---|---|---|
| Issuer console | Top bar (network pill, wallet, bell, avatar), sidebar (Issue credential, Credentials, Recipients, Transactions, Audit log, local-service health), three-section form, readiness panel, preflight checks, recent issuance | `web/src/app/features/issuer/*` |
| Issuance states | Review modal → progress modal → network-disconnected error boundary | `review-modal`, `progress-modal`, `recovery-modal` |
| Verifier (mobile) | Scan, manual docHash entry, VALID, REVOKED | `features/verifier/*` (plus NOT FOUND and EXPIRED) |
| Stack hints | Ganache chain 1337 on :7545, IPFS API :5001, MetaMask, Lucide icons, Inter + Roboto Mono | Hardhat node 1337 on :7545, Kubo-compatible API on :5001, MetaMask and dev-wallet modes, Lucide, same fonts |

## 2. Change log

Status values: **Applied** (in the code), **Needs decision** (applied provisionally, confirm).

### A-01 Hardhat Network replaces Ganache
- **Source:** Figma labels ("Ganache · Chain 1337", "GANACHE · 7545"); engineering judgement.
- **Finding:** Ganache and the Truffle suite were discontinued by ConsenSys in late 2023. Building a new project on them adds maintenance risk.
- **Change:** Local chain is `hardhat node` on port 7545 with chain ID 1337 and `initialBaseFeePerGas: 0`, so the UI frames (port, chain ID) remain accurate. Tests use Mocha + Chai through Hardhat. UI copy says "Local Hardhat".
- **Impact:** Contracts, tests, scripts. No UI layout change.
- **Plan check:** the SPMP names Ganache (§5.3 infrastructure, TR-04, TR-19, TR-32) and Truffle/Mocha (Gate 4 deliverables), so this is a deviation from the plan, not only from the mock-up.
- **Status:** Needs decision. If the plan stays as written, the contract and app work unchanged against Ganache; the SPMP tool tables also already list "Ganache / Hardhat" together.

### A-02 Hash algorithm: Keccak-256 (design says SHA-256)
- **Source:** Figma field label "docHash (SHA-256)"; 32-byte `0x…` value.
- **Finding:** On an EVM stack Keccak-256 is native (`keccak256` in Solidity, `ethers.keccak256`). The label and any implementation must agree, otherwise hashes computed by issuer and verifier differ.
- **Change:** One routine, `keccakOfBlob` (`web/src/app/core/util.ts`), is used for issuance, file checks and integrity checks. UI label reads "docHash (Keccak-256)". The contract stores an opaque `bytes32`, so switching to SHA-256 means changing only that routine and the label.
- **SRS check:** the SRS glossary and the issuance use case both specify Keccak-256, so the Figma label is the outlier and the implementation agrees with the SRS.
- **Status:** Applied (consistent with the SRS; fix the Figma label).

### A-03 `docHash` is the hash of the file; verification cross-checks IPFS against the chain
- **Source:** Figma ("Computed locally from the selected document", "docHash matches selected artifact").
- **Finding:** Re-hashing metadata fetched from IPFS and comparing it to the chain only shows that IPFS and the chain agree with each other. It does not show that the document a holder presents is the one that was issued.
- **Change:** `docHash = keccak256(file bytes)`. Two objects are pinned: the file and a JSON manifest (`sourcify.credential.v1`) that records `docHash` and the file's CID. The chain stores `docHash` and the manifest CID. The verifier (a) looks up the hash on-chain, (b) checks `manifest.docHash` equals the anchored hash, (c) re-hashes the pinned file. The verifier can also hash a file the holder supplies ("Check a certificate file").
- **Impact:** `issuance.service.ts`, `verifier.component.ts`.
- **SRS check:** the SRS issuance use case hashes the raw certificate *metadata*, and the verification use case re-hashes the JSON fetched from IPFS and compares it with the on-chain `docHash`. This entry changes both. The SRS flow is still performed (manifest `docHash` is compared with the chain) and a file re-hash is added.
- **Status:** Needs decision; requires an SRS change request if accepted.

### A-04 QR code cannot be inside the hashed file
- **Source:** Engineering judgement.
- **Finding:** If the printed QR encodes the document's own hash, stamping it into the file changes the file and therefore the hash (circular dependency).
- **Change:** `docHash` is computed over the final, **unstamped** certificate. The QR carries `https://<host>/verify/<docHash>` and is distributed alongside the file or printed on a cover/footer outside the hashed bytes. The form hint says "final, unstamped certificate". QR error correction is level H.
- **Status:** Applied. Confirm the issuing workflow can supply an unstamped master.

### A-05 Role model: AccessControl with two-step ownership
- **Source:** Engineering judgement (the design shows "Issuer admin" and "Wallet authorized for issuer contract").
- **Change:** `DEFAULT_ADMIN_ROLE` (owner, two-step transfer via OpenZeppelin `AccessControlDefaultAdminRules`) and `ISSUER_ROLE`. The owner authorises issuers with a display name shown to verifiers; the owner or the original issuer may revoke. Revocation is permanent and a revoked hash cannot be re-registered (duplicates are rejected), so a correction must be a new file.
- **Impact:** `SourcifyRegistry.sol`, 16 tests, "Issuer access" page.
- **Status:** Applied.

### A-06 Pin to IPFS **before** asking for the signature
- **Source:** Figma progress modal order: *Awaiting Wallet Signature → Pinning to IPFS → Minting → Confirmed*.
- **Finding:** The signed transaction contains the manifest CID, so the CID must exist before signing. The drawn order is not implementable without signing something other than the mint transaction.
- **Change:** Order is *Pinning → Awaiting wallet signature → Minting → Confirmed*. The review modal shows final CIDs, computed with Kubo's `only-hash`, so cancelling leaves no orphan pins. The pinned CIDs are compared with the reviewed ones before signing.
- **Status:** Applied.

### A-07 Personal data minimisation
- **Source:** Figma form (name, e-mail, DID).
- **Finding:** IPFS content is public and permanent.
- **Change:** The e-mail address is used only for the share link and is never written to the manifest or chain. DID is optional. A 128-bit random salt is added to the manifest so manifests cannot be guessed from known names.
- **Status:** Applied. Residual risk: the recipient's name and program are public to anyone who learns the CID. Encrypting the manifest is a candidate follow-up.

### A-08 Verifier shows the real network
- **Source:** Figma VALID screen text "Ethereum Sepolia · Block 6,245,901".
- **Finding:** The rest of the design is a local 1337 network; a public-testnet label would mislead verifiers.
- **Change:** The proof line reads `<configured chain name> · Chain <id> · Block <n>` from the actual issuance event.
- **Status:** Applied.

### A-09 Naming and schema
- **Source:** Figma strings ("Proofline cannot reach…", `proofline.degree.v2`, component "Proofline brand") versus the SOURCIFY logo.
- **Change:** Product copy uses **Sourcify**. Schema ID is `sourcify.credential.v1` (not tied to degrees, since the type dropdown covers fellowships and certifications).
- **Status:** Applied.

### A-10 Additions beyond the mock-ups (confirm scope)
Issuer access page; NOT FOUND and EXPIRED result states; "Check a certificate file" on the verifier; generic ledger pages (Credentials with revoke, Recipients, Transactions, Audit log); dev-wallet mode (unlocked local accounts) next to MetaMask; draft autosave (`localStorage`, file excluded).

### A-11 Toolchain pins forced by the build environment
- Angular **21** rather than 22: the build sandbox had Node 22.22.2 and Angular 22 requires ≥ 22.22.3. On a newer Node, upgrade with `ng update`.
- Hardhat **2.29** rather than 3 (stable plugin set). Optional `SOLCJS=1` compiles with the `solc` npm package when `binaries.soliditylang.org` is unreachable.
- Icons use the `lucide` core package through a small `IconComponent` (tree-shaken), not a framework wrapper, to stay independent of Angular peer-dependency lag.
- Gas is displayed in gas units. The mock shows ETH, but with a zero base fee the ETH value is always 0.
- **SPMP check:** the SPMP names a *React* DApp. Angular was chosen at the project owner's direction; record it as an SPMP change.
- **Status:** Applied.

### A-12 Reproducible environment (added after the SPMP/SRS were supplied)
- **Source:** SPMP TR-04 (compiler drift), TR-09 (Ethers.js version), TR-19 (port conflicts), TR-20 and TR-32 (local data loss; treat as reproducible by script), TR-42 (vulnerable npm dependencies), PR-14 (setup knowledge held in one person's head).
- **Finding from a real clean clone:** the first shipped lockfile for `web/` could not be installed with plain `npm ci`. It had been generated with `--legacy-peer-deps`, a flag that is not recorded anywhere. Root cause: npm 10's resolver crashes on an optional peer conflict (test-only `jsdom` → `@exodus/bytes` wants `@noble/hashes ^1.8||^2`; `ethers` pins 1.3.2). A from-scratch install also crashes on npm 10; npm 11 resolves it.
- **Change:** committed `.npmrc` (`legacy-peer-deps=true`, exact versions, engine-strict) per package, regenerated lockfiles, exact version pins, `.nvmrc`, `engines`; `.env` as single source for ports/chain ID/name with a generated browser config; deterministic seed data; automatic solc-js fallback; `doctor`, `clean`, `reset`, `smoke` commands; CI job that proves a clean clone works; pinned Slither toolchain; weekly audit workflow and Dependabot; Dev Container; README setup and troubleshooting log.
- **Audit result (TR-42 "No audit yet"):** first `npm audit` found 2 critical in `web/` (`piscina` via `@angular/build`) and 8 high in `contracts/` (Hardhat 2's dependency tree). Resolved with pinned `overrides`: `piscina 5.3.2`; `adm-zip 0.6.1`, `tmp 0.2.7`, `serialize-javascript 7.1.2`, `undici 6.29.0`. Now **0 critical/high** in both. Tests, build and the smoke test pass.
- **Caveat found on the way:** overriding `undici` to 8.x passed the unit tests but broke Hardhat's HTTP provider (`maxRedirections is not supported`), which only the smoke test caught. 6.x works. Remaining in `contracts/`: 14 low and 5 moderate, all dev tooling. `npm audit`'s own suggestion for `web/` was a downgrade to Angular 19 and was not followed.
- **Residual:** the cleaner long-term fix for `contracts/` is migrating to Hardhat 3 (breaking change), which would also retire the overrides.
- **Status:** Applied.

## 3. Traceability (to be completed)

| Capability | Where | SRS / SPMP ID |
|---|---|---|
| Issue credential | `SourcifyRegistry.issueCertificate`, `issue.component` | _pending documents_ |
| Revoke credential | `revokeCertificate`, `ledger.component` | _pending_ |
| Verify by QR / hash / file | `verifier.component` | _pending_ |
| Issuer authorisation | `authorizeIssuer`, `issuers.component` | _pending_ |
| Pin and retrieve metadata | `ipfs.service` | _pending_ |
| Service-health and recovery | `health.service`, `recovery-modal` | _pending_ |
| Pin compiler version | `hardhat.config.js`, `solc` exact in `package.json` | SPMP TR-04 |
| Pin Ethers.js | `ethers` 6.17.0 exact in both packages | SPMP TR-09 |
| Standard, configurable RPC port | `.env`, `tools/load-env.cjs`, `npm run doctor` | SPMP TR-19 |
| Rebuild local data from scripts | `npm run reset`, deterministic `seed.js` | SPMP TR-20, TR-32 |
| Dependency audit | `.github/workflows/audit.yml`, Dependabot, A-12 results | SPMP TR-42 |
| Setup and troubleshooting log | `README.md`, `tools/doctor.mjs` | SPMP PR-14 |

## 4. Verification evidence (IEEE 829 / ISO 29119 style summary)

| Item | Result |
|---|---|
| Contract unit tests (Mocha/Chai, 16) | 16 passed: roles, duplicates, validation, expiry, revocation, ownership transfer, gas < 200k |
| Web unit tests (Vitest, 5) | 5 passed |
| Production build | Succeeds; initial bundle 266 kB raw / 72 kB transferred |
| Scripted browser run (Chromium, Playwright) | Issue → pin → sign → mint → QR; mobile VALID with "stored document matches"; unknown hash → NOT FOUND; revoke → REVOKED; zero console errors |
| IPFS retrieval benchmark (mock, loopback) | mean 2.8 ms over 20 trials (not representative of a real Kubo node) |
| Clean `git clone` → `npm run setup` → `npm test` → build → `npm run smoke` (Node 22.22.2, npm 10.9.7, blocked compiler download) | All pass. Smoke fingerprint `c003f018a3adad3b` identical across two runs, a second checkout, and custom ports via `.env` |
| `npm audit` after A-12 | 0 critical, 0 high in both packages |
| **Not tested** | MetaMask path; real camera QR scanning; real Kubo (no Docker in the build sandbox); Slither (configured in CI, not run); load or accessibility audits |
