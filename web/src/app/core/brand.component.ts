import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Placeholder wordmark. Replace with the exported vector from the Figma "SOURCIFY_Logo" frames. */
@Component({
  selector: 'app-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M14 2 3 8v12l11 6 11-6V8z" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="m9 14 3.5 3.5L19 11" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>SOURCIFY</span>`,
  styles: `:host{display:inline-flex;align-items:center;gap:8px;font-weight:800;letter-spacing:.14em;font-size:15px}`,
})
export class BrandComponent {}
