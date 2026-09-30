import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRucProxy } from './ruc-proxy.js';
import { createClientLookupMock, isClientMockRequestAllowed } from './cliente-mock.js';
import { createRegistrationMock } from './registration-mock.js';
import { decodeRequestPath, resolvePublicFile } from './public-surface.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PORT = Number(process.env.PORT || 8000);
const BIND_HOST = process.env.DEV_BIND_HOST || '127.0.0.1';
if (!['127.0.0.1', '::1', 'localhost'].includes(BIND_HOST)) {
  throw new Error('DEV_BIND_HOST debe ser una interfaz loopback.');
}
const rucProxy = createRucProxy({ upstreamUrl: process.env.SRI_RUC_URL });
const clientLookup = createClientLookupMock({ enabled: process.env.DEV_CLIENT_LOOKUP_MOCK === '1', existingRuc: process.env.DEV_CLIENT_LOOKUP_EXISTING_RUC || '', nodeEnv: process.env.NODE_ENV });
const registrationMock = createRegistrationMock({ enabled: process.env.DEV_REGISTRATION_MOCK === '1', nodeEnv: process.env.NODE_ENV });
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
  '.ttf': 'font/ttf', '.otf': 'font/otf',
};

const server = createServer(async (req, res) => {
  const requestPath = decodeRequestPath(req.url);
  if (!requestPath.allowed) { blockRequest(res, 400, requestPath.code); return; }
  const pathname = requestPath.pathname;
  if (pathname === '/api/registro/verificar-cliente') {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let bytes = 0;
    let raw = '';
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 1024) { res.writeHead(413).end(); return; }
        raw += chunk;
      }
      const local = isClientMockRequestAllowed(req, {
        allowedOrigin: process.env.DEV_ALLOWED_ORIGIN || '', nodeEnv: process.env.NODE_ENV
      });
      const result = clientLookup(JSON.parse(raw), { local });
      res.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Dev-Client-Lookup-Mock': '1' });
      res.end(JSON.stringify(result.body));
    } catch { res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{"error":"INVALID_REQUEST"}'); }
    return;
  }
  if (pathname === '/api/registro') {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let bytes = 0;
    let raw = '';
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 128 * 1024) { res.writeHead(413).end(); return; }
        raw += chunk;
      }
      const local = isClientMockRequestAllowed(req, {
        allowedOrigin: process.env.DEV_ALLOWED_ORIGIN || '', nodeEnv: process.env.NODE_ENV
      });
      const result = registrationMock(JSON.parse(raw), { local });
      res.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Dev-Registration-Mock': '1' });
      res.end(JSON.stringify(result.body));
    } catch { res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{"error":"INVALID_REQUEST"}'); }
    return;
  }
  const rucMatch = pathname.match(/^\/api\/ruc\/(\d+)$/);
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

  const publicFile = await resolvePublicFile(ROOT, pathname);
  if (!publicFile.allowed) { blockRequest(res, 404, publicFile.code); return; }
  try {
    const body = await readFile(publicFile.filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[extname(publicFile.filePath)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
});

server.listen(PORT, BIND_HOST, () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : PORT;
  console.log(`TributaSoft disponible en http://${BIND_HOST === '::1' ? '[::1]' : BIND_HOST}:${actualPort}`);
  if (!process.env.SRI_RUC_URL) console.log('SRI_RUC_URL no configurada: el flujo usará fallback manual seguro.');
});

function blockRequest(res, status, code) {
  console.warn(`[dev-server] solicitud bloqueada code=${code}`);
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(status === 400 ? 'Solicitud inválida' : 'No encontrado');
}
