import {
  draftPath, LEGAL_DOCUMENT_HASHES, LEGAL_DOCUMENT_ID, LEGAL_DOCUMENT_VERSION,
  REGISTRATION_ERROR, SESSION_POLICY, SIGNATURE_ALGORITHM, TAX_DATA_SOURCE,
} from './registration-contract.js?v=20261005p';

const csrfTokens = new Map();

export class RegistrationApiError extends Error {
  constructor(code = REGISTRATION_ERROR.INVALID_REQUEST, status = 0, retryAfter = 0) {
    super(code);
    this.name = 'RegistrationApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  } catch {
    throw new RegistrationApiError('SERVICE_UNAVAILABLE', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new RegistrationApiError(data.error || REGISTRATION_ERROR.INVALID_REQUEST, response.status, Number(response.headers.get('Retry-After') || 0));
  }
  return data;
}

const json = body => ({ headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
const protectedJson = (registrationId, body) => ({
  headers: {
    'Content-Type': 'application/json', Accept: 'application/json',
    [SESSION_POLICY.csrfHeader]: csrfTokens.get(registrationId) || '',
  },
  body: JSON.stringify(body),
});

function protectedHeaders(registrationId, headers = {}) {
  return { ...headers, [SESSION_POLICY.csrfHeader]: csrfTokens.get(registrationId) || '' };
}

export function draftSecurityHeaders(registrationId) {
  return protectedHeaders(registrationId);
}

export async function crearDraft({ ruc }) {
  const draft = await request('/api/registro/drafts', { method: 'POST', ...json({
    contractVersion: 'v2', rucClaim: ruc,
    consent: {
      accepted: true, legalDocumentVersion: LEGAL_DOCUMENT_VERSION,
      legalDocumentId: LEGAL_DOCUMENT_ID, documentHashes: LEGAL_DOCUMENT_HASHES,
    },
  }) });
  if (draft.registrationId && draft.csrfToken) csrfTokens.set(draft.registrationId, draft.csrfToken);
  return draft;
}

export function crearChallenge(registrationId) {
  return request(draftPath(registrationId, '/signature-challenges'), { method: 'POST', ...protectedJson(registrationId, { algorithm: SIGNATURE_ALGORITHM }) });
}

export function verificarChallenge(registrationId, challengeId, proof) {
  return request(draftPath(registrationId, `/signature-challenges/${encodeURIComponent(challengeId)}/verify`), { method: 'POST', ...protectedJson(registrationId, proof) });
}

export function subirPaqueteCertificado(registrationId, file, password, metadata) {
  const form = new FormData();
  form.append('certificatePackage', file, file.name);
  form.append('password', password);
  form.append('metadata', JSON.stringify(metadata));
  return request(draftPath(registrationId, '/certificate-package'), { method: 'POST', headers: protectedHeaders(registrationId, { Accept: 'application/json' }), body: form });
}

export function verificarCliente(registrationId) {
  return request(draftPath(registrationId, '/client-check'), { method: 'POST', ...protectedJson(registrationId, {}) });
}

export function verificarAutorizacionFacturacion(registrationId) {
  return request(draftPath(registrationId, '/issuer-authorization/check'), { method: 'POST', ...protectedJson(registrationId, {}) });
}

export function consultarSriDraft(registrationId) {
  return request(draftPath(registrationId, '/sri/lookup'), { method: 'POST', ...protectedJson(registrationId, {}) });
}

export function guardarDatosTributariosManuales(registrationId, declared, noResolucion = '') {
  return request(draftPath(registrationId, '/tax-data'), { method: 'PUT', ...protectedJson(registrationId, { source: TAX_DATA_SOURCE.MANUAL_ENTRY, status: 'MANUAL_PENDING', declared, noResolucion }) });
}

export function confirmarDatosTributariosSri(registrationId, { noResolucion = '', nombreComercial = '' } = {}) {
  return request(draftPath(registrationId, '/tax-data'), { method: 'PUT', ...protectedJson(registrationId, { source: TAX_DATA_SOURCE.SRI_CONFIRMATION, noResolucion, nombreComercial }) });
}

export function guardarContacto(registrationId, contact) {
  return request(draftPath(registrationId, '/contact'), { method: 'PUT', ...protectedJson(registrationId, contact) });
}

export function enviarOtpEmail(registrationId) {
  return request(draftPath(registrationId, '/otp/email/send'), { method: 'POST', ...protectedJson(registrationId, {}) });
}

export function verificarOtpEmail(registrationId, codigo) {
  return request(draftPath(registrationId, '/otp/email/verify'), { method: 'POST', ...protectedJson(registrationId, { codigo }) });
}

export function guardarFacturacion(registrationId, billing) {
  return request(draftPath(registrationId, '/billing'), { method: 'PUT', ...protectedJson(registrationId, billing) });
}

export function completarDraft(registrationId, idempotencyKey) {
  return request(draftPath(registrationId, '/complete'), {
    method: 'POST', headers: protectedHeaders(registrationId, { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': idempotencyKey }), body: '{}',
  });
}

export async function cancelarDraft(registrationId) {
  const result = await request(draftPath(registrationId), {
    method: 'DELETE', headers: protectedHeaders(registrationId, { Accept: 'application/json' }),
  });
  csrfTokens.delete(registrationId);
  return result;
}

export function guardarLogo({ accountId, postCreateToken, selection }) {
  const path = `/api/registro/accounts/${encodeURIComponent(accountId)}/logo`;
  if (selection?.kind !== 'file' || !selection.file) throw new Error('No se pudo preparar el logo para enviarlo.');
  const form = new FormData();
  form.append('mode', 'upload');
  form.append('source', selection.generated ? 'generated' : 'user');
  form.append('logo', selection.file, selection.file.name);
  return request(path, { method: 'PUT', headers: { Accept: 'application/json', Authorization: `Bearer ${postCreateToken}` }, body: form });
}

export function newIdempotencyKey() {
  if (!globalThis.crypto?.randomUUID) throw new Error('No existe un generador seguro para la operación.');
  return globalThis.crypto.randomUUID();
}
