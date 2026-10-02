// Seeds three demo credentials (fictional data only) so the UI has content on first run.
// Content is derived from fixed labels (no randomness), so every clone produces the same docHashes and CIDs.
// Metadata is pinned through the local IPFS API (real Kubo or tools/ipfs-mock.mjs).
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const env = require("../../tools/load-env.cjs");
const IPFS_API = process.env.IPFS_API || `http://127.0.0.1:${env.ports.ipfsApi}`;
const deployment = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../web/public/deployment/deployment.json"), "utf8"));

async function ipfsAdd(bytes, name) {
  const form = new FormData();
  form.append("file", new Blob([bytes]), name);
  const res = await fetch(`${IPFS_API}/api/v0/add?cid-version=1&raw-leaves=true&pin=true`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`IPFS add failed: ${res.status}`);
  return (await res.json()).Hash;
}

const DEMO = [
  { name: "Amara Okafor", type: "Master of Science", program: "MSc Data Science · Distinction", date: "2026-09-18" },
  { name: "Luis Moreno", type: "Research Fellowship", program: "Research Fellowship · Applied Cryptography", date: "2026-09-18" },
  { name: "Marcus Reed", type: "Safety Certification", program: "Laboratory Safety Certification", date: "2026-09-17", revoke: true },
];

async function main() {
  const [owner] = await ethers.getSigners();
  const registry = await ethers.getContractAt(deployment.abi, deployment.address, owner);

  for (const [i, d] of DEMO.entries()) {
    const doc = ethers.toUtf8Bytes(`DEMO CERTIFICATE\n${d.name}\n${d.program}\n${d.date}\nseed-${i}`);
    const docHash = ethers.keccak256(doc);
    const documentCID = await ipfsAdd(doc, "certificate.txt");
    const manifest = {
      schema: "sourcify.credential.v1",
      docHash,
      documentCID,
      issuer: owner.address,
      recipient: { name: d.name },
      credential: { type: d.type, program: d.program, awardDate: d.date },
      salt: ethers.dataSlice(ethers.keccak256(ethers.toUtf8Bytes(`sourcify-demo-salt-${i}`)), 0, 16),
    };
    const metadataCID = await ipfsAdd(ethers.toUtf8Bytes(JSON.stringify(manifest)), "metadata.json");
    await (await registry.issueCertificate(docHash, metadataCID, 0)).wait();
    if (d.revoke) await (await registry.revokeCertificate(docHash, "Issued in error — superseded by corrected record")).wait();
    console.log(`seeded ${d.name} → ${docHash}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
