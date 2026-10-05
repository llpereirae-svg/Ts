import { validarRUC } from '../utils/ruc-validation.js?v=20261005p';
import { draftSecurityHeaders } from './draft-service.js?v=20261005p';

export const RUC_RESULT = Object.freeze({
  OK: 'OK',
  INVALID: 'INVALID',
  NOT_FOUND: 'NOT_FOUND',
  UNAVAILABLE: 'UNAVAILABLE',
  MALFORMED: 'MALFORMED',
});

export function normalizarRespuestaRuc(raw) {
  const source = Array.isArray(raw) ? raw[0] : raw;
  if (!source || typeof source !== 'object') return null;

  const estado = clean(source.estadoContribuyenteRuc);
  const representantes = Array.isArray(source.representantesLegales)
    ? source.representantesLegales.filter(Boolean)
    : [];
  const fechas = Array.isArray(source.informacionFechasContribuyente)
    ? source.informacionFechasContribuyente.filter(Boolean)
    : source.informacionFechasContribuyente && typeof source.informacionFechasContribuyente === 'object'
      ? [source.informacionFechasContribuyente] : [];
  const advertencias = [];

  if (upper(source.contribuyenteFantasma) === 'SI') advertencias.push('Contribuyente marcado como fantasma por el SRI.');
  if (upper(source.transaccionesInexistente) === 'SI') advertencias.push('El SRI reporta transacciones inexistentes.');
  if (upper(estado) === 'PASIVO') advertencias.push('El estado actual del contribuyente es PASIVO.');

  const razonSocial = clean(source.razonSocial || source.nombreContribuyente || source.nombreCompleto);
  const ruc = clean(source.numeroRuc || source.ruc);
  if (!razonSocial && !ruc && !estado) return null;

  return {
    ruc,
    razonSocial,
    nombreComercial: clean(source.nombreComercial),
    estadoContribuyenteRuc: estado,
    actividadEconomicaPrincipal: clean(source.actividadEconomicaPrincipal || source.actividadEconomica),
    regimen: clean(source.regimen || source.regimenGeneral),
    categoria: clean(source.categoria),
    tipoContribuyente: clean(source.tipoContribuyente),
    obligadoLlevarContabilidad: clean(source.obligadoLlevarContabilidad),
    agenteRetencion: source.agenteRetencion ?? source.agenteDeRetencion ?? null,
    contribuyenteEspecial: source.contribuyenteEspecial ?? null,
    granContribuyente: source.granContribuyente ?? null,
    representantesLegales: representantes,
    representanteLegal: representantes[0] || null,
    informacionFechasContribuyente: fechas,
    esSociedad: upper(source.tipoContribuyente).startsWith('SOCIEDAD') || representantes.length > 0,
    advertencias,
    validacionPendiente: false,
  };
}

export async function consultarRuc(ruc, { fetchImpl = globalThis.fetch, timeoutMs = 8_000, registrationId = '' } = {}) {
  const validacion = validarRUC(ruc);
  if (!validacion.valid) return { status: RUC_RESULT.INVALID, reason: validacion.reason };
  if (typeof fetchImpl !== 'function') return { status: RUC_RESULT.UNAVAILABLE, reason: 'Servicio no disponible.' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = registrationId
      ? `/api/registro/drafts/${encodeURIComponent(registrationId)}/sri/lookup`
      : `/api/ruc/${encodeURIComponent(ruc)}`;
    const response = await fetchImpl(endpoint, {
      method: registrationId ? 'POST' : 'GET',
      headers: { Accept: 'application/json', ...(registrationId ? { 'Content-Type': 'application/json', ...draftSecurityHeaders(registrationId) } : {}) },
      credentials: 'same-origin', cache: 'no-store',
      ...(registrationId ? { body: '{}' } : {}),
      signal: controller.signal,
    });
    if (response.status === 204) {
      return { status: RUC_RESULT.NOT_FOUND, reason: 'El SRI no encontró ese RUC.' };
    }
    if (response.status === 408 || response.status >= 500) {
      const envelope = await response.json?.().catch(() => ({})) || {};
      return {
        status: RUC_RESULT.UNAVAILABLE,
        reason: 'El SRI no está disponible temporalmente.',
        attempts: Number.isInteger(envelope.attempts) ? envelope.attempts : 0,
        errorCode: typeof envelope.error === 'string' ? envelope.error : 'SRI_UNAVAILABLE',
      };
    }
    if (!response.ok) {
      return { status: RUC_RESULT.MALFORMED, reason: 'La consulta no pudo completarse.' };
    }
    let raw;
    try {
      raw = await response.json();
    } catch {
      return { status: RUC_RESULT.MALFORMED, reason: 'El servicio devolvió una respuesta no válida.' };
    }
    const data = normalizarRespuestaRuc(registrationId && raw?.data ? raw.data : raw);
    if (!data) return { status: RUC_RESULT.MALFORMED, reason: 'La respuesta no contiene datos de contribuyente.' };
    if (data.ruc !== String(ruc)) return { status: RUC_RESULT.MALFORMED, reason: 'El RUC de la respuesta no coincide con el consultado.' };
    return { status: RUC_RESULT.OK, data };
  } catch (error) {
    const timeoutMessage = error?.name === 'AbortError'
      ? 'La consulta al SRI superó el tiempo de espera.'
      : 'No se pudo conectar con el servicio del RUC.';
    return { status: RUC_RESULT.UNAVAILABLE, reason: timeoutMessage, attempts: 0, errorCode: 'BACKEND_UNAVAILABLE' };
  } finally {
    clearTimeout(timeout);
  }
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}
