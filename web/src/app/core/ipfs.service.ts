import { Injectable, signal } from '@angular/core';
import { cfg } from './runtime';
import { TimeoutError, withTimeout } from './util';

export class IpfsError extends Error {
  constructor(readonly kind: 'timeout' | 'unreachable' | 'bad-response', message: string) { super(message); }
}

/** Thin client for the Kubo-compatible HTTP API (real Kubo daemon or tools/ipfs-mock.mjs). */
@Injectable({ providedIn: 'root' })
export class IpfsService {
  /** Last measured retrieval time, surfaced for latency benchmarking (working target ≤ 500 ms; see tools/bench-ipfs.mjs). */
  readonly lastRetrievalMs = signal<number | null>(null);

  async add(data: Blob | string, name: string, opts: { onlyHash?: boolean } = {}): Promise<{ cid: string; size: number }> {
    const blob = typeof data === 'string' ? new Blob([data], { type: 'application/json' }) : data;
    const form = new FormData();
    form.append('file', blob, name);
    const qs = new URLSearchParams({
      'cid-version': '1', 'raw-leaves': 'true', 'only-hash': String(!!opts.onlyHash), pin: String(!opts.onlyHash),
    });
    const res = await this.request(`${cfg.ipfsApi}/api/v0/add?${qs}`, { method: 'POST', body: form });
    const json = await res.json().catch(() => null);
    if (!json?.Hash) throw new IpfsError('bad-response', 'IPFS add returned no CID');
    return { cid: json.Hash as string, size: Number(json.Size ?? blob.size) };
  }

  async cat(cid: string): Promise<Uint8Array> {
    const t0 = performance.now();
    const res = await this.request(`${cfg.ipfsGateway}/${encodeURIComponent(cid)}`, { method: 'GET' });
    const bytes = new Uint8Array(await res.arrayBuffer());
    this.lastRetrievalMs.set(Math.round(performance.now() - t0));
    return bytes;
  }

  async catJson<T>(cid: string): Promise<T> {
    return JSON.parse(new TextDecoder().decode(await this.cat(cid))) as T;
  }

  /** Round-trip latency of the API in ms; throws IpfsError when not reachable. */
  async ping(): Promise<number> {
    const t0 = performance.now();
    await this.request(`${cfg.ipfsApi}/api/v0/version`, { method: 'POST' });
    return Math.round(performance.now() - t0);
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await withTimeout(fetch(url, init), cfg.serviceTimeoutMs);
    } catch (e) {
      throw e instanceof TimeoutError ? new IpfsError('timeout', `IPFS did not answer within ${cfg.serviceTimeoutMs} ms`) : new IpfsError('unreachable', 'IPFS is unreachable');
    }
    if (!res.ok) throw new IpfsError('bad-response', `IPFS responded ${res.status}`);
    return res;
  }
}
