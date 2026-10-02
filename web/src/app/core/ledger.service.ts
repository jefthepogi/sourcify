import { Injectable, inject, signal } from '@angular/core';
import { IpfsService } from './ipfs.service';
import { AuditEvent, CredentialManifest, LedgerEntry } from './models';
import { RegistryService } from './registry.service';

/** Read model assembled from chain events + IPFS manifests. Chain is the source of truth; IPFS failures degrade gracefully. */
@Injectable({ providedIn: 'root' })
export class LedgerService {
  private readonly registry = inject(RegistryService);
  private readonly ipfs = inject(IpfsService);
  private readonly manifests = new Map<string, CredentialManifest | null>();

  readonly entries = signal<LedgerEntry[]>([]);
  readonly audit = signal<AuditEvent[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async refresh(): Promise<void> {
    if (!this.registry.deployed) { this.error.set('Registry contract is not deployed.'); return; }
    this.loading.set(true);
    try {
      const logs = await this.registry.issuedLogs();
      const entries = await Promise.all(logs.map(async (l): Promise<LedgerEntry> => ({
        ...(await this.registry.verify(l.args['docHash'])),
        blockNumber: l.blockNumber, txHash: l.transactionHash, manifest: await this.manifest(l.args['metadataCID']),
      })));
      this.entries.set(entries.sort((a, b) => b.issuedAt - a.issuedAt || b.blockNumber - a.blockNumber));
      this.audit.set(await this.registry.auditTrail());
      this.error.set(null);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Could not load the ledger.');
    } finally { this.loading.set(false); }
  }

  private async manifest(cid: string): Promise<CredentialManifest | null> {
    if (this.manifests.has(cid)) return this.manifests.get(cid)!;
    try {
      const m = await this.ipfs.catJson<CredentialManifest>(cid);
      this.manifests.set(cid, m);
      return m;
    } catch { return null; } // not cached: retry on next refresh
  }
}
