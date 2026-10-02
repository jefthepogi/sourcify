import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { ChainService } from '../../core/chain.service';
import { IconComponent } from '../../core/icon.component';
import { PreparedIssuance } from '../../core/issuance.service';
import { cfg, deployment } from '../../core/runtime';
import { inject } from '@angular/core';
import { short } from '../../core/util';

@Component({
  selector: 'app-review-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
  <div class="scrim" role="dialog" aria-modal="true" aria-labelledby="rv-t">
    <div class="modal" style="max-width:580px">
      <div class="h"><span class="si"><app-icon name="shield-alert" [size]="21" /></span><div><small class="upper">Required review · Step 2 of 2</small><h2 id="rv-t">Confirm before signing</h2></div>
        <button class="x" (click)="cancel.emit()" aria-label="Close"><app-icon name="x" [size]="15" /></button></div>
      <div class="b">
        <div class="warn"><app-icon name="triangle-alert" [size]="20" /><p>Blockchain records are immutable. Verify every value below before {{ chain.mode() === 'injected' ? 'opening MetaMask' : 'signing' }}.</p></div>
        <h4>Recipient &amp; credential</h4>
        <dl><dt>Recipient</dt><dd>{{ data().manifest.recipient.name }}</dd><dt>Credential</dt><dd>{{ data().manifest.credential.program }}</dd><dt>Type</dt><dd>{{ data().manifest.credential.type }}</dd><dt>Award date</dt><dd>{{ data().manifest.credential.awardDate }}</dd></dl>
        <h4>Document &amp; storage</h4>
        <dl><dt>docHash</dt><dd class="m">{{ short(data().docHash, 10, 8) }}</dd><dt>Document CID</dt><dd class="m">{{ short(data().documentCID, 12, 6) }}</dd><dt>Metadata CID</dt><dd class="m">{{ short(data().metadataCID, 12, 6) }}</dd><dt>Schema</dt><dd class="m">{{ data().manifest.schema }}</dd></dl>
        <h4>Signing context</h4>
        <dl><dt>Wallet</dt><dd class="m">{{ short(chain.account(), 6, 4) }}</dd><dt>Contract</dt><dd class="m">{{ short(contract, 6, 4) }} · {{ cfg.chainName }} {{ cfg.chainId }}</dd><dt>Estimated gas</dt><dd class="m">{{ gas() == null ? '—' : gas()!.toLocaleString() + ' gas' }}</dd></dl>
        <label class="ack"><input type="checkbox" [checked]="ack()" (change)="ack.set($any($event.target).checked)" /><span>I reviewed the recipient, document hash, IPFS CID, contract, and understand this record cannot be edited after signing.</span></label>
      </div>
      <div class="f"><button class="btn" style="width:150px" (click)="cancel.emit()">Return to Edit</button>
        <button class="btn btn-primary" style="flex:1" [disabled]="!ack()" (click)="confirm.emit()"><app-icon [name]="ack() ? 'shield-check' : 'lock-keyhole'" [size]="16" />{{ ack() ? 'Pin & Sign' : 'Acknowledge to Sign' }}</button></div>
    </div>
  </div>`,
  styles: `
  .h { display: flex; gap: 12px; align-items: center; padding: 18px 22px; background: var(--surface-2); border-bottom: 1px solid var(--line); } .h > div { flex: 1; }
  .si { width: 38px; height: 38px; border-radius: 8px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; }
  small { font-size: 9px; color: var(--primary); } h2 { margin: 2px 0 0; font-size: 20px; font-weight: 400; }
  .x { width: 32px; height: 32px; border: 1px solid var(--line); border-radius: 8px; background: #fff; display: grid; place-items: center; }
  .b { padding: 16px 22px 18px; display: flex; flex-direction: column; gap: 6px; max-height: calc(100vh - 220px); overflow: auto; }
  .warn { display: flex; gap: 10px; align-items: center; padding: 12px; background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: 8px; color: var(--warn-ink); margin-bottom: 8px; } .warn p { margin: 0; font-size: 12px; line-height: 1.4; }
  h4 { margin: 8px 0 0; font-size: 9px; font-weight: 400; text-transform: uppercase; color: var(--ink-4); }
  dl { margin: 0; display: grid; grid-template-columns: 140px 1fr; } dt, dd { padding: 7px 0; border-bottom: 1px solid var(--line); margin: 0; } dt { font-size: 12px; color: var(--ink-3); }
  dd { text-align: right; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } dd.m { font-family: var(--mono); font-size: 10px; padding-top: 9px; }
  .ack { display: flex; gap: 10px; padding: 12px; margin-top: 10px; border: 1px solid var(--line-strong); border-radius: 8px; font-size: 12px; line-height: 1.4; color: var(--ink-2); cursor: pointer; } .ack input { width: 18px; height: 18px; margin: 0; flex: none; }
  .f { display: flex; gap: 10px; padding: 16px 22px; background: var(--surface-2); border-top: 1px solid var(--line); }`,
})
export class ReviewModalComponent {
  readonly data = input.required<PreparedIssuance>();
  readonly gas = input<bigint | null>(null);
  readonly cancel = output<void>();
  readonly confirm = output<void>();
  protected readonly chain = inject(ChainService);
  protected readonly ack = signal(false);
  protected readonly cfg = cfg;
  protected readonly contract = deployment?.address ?? '';
  protected readonly short = short;
}
