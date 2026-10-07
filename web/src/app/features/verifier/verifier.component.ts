import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BrandComponent } from '../../core/brand.component';
import { HealthService } from '../../core/health.service';
import { IconComponent } from '../../core/icon.component';
import { IpfsService } from '../../core/ipfs.service';
import { CredentialManifest, VerifyResult } from '../../core/models';
import { QrScanner } from '../../core/qr.service';
import { RegistryService } from '../../core/registry.service';
import { cfg } from '../../core/runtime';
import { extractDocHash, fmtDate, keccakOfBlob, short } from '../../core/util';

type View = 'scan' | 'manual' | 'result' | 'loading';
type Integrity = 'checking' | 'ok' | 'mismatch' | 'unavailable';
const COPY = {
  valid: { word: 'VALID', line: 'Credential verified on-chain', icon: 'check', bg: '#075b3b', soft: '#ddf7ea' },
  revoked: { word: 'REVOKED', line: 'This credential is no longer valid', icon: 'x', bg: '#8f1725', soft: '#fde7e9' },
  expired: { word: 'EXPIRED', line: 'This credential passed its expiration date', icon: 'clock', bg: '#8a4a06', soft: '#fff2d6' },
  notfound: { word: 'NOT FOUND', line: 'No record exists for this document hash', icon: 'search-x', bg: '#1f2937', soft: '#e5e7eb' },
} as const;

@Component({
  selector: 'app-verifier',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, BrandComponent, RouterLink],
  templateUrl: './verifier.component.html',
  styleUrl: './verifier.component.css',
})
export class VerifierComponent implements OnInit, OnDestroy {
  readonly hash = input<string | undefined>();
  private readonly registry = inject(RegistryService);
  private readonly ipfs = inject(IpfsService);
  private readonly router = inject(Router);
  protected readonly health = inject(HealthService);
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private scanner?: QrScanner;

  protected readonly view = signal<View>('scan');
  protected readonly cameraError = signal(false);
  protected readonly torch = signal(false);
  protected readonly raw = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<VerifyResult | null>(null);
  protected readonly manifest = signal<CredentialManifest | null>(null);
  protected readonly integrity = signal<Integrity>('checking');
  protected readonly anchor = signal<{ blockNumber: number } | null>(null);
  protected readonly copy = computed(() => COPY[this.result()?.status ?? 'notfound']);
  protected readonly short = short;
  protected readonly fmtDate = fmtDate;
  protected readonly cfg = cfg;
  protected readonly canScan = !!navigator.mediaDevices?.getUserMedia;
  protected scanner_torch(): boolean { return !!this.scanner?.torchSupported; }

  ngOnInit(): void {
    this.health.start();
    const h = this.hash();
    if (h) { const parsed = extractDocHash(h); if (parsed) { void this.check(parsed); return; } this.error.set('That link does not contain a valid 66-character document hash.'); this.view.set('manual'); return; }
    void this.startScan();
  }
  ngOnDestroy(): void { this.scanner?.stop(); }

  protected async startScan(): Promise<void> {
    this.error.set(null); this.view.set('scan'); this.cameraError.set(false);
    if (!this.canScan) return this.toManual(true);
    await Promise.resolve(); // let the <video> render
    try {
      this.scanner = new QrScanner();
      await this.scanner.start(this.video()!.nativeElement, (text) => this.onScanned(text));
    } catch { this.toManual(true); }
  }
  private onScanned(text: string): void {
    this.scanner?.stop();
    const h = extractDocHash(text);
    if (h) void this.check(h); else { this.error.set('That QR code is not a Sourcify credential.'); this.toManual(false); }
  }
  protected toManual(cameraFailed: boolean): void { this.scanner?.stop(); this.cameraError.set(cameraFailed); this.view.set('manual'); }
  protected async toggleTorch(): Promise<void> { this.torch.set(!this.torch()); try { await this.scanner?.setTorch(this.torch()); } catch { this.torch.set(false); } }
  protected async paste(): Promise<void> { try { this.raw.set(await navigator.clipboard.readText()); } catch { /* permission denied: user can type */ } }

  protected submitManual(): void {
    const h = extractDocHash(this.raw());
    if (!h) { this.error.set('Enter the full 66-character hash starting with 0x.'); return; }
    void this.check(h);
  }
  protected async onFile(ev: Event): Promise<void> {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (f) await this.check(await keccakOfBlob(f));
  }

  protected async check(docHash: string): Promise<void> {
    this.scanner?.stop(); this.error.set(null); this.view.set('loading'); this.manifest.set(null); this.integrity.set('checking'); this.anchor.set(null);
    try {
      const r = await this.registry.verify(docHash);
      this.result.set(r); this.view.set('result');
      if (r.status !== 'notfound') void this.deepCheck(r);
    } catch {
      this.error.set('The verification service is unreachable. Check that the local chain is running and try again.');
      this.raw.set(docHash); this.view.set('manual');
    }
  }

  /** Cross-checks IPFS against the chain: manifest.docHash must equal the anchored hash, and the pinned file must re-hash to it. */
  private async deepCheck(r: VerifyResult): Promise<void> {
    void this.registry.issuedAt(r.docHash).then((a) => a && this.anchor.set({ blockNumber: a.blockNumber })).catch(() => undefined);
    try {
      const m = await this.ipfs.catJson<CredentialManifest>(r.metadataCID);
      this.manifest.set(m);
      if (m.docHash?.toLowerCase() !== r.docHash.toLowerCase()) return this.integrity.set('mismatch');
      const doc = await this.ipfs.cat(m.documentCID);
      this.integrity.set((await keccakOfBlob(new Blob([doc as BlobPart]))) === r.docHash ? 'ok' : 'mismatch');
    } catch { this.integrity.set('unavailable'); }
  }

  protected again(): void { this.raw.set(''); this.result.set(null); void this.router.navigateByUrl('/verify').then(() => this.startScan()); }
  protected integrityText(): string {
    return { checking: 'Checking stored document…', ok: 'Stored document matches the anchored hash', mismatch: 'Stored data does not match the anchored hash', unavailable: 'Stored document could not be retrieved from IPFS' }[this.integrity()];
  }
}
