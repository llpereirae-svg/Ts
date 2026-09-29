import { BACKEND_URL, USE_MOCKS } from './config.js?v=20260929a';

export async function crearRegistro(payload, { fetchImpl = globalThis.fetch } = {}) {
  if (USE_MOCKS) return { ok: true, demo: true };
  const response = await fetchImpl(`${BACKEND_URL}/api/registro`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, credentials: 'include', body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('El backend no pudo crear la cuenta. Tus datos no fueron confirmados.');
  return { ok: true, demo: false, data: await response.json().catch(() => ({})) };
}
