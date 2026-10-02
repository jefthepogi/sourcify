#!/usr/bin/env node
// Zero-dependency, Kubo-compatible dev shim: POST /api/v0/{add,version,cat,pin/ls}, GET /ipfs/<cid>.
// Produces CIDv1 raw-leaf (sha2-256) identifiers — identical to `ipfs add --cid-version=1 --raw-leaves`
// for files up to one chunk (256 KiB); larger files get the same deterministic scheme but a different CID than Kubo.
// For development and CI only. Use the Docker Kubo node (docker-compose.yml) for realistic behaviour.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const e = createRequire(import.meta.url)('./load-env.cjs');

const API_PORT = Number(process.env.IPFS_API_PORT ?? e.ports.ipfsApi);
const GATEWAY_PORT = Number(process.env.IPFS_GATEWAY_PORT ?? e.ports.gateway);
const DIR = process.env.IPFS_MOCK_DIR ?? join(process.cwd(), '.ipfs-mock');
mkdirSync(DIR, { recursive: true });

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
function cidOf(bytes) {
  const digest = createHash('sha256').update(bytes).digest();
  const raw = Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), digest]);
  let bits = 0, value = 0, out = '';
  for (const b of raw) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return 'b' + out;
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': '*' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { ...CORS, 'content-type': type }); res.end(body); };
const readBody = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });

// Minimal multipart parser: returns the bytes of the first part.
function firstPart(body, contentType) {
  const boundary = /boundary=(.+)$/.exec(contentType ?? '')?.[1];
  if (!boundary) return body;
  const start = body.indexOf('\r\n\r\n') + 4;
  const end = body.lastIndexOf(`\r\n--${boundary}`);
  return body.subarray(start, end);
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  try {
    if (url.pathname === '/api/v0/version') return send(res, 200, JSON.stringify({ Version: 'sourcify-ipfs-mock', System: 'node' }));
    if (url.pathname === '/api/v0/add') {
      const bytes = firstPart(await readBody(req), req.headers['content-type']);
      const cid = cidOf(bytes);
      if (url.searchParams.get('only-hash') !== 'true') writeFileSync(join(DIR, cid), bytes);
      return send(res, 200, JSON.stringify({ Name: cid, Hash: cid, Size: String(bytes.length) }));
    }
    const m = /^\/(?:ipfs|api\/v0\/cat)\/?(.*)$/.exec(url.pathname);
    const cid = m ? (url.pathname.startsWith('/api/v0/cat') ? url.searchParams.get('arg') : m[1]) : null;
    if (cid && /^[a-z2-7]+$/.test(cid)) {
      const f = join(DIR, cid);
      return existsSync(f) ? send(res, 200, readFileSync(f), 'application/octet-stream') : send(res, 404, 'not found', 'text/plain');
    }
    send(res, 404, JSON.stringify({ Message: 'unknown route' }));
  } catch (e) { send(res, 500, JSON.stringify({ Message: String(e) })); }
}

createServer(handler).listen(API_PORT, '127.0.0.1', () => console.log(`[ipfs-mock] API     http://127.0.0.1:${API_PORT}  (store: ${DIR})`));
createServer(handler).listen(GATEWAY_PORT, '127.0.0.1', () => console.log(`[ipfs-mock] Gateway http://127.0.0.1:${GATEWAY_PORT}/ipfs/<cid>`));
