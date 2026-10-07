import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

/**
 * Sourcify brand.
 *
 * The preferred logo image is used when available. If it cannot be loaded,
 * the original inline SVG + wordmark is used as a fallback.
 *
 * Pages/themes can control the brand appearance with:
 *
 *   --brand-color
 *   --brand-image-filter
 */
// routed on /public directory
const path_to_logo = "/assets/SOURCIFY_Logo.svg" 

@Component({
  selector: 'app-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (logoAvailable()) {
      <img
        src="${path_to_logo}"
        alt="Sourcify"
        (error)="logoAvailable.set(false)"
      />
    } @else {
      <svg
        width="26"
        height="26"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M14 2 3 8v12l11 6 11-6V8z"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linejoin="round"
        />
        <path
          d="m9 14 3.5 3.5L19 11"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>

      <span>SOURCIFY</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 8px;

      color: var(--brand-color, var(--ink));

      font-weight: 800;
      letter-spacing: .14em;
      font-size: 15px;
      line-height: 1;
    }

    img {
      width: 120px;
      height: auto;
      display: block;
      object-fit: contain;

      filter: var(--brand-image-filter, none);
    }

    svg {
      display: block;
      flex: none;
      color: currentColor;
    }

    span {
      color: currentColor;
    }
  `,
})
export class BrandComponent {
  protected readonly logoAvailable = signal(true);
}