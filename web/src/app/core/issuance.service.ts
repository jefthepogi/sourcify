import { Injectable, computed, inject, signal } from '@angular/core';
import { ChainService } from './chain.service';
import { IpfsService } from './ipfs.service';
import { CredentialManifest } from './models';
import { QrService } from './qr.service';
import { RegistryService } from './registry.service';
import { fmtTime, formatBytes, short } from './util';

export type StepState = 'queued' | 'active' | 'done' | 'failed';
export interface IssuanceStep { id: 'pin' | 'sign' | 'mint' | 'confirm'; label: string; detail: string; state: StepState; evidence?: string }
export interface PreparedIssuance {
  file: File; docHash: string; manifest: CredentialManifest; expiresAt: number;
  documentCID: string; metadataCID: string;
}
export interface IssuanceResult { docHash: string; txHash: string; blockNumber: number; qrDataUrl: string; verifyUrl: string }

const FRESH: IssuanceStep[] = [
  { id: 'pin', label: 'Pinning to IPFS', detail: 'Pins the certificate file and its metadata manifest.', state: 'queued' },
  { id: 'sign', label: 'Awaiting wallet signature', detail: 'Your wallet will ask you to sign the registry transaction.', state: 'queued' },
  { id: 'mint', label: 'Minting to blockchain', detail: 'Transaction broadcast; waiting for one block confirmation.', state: 'queued' },
  { id: 'confirm', label: 'Transaction confirmed', detail: 'Final receipt and verification QR code will appear here.', state: 'queued' },
];

/**
 * Pin-then-sign pipeline. The approved design signs before pinning, but the transaction carries the metadata CID,
 * so the pin must come first (see docs/ARCHITECTURE_LOG.md, A-06).
 */
@Injectable({ providedIn: 'root' })
export class IssuanceService {
  private readonly ipfs = inject(IpfsService);
  private readonly registry = inject(RegistryService);
  private readonly chain = inject(ChainService);
  private readonly qr = inject(QrService);

  readonly steps = signal<IssuanceStep[]>(FRESH.map((s) => ({ ...s })));
  readonly running = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<IssuanceResult | null>(null);
  readonly elapsedMs = signal(0);
  readonly log = signal<string[]>([]);
  readonly elapsed = computed(() => { const s = this.elapsedMs() / 1000; return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`; });

  reset(): void { this.steps.set(FRESH.map((s) => ({ ...s }))); this.error.set(null); this.result.set(null); this.log.set([]); this.elapsedMs.set(0); }

  async run(p: PreparedIssuance): Promise<void> {
    this.reset();
    this.running.set(true);
    const t0 = performance.now();
    const timer = setInterval(() => this.elapsedMs.set(performance.now() - t0), 100);
    const set = (id: IssuanceStep['id'], patch: Partial<IssuanceStep>) => this.steps.update((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const note = (m: string) => this.log.update((l) => [...l, `${fmtTime(new Date())}  ${m}`]);
    let current: IssuanceStep['id'] = 'pin';
    try {
      set('pin', { state: 'active', detail: 'Pinning the certificate file and metadata manifest…' });
      const doc = await this.ipfs.add(p.file, p.file.name);
      const meta = await this.ipfs.add(JSON.stringify(p.manifest), 'metadata.json');
      if (doc.cid !== p.documentCID || meta.cid !== p.metadataCID) throw new Error('Pinned CIDs differ from the reviewed values. Return to edit and review again.');
      note(`pinned document ${doc.cid}`); note(`pinned manifest ${meta.cid}`);
      set('pin', { state: 'done', detail: 'Certificate file and metadata pinned to the local IPFS node.', evidence: `CID: ${short(meta.cid, 12, 4)} · ${formatBytes(doc.size)} document` });

      current = 'sign';
      set('sign', { state: 'active', detail: this.chain.mode() === 'injected' ? 'Confirm the transaction in MetaMask.' : 'Signing with the local development account…' });
      const tx = await this.registry.issue(p.docHash, p.metadataCID, p.expiresAt);
      note(`signed by ${this.chain.account()} → ${tx.hash}`);
      set('sign', { state: 'done', detail: `Signature accepted by ${short(this.chain.account(), 6, 4)} at ${fmtTime(new Date())}.`, evidence: `tx: ${short(tx.hash, 10, 4)}` });

      current = 'mint';
      set('mint', { state: 'active', detail: 'Transaction broadcast. Waiting for one block confirmation.', evidence: `tx: ${short(tx.hash, 10, 4)} · pending` });
      const receipt = await tx.wait(1);
      if (!receipt || receipt.status !== 1) throw new Error('The transaction was mined but reverted.');
      note(`mined in block ${receipt.blockNumber}, gas ${receipt.gasUsed}`);
      set('mint', { state: 'done', detail: 'Block confirmation received.', evidence: `block ${receipt.blockNumber} · ${receipt.gasUsed} gas` });

      current = 'confirm';
      const verifyUrl = this.qr.verifyUrl(p.docHash);
      const qrDataUrl = await this.qr.toDataUrl(verifyUrl, 360);
      set('confirm', { state: 'done', detail: 'Credential anchored. Share the QR code or link with the recipient.', evidence: `docHash: ${short(p.docHash, 10, 6)}` });
      this.result.set({ docHash: p.docHash, txHash: tx.hash, blockNumber: receipt.blockNumber, qrDataUrl, verifyUrl });
    } catch (e: any) {
      const rejected = e?.code === 'ACTION_REJECTED' || e?.info?.error?.code === 4001;
      const msg = rejected ? 'Signature rejected. Nothing was submitted to the chain.' : (e?.shortMessage ?? e?.message ?? 'Unexpected error');
      set(current, { state: 'failed', detail: msg });
      this.error.set(msg);
      note(`ERROR ${msg}`);
    } finally {
      clearInterval(timer);
      this.running.set(false);
    }
  }
}
