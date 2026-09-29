import { validarRUC } from '../assets/utils/ruc-validation.js';

export function createRucProxy({ upstreamUrl, fetchImpl = globalThis.fetch, timeoutMs = 8_000 } = {}) {
  return async function handleRuc(ruc) {
    const check = validarRUC(String(ruc || ''));
    if (!check.valid) return json(400, { error: 'RUC_INVALIDO', message: check.reason });
    if (!upstreamUrl) {
      return json(503, {
        error: 'SRI_NO_CONFIGURADO',
        message: 'Configure SRI_RUC_URL en el backend. No se usa fetch directo desde el navegador.',
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const target = upstreamUrl.replace('{ruc}', encodeURIComponent(ruc));
      const response = await fetchImpl(target, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (response.status === 204) return { status: 204, headers: {}, body: '' };
      if (response.status >= 500) return json(503, { error: 'SRI_NO_DISPONIBLE' });
      if (!response.ok) return json(response.status, { error: 'SRI_RECHAZO' });

      const text = await response.text();
      try {
        JSON.parse(text);
      } catch {
        return json(502, { error: 'RESPUESTA_SRI_MALFORMADA' });
      }
      return { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: text };
    } catch (error) {
      return json(error?.name === 'AbortError' ? 408 : 503, {
        error: error?.name === 'AbortError' ? 'SRI_TIMEOUT' : 'SRI_NO_DISPONIBLE',
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

function json(status, value) {
  return {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(value),
  };
}
