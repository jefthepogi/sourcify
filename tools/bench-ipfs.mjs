#!/usr/bin/env node
// IPFS metadata retrieval latency over N trials (working target ≤ 500 ms mean; adjust to your SPMP acceptance criterion).
const API = process.env.IPFS_API ?? 'http://127.0.0.1:5001';
const GATEWAY = process.env.IPFS_GATEWAY ?? 'http://127.0.0.1:8080/ipfs';
const N = Number(process.env.TRIALS ?? 20);
const payload = JSON.stringify({ schema: 'sourcify.credential.v1', bench: true, at: Date.now(), pad: 'x'.repeat(900) });

const form = new FormData(); form.append('file', new Blob([payload]), 'bench.json');
const add = await fetch(`${API}/api/v0/add?cid-version=1&raw-leaves=true`, { method: 'POST', body: form });
const { Hash } = await add.json();
const samples = [];
for (let i = 0; i < N; i++) { const t = performance.now(); const r = await fetch(`${GATEWAY}/${Hash}`); await r.arrayBuffer(); samples.push(performance.now() - t); }
samples.sort((a, b) => a - b);
const mean = samples.reduce((a, b) => a + b, 0) / N;
const pct = (p) => samples[Math.min(N - 1, Math.floor(N * p))];
console.log(`CID ${Hash}\ntrials=${N} mean=${mean.toFixed(1)}ms p50=${pct(0.5).toFixed(1)}ms p95=${pct(0.95).toFixed(1)}ms max=${samples[N - 1].toFixed(1)}ms`);
console.log(mean <= 500 ? 'PASS (≤ 500 ms)' : 'FAIL (> 500 ms)');
process.exit(mean <= 500 ? 0 : 1);
