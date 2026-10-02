import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ChainService } from '../../core/chain.service';
import { HealthService } from '../../core/health.service';
import { IconComponent } from '../../core/icon.component';
import { IpfsService } from '../../core/ipfs.service';
import { IssuanceService, PreparedIssuance } from '../../core/issuance.service';
import { LedgerService } from '../../core/ledger.service';
import { CredentialManifest } from '../../core/models';
import { RegistryService } from '../../core/registry.service';
import { SCHEMA_ID, deployment } from '../../core/runtime';
import { fmtTime, formatBytes, keccakOfBlob, randomSalt, short } from '../../core/util';
import { ProgressModalComponent } from './progress-modal.component';
import { ReviewModalComponent } from './review-modal.component';

const TYPES = ['Bachelor of Science', 'Master of Science', 'Doctor of Philosophy', 'Certificate of Completion', 'Research Fellowship', 'Safety Certification'];
const DRAFT_KEY = 'sourcify.draft.v1';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DID_RE = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/;

@Component({
  selector: 'app-issue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, IconComponent, ReviewModalComponent, ProgressModalComponent],
  templateUrl: './issue.component.html',
  styleUrl: './issue.component.css',
})
export class IssueComponent {
  private readonly ipfs = inject(IpfsService);
  private readonly registry = inject(RegistryService);
  protected readonly chain = inject(ChainService);
  protected readonly health = inject(HealthService);
  protected readonly issuance = inject(IssuanceService);
  protected readonly ledger = inject(LedgerService);
  protected readonly types = TYPES;
  protected readonly short = short;
  protected readonly formatBytes = formatBytes;
  protected readonly contract = deployment?.address ?? '';

  // form state
  protected readonly name = signal('');
  protected readonly type = signal(TYPES[1]);
  protected readonly email = signal('');
  protected readonly did = signal('');
  protected readonly program = signal('');
  protected readonly awardDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly expiry = signal('');
  protected readonly salt = signal(randomSalt());
  protected readonly file = signal<File | null>(null);
  protected readonly docHash = signal('');
  protected readonly touched = signal(false);
  protected readonly draftSavedAt = signal<string | null>(null);

  // derived / async preview
  protected readonly preview = signal<{ documentCID: string; metadataCID: string; gas: bigint | null; duplicate: boolean; manifest: CredentialManifest } | null>(null);
  protected readonly previewError = signal<string | null>(null);
  protected readonly modal = signal<'none' | 'review' | 'progress'>('none');
  protected readonly prepared = signal<PreparedIssuance | null>(null);
  private previewSeq = 0;

  protected readonly errors = computed(() => {
    const e: Record<string, string> = {};
    if (this.name().trim().length < 2) e['name'] = 'Enter the recipient’s full name.';
    if (!EMAIL_RE.test(this.email().trim())) e['email'] = 'Enter a valid e-mail address.';
    if (this.did().trim() && !DID_RE.test(this.did().trim())) e['did'] = 'Use the form did:method:identifier.';
    if (this.program().trim().length < 2) e['program'] = 'Enter the program or award.';
    if (!this.awardDate()) e['awardDate'] = 'Choose the award date.';
    if (this.expiry() && new Date(this.expiry()).getTime() <= Date.now()) e['expiry'] = 'Expiration must be in the future.';
    if (!this.file()) e['file'] = 'Select the certificate file to anchor.';
    return e;
  });
  protected readonly formValid = computed(() => Object.keys(this.errors()).length === 0);
  protected readonly checks = computed(() => [
    { label: 'Wallet authorized for issuer contract', ok: this.chain.role() !== 'none' },
    { label: 'Registry reachable on the local chain', ok: this.health.chainUp() && !!deployment },
    { label: 'docHash computed from the selected file', ok: !!this.docHash() },
    { label: 'IPFS node reachable', ok: this.health.ipfsUp() },
    { label: 'Recipient schema is valid', ok: this.formValid() },
    { label: 'docHash not yet registered', ok: !!this.preview() && !this.preview()!.duplicate },
  ]);
  protected readonly passed = computed(() => this.checks().filter((c) => c.ok).length);
  protected readonly ready = computed(() => this.passed() === this.checks().length);
  protected readonly gasText = computed(() => {
    const g = this.preview()?.gas; return g == null ? '—' : `${g.toLocaleString()} gas`;
  });

  constructor() {
    this.restoreDraft();
    // Persist draft (never the file itself).
    effect(() => {
      const d = { name: this.name(), type: this.type(), email: this.email(), did: this.did(), program: this.program(), awardDate: this.awardDate(), expiry: this.expiry() };
      untracked(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); this.draftSavedAt.set(fmtTime(new Date())); });
    });
    // Recompute CIDs, duplicate flag and gas whenever inputs or service health change.
    effect(() => {
      const valid = this.formValid(); const hash = this.docHash(); const up = this.health.ipfsUp() && this.health.chainUp(); const role = this.chain.role();
      this.name(); this.type(); this.did(); this.program(); this.awardDate(); this.expiry(); this.salt(); this.email();
      untracked(() => { if (valid && hash && up && role !== 'none') void this.refreshPreview(); else this.preview.set(null); });
    });
  }

  protected async onFile(ev: Event): Promise<void> {
    const f = (ev.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(f);
    this.docHash.set(f ? await keccakOfBlob(f) : '');
  }
  protected input(sig: { set(v: string): void }, ev: Event): void { sig.set((ev.target as HTMLInputElement).value); }

  protected buildManifest(documentCID: string): CredentialManifest {
    const m: CredentialManifest = {
      schema: SCHEMA_ID, docHash: this.docHash(), documentCID, issuer: this.chain.account() ?? '',
      recipient: { name: this.name().trim(), ...(this.did().trim() ? { did: this.did().trim() } : {}) },
      credential: { type: this.type(), program: this.program().trim(), awardDate: this.awardDate() },
      salt: this.salt(),
    };
    const exp = this.expiresAt(); if (exp) m.expiresAt = exp;
    return m;
  }
  private expiresAt(): number { return this.expiry() ? Math.floor(new Date(this.expiry() + 'T23:59:59').getTime() / 1000) : 0; }

  private async refreshPreview(): Promise<void> {
    const seq = ++this.previewSeq;
    try {
      const file = this.file()!;
      const documentCID = (await this.ipfs.add(file, file.name, { onlyHash: true })).cid;
      const manifest = this.buildManifest(documentCID);
      const metadataCID = (await this.ipfs.add(JSON.stringify(manifest), 'metadata.json', { onlyHash: true })).cid;
      const existing = await this.registry.verify(this.docHash());
      const duplicate = existing.status !== 'notfound';
      let gas: bigint | null = null;
      if (!duplicate) { try { gas = await this.registry.estimateIssue(this.docHash(), metadataCID, this.expiresAt()); } catch { gas = null; } }
      if (seq === this.previewSeq) { this.preview.set({ documentCID, metadataCID, gas, duplicate, manifest }); this.previewError.set(null); }
    } catch (e: any) {
      if (seq === this.previewSeq) { this.preview.set(null); this.previewError.set(e?.message ?? 'Preview failed'); }
    }
  }

  protected openReview(): void {
    this.touched.set(true);
    const p = this.preview();
    if (!this.ready() || !p) return;
    this.prepared.set({ file: this.file()!, docHash: this.docHash(), manifest: p.manifest, expiresAt: this.expiresAt(), documentCID: p.documentCID, metadataCID: p.metadataCID });
    this.modal.set('review');
  }
  protected async sign(): Promise<void> {
    this.modal.set('progress');
    await this.issuance.run(this.prepared()!);
    void this.ledger.refresh();
  }
  protected closeProgress(): void {
    const done = !!this.issuance.result();
    this.modal.set('none');
    if (done) this.resetForm();
  }
  protected resetForm(): void {
    this.name.set(''); this.email.set(''); this.did.set(''); this.program.set(''); this.expiry.set('');
    this.file.set(null); this.docHash.set(''); this.salt.set(randomSalt()); this.touched.set(false); this.preview.set(null);
  }
  protected restoreDraft(): void {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
      if (!d) return;
      this.name.set(d.name ?? ''); this.type.set(d.type ?? TYPES[1]); this.email.set(d.email ?? ''); this.did.set(d.did ?? '');
      this.program.set(d.program ?? ''); this.awardDate.set(d.awardDate ?? this.awardDate()); this.expiry.set(d.expiry ?? '');
    } catch { /* ignore corrupt draft */ }
  }
  protected err(k: string): string | null { return this.touched() ? (this.errors()[k] ?? null) : null; }
  protected recent() { return this.ledger.entries().slice(0, 3); }
  protected ago(ts: number): string {
    const s = Math.max(0, Date.now() / 1000 - ts); return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} hr ago` : `${Math.round(s / 86400)} d ago`;
  }
  protected readonly loadRecent = effect(() => { if (this.health.chainUp()) untracked(() => void this.ledger.refresh()); });
}
