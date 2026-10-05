import { validarRUC } from '../utils/ruc-validation.js?v=20261005p';
import { TRIBUTASOFT_LOGIN_URL } from './portal-config.js?v=20261005p';
import { draftSecurityHeaders } from './draft-service.js?v=20261005p';

export const CLIENTE_ESTADO = Object.freeze({ IDLE: 'IDLE', CHECKING: 'CHECKING', NEW_CLIENT: 'NEW_CLIENT', EXISTING_CLIENT: 'EXISTING_CLIENT', ERROR: 'ERROR' });
export const CLIENTE_ERROR = 'No pudimos verificar tu registro en este momento.';
const error = () => ({ status: CLIENTE_ESTADO.ERROR, message: CLIENTE_ERROR });

export function resolverLoginUrl(candidate, configured = TRIBUTASOFT_LOGIN_URL) {
  if (!configured) return '';
  try {
    const trusted = new URL(configured);
    const target = new URL(candidate || configured);
    if (trusted.protocol !== 'https:' || target.protocol !== 'https:' || target.username || target.password || trusted.username || trusted.password) return '';
    // El backend no puede convertir este CTA en una redirección a otro destino.
    if (target.origin !== trusted.origin || target.pathname !== trusted.pathname) return '';
    return trusted.href;
  } catch { return ''; }
}

export function normalizarCliente(raw, loginUrl = TRIBUTASOFT_LOGIN_URL) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.esCliente !== 'boolean') return error();
  if (raw.estado !== undefined && (typeof raw.estado !== 'string' || raw.estado.length > 80)) return error();
  if (raw.redirectUrl !== undefined && typeof raw.redirectUrl !== 'string') return error();
  if (!raw.esCliente) return { status: CLIENTE_ESTADO.NEW_CLIENT };
  const url = resolverLoginUrl(raw.redirectUrl, loginUrl);
  if (raw.redirectUrl && loginUrl && !url) return error();
  return { status: CLIENTE_ESTADO.EXISTING_CLIENT, loginUrl: url, configRequired: !url };
}

export async function consultarCliente(ruc, { fetchImpl = globalThis.fetch, timeoutMs = 8000, loginUrl = TRIBUTASOFT_LOGIN_URL, registrationId = '' } = {}) {
  if (typeof ruc !== 'string' || !validarRUC(ruc).valid || typeof fetchImpl !== 'function') return error();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = registrationId
      ? `/api/registro/drafts/${encodeURIComponent(registrationId)}/client-check`
      : '/api/registro/verificar-cliente';
    const response = await fetchImpl(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(registrationId ? draftSecurityHeaders(registrationId) : {}) },
      body: JSON.stringify(registrationId ? {} : { ruc }), credentials: 'same-origin', cache: 'no-store', signal: controller.signal
    });
    if (!response.ok || response.status === 204) return error();
    return normalizarCliente(await response.json(), loginUrl);
  } catch { return error(); }
  finally { clearTimeout(timeout); }
}
