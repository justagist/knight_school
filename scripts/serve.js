#!/usr/bin/env node
// Tiny static server for `dist/` that sets COOP/COEP so Stockfish can use multi-threading.
// Usage: node scripts/serve.js   (or `npm run serve`)
// Env:   PORT (default 8080), HOST (default 0.0.0.0)

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.nnue': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
};

async function resolveFile(urlPath) {
  // Strip query, decode, and prevent path traversal.
  const cleaned = decodeURIComponent(urlPath.split('?')[0]);
  const safe = normalize(cleaned).replace(/^(\.\.[/\\])+/, '');
  let full = join(ROOT, safe);
  if (!full.startsWith(ROOT)) full = ROOT;
  try {
    const s = await stat(full);
    if (s.isDirectory()) full = join(full, 'index.html');
    await stat(full);
    return full;
  } catch {
    // SPA fallback
    return join(ROOT, 'index.html');
  }
}

const server = createServer(async (req, res) => {
  try {
    const file = await resolveFile(req.url || '/');
    const body = await readFile(file);
    const mime = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, ...HEADERS });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain', ...HEADERS });
    res.end(`Server error: ${err.message}`);
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`KnightSchool serving dist/ at http://${HOST}:${PORT}`);
});
