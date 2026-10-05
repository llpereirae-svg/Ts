import { ENV, REGISTRATION_API_URL } from './config.js?v=20261005p';

export async function crearRegistro(payload, { fetchImpl = globalThis.fetch } = {}) {
  // Se conserva el demo estático histórico. Localhost y Dev Tunnels usan el
  // mock explícito del servidor para probar la petición real de punta a punta.
  if (!REGISTRATION_API_URL) return { ok: true, demo: true };
  let response;
  try {
    response = await fetchImpl(REGISTRATION_API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, credentials: 'include', body: JSON.stringify(payload),
    });
  } catch (technicalError) {
    if (ENV !== 'production') console.error('[registration-service] POST /api/registro no disponible', technicalError);
    throw new Error('No pudimos crear tu cuenta en este momento. Intenta nuevamente.');
  }
  if (!response.ok) throw new Error('El backend no pudo crear la cuenta. Tus datos no fueron confirmados.');
  const data = await response.json().catch(() => ({}));
  return { ok: true, demo: ENV !== 'production' && data.demo === true, data };
}
