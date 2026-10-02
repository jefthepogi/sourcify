import { Injectable, computed, inject, signal } from '@angular/core';
import { ChainService } from './chain.service';
import { IpfsError, IpfsService } from './ipfs.service';
import { cfg, deployment } from './runtime';
import { TimeoutError, withTimeout } from './util';

export type ServiceState = 'checking' | 'up' | 'timeout' | 'down';
export interface ServiceHealth { id: 'chain' | 'ipfs' | 'registry'; name: string; endpoint: string; state: ServiceState; latencyMs: number | null }

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly chain = inject(ChainService);
  private readonly ipfs = inject(IpfsService);
  private timer?: ReturnType<typeof setInterval>;

  readonly services = signal<ServiceHealth[]>([
    { id: 'chain', name: 'Blockchain RPC', endpoint: cfg.rpcUrl, state: 'checking', latencyMs: null },
    { id: 'ipfs', name: 'IPFS API', endpoint: cfg.ipfsApi, state: 'checking', latencyMs: null },
    { id: 'registry', name: 'Registry contract', endpoint: deployment?.address ?? 'not deployed', state: 'checking', latencyMs: null },
  ]);
  readonly firstCheckDone = signal(false);
  readonly chainUp = computed(() => this.get('chain').state === 'up');
  readonly ipfsUp = computed(() => this.get('ipfs').state === 'up');
  readonly allUp = computed(() => this.services().every((s) => s.state === 'up'));
  readonly blocking = computed(() => this.firstCheckDone() && !this.allUp());

  start(): void {
    void this.check();
    this.timer ??= setInterval(() => void this.check(), cfg.healthIntervalMs);
  }

  async check(): Promise<void> {
    const [chain, ipfs] = await Promise.all([this.probeChain(), this.probeIpfs()]);
    const registry = await this.probeRegistry(chain.state === 'up');
    this.services.set([chain, ipfs, registry]);
    this.firstCheckDone.set(true);
    if (chain.state === 'up') void this.chain.refreshRole();
  }

  diagnostics(): string {
    return [`Sourcify diagnostics @ ${new Date().toISOString()}`, `chainId=${cfg.chainId}`,
      ...this.services().map((s) => `${s.name} ${s.endpoint} → ${s.state}${s.latencyMs != null ? ` (${s.latencyMs} ms)` : ''}`)].join('\n');
  }

  private get(id: ServiceHealth['id']): ServiceHealth { return this.services().find((s) => s.id === id)!; }

  private async probeChain(): Promise<ServiceHealth> {
    const base = { id: 'chain' as const, name: 'Blockchain RPC', endpoint: cfg.rpcUrl };
    const t0 = performance.now();
    try {
      await withTimeout(this.chain.provider.getBlockNumber(), cfg.serviceTimeoutMs);
      return { ...base, state: 'up', latencyMs: Math.round(performance.now() - t0) };
    } catch (e) { return { ...base, state: e instanceof TimeoutError ? 'timeout' : 'down', latencyMs: null }; }
  }

  private async probeIpfs(): Promise<ServiceHealth> {
    const base = { id: 'ipfs' as const, name: 'IPFS API', endpoint: cfg.ipfsApi };
    try { return { ...base, state: 'up', latencyMs: await this.ipfs.ping() }; }
    catch (e) { return { ...base, state: e instanceof IpfsError && e.kind === 'timeout' ? 'timeout' : 'down', latencyMs: null }; }
  }

  private async probeRegistry(chainUp: boolean): Promise<ServiceHealth> {
    const base = { id: 'registry' as const, name: 'Registry contract', endpoint: deployment?.address ?? 'not deployed' };
    if (!deployment || !chainUp) return { ...base, state: 'down', latencyMs: null };
    try {
      const code = await withTimeout(this.chain.provider.getCode(deployment.address), cfg.serviceTimeoutMs);
      return { ...base, state: code !== '0x' ? 'up' : 'down', latencyMs: null };
    } catch { return { ...base, state: 'down', latencyMs: null }; }
  }
}
