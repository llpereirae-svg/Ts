import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRucProxy } from './ruc-proxy.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PORT = Number(process.env.PORT || 8000);
const rucProxy = createRucProxy({ upstreamUrl: process.env.SRI_RUC_URL });
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
  '.ttf': 'font/ttf', '.otf': 'font/otf',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const rucMatch = url.pathname.match(/^\/api\/ruc\/(\d+)$/);
  if (req.method === 'GET' && rucMatch) {
    const result = await rucProxy(rucMatch[1]);
    res.writeHead(result.status, { 'Cache-Control': 'no-store', ...result.headers });
    res.end(result.body);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }

  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const safePath = normalize(relative).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(ROOT, safePath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not file');
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
}).listen(PORT, () => {
  console.log(`TributaSoft disponible en http://localhost:${PORT}`);
  if (!process.env.SRI_RUC_URL) console.log('SRI_RUC_URL no configurada: el flujo usará fallback manual seguro.');
});
