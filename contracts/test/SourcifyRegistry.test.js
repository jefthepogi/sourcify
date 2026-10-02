const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const Status = { NotFound: 0n, Valid: 1n, Revoked: 2n, Expired: 3n };
const hashOf = (text) => ethers.keccak256(ethers.toUtf8Bytes(text));
const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";

async function deploy() {
  const [owner, issuer, other, stranger] = await ethers.getSigners();
  const registry = await (await ethers.getContractFactory("SourcifyRegistry")).deploy(owner.address, "Northbridge University", 0);
  await registry.waitForDeployment();
  await registry.connect(owner).authorizeIssuer(issuer.address, "Northbridge Faculty of Science");
  await registry.connect(owner).authorizeIssuer(other.address, "Northbridge Extension");
  return { registry, owner, issuer, other, stranger };
}

describe("SourcifyRegistry", () => {
  describe("access control", () => {
    it("makes the deployer owner and first issuer", async () => {
      const { registry, owner } = await loadFixture(deploy);
      expect(await registry.owner()).to.equal(owner.address);
      expect(await registry.hasRole(await registry.ISSUER_ROLE(), owner.address)).to.equal(true);
      expect(await registry.issuerName(owner.address)).to.equal("Northbridge University");
    });

    it("lets only the owner authorise and de-authorise issuers", async () => {
      const { registry, issuer, stranger } = await loadFixture(deploy);
      await expect(registry.connect(issuer).authorizeIssuer(stranger.address, "x")).to.be.revertedWithCustomError(
        registry,
        "AccessControlUnauthorizedAccount",
      );
      await expect(registry.connect(issuer).deauthorizeIssuer(issuer.address)).to.be.revertedWithCustomError(
        registry,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("rejects empty or zero-address issuer registrations", async () => {
      const { registry, owner, stranger } = await loadFixture(deploy);
      await expect(registry.connect(owner).authorizeIssuer(stranger.address, "")).to.be.revertedWithCustomError(registry, "InvalidName");
      await expect(registry.connect(owner).authorizeIssuer(ethers.ZeroAddress, "x")).to.be.revertedWithCustomError(registry, "InvalidName");
    });

    it("blocks unauthorised wallets from issuing, including de-authorised issuers", async () => {
      const { registry, owner, issuer, stranger } = await loadFixture(deploy);
      await expect(registry.connect(stranger).issueCertificate(hashOf("a"), CID, 0)).to.be.revertedWithCustomError(registry, "NotIssuer");
      await registry.connect(owner).deauthorizeIssuer(issuer.address);
      await expect(registry.connect(issuer).issueCertificate(hashOf("a"), CID, 0)).to.be.revertedWithCustomError(registry, "NotIssuer");
    });

    it("moves ownership through a two-step transfer", async () => {
      const { registry, owner, other } = await loadFixture(deploy);
      await registry.connect(owner).beginDefaultAdminTransfer(other.address);
      await time.increase(1); // OZ requires the schedule to be strictly in the past
      await registry.connect(other).acceptDefaultAdminTransfer();
      expect(await registry.owner()).to.equal(other.address);
    });
  });

  describe("issuance", () => {
    it("stores the record and emits CertificateIssued", async () => {
      const { registry, issuer } = await loadFixture(deploy);
      const h = hashOf("diploma-1");
      const tx = await registry.connect(issuer).issueCertificate(h, CID, 0);
      await expect(tx).to.emit(registry, "CertificateIssued").withArgs(h, issuer.address, CID, 0);

      const [status, cert, label] = await registry.verify(h);
      expect(status).to.equal(Status.Valid);
      expect(cert.issuer).to.equal(issuer.address);
      expect(cert.metadataCID).to.equal(CID);
      expect(cert.revokedAt).to.equal(0n);
      expect(label).to.equal("Northbridge Faculty of Science");
    });

    it("rejects duplicate registrations", async () => {
      const { registry, issuer, other } = await loadFixture(deploy);
      const h = hashOf("dup");
      await registry.connect(issuer).issueCertificate(h, CID, 0);
      await expect(registry.connect(other).issueCertificate(h, CID, 0)).to.be.revertedWithCustomError(registry, "AlreadyRegistered").withArgs(h);
    });

    it("validates inputs", async () => {
      const { registry, issuer } = await loadFixture(deploy);
      await expect(registry.connect(issuer).issueCertificate(ethers.ZeroHash, CID, 0)).to.be.revertedWithCustomError(registry, "InvalidDocHash");
      await expect(registry.connect(issuer).issueCertificate(hashOf("x"), "", 0)).to.be.revertedWithCustomError(registry, "InvalidCID");
      await expect(registry.connect(issuer).issueCertificate(hashOf("x"), "b".repeat(129), 0)).to.be.revertedWithCustomError(registry, "InvalidCID");
      const past = (await time.latest()) - 10;
      await expect(registry.connect(issuer).issueCertificate(hashOf("x"), CID, past)).to.be.revertedWithCustomError(registry, "InvalidExpiry");
    });

    it("reports NotFound for unknown hashes", async () => {
      const { registry } = await loadFixture(deploy);
      const [status, _] = await registry.verify(hashOf("nothing"));
    
      expect(status).to.equal(Status.NotFound);
    });

    it("turns Expired once the expiry passes", async () => {
      const { registry, issuer } = await loadFixture(deploy);
      const h = hashOf("short-lived");
      await registry.connect(issuer).issueCertificate(h, CID, (await time.latest()) + 100);
      expect((await registry.verify(h))[0]).to.equal(Status.Valid);
      await time.increase(200);
      expect((await registry.verify(h))[0]).to.equal(Status.Expired);
    });
  });

  describe("revocation", () => {
    it("lets the original issuer revoke and flips status", async () => {
      const { registry, issuer } = await loadFixture(deploy);
      const h = hashOf("rev-1");
      await registry.connect(issuer).issueCertificate(h, CID, 0);
      await expect(registry.connect(issuer).revokeCertificate(h, "Issued in error"))
        .to.emit(registry, "CertificateRevoked")
        .withArgs(h, issuer.address, "Issued in error");
      const [status, cert] = await registry.verify(h);
      expect(status).to.equal(Status.Revoked);
      expect(cert.revokedAt).to.be.greaterThan(0n);
    });

    it("lets the owner revoke certificates issued by others", async () => {
      const { registry, owner, issuer } = await loadFixture(deploy);
      const h = hashOf("rev-2");
      await registry.connect(issuer).issueCertificate(h, CID, 0);
      await registry.connect(owner).revokeCertificate(h, "Policy");
      expect((await registry.verify(h))[0]).to.equal(Status.Revoked);
    });

    it("refuses other issuers and strangers", async () => {
      const { registry, issuer, other, stranger } = await loadFixture(deploy);
      const h = hashOf("rev-3");
      await registry.connect(issuer).issueCertificate(h, CID, 0);
      await expect(registry.connect(other).revokeCertificate(h, "")).to.be.revertedWithCustomError(registry, "NotAllowedToRevoke");
      await expect(registry.connect(stranger).revokeCertificate(h, "")).to.be.revertedWithCustomError(registry, "NotAllowedToRevoke");
    });

    it("rejects unknown and repeat revocations, and a revoked hash cannot be re-registered", async () => {
      const { registry, issuer } = await loadFixture(deploy);
      const h = hashOf("rev-4");
      await expect(registry.connect(issuer).revokeCertificate(h, "")).to.be.revertedWithCustomError(registry, "UnknownCertificate");
      await registry.connect(issuer).issueCertificate(h, CID, 0);
      await registry.connect(issuer).revokeCertificate(h, "");
      await expect(registry.connect(issuer).revokeCertificate(h, "")).to.be.revertedWithCustomError(registry, "AlreadyRevoked");
      await expect(registry.connect(issuer).issueCertificate(h, CID, 0)).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
      expect((await registry.verify(h))[0]).to.equal(Status.Revoked);
    });

    it("keeps revoked status visible for expired-and-revoked certificates", async () => {
      const { registry, issuer } = await loadFixture(deploy);
      const h = hashOf("rev-5");
      await registry.connect(issuer).issueCertificate(h, CID, (await time.latest()) + 50);
      await registry.connect(issuer).revokeCertificate(h, "");
      await time.increase(100);
      expect((await registry.verify(h))[0]).to.equal(Status.Revoked);
    });
  });

  describe("gas footprint", () => {
    it("keeps issuance under 200k gas", async () => {
      const { registry, issuer } = await loadFixture(deploy);
      const receipt = await (await registry.connect(issuer).issueCertificate(hashOf("gas"), CID, 0)).wait();
      expect(receipt.gasUsed).to.be.lessThan(200_000n);
    });
  });
});
