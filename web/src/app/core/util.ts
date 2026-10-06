import { keccak256 } from 'ethers';

export const DOC_HASH_RE = /0x[0-9a-fA-F]{64}/;

/** Keccak-256 of raw bytes — the single hashing routine for issuance and verification. */
export async function keccakOfBlob(blob: Blob): Promise<string> {
  return keccak256(new Uint8Array(await blob.arrayBuffer()));
}

export function extractDocHash(text: string): string | null {
  const m = DOC_HASH_RE.exec(text.trim());
  return m ? m[0].toLowerCase() : null;
}

export const short = (v: string | null | undefined, head = 6, tail = 4): string =>
  !v ? '—' : v.length <= head + tail + 1 ? v : `${v.slice(0, head)}…${v.slice(-tail)}`;

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError()), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
export class TimeoutError extends Error { constructor() { super('timeout'); } }

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export const fmtDate = (unixSeconds: number | bigint): string =>
  new Date(Number(unixSeconds) * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtTime = (d: Date): string => d.toLocaleTimeString('en-GB');
export const randomSalt = (): string => '0x' + [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

// Preview Image
export type PreviewKind = 'image' | 'pdf' | 'text' | 'other';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
const TEXT_EXT = /\.(txt|md|json|csv|log|xml|html?)$/i;

/** What the issuer form can safely show for a chosen file. HTML is shown as source text, never rendered. */
export function previewKind(name: string, type: string): PreviewKind {
  if (type.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (type.startsWith('text/') || type === 'application/json' || TEXT_EXT.test(name)) return 'text';
  return 'other';
}
