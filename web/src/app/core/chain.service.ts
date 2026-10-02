import { Injectable, computed, signal } from '@angular/core';
import { BrowserProvider, Contract, JsonRpcProvider, Network, Signer } from 'ethers';
import { cfg, deployment } from './runtime';

export type WalletMode = 'dev' | 'injected';
export type Role = 'owner' | 'issuer' | 'none';

/** Provider, wallet and role state. Dev mode uses the unlocked accounts of the local node (no extension needed). */
@Injectable({ providedIn: 'root' })
export class ChainService {
  readonly provider = new JsonRpcProvider(cfg.rpcUrl, Network.from(cfg.chainId), { staticNetwork: true, batchMaxCount: 1 });
  readonly signer = signal<Signer | null>(null);
  readonly account = signal<string | null>(null);
  readonly mode = signal<WalletMode>('dev');
  readonly devAccounts = signal<string[]>([]);
  readonly role = signal<Role>('none');
  readonly roleLabel = computed(() => ({ owner: 'Issuer admin', issuer: 'Issuer', none: 'Not authorized' })[this.role()]);
  readonly hasInjected = typeof window !== 'undefined' && !!(window as any).ethereum;

  async restore(): Promise<void> {
    const saved = localStorage.getItem('sourcify.wallet');
    const parsed = saved ? JSON.parse(saved) : { mode: 'dev', index: 0 };
    try {
      await this.connect(parsed.mode === 'injected' && this.hasInjected ? 'injected' : 'dev', parsed.index ?? 0);
    } catch { /* node offline — HealthService shows recovery guidance */ }
  }

  async connect(mode: WalletMode, index = 0): Promise<void> {
    if (mode === 'injected') {
      const eth = (window as any).ethereum;
      await this.ensureChain(eth);
      const bp = new BrowserProvider(eth, 'any');
      await bp.send('eth_requestAccounts', []);
      const signer = await bp.getSigner();
      this.signer.set(signer);
      this.account.set(await signer.getAddress());
    } else {
      const accounts = (await this.provider.listAccounts()).map((a) => a.address);
      this.devAccounts.set(accounts);
      const signer = await this.provider.getSigner(Math.min(index, accounts.length - 1));
      this.signer.set(signer);
      this.account.set(await signer.getAddress());
    }
    this.mode.set(mode);
    localStorage.setItem('sourcify.wallet', JSON.stringify({ mode, index }));
    await this.refreshRole();
  }

  async refreshRole(): Promise<void> {
    const account = this.account();
    if (!account || !deployment) return this.role.set('none');
    try {
      const c = new Contract(deployment.address, deployment.abi as never, this.provider);
      const [owner, isIssuer] = await Promise.all([c['owner'](), c['hasRole'](await c['ISSUER_ROLE'](), account)]);
      this.role.set(owner.toLowerCase() === account.toLowerCase() ? 'owner' : isIssuer ? 'issuer' : 'none');
    } catch { this.role.set('none'); }
  }

  private async ensureChain(eth: any): Promise<void> {
    const chainId = '0x' + cfg.chainId.toString(16);
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
    } catch (e: any) {
      if (e?.code !== 4902) throw e;
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId, chainName: cfg.chainName, rpcUrls: [cfg.rpcUrl], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } }],
      });
    }
  }
}
