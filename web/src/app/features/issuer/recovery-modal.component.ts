import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HealthService, ServiceState } from '../../core/health.service';
import { IconComponent } from '../../core/icon.component';
import { cfg } from '../../core/runtime';

/** "Network disconnected" error boundary from the design. Blocks signing; drafts stay in localStorage. */
@Component({
  selector: 'app-recovery-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
  <div class="scrim" role="alertdialog" aria-modal="true" aria-labelledby="rt">
    <div class="modal" style="max-width:648px;border:1px solid var(--line-strong)">
      <div class="head"><span class="ci"><app-icon name="cloud-off" [size]="25" /></span><div>
        <small class="upper">Safe recovery mode · Error boundary</small><h2 id="rt">Network disconnected</h2><p>Issuance is paused. No transaction was submitted.</p></div></div>
      <div class="content">
        <p class="lead">Sourcify cannot reach one or more required local services. Your draft is preserved and signing is disabled until connectivity is restored.</p>
        <div class="svcs">
          @for (s of health.services(); track s.id) {
            <div class="svc"><app-icon [name]="s.id === 'ipfs' ? 'boxes' : 'blocks'" [size]="17" /><div><b>{{ s.name }}</b><small class="mono">{{ s.endpoint }}</small></div>
              <span class="badge" [class.ok]="s.state === 'up'" [class.bad]="s.state === 'down'" [class.warn]="s.state === 'timeout' || s.state === 'checking'">{{ label(s.state) }}</span></div>
          }
        </div>
        <div class="guide"><b>Recovery guidance</b>
          <p>1. Start the local chain (<span class="mono">npm run chain</span>) and confirm chain ID {{ cfg.chainId }}.</p>
          <p>2. Run the IPFS daemon (<span class="mono">docker compose up -d</span>) or <span class="mono">npm run ipfs:mock</span>; confirm the API on port 5001.</p>
          <p>3. Deploy the registry if needed (<span class="mono">npm run deploy</span>), then retry. Your unsent form data will remain intact.</p></div>
        <div class="actions">
          <button class="btn" (click)="copy()"><app-icon name="copy" [size]="15" />{{ copied() ? 'Copied' : 'Copy diagnostics' }}</button>
          <button class="btn btn-primary" style="flex:1" (click)="retry()" [disabled]="busy()"><app-icon name="refresh-cw" [size]="15" />{{ busy() ? 'Checking…' : 'Retry connection' }}</button>
        </div>
      </div>
    </div>
  </div>`,
  styles: `
  .head { display: flex; gap: 14px; align-items: center; padding: 20px 24px; background: var(--bad-soft); border-bottom: 1px solid #f5bac1; }
  .ci { width: 46px; height: 46px; border-radius: 50%; background: #fff; display: grid; place-items: center; color: var(--bad); flex: none; }
  small.upper { font-size: 9px; color: var(--bad); } h2 { margin: 3px 0; font-size: 24px; font-weight: 400; color: var(--bad-ink); } .head p { margin: 0; font-size: 12px; color: #7a3038; }
  .content { padding: 24px; display: flex; flex-direction: column; gap: 16px; } .lead { margin: 0; font-size: 14px; line-height: 1.5; color: var(--ink-2); }
  .svcs { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; } .svc { display: flex; align-items: center; gap: 9px; padding: 12px 14px; } .svc + .svc { border-top: 1px solid var(--line); }
  .svc > div { flex: 1; display: flex; flex-direction: column; } .svc small { font-size: 9px; color: var(--ink-3); }
  .guide { background: var(--primary-soft); border-radius: 8px; padding: 14px; font-size: 12px; color: var(--primary-ink); } .guide p { margin: 8px 0 0; color: var(--ink-2); line-height: 1.4; }
  .actions { display: flex; gap: 10px; }`,
})
export class RecoveryModalComponent {
  protected readonly health = inject(HealthService);
  protected readonly cfg = cfg;
  protected readonly busy = signal(false);
  protected readonly copied = signal(false);
  protected label(s: ServiceState): string { return { up: 'ONLINE', down: 'UNREACHABLE', timeout: 'TIMEOUT', checking: 'CHECKING' }[s]; }
  protected async retry(): Promise<void> { this.busy.set(true); await this.health.check(); this.busy.set(false); }
  protected async copy(): Promise<void> { await navigator.clipboard?.writeText(this.health.diagnostics()); this.copied.set(true); setTimeout(() => this.copied.set(false), 1500); }
}
