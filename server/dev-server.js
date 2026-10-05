import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRucProxy } from './ruc-proxy.js';
import { createClientLookupMock, isClientMockRequestAllowed } from './cliente-mock.js';
import { createRegistrationMock } from './registration-mock.js';
import { createRegistrationV2Mock } from './registration-v2-mock.js';
import { consultarEmisorAutorizado, IssuerAuthorizationError } from './emisor-autorizado.js';
import { resolveIssuerAuthorizationMock } from './emisor-autorizado-mock.js';
import { SESSION_POLICY } from '../assets/services/registration-contract.js';
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
const registrationV2 = createRegistrationV2Mock({
  enabled: process.env.DEV_REGISTRATION_MOCK === '1', nodeEnv: process.env.NODE_ENV,
  existingRuc: process.env.DEV_CLIENT_LOOKUP_EXISTING_RUC || '',
});
const issuerAuthorizationCache = new Map();
const draftCleanup = setInterval(() => registrationV2.cleanup(), 5 * 60 * 1000);
draftCleanup.unref();
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
  if (pathname === '/api/registro/drafts' || pathname.startsWith('/api/registro/drafts/') || pathname.startsWith('/api/registro/accounts/')) {
    await handleRegistrationV2(req, res, pathname);
    return;
  }
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

async function handleRegistrationV2(req, res, pathname) {
  const local = isClientMockRequestAllowed(req, { allowedOrigin: process.env.DEV_ALLOWED_ORIGIN || '', nodeEnv: process.env.NODE_ENV });
  try {
    let result;
    const cookies = parseCookies(req.headers.cookie || '');
    const cookieName = SESSION_POLICY.developmentCookieName;
    let sessionId = cookies[cookieName] || '';
    if (pathname === '/api/registro/drafts' && req.method === 'POST' && !sessionId) {
      sessionId = randomBytes(32).toString('base64url');
    }
    const context = {
      local, sessionId, csrfToken: String(req.headers['x-csrf-token'] || ''),
      ip: req.socket.remoteAddress || 'loopback', userAgent: String(req.headers['user-agent'] || ''),
    };
    if (pathname === '/api/registro/drafts' && req.method === 'POST') {
      result = registrationV2.createDraft(await readJson(req, 16 * 1024), context);
    } else {
      const draftMatch = pathname.match(/^\/api\/registro\/drafts\/([^/]+)(.*)$/);
      const accountMatch = pathname.match(/^\/api\/registro\/accounts\/([^/]+)\/logo$/);
      if (accountMatch && req.method === 'PUT') {
        const contentType = String(req.headers['content-type'] || '');
        const selection = contentType.includes('application/json') ? await readJson(req, 1024) : (await readBuffer(req, 600 * 1024), { mode: 'upload' });
        result = registrationV2.storeLogo(decodeURIComponent(accountMatch[1]), bearer(req), selection, context);
      } else if (!draftMatch) result = { status: 404, body: { error: 'DRAFT_NOT_FOUND' } };
      else {
        const id = decodeURIComponent(draftMatch[1]);
        const suffix = draftMatch[2];
        const challengeMatch = suffix.match(/^\/signature-challenges\/([^/]+)\/verify$/);
        if (!suffix && req.method === 'DELETE') result = registrationV2.cancelDraft(id, context);
        else if (suffix === '/signature-challenges' && req.method === 'POST') result = registrationV2.createChallenge(id, await readJson(req), context);
        else if (challengeMatch && req.method === 'POST') result = registrationV2.verifyChallenge(id, decodeURIComponent(challengeMatch[1]), await readJson(req, 128 * 1024), context);
        else if (suffix === '/certificate-package' && req.method === 'POST') result = registrationV2.uploadCertificate(id, await readCertificateUpload(req), context);
        else if (suffix === '/client-check' && req.method === 'POST') { await readJson(req); result = registrationV2.clientCheck(id, context); }
        else if (suffix === '/issuer-authorization/check' && req.method === 'POST') {
          await readJson(req);
          const started = registrationV2.beginIssuerAuthorizationCheck(id, context);
          const draft = registrationV2._drafts.get(id);
          if (started.status >= 300) result = started;
          else if (!draft) result = { status: 404, body: { error: 'DRAFT_NOT_FOUND' } };
          else {
            try {
              const authorization = await lookupIssuerAuthorization(draft.ruc);
              result = registrationV2.storeIssuerAuthorization(id, authorization, context);
            } catch (error) {
              if (error instanceof IssuerAuthorizationError) {
                console.warn(`[dev-server] consulta de emisor no disponible code=${error.code}`);
              }
              result = registrationV2.markIssuerAuthorizationUnavailable(id, context);
            }
          }
        }
        else if (suffix === '/sri/lookup' && req.method === 'POST') {
          await readJson(req); const started = registrationV2.beginSriLookup(id, context);
          const draft = registrationV2._drafts.get(id);
          if (started.status >= 300) result = started;
          else if (!draft) result = { status: 404, body: { error: 'DRAFT_NOT_FOUND' } };
          else {
            const upstream = await rucProxy(draft.ruc);
            if (upstream.status === 200) {
              const raw = JSON.parse(upstream.body); const source = Array.isArray(raw) ? raw[0] : raw;
              result = registrationV2.storeSri(id, canonicalSri(source, draft.ruc), context);
              if (result.status < 300) result.body = { status: 'OK', data: result.body.snapshot || canonicalSri(source, draft.ruc) };
            } else {
              const error = safeJson(upstream.body, { error: 'SRI_UNAVAILABLE' });
              result = upstream.status === 503 && error.error === 'SRI_UNAVAILABLE'
                ? registrationV2.markSriUnavailable(id, { attempts: Number(error.attempts || 3), errorCode: error.error }, context)
                : { status: upstream.status, body: error };
            }
          }
        }
        else if (suffix === '/tax-data' && req.method === 'PUT') result = registrationV2.storeSri(id, await readJson(req, 32 * 1024), context);
        else if (suffix === '/contact' && req.method === 'PUT') result = registrationV2.storeContact(id, await readJson(req, 8 * 1024), context);
        else if (suffix === '/otp/email/send' && req.method === 'POST') { await readJson(req); result = registrationV2.sendOtp(id, context); }
        else if (suffix === '/otp/email/verify' && req.method === 'POST') result = registrationV2.verifyOtp(id, await readJson(req), context);
        else if (suffix === '/billing' && req.method === 'PUT') result = registrationV2.storeBilling(id, await readJson(req, 32 * 1024), context);
        else if (suffix === '/complete' && req.method === 'POST') { await readJson(req); result = registrationV2.complete(id, String(req.headers['idempotency-key'] || ''), context); }
        else result = { status: 404, body: { error: 'DRAFT_NOT_FOUND' } };
      }
    }
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Dev-Registration-Mock': 'v2' };
    if (result.retryAfter) headers['Retry-After'] = String(result.retryAfter);
    if (sessionId && result.status < 300) headers['Set-Cookie'] = `${cookieName}=${sessionId}; Max-Age=7200; ${SESSION_POLICY.developmentCookie}`;
    res.writeHead(result.status, headers);
    res.end(JSON.stringify(result.body));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{"error":"INVALID_REQUEST"}');
  }
}

async function readJson(req, limit = 16 * 1024) {
  const buffer = await readBuffer(req, limit);
  if (!buffer.length) return {};
  const value = JSON.parse(buffer.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_REQUEST');
  return value;
}
async function readBuffer(req, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('PAYLOAD_TOO_LARGE'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function readCertificateUpload(req) {
  const buffer = await readBuffer(req, 9 * 1024 * 1024);
  const response = new Response(buffer, { headers: { 'Content-Type': req.headers['content-type'] || '' } });
  const form = await response.formData(); const file = form.get('certificatePackage');
  return { file: file && typeof file === 'object' ? { name: file.name, size: file.size, type: file.type } : null, password: String(form.get('password') || ''), metadata: String(form.get('metadata') || '') };
}
function bearer(req) { const value = String(req.headers.authorization || ''); return value.startsWith('Bearer ') ? value.slice(7) : ''; }
function parseCookies(header) {
  return Object.fromEntries(String(header).split(';').map(value => value.trim()).filter(Boolean).map(value => {
    const index = value.indexOf('=');
    return index > 0 ? [value.slice(0, index), value.slice(index + 1)] : [value, ''];
  }));
}
function safeJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
async function lookupIssuerAuthorization(ruc) {
  const mocked = resolveIssuerAuthorizationMock(ruc, {
    mode: process.env.DEV_ISSUER_AUTHORIZATION_MOCK,
    notAuthorizedRuc: process.env.DEV_ISSUER_NOT_AUTHORIZED_RUC,
  });
  if (mocked) return mocked;
  const cached = issuerAuthorizationCache.get(ruc);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await consultarEmisorAutorizado(ruc);
  const ttl = value.authorized ? 24 * 60 * 60 * 1000 : 30 * 60 * 1000;
  issuerAuthorizationCache.set(ruc, { value, expiresAt: Date.now() + ttl });
  return value;
}
function canonicalSri(source, ruc) {
  return {
    source: 'SRI', ruc, estadoContribuyenteRuc: String(source?.estadoContribuyenteRuc || ''),
    razonSocial: String(source?.razonSocial || source?.nombreContribuyente || ''),
    nombreComercial: String(source?.nombreComercial || ''), regimen: String(source?.regimen || source?.regimenGeneral || ''),
    tipoContribuyente: String(source?.tipoContribuyente || ''), obligadoLlevarContabilidad: String(source?.obligadoLlevarContabilidad || ''),
    actividadEconomicaPrincipal: String(source?.actividadEconomicaPrincipal || source?.actividadEconomica || ''),
    agenteRetencion: source?.agenteRetencion ?? null, contribuyenteEspecial: source?.contribuyenteEspecial ?? null,
    granContribuyente: source?.granContribuyente ?? null, representantesLegales: Array.isArray(source?.representantesLegales) ? source.representantesLegales : [],
    attempts: 1, lastAttemptAt: new Date().toISOString(),
  };
}
