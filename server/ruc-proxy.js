import { validarRUC } from '../assets/utils/ruc-validation.js';

export function createRucProxy({
  upstreamUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8_000,
  maxAttempts = 3,
  retryBaseMs = 250,
  random = Math.random,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  return async function handleRuc(ruc) {
    const check = validarRUC(ruc);
    if (!check.valid) return json(400, { error: 'RUC_INVALIDO', message: check.reason });
    if (!upstreamUrl) {
      return json(503, {
        error: 'SRI_NO_CONFIGURADO',
        message: 'Configure SRI_RUC_URL en el backend. No se usa fetch directo desde el navegador.',
      });
    }

    const attemptsLimit = Number.isInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : 3;
    const target = upstreamUrl.replace('{ruc}', encodeURIComponent(ruc));
    for (let attempt = 1; attempt <= attemptsLimit; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(target, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (response.status === 204) return { status: 204, headers: {}, body: '' };
        if (response.status >= 500) {
          if (attempt < attemptsLimit) { await waitBeforeRetry(attempt, retryBaseMs, random, sleep); continue; }
          return json(503, { error: 'SRI_UNAVAILABLE', attempts: attempt });
        }
        if (!response.ok) return json(response.status, { error: 'SRI_REJECTED', attempts: attempt });

        const text = await response.text();
        try {
          JSON.parse(text);
        } catch {
          return json(502, { error: 'SRI_RESPONSE_MALFORMED', attempts: attempt });
        }
        return { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: text };
      } catch {
        if (attempt < attemptsLimit) { await waitBeforeRetry(attempt, retryBaseMs, random, sleep); continue; }
        return json(503, { error: 'SRI_UNAVAILABLE', attempts: attempt });
      } finally {
        clearTimeout(timeout);
      }
    }
    return json(503, { error: 'SRI_UNAVAILABLE', attempts: attemptsLimit });
  };
}

async function waitBeforeRetry(attempt, baseMs, random, sleep) {
  const jitter = Math.floor(Math.max(0, Math.min(1, Number(random()) || 0)) * 150);
  await sleep(Math.max(0, baseMs) * (2 ** (attempt - 1)) + jitter);
}

function json(status, value) {
  return {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(value),
  };
}
