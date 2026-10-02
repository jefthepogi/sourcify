import { Injectable, inject } from '@angular/core';
import { Contract, ContractTransactionResponse, EventLog, Log } from 'ethers';
import { ChainService } from './chain.service';
import { AuditEvent, STATUS_BY_INDEX, VerifyResult } from './models';
import { deployment } from './runtime';

@Injectable({ providedIn: 'root' })
export class RegistryService {
  private readonly chain = inject(ChainService);
  private readonly blockTimes = new Map<number, number>();

  get deployed(): boolean { return !!deployment; }
  get address(): string { return deployment?.address ?? ''; }

  private read(): Contract {
    if (!deployment) throw new Error('Registry contract is not deployed. Run `npm run deploy`.');
    return new Contract(deployment.address, deployment.abi as never, this.chain.provider);
  }
  private write(): Contract {
    const signer = this.chain.signer();
    if (!signer) throw new Error('No wallet connected.');
    return this.read().connect(signer) as Contract;
  }

  async verify(docHash: string): Promise<VerifyResult> {
    const [status, cert, label] = await this.read()['verify'](docHash);
    return {
      status: STATUS_BY_INDEX[Number(status)], docHash, issuer: cert.issuer, issuerLabel: label,
      issuedAt: Number(cert.issuedAt), expiresAt: Number(cert.expiresAt), revokedAt: Number(cert.revokedAt), metadataCID: cert.metadataCID,
    };
  }

  estimateIssue(docHash: string, cid: string, expiresAt: number): Promise<bigint> {
    return this.write()['issueCertificate'].estimateGas(docHash, cid, expiresAt);
  }
  issue(docHash: string, cid: string, expiresAt: number): Promise<ContractTransactionResponse> {
    return this.write()['issueCertificate'](docHash, cid, expiresAt);
  }
  revoke(docHash: string, reason: string): Promise<ContractTransactionResponse> {
    return this.write()['revokeCertificate'](docHash, reason);
  }
  authorizeIssuer(address: string, name: string): Promise<ContractTransactionResponse> {
    return this.write()['authorizeIssuer'](address, name);
  }
  deauthorizeIssuer(address: string): Promise<ContractTransactionResponse> {
    return this.write()['deauthorizeIssuer'](address);
  }

  /** Where and when a record was anchored (used for the "chain proof" line). */
  async issuedAt(docHash: string): Promise<{ blockNumber: number; txHash: string } | null> {
    const c = this.read();
    const logs = await c.queryFilter(c.filters['CertificateIssued'](docHash), deployment!.deployedAtBlock);
    const l = logs[0];
    return l ? { blockNumber: l.blockNumber, txHash: l.transactionHash } : null;
  }

  async issuedLogs(): Promise<EventLog[]> {
    const c = this.read();
    return (await c.queryFilter(c.filters['CertificateIssued'](), deployment!.deployedAtBlock)) as EventLog[];
  }

  async auditTrail(): Promise<AuditEvent[]> {
    const c = this.read();
    const logs = (await c.queryFilter('*' as never, deployment!.deployedAtBlock)).filter((l): l is EventLog => 'eventName' in l);
    const out: AuditEvent[] = [];
    for (const l of logs) {
      const base = { blockNumber: l.blockNumber, txHash: l.transactionHash, logIndex: l.index, timestamp: await this.blockTime(l.blockNumber) };
      switch (l.eventName) {
        case 'CertificateIssued': out.push({ ...base, kind: 'issued', actor: l.args['issuer'], subject: l.args['docHash'], detail: l.args['metadataCID'] }); break;
        case 'CertificateRevoked': out.push({ ...base, kind: 'revoked', actor: l.args['revokedBy'], subject: l.args['docHash'], detail: l.args['reason'] }); break;
        case 'IssuerAuthorized': out.push({ ...base, kind: 'issuer-authorized', actor: '', subject: l.args['issuer'], detail: l.args['name'] }); break;
        case 'IssuerDeauthorized': out.push({ ...base, kind: 'issuer-deauthorized', actor: '', subject: l.args['issuer'], detail: '' }); break;
      }
    }
    return out.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
  }

  async blockTime(blockNumber: number): Promise<number> {
    const hit = this.blockTimes.get(blockNumber);
    if (hit) return hit;
    const ts = (await this.chain.provider.getBlock(blockNumber))?.timestamp ?? 0;
    this.blockTimes.set(blockNumber, ts);
    return ts;
  }

  isLog(l: Log | EventLog): l is EventLog { return 'eventName' in l; }
}
