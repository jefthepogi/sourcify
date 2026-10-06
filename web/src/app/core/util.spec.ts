import { describe, expect, it } from 'vitest';
import { extractDocHash, formatBytes, previewKind, short, withTimeout, TimeoutError } from './util';

const H = '0x' + 'a1'.repeat(32);

describe('util', () => {
  it('extracts a docHash from a bare hash or a verification URL', () => {
    expect(extractDocHash(H)).toBe(H);
    expect(extractDocHash(`https://sourcify.example/verify/${H.toUpperCase().replace('0X', '0x')}`)).toBe(H);
  });
  it('rejects malformed hashes', () => {
    expect(extractDocHash('0x1234')).toBeNull();
    expect(extractDocHash('not a hash')).toBeNull();
  });
  it('shortens long identifiers and leaves short ones alone', () => {
    expect(short(H, 6, 4)).toBe('0xa1a1…a1a1');
    expect(short('abc')).toBe('abc');
    expect(short(null)).toBe('—');
  });
  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(486 * 1024)).toBe('486 KB');
  });
  it('times out slow promises', async () => {
    await expect(withTimeout(new Promise(() => undefined), 20)).rejects.toBeInstanceOf(TimeoutError);
    await expect(withTimeout(Promise.resolve(7), 20)).resolves.toBe(7);
  });
  it('classifies files for preview, falling back to the extension when the type is empty', () => {
    expect(previewKind('a.png', 'image/png')).toBe('image');
    expect(previewKind('scan.JPG', '')).toBe('image');
    expect(previewKind('cert.pdf', 'application/pdf')).toBe('pdf');
    expect(previewKind('cert.pdf', '')).toBe('pdf');
    expect(previewKind('notes.txt', 'text/plain')).toBe('text');
    expect(previewKind('page.html', 'text/html')).toBe('text'); // shown as source, never rendered
    expect(previewKind('data.bin', 'application/octet-stream')).toBe('other');
  });
});
