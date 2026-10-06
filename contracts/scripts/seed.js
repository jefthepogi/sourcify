// Seeds deterministic demo credentials into the registry belonging
// to the selected local runtime.
//
// Network mapping:
//   localhost   -> development -> development.json
//   persistent  -> persistent  -> persistent.json

const fs = require("fs");
const path = require("path");

const hre = require("hardhat");
const { ethers } = hre;

const env =
  require("../../tools/load-env.cjs");

const OUT_DIR =
  path.resolve(
    __dirname,
    "../../web/public/deployment"
  );

function getMode() {
  switch (hre.network.name) {
    case "localhost":
      return "development";

    case "persistent":
      return "persistent";

    default:
      throw new Error(
        `Unsupported seed network "${hre.network.name}". ` +
        `Use --network localhost for development or ` +
        `--network persistent for persistent mode.`
      );
  }
}

function getDeploymentPath(mode) {
  return path.join(
    OUT_DIR,
    `${mode}.json`
  );
}

function readDeployment(mode) {
  const file =
    getDeploymentPath(mode);

  if (!fs.existsSync(file)) {
    throw new Error(
      `Deployment file not found: ${file}\n` +
      `Run the matching deploy command first.`
    );
  }

  const deployment =
    JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );

  if (
    deployment.mode !== mode
  ) {
    throw new Error(
      `Deployment mode mismatch: expected "${mode}", ` +
      `found "${deployment.mode}".`
    );
  }

  if (
    !ethers.isAddress(
      deployment.address
    )
  ) {
    throw new Error(
      `Invalid registry address in ${file}: ` +
      `${deployment.address}`
    );
  }

  return deployment;
}

const mode =
  getMode();

const deployment =
  readDeployment(mode);

const IPFS_API =
  process.env.IPFS_API ||
  `http://127.0.0.1:${env.ports.ipfsApi}`;

const GATEWAY =
  process.env.IPFS_GATEWAY ||
  `http://127.0.0.1:${env.ports.gateway}/ipfs`;

const DEMO = [
  {
    name: "Amara Okafor",
    type: "Master of Science",
    program:
      "MSc Data Science · Distinction",
    date: "2026-09-18",
  },
  {
    name: "Luis Moreno",
    type: "Research Fellowship",
    program:
      "Research Fellowship · Applied Cryptography",
    date: "2026-09-18",
  },
  {
    name: "Marcus Reed",
    type: "Safety Certification",
    program:
      "Laboratory Safety Certification",
    date: "2026-09-17",
    revoke: true,
  },
];

async function ipfsAdd(
  bytes,
  name
) {
  const form =
    new FormData();

  form.append(
    "file",
    new Blob([bytes]),
    name
  );

  const response =
    await fetch(
      `${IPFS_API}/api/v0/add` +
        `?cid-version=1` +
        `&raw-leaves=true` +
        `&pin=true`,
      {
        method: "POST",
        body: form,
        signal:
          AbortSignal.timeout(10000),
      }
    );

  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      `IPFS add failed: ` +
      `${response.status} ${response.statusText}` +
      (body ? ` — ${body}` : "")
    );
  }

  const result =
    await response.json();

  if (!result.Hash) {
    throw new Error(
      "IPFS add response did not contain a Hash."
    );
  }

  return result.Hash;
}

async function main() {
  const [owner] =
    await ethers.getSigners();

  const network =
    await ethers.provider.getNetwork();

  console.log(
    `[seed] mode=${mode}`
  );

  console.log(
    `[seed] network=${hre.network.name}`
  );

  console.log(
    `[seed] chainId=${network.chainId}`
  );

  console.log(
    `[seed] registry=${deployment.address}`
  );

  console.log(
    `[seed] IPFS=${IPFS_API}`
  );

  const registry =
    await ethers.getContractAt(
      deployment.abi,
      deployment.address,
      owner
    );

  for (
    const [index, demo] of DEMO.entries()
  ) {
    /*
     * Deterministic document content.
     *
     * The same mode can be seeded repeatedly without
     * generating different document hashes.
     */
    const document =
      ethers.toUtf8Bytes(
        [
          "DEMO CERTIFICATE",
          demo.name,
          demo.program,
          demo.date,
          `seed-${index}`,
        ].join("\n")
      );

    const docHash =
      ethers.keccak256(document);

    /*
     * IMPORTANT:
     * Check the blockchain BEFORE writing anything to IPFS.
     *
     * This makes repeated persistent runs cheap and idempotent.
     */
    const [status] =
      await registry.verify(
        docHash
      );

    if (Number(status) !== 0) {
      console.log(
        `[seed] already seeded ${demo.name} ` +
        `→ ${docHash} (status=${status})`
      );

      continue;
    }

    /*
     * Store the original document in IPFS.
     */
    const documentCID =
      await ipfsAdd(
        document,
        "certificate.txt"
      );

    /*
     * Construct the metadata manifest.
     */
    const manifest = {
      schema:
        "sourcify.credential.v1",

      docHash,

      documentCID,

      issuer:
        owner.address,

      recipient: {
        name: demo.name,
      },

      credential: {
        type: demo.type,
        program: demo.program,
        awardDate: demo.date,
      },

      salt:
        ethers.dataSlice(
          ethers.keccak256(
            ethers.toUtf8Bytes(
              `sourcify-demo-salt-${index}`
            )
          ),
          0,
          16
        ),
    };

    /*
     * Store metadata in IPFS.
     */
    const metadataCID =
      await ipfsAdd(
        ethers.toUtf8Bytes(
          JSON.stringify(manifest)
        ),
        "metadata.json"
      );

    /*
     * Anchor the document hash + metadata CID
     * on the selected blockchain.
     */
    const tx =
      await registry.issueCertificate(
        docHash,
        metadataCID,
        0
      );

    await tx.wait();

    /*
     * Preserve the existing revoked demo case.
     */
    if (demo.revoke) {
      const revokeTx =
        await registry.revokeCertificate(
          docHash,
          "Issued in error — superseded by corrected record"
        );

      await revokeTx.wait();
    }

    console.log(
      `[seed] seeded ${demo.name} ` +
      `→ ${docHash}`
    );

    console.log(
      `[seed]   documentCID=${documentCID}`
    );

    console.log(
      `[seed]   metadataCID=${metadataCID}`
    );
  }

  console.log(
    `[seed] ${mode} seed complete`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});