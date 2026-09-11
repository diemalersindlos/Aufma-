/** Loopback-only test runtime for the unchanged compiled MalerAufmass Pro app.
 * Never deploy this local test identity to the internet or a shared LAN.
 */
import http from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openStorage } from './speicher.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.AUFMASS_TEST_PORT ?? 4317);
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw new Error('Ungueltiger lokaler Testport.');
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ALLOWED = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const DATA = path.resolve(process.env.AUFMASS_TEST_DATA ?? path.join(ROOT, 'Testdaten'));
const storage = openStorage(DATA);
let worker;
try { ({ default: worker } = await import(pathToFileURL(path.join(ROOT, 'dist/server/index.js')).href)); }
catch (error) {
  storage.close();
  console.error('Der Original-Build konnte nicht geladen werden. Bitte das gesamte ZIP entpacken.');
  throw error;
}
if (typeof worker?.fetch !== 'function') throw new Error('Original-Worker ohne fetch-Einstieg.');
const TYPES = { '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json' };
const ASSET_ROOT = path.join(ROOT, 'dist/client');
async function asset(request) {
  let relative;
  try { relative = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response('Bad path', { status: 400 }); }
  if (relative.includes('\0') || relative.includes('\\') || relative.split('/').some((p) => p === '..' || p.startsWith('.'))) return new Response('Forbidden', { status: 403 });
  const candidate = path.resolve(ASSET_ROOT, '.' + relative);
  if (!candidate.startsWith(ASSET_ROOT + path.sep)) return new Response('Not found', { status: 404 });
  try {
    const actual = await realpath(candidate);
    if (!actual.startsWith(ASSET_ROOT + path.sep) || !(await stat(actual)).isFile()) return new Response('Not found', { status: 404 });
    const data = await readFile(actual);
    const type = TYPES[path.extname(actual)] ?? 'application/octet-stream';
    return new Response(request.method === 'HEAD' ? null : data, { headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } });
  } catch { return new Response('Not found', { status: 404 }); }
}
const env = { DB: storage.DB, BUCKET: storage.BUCKET, ASSETS: { fetch: asset } };
let queue = Promise.resolve();
function reply(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify({ error: message }));
}
async function handle(req, res) {
  const host = req.headers.host;
  if (!ALLOWED.has(host)) return reply(res, 403, 'Nur lokale Aufrufe sind zugelassen.');
  const origin = req.headers.origin;
  if (origin && ![ORIGIN, `http://localhost:${PORT}`].includes(origin)) return reply(res, 403, 'Fremder Ursprung blockiert.');
  if (req.headers['sec-fetch-site'] === 'cross-site') return reply(res, 403, 'Fremde Webseite blockiert.');
  const url = new URL(req.url ?? '/', `http://${host}`);
  if (url.host !== host) return reply(res, 403, 'Ungueltiges Anfrageziel.');
  if (url.pathname === '/__lokal/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ application: 'MalerAufmass Pro - Original V45', mode: 'local-test-only', sourceCommit: '6cb449ea8397ae3f14b96ab66f77213c8257a8e5', persistentStorage: 'local-sqlite', cloudConnected: false }));
  }
  if (['/signin-with-chatgpt', '/signout-with-chatgpt'].includes(url.pathname)) {
    const target = url.searchParams.get('returnTo') ?? '/';
    res.writeHead(303, { Location: target.startsWith('/') && !target.startsWith('//') && !target.includes('\\') ? target : '/', 'Cache-Control': 'no-store' });
    return res.end();
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.startsWith('oai-') || ['host', 'connection', 'transfer-encoding', 'content-length'].includes(key)) continue;
    if (typeof value === 'string') headers.set(key, value);
  }
  headers.set('oai-authenticated-user-email', 'lokaler-test@example.invalid');
  headers.set('oai-authenticated-user-full-name', 'Lokaler%20Testbetrieb');
  headers.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');
  const parts = []; let bytes = 0;
  if (!['GET', 'HEAD'].includes(req.method)) {
    for await (const part of req) {
      bytes += part.length;
      if (bytes > 64 * 1024 * 1024) return reply(res, 413, 'Testdatei ist groesser als 64 MB.');
      parts.push(part);
    }
  }
  const request = new Request(url, { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(parts) } : {}) });
  let response = ['GET', 'HEAD'].includes(req.method) ? await asset(request) : null;
  if (!response || response.status === 404) {
    const pending = [];
    // Serialize worker requests, preserving the original optimistic revision checks.
    const task = queue.then(async () => {
      const answer = await worker.fetch(request, env, { waitUntil(p) { pending.push(Promise.resolve(p)); }, passThroughOnException() {} });
      let body = req.method === 'HEAD' || [204, 205, 304].includes(answer.status) ? null : Buffer.from(await answer.arrayBuffer());
      if (body && (answer.headers.get('content-type') ?? '').includes('text/html')) {
        body = Buffer.from(body.toString('utf8').replace(/<link\b(?=[^>]*\bas=["']font["'])[^>]*>/gi, ''));
      }
      await Promise.allSettled(pending);
      return { answer, body };
    });
    queue = task.then(() => {}, () => {});
    const { answer, body } = await task;
    response = new Response(body, { status: answer.status, statusText: answer.statusText, headers: answer.headers });
  }
  const out = Object.fromEntries(response.headers);
  delete out['content-length']; delete out['transfer-encoding'];
  if (out.link) {
    out.link = out.link.split(',').filter((entry) => !/\bas=font\b/.test(entry)).join(',');
    if (!out.link) delete out.link;
  }
  if (typeof response.headers.getSetCookie === 'function' && response.headers.getSetCookie().length) out['set-cookie'] = response.headers.getSetCookie();
  out['x-content-type-options'] = 'nosniff';
  out['x-frame-options'] = 'DENY';
  out['referrer-policy'] = 'same-origin';
  out['x-aufmass-mode'] = 'local-test-only';
  if (url.pathname.startsWith('/api/')) out['cache-control'] = 'no-store';
  res.writeHead(response.status, out);
  res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
}
const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error('Lokaler Testfehler:', error);
    if (!res.headersSent) reply(res, 500, 'Lokaler Testfehler. Details im Startfenster.');
    else res.end();
  });
});
server.requestTimeout = 120000;
server.headersTimeout = 15000;
server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? 'Port belegt: Laeuft das Programm bereits? Browser oeffnen oder altes Startfenster schliessen.' : error); storage.close(); process.exitCode = 1; });
server.listen(PORT, '127.0.0.1', () => {
  console.log('\nMalerAufmass Pro - ORIGINAL V45, lokaler Testbetrieb');
  console.log(`PC:    ${ORIGIN}/\nMobil: ${ORIGIN}/mobil`);
  console.log(`Testdaten: ${DATA}`);
  console.log('Keine Cloudverbindung. Keine echte Anmeldung. Nicht fuer Firmenbetrieb freigegeben.');
  console.log('Dieses Fenster offen lassen. Beenden mit Strg+C.\n');
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => { storage.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
