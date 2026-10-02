import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { isAddress } from 'ethers';
import { ChainService } from '../../core/chain.service';
import { HealthService } from '../../core/health.service';
import { IconComponent } from '../../core/icon.component';
import { LedgerService } from '../../core/ledger.service';
import { RegistryService } from '../../core/registry.service';
import { short } from '../../core/util';

/** Owner-only issuer management (the owner authorises secondary issuer wallets). */
@Component({
  selector: 'app-issuers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
  <h1>Issuer access</h1><p class="s0">Wallets allowed to issue certificates. Only the contract owner can change this list.</p>
  @if (chain.role() === 'owner') {
    <div class="card" style="margin-bottom:16px"><div class="card-head"><span class="ico"><app-icon name="key-round" /></span><div><h3>Authorize a wallet</h3><p>The institution name is shown to verifiers.</p></div></div>
      <div class="card-body"><div class="row">
        <div><label class="label" for="a">Wallet address</label><div class="input"><input id="a" class="mono-v" placeholder="0x…" [value]="addr()" (input)="addr.set($any($event.target).value.trim())" /></div></div>
        <div><label class="label" for="n">Institution / department name</label><div class="input"><input id="n" [value]="nm()" (input)="nm.set($any($event.target).value)" /></div></div></div>
        <div><button class="btn btn-primary" (click)="add()" [disabled]="!valid() || busy()"><app-icon name="plus" [size]="16" />Authorize issuer</button></div>
        @if (msg()) { <p class="err">{{ msg() }}</p> }</div></div>
  } @else { <div class="card" style="margin-bottom:16px"><div class="empty">Connect the owner wallet (account #0 on the local chain) to manage issuers.</div></div> }
  <div class="card"><table class="table"><thead><tr><th>Wallet</th><th>Name</th><th></th></tr></thead><tbody>
    @for (i of issuers(); track i.address) { <tr><td class="mono">{{ short(i.address, 10, 6) }}</td><td>{{ i.name }}</td>
      <td style="text-align:right">@if (chain.role() === 'owner' && i.address.toLowerCase() !== chain.account()?.toLowerCase()) { <button class="btn" style="height:30px;font-size:11px" (click)="remove(i.address)" [disabled]="busy()">Remove</button> }</td></tr> }
    @empty { <tr><td colspan="3" class="empty">No issuers found.</td></tr> }</tbody></table></div>`,
  styles: `h1{margin:0 0 4px;font-size:26px;font-weight:400}.s0{margin:0 0 16px;color:var(--ink-3);font-size:12px}`,
})
export class IssuersComponent {
  protected readonly chain = inject(ChainService);
  private readonly registry = inject(RegistryService);
  private readonly ledger = inject(LedgerService);
  private readonly health = inject(HealthService);
  protected readonly short = short;
  protected readonly addr = signal(''); protected readonly nm = signal('');
  protected readonly busy = signal(false); protected readonly msg = signal<string | null>(null);
  protected readonly valid = computed(() => isAddress(this.addr()) && this.nm().trim().length > 0);
  /** Current issuers = replay of authorise/de-authorise events. */
  protected readonly issuers = computed(() => {
    const m = new Map<string, string>();
    for (const a of [...this.ledger.audit()].reverse()) {
      if (a.kind === 'issuer-authorized') m.set(a.subject, a.detail); else if (a.kind === 'issuer-deauthorized') m.delete(a.subject);
    }
    return [...m].map(([address, name]) => ({ address, name }));
  });
  constructor() { effect(() => { if (this.health.chainUp()) untracked(() => void this.ledger.refresh()); }); }
  protected async add(): Promise<void> { await this.run(() => this.registry.authorizeIssuer(this.addr(), this.nm().trim())); this.addr.set(''); this.nm.set(''); }
  protected remove(a: string): Promise<void> { return this.run(() => this.registry.deauthorizeIssuer(a)); }
  private async run(fn: () => Promise<{ wait: (n: number) => Promise<unknown> }>): Promise<void> {
    this.busy.set(true); this.msg.set(null);
    try { await (await fn()).wait(1); await this.ledger.refresh(); } catch (e: any) { this.msg.set(e?.shortMessage ?? e?.message ?? 'Transaction failed'); }
    this.busy.set(false);
  }
}
