import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { IconComponent } from '../../core/icon.component';
import { IssuanceService, StepState } from '../../core/issuance.service';
import { cfg } from '../../core/runtime';

@Component({
  selector: 'app-progress-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
  <div class="scrim" role="dialog" aria-modal="true" aria-labelledby="pg-t" aria-live="polite">
    <div class="modal" style="max-width:548px">
      <div class="h"><div class="r"><small class="upper">Live transaction receipt</small><span class="net"><span class="dot"></span>Chain {{ cfg.chainId }}</span></div>
        <h2 id="pg-t">{{ s.result() ? 'Credential issued' : s.error() ? 'Issuance stopped' : 'Issuing credential' }}</h2>
        <p>{{ s.result() ? 'The record is anchored on-chain. Share the QR code with the recipient.' : s.error() ? 'No further steps will run. Nothing is anchored unless the mint step shows complete.' : 'Keep this window open. Each stage records independent evidence — there is no generic spinner.' }}</p></div>
      <ol class="steps">
        @for (st of s.steps(); track st.id) {
          <li><span class="ind" [class]="st.state"><app-icon [name]="icon(st.state)" [size]="15" /></span>
            <div class="info"><div class="sh"><b [class.dim]="st.state === 'queued'">{{ st.label }}</b><span class="badge upper" [class.ok]="st.state === 'done'" [class.info]="st.state === 'active'" [class.bad]="st.state === 'failed'">{{ stateText(st.state) }}</span></div>
              <p [class.errtxt]="st.state === 'failed'">{{ st.detail }}</p>
              @if (st.evidence) { <div class="ev mono"><app-icon name="receipt-text" [size]="13" />{{ st.evidence }}</div> }</div></li>
        }
      </ol>
      @if (s.result(); as r) {
        <div class="done"><img [src]="r.qrDataUrl" width="132" height="132" alt="QR code linking to the verification page" />
          <div><p class="mono url">{{ r.verifyUrl }}</p>
            <div class="ra"><button class="btn" (click)="copy(r.verifyUrl)"><app-icon name="link" [size]="15" />{{ copied() ? 'Copied' : 'Copy link' }}</button>
              <a class="btn" [href]="r.qrDataUrl" [download]="'sourcify-' + r.docHash.slice(2, 10) + '.png'"><app-icon name="download" [size]="15" />QR (PNG)</a></div></div></div>
      }
      <div class="f"><div><small class="upper">Elapsed</small><div class="mono">{{ s.elapsed() }}</div></div>
        <div class="fa">
          <button class="link" (click)="logOpen.set(!logOpen())">{{ logOpen() ? 'Hide' : 'View' }} raw event log</button>
          @if (s.error()) { <button class="btn btn-primary" (click)="retry.emit()">Retry</button> }
          @if (!s.running()) { <button class="btn" [class.btn-primary]="!!s.result()" (click)="close.emit()">{{ s.result() ? 'Done' : 'Close' }}</button> }
        </div></div>
      @if (logOpen()) { <pre class="log mono">{{ s.log().join('\\n') || 'No events yet.' }}</pre> }
    </div>
  </div>`,
  styles: `
  .h { background: var(--ink); color: #fff; padding: 20px 22px 16px; } .r { display: flex; justify-content: space-between; align-items: center; } small.upper { font-size: 9px; color: #afc6f8; }
  .net { display: inline-flex; gap: 5px; align-items: center; padding: 5px 8px; background: rgba(255, 255, 255, .08); border-radius: 99px; font: 9px var(--mono); }
  h2 { margin: 8px 0; font-size: 24px; font-weight: 400; } .h p { margin: 0; font-size: 12px; line-height: 1.45; color: #c6d0de; }
  .steps { list-style: none; margin: 0; padding: 18px 22px 8px; } li { display: flex; gap: 14px; } .info { flex: 1; min-width: 0; padding-bottom: 18px; }
  .ind { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; flex: none; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink-4); }
  .ind.done { background: var(--ok-soft); border-color: var(--ok); color: var(--ok); } .ind.active { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); } .ind.failed { background: var(--bad-soft); border-color: var(--bad); color: var(--bad); }
  .sh { display: flex; justify-content: space-between; align-items: center; } .sh b { font-weight: 400; font-size: 14px; } .dim { color: var(--ink-3); }
  .info p { margin: 4px 0; font-size: 12px; line-height: 1.4; color: var(--ink-3); } .errtxt { color: var(--bad) !important; }
  .ev { display: flex; gap: 8px; align-items: center; padding: 7px 10px; background: var(--surface-2); border-radius: 4px; font-size: 9px; color: var(--ink-2); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .done { display: flex; gap: 16px; align-items: center; padding: 6px 22px 18px; } .done img { border: 1px solid var(--line); border-radius: 8px; } .url { font-size: 10px; word-break: break-all; color: var(--ink-2); margin: 0 0 10px; } .ra { display: flex; gap: 8px; flex-wrap: wrap; } .ra .btn { height: 36px; text-decoration: none; }
  .f { display: flex; justify-content: space-between; align-items: center; padding: 14px 22px; background: var(--surface-2); border-top: 1px solid var(--line); } .f small { font-size: 9px; color: var(--ink-4); } .f .mono { font-size: 12px; }
  .fa { display: flex; gap: 12px; align-items: center; } .fa .btn { height: 36px; }
  .log { margin: 0; padding: 12px 22px; max-height: 160px; overflow: auto; background: #0b1220; color: #cbd5e1; font-size: 10px; white-space: pre-wrap; }`,
})
export class ProgressModalComponent {
  protected readonly s = inject(IssuanceService);
  readonly close = output<void>();
  readonly retry = output<void>();
  protected readonly cfg = cfg;
  protected readonly logOpen = signal(false);
  protected readonly copied = signal(false);
  protected icon(st: StepState): string { return { done: 'check', active: 'radio', failed: 'x', queued: 'circle' }[st]; }
  protected stateText(st: StepState): string { return { done: 'Complete', active: 'In progress', failed: 'Failed', queued: 'Queued' }[st]; }
  protected async copy(url: string): Promise<void> { await navigator.clipboard?.writeText(url); this.copied.set(true); setTimeout(() => this.copied.set(false), 1500); }
}
