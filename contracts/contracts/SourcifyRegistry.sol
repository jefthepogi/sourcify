// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControlDefaultAdminRules} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";

/**
 * @title SourcifyRegistry
 * @notice On-chain anchor for academic credentials. Only a Keccak-256 document hash and an IPFS
 *         metadata CID are stored; personal data never touches the ledger.
 *
 * Access model (OpenZeppelin AccessControl):
 *   - DEFAULT_ADMIN_ROLE : the contract owner. Authorises/de-authorises issuers, may revoke any certificate.
 *                          Ownership moves through a two-step transfer (AccessControlDefaultAdminRules).
 *   - ISSUER_ROLE        : may issue certificates and revoke the ones it issued.
 */
contract SourcifyRegistry is AccessControlDefaultAdminRules {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    uint256 private constant MAX_CID_LENGTH = 128;
    uint256 private constant MAX_NAME_LENGTH = 96;

    enum Status {
        NotFound,
        Valid,
        Revoked,
        Expired
    }

    struct Certificate {
        address issuer;
        uint64 issuedAt;
        uint64 expiresAt; // 0 = never expires
        uint64 revokedAt; // 0 = not revoked
        string metadataCID;
    }

    mapping(bytes32 docHash => Certificate) private _certificates;
    mapping(bytes32 docHash => bool) private _certificateExists;
    mapping(address issuer => string name) private _issuerNames;

    event IssuerAuthorized(address indexed issuer, string name);
    event IssuerDeauthorized(address indexed issuer);
    event CertificateIssued(
        bytes32 indexed docHash,
        address indexed issuer,
        string metadataCID,
        uint64 expiresAt
    );
    event CertificateRevoked(bytes32 indexed docHash, address indexed revokedBy, string reason);

    error NotIssuer();
    error InvalidDocHash();
    error InvalidCID();
    error InvalidName();
    error InvalidExpiry();
    error AlreadyRegistered(bytes32 docHash);
    error UnknownCertificate(bytes32 docHash);
    error AlreadyRevoked(bytes32 docHash);
    error NotAllowedToRevoke();

    modifier onlyIssuer() {
        if (!hasRole(ISSUER_ROLE, msg.sender)) revert NotIssuer();
        _;
    }

    /**
     * @param initialOwner   Wallet that becomes owner (DEFAULT_ADMIN_ROLE) and the first issuer.
     * @param ownerName      Display name of the issuing institution shown to verifiers.
     * @param adminDelay     Seconds before a pending ownership transfer can be accepted (0 on local chains).
     */
    constructor(
        address initialOwner,
        string memory ownerName,
        uint48 adminDelay
    ) AccessControlDefaultAdminRules(adminDelay, initialOwner) {
        _authorizeIssuer(initialOwner, ownerName);
    }

    // ───────────────────────────── Issuer management ─────────────────────────────

    function authorizeIssuer(address issuer, string calldata name) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _authorizeIssuer(issuer, name);
    }

    function deauthorizeIssuer(address issuer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(ISSUER_ROLE, issuer);
        emit IssuerDeauthorized(issuer);
    }

    function issuerName(address issuer) external view returns (string memory) {
        return _issuerNames[issuer];
    }

    // ───────────────────────────── Certificate lifecycle ─────────────────────────────

    function issueCertificate(
        bytes32 docHash,
        string calldata metadataCID,
        uint64 expiresAt
    ) external onlyIssuer {
        if (docHash == bytes32(0)) revert InvalidDocHash();
        uint256 len = bytes(metadataCID).length;
        if (len == 0 || len > MAX_CID_LENGTH) revert InvalidCID();
        if (_certificateExists[docHash]) revert AlreadyRegistered(docHash);
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert InvalidExpiry();

        _certificateExists[docHash] = true;

        _certificates[docHash] = Certificate({
            issuer: msg.sender,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            revokedAt: 0,
            metadataCID: metadataCID
        });
        emit CertificateIssued(docHash, msg.sender, metadataCID, expiresAt);
    }

    /// @notice The contract owner or the original issuer may revoke. Revocation is permanent.
    function revokeCertificate(bytes32 docHash, string calldata reason) external {
        Certificate storage cert = _certificates[docHash];
        if (!_certificateExists[docHash]) revert UnknownCertificate(docHash);
        if (cert.revokedAt != 0) revert AlreadyRevoked(docHash);
        if (msg.sender != cert.issuer && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotAllowedToRevoke();

        cert.revokedAt = uint64(block.timestamp);
        emit CertificateRevoked(docHash, msg.sender, reason);
    }

    // ───────────────────────────── Verification (read-only) ─────────────────────────────

    /// @return status      Computed lifecycle state.
    /// @return certificate Stored record (zeroed when NotFound).
    /// @return issuerLabel Display name registered for the issuing wallet.
    function verify(
        bytes32 docHash
    ) external view returns (Status status, Certificate memory certificate, string memory issuerLabel) {
        certificate = _certificates[docHash];
        if (!_certificateExists[docHash]) {
            return (Status.NotFound, certificate, "");
        }
        issuerLabel = _issuerNames[certificate.issuer];
        if (certificate.revokedAt != 0) status = Status.Revoked;
        else if (certificate.expiresAt != 0 && certificate.expiresAt <= block.timestamp) status = Status.Expired;
        else status = Status.Valid;
    }

    // ───────────────────────────── Internals ─────────────────────────────

    function _authorizeIssuer(address issuer, string memory name) private {
        uint256 len = bytes(name).length;
        if (issuer == address(0) || len == 0 || len > MAX_NAME_LENGTH) revert InvalidName();
        _grantRole(ISSUER_ROLE, issuer);
        _issuerNames[issuer] = name;
        emit IssuerAuthorized(issuer, name);
    }
}
