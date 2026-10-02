import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ChainService } from '../../core/chain.service';
import { HealthService } from '../../core/health.service';
import { IconComponent } from '../../core/icon.component';
import { LedgerService } from '../../core/ledger.service';
import { LedgerEntry } from '../../core/models';
import { RegistryService } from '../../core/registry.service';
import { fmtDate, short } from '../../core/util';

type View = 'credentials' | 'recipients' | 'transactions' | 'audit';
const TITLES: Record<View, [string, string]> = {
  credentials: ['Credentials', 'Every record anchored by connected issuer contracts, with live status.'],
  recipients: ['Recipients', 'Recipients derived from IPFS manifests. E-mail addresses are never stored here.'],
  transactions: ['Transactions', 'Block and transaction references for each anchored record.'],
  audit: ['Audit log', 'Chronological, tamper-evident trail of issuance, revocation and access changes.'],
};

/** One read-only ledger page rendering four lenses on the same chain-derived data. */
@Component({
  selector: 'app-ledger',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  templateUrl: './ledger.component.html',
  styles: `h1{margin:0 0 4px;font-size:26px;font-weight:400} .sub0{margin:0 0 16px;color:var(--ink-3);font-size:12px} .bar{display:flex;gap:10px;margin-bottom:12px;align-items:center}
  .search{flex:1;max-width:360px} .tr{overflow-x:auto} .acts{display:flex;gap:8px;justify-content:flex-end} .sm{height:30px;padding:0 10px;font-size:11px}
  .rv{display:flex;gap:8px;align-items:center;margin-top:6px} .rv input{height:30px;border:1px solid var(--line-strong);border-radius:6px;padding:0 8px;font-size:11px;width:220px}`,
})
export class LedgerComponent {
  readonly view = input<string>('credentials');
  protected readonly ledger = inject(LedgerService);
  protected readonly registry = inject(RegistryService);
  protected readonly chain = inject(ChainService);
  private readonly health = inject(HealthService);
  protected readonly short = short;
  protected readonly fmtDate = fmtDate;
  protected readonly q = signal('');
  protected readonly revoking = signal<string | null>(null);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly v = computed<View>(() => (['credentials', 'recipients', 'transactions', 'audit'].includes(this.view()) ? (this.view() as View) : 'credentials'));
  protected readonly title = computed(() => TITLES[this.v()]);
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.ledger.entries().filter((e) => !q || [e.docHash, e.manifest?.recipient.name, e.manifest?.credential.program, e.issuerLabel].some((x) => x?.toLowerCase().includes(q)));
  });
  protected readonly recipients = computed(() => {
    const m = new Map<string, { name: string; did?: string; count: number; last: number }>();
    for (const e of this.rows()) {
      const n = e.manifest?.recipient.name ?? 'Unknown (metadata unavailable)';
      const cur = m.get(n) ?? { name: n, did: e.manifest?.recipient.did, count: 0, last: 0 };
      cur.count++; cur.last = Math.max(cur.last, e.issuedAt); m.set(n, cur);
    }
    return [...m.values()];
  });
  constructor() { effect(() => { if (this.health.chainUp()) untracked(() => void this.ledger.refresh()); }); }

  protected canRevoke(e: LedgerEntry): boolean {
    const a = this.chain.account()?.toLowerCase();
    return e.status === 'valid' && !!a && (this.chain.role() === 'owner' || e.issuer.toLowerCase() === a);
  }
  protected async revoke(e: LedgerEntry): Promise<void> {
    this.busy.set(true); this.message.set(null);
    try { await (await this.registry.revoke(e.docHash, this.reason().trim())).wait(1); this.revoking.set(null); this.reason.set(''); await this.ledger.refresh(); }
    catch (err: any) { this.message.set(err?.shortMessage ?? err?.message ?? 'Revocation failed'); }
    this.busy.set(false);
  }
  protected kindLabel(k: string): string { return ({ issued: 'Issued', revoked: 'Revoked', 'issuer-authorized': 'Issuer authorized', 'issuer-deauthorized': 'Issuer removed' } as Record<string, string>)[k]; }
}
