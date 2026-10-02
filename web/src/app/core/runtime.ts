/** Runtime configuration (public/config.json) and the contract deployment (public/deployment/deployment.json). */
export interface RuntimeConfig {
  rpcUrl: string;
  chainId: number;
  chainName: string;
  ipfsApi: string;
  ipfsGateway: string;
  serviceTimeoutMs: number;
  healthIntervalMs: number;
}

export interface Deployment {
  chainId: number;
  address: string;
  owner: string;
  deployedAtBlock: number;
  abi: unknown[];
}

export const cfg: RuntimeConfig = {
  rpcUrl: 'http://127.0.0.1:7545',
  chainId: 1337,
  chainName: 'Local Hardhat',
  ipfsApi: 'http://127.0.0.1:5001',
  ipfsGateway: 'http://127.0.0.1:8080/ipfs',
  serviceTimeoutMs: 3500,
  healthIntervalMs: 10000,
};

export const SCHEMA_ID = 'sourcify.credential.v1';
export let deployment: Deployment | null = null;

export async function loadRuntime(): Promise<void> {
  try {
    const res = await fetch('config.json', { cache: 'no-store' });
    if (res.ok) Object.assign(cfg, await res.json());
  } catch { /* defaults apply */ }
  try {
    const res = await fetch('deployment/deployment.json', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json?.address && Array.isArray(json?.abi)) deployment = json as Deployment;
    }
  } catch { /* "not deployed" is surfaced by HealthService */ }
}
