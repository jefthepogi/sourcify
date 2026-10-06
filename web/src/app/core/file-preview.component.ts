import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { IconComponent } from './icon.component';
import { formatBytes, previewKind } from './util';

const TEXT_LIMIT = 4096;

/** Local preview of the file chosen for issuance. Nothing is uploaded; the blob URL lives only in this tab. */
@Component({
  selector: 'app-file-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
  <div class="pv">
    <div class="bar">
      <span class="meta"><b>{{ file().name }}</b><small>{{ file().type || 'unknown type' }} · {{ formatBytes(file().size) }}</small></span>
      <span class="acts">
        @if (kind() !== 'other') { <a class="mini" [href]="safeUrl()" target="_blank" rel="noopener"><app-icon name="link" [size]="13" />Open</a> }
        <button type="button" class="mini" (click)="remove.emit()"><app-icon name="x" [size]="13" />Remove</button>
      </span>
    </div>

    <div class="stage" [class]="kind()">
      @switch (kind()) {
        @case ('image') {
          <img [src]="safeUrl()" [alt]="'Preview of ' + file().name" />
        }

        @case ('pdf') {
          <object [data]="resourceUrl()" type="application/pdf" aria-label="PDF preview">
            <div class="fallback">
              <app-icon name="file-lock-2" [size]="28" />
              <p>This browser can't show PDFs inline.</p>
              <a class="mini" [href]="safeUrl()" target="_blank" rel="noopener">Open in a new tab</a>
            </div>
          </object>
        }

        @case ('text') {
          <pre class="mono">{{ text() }}@if (truncated()) { … (first 4 KB shown) }</pre>
        }

        @default {
          <div class="fallback">
            <app-icon name="file-lock-2" [size]="28" />
            <p>No inline preview for this file type.</p>
            <small>It will still be hashed and pinned exactly as selected.</small>
          </div>
        }
      }
    </div>
  </div>
  `,
  styles: `
  .pv { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: #fff; }
  .bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; background: var(--surface-2); border-bottom: 1px solid var(--line); }
  .meta { display: flex; flex-direction: column; min-width: 0; }
  .meta b { font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta small { font-size: 10px; color: var(--ink-3); }
  .acts { display: flex; gap: 6px; flex: none; }
  .mini { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 6px; background: #fff; color: var(--ink-2); font-size: 11px; font-weight: 500; text-decoration: none; }
  .mini:hover { border-color: var(--primary); color: var(--primary); }
  .stage { display: grid; place-items: center; background: repeating-conic-gradient(#f3f6f9 0% 25%, #fff 0% 50%) 50% / 16px 16px; max-height: 360px; overflow: auto; }
  .stage.pdf { height: 360px; background: var(--surface-2); }
  .stage.pdf object { width: 100%; height: 100%; }
  .stage.text { background: var(--surface-2); place-items: stretch; }
  img { display: block; max-width: 100%; max-height: 360px; object-fit: contain; }
  pre { margin: 0; padding: 12px; font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; color: var(--ink-2); }
  .fallback { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 28px 16px; color: var(--ink-3); text-align: center; }
  .fallback p { margin: 0; font-size: 12px; }
  .fallback small { font-size: 10px; }
  `,
})
export class FilePreviewComponent {
  readonly file = input.required<File>();
  readonly remove = output<void>();

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly formatBytes = formatBytes;
  protected readonly kind = computed(() => previewKind(this.file().name, this.file().type));

  private readonly url = signal('');
  protected readonly text = signal('');
  protected readonly truncated = signal(false);

  // The URL is created by this component from the user's own file, so it is safe to trust.
  protected readonly safeUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustUrl(this.url()),
  );

  protected readonly resourceUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.url()),
  );

  constructor() {
    effect((onCleanup) => {
      const f = this.file();
      const u = URL.createObjectURL(f);

      this.url.set(u);

      onCleanup(() => URL.revokeObjectURL(u));

      this.text.set('');
      this.truncated.set(false);

      if (previewKind(f.name, f.type) === 'text') {
        let live = true;
        onCleanup(() => (live = false));

        void f.slice(0, TEXT_LIMIT).text().then((t) => {
          if (live) {
            this.text.set(t);
            this.truncated.set(f.size > TEXT_LIMIT);
          }
        });
      }
    });
  }
}