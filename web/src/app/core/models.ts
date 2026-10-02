import { SCHEMA_ID } from './runtime';

export type CertStatus = 'valid' | 'revoked' | 'expired' | 'notfound';
export const STATUS_BY_INDEX: CertStatus[] = ['notfound', 'valid', 'revoked', 'expired'];

/** IPFS manifest (off-chain payload). Deterministic key order so CIDs are reproducible. No e-mail, no timestamps. */
export interface CredentialManifest {
  schema: typeof SCHEMA_ID;
  docHash: string;
  documentCID: string;
  issuer: string;
  recipient: { name: string; did?: string };
  credential: { type: string; program: string; awardDate: string };
  expiresAt?: number;
  salt: string;
}

export interface VerifyResult {
  status: CertStatus;
  docHash: string;
  issuer: string;
  issuerLabel: string;
  issuedAt: number;
  expiresAt: number;
  revokedAt: number;
  metadataCID: string;
}

export interface LedgerEntry extends VerifyResult {
  blockNumber: number;
  txHash: string;
  manifest: CredentialManifest | null;
}

export interface AuditEvent {
  kind: 'issued' | 'revoked' | 'issuer-authorized' | 'issuer-deauthorized';
  actor: string;
  subject: string;
  detail: string;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  timestamp: number;
}
