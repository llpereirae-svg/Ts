import { validarRUC } from '../assets/utils/ruc-validation.js';

const BASE_URL = 'https://srienlinea.sri.gob.ec';
const FORM_PATH = '/comprobantes-electronicos-internet/publico/validezEmisor.jsf';
const DEFAULT_TIMEOUT_MS = 20_000;

export class IssuerAuthorizationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IssuerAuthorizationError';
    this.code = code;
  }
}

export async function consultarEmisorAutorizado(ruc, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date(),
} = {}) {
  if (typeof ruc !== 'string' || !validarRUC(ruc).valid) {
    throw new IssuerAuthorizationError('INVALID_RUC', 'El RUC no es válido.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new IssuerAuthorizationError('SRI_ISSUER_UNAVAILABLE', 'La consulta del SRI no está disponible.');
  }

  const first = await request(fetchImpl, `${BASE_URL}${FORM_PATH}`, {
    headers: { Accept: 'text/html' },
  }, timeoutMs);
  const html = await first.text();
  assertPortalResponse(html);
  if (first.status !== 200) throw unavailable(`HTTP_${first.status}_OPEN`);

  const viewState = decodeHtmlAttribute(html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/)?.[1] || '');
  if (!viewState || !html.includes('frmPrincipal:txtRuc') || !html.includes('frmPrincipal:btnConsultar')) {
    throw new IssuerAuthorizationError('SRI_ISSUER_FORM_CHANGED', 'El formulario de consulta del SRI cambió.');
  }

  const body = new URLSearchParams({
    'javax.faces.partial.ajax': 'true',
    'javax.faces.source': 'frmPrincipal:btnConsultar',
    'javax.faces.partial.execute': '@all',
    'javax.faces.partial.render': 'frmPrincipal:pnlDatosEmisor',
    'frmPrincipal:btnConsultar': 'frmPrincipal:btnConsultar',
    frmPrincipal: 'frmPrincipal',
    'frmPrincipal:txtRuc': ruc,
    'javax.faces.ViewState': viewState,
  });
  const second = await request(fetchImpl, `${BASE_URL}${FORM_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Faces-Request': 'partial/ajax',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/xml, text/xml, */*',
      Cookie: responseCookies(first.headers),
    },
    body: body.toString(),
  }, timeoutMs);
  const xml = await second.text();
  assertPortalResponse(xml);
  if (second.status !== 200) throw unavailable(`HTTP_${second.status}_QUERY`);

  const panel = xml.match(/<update id="frmPrincipal:pnlDatosEmisor"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/)?.[1];
  if (!panel || !panel.includes('tblComprobantesAutorizados')) {
    throw new IssuerAuthorizationError('SRI_ISSUER_FORM_CHANGED', 'La respuesta del SRI cambió.');
  }
  const notice = xml.match(/<update id="formMessages:messages"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/)?.[1];
  if (notice && stripMarkup(notice)) {
    throw new IssuerAuthorizationError('SRI_ISSUER_FORM_CHANGED', 'El SRI devolvió un aviso no interpretable.');
  }

  const base = {
    ruc,
    authorized: false,
    businessName: null,
    tradeName: null,
    authorizationDate: null,
    province: null,
    canton: null,
    checkedAt: now().toISOString(),
  };
  if (panel.includes('ui-datatable-empty-message')) return base;

  const rows = [...panel.matchAll(/<tr[^>]*data-ri="\d+"[^>]*>([\s\S]*?)<\/tr>/g)]
    .map(match => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cell => stripMarkup(cell[1])));
  const row = rows.find(values => values[1] === ruc);
  if (!row || row.length < 7) {
    throw new IssuerAuthorizationError('SRI_ISSUER_FORM_CHANGED', 'La tabla de emisores del SRI cambió.');
  }
  const optional = value => value && value !== 'N/A' ? value : null;
  return {
    ...base,
    authorized: true,
    businessName: optional(row[2]),
    tradeName: optional(row[3]),
    authorizationDate: optional(row[4]),
    province: optional(row[5]),
    canton: optional(row[6]),
  };
}

async function request(fetchImpl, url, options, timeoutMs) {
  try {
    return await fetchImpl(url, {
      ...options,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw unavailable('NETWORK_OR_TIMEOUT');
  }
}

function assertPortalResponse(text) {
  if (/Request Rejected/i.test(text)) {
    throw new IssuerAuthorizationError('SRI_ISSUER_REJECTED', 'El SRI rechazó temporalmente la consulta.');
  }
  if (/g-recaptcha|grecaptcha|recaptcha\/api/i.test(text)) {
    throw new IssuerAuthorizationError('SRI_ISSUER_CAPTCHA', 'El SRI requiere verificación manual.');
  }
}

function responseCookies(headers) {
  const values = typeof headers?.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers?.get?.('set-cookie') || ''];
  return values.filter(Boolean).map(value => value.split(';')[0]).join('; ');
}

function stripMarkup(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, number) => String.fromCharCode(Number(number)))
    .replace(/\s+/g, ' ').trim();
}

function decodeHtmlAttribute(value) {
  return String(value).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function unavailable(reason) {
  const error = new IssuerAuthorizationError('SRI_ISSUER_UNAVAILABLE', 'La consulta de emisores del SRI no está disponible.');
  error.reason = reason;
  return error;
}
