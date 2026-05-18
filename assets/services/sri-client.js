// sri-client.js — Cliente para la consulta del RUC en el SRI.
//
// IMPORTANTE: La consulta real al SRI se hace SIEMPRE server-side (proxy backend).
// Desde el navegador llamamos a /api/sri/consulta-ruc, NUNCA directo al portal del SRI
// (CORS lo bloquea y además expondríamos lógica de scraping).
//
// Este módulo:
//   1. Cachea respuestas por 24h en localStorage (key namespaced).
//   2. Implementa timeout y reintento simple para 5xx.
//   3. Tiene un MOCK habilitado por defecto. Para apuntar al backend real,
//      cambiar SRI_MODE a 'live'.

const CACHE_PREFIX = 'tsoft:sri:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const REQUEST_TIMEOUT_MS = 10_000;

// Cambia a 'live' cuando el backend Java tenga listo el endpoint /api/sri/consulta-ruc.
const SRI_MODE = 'mock'; // 'mock' | 'live'

// Datos mock para que el flujo se pueda probar sin backend.
const MOCK_DB = {
  '0992703601001': {
    found: true,
    ruc: '0992703601001',
    razonSocial: 'TRIBUTASOFT S.A.',
    nombreComercial: 'TRIBUTASOFT',
    direccion: 'AV. FRANCISCO DE ORELLANA Y ALBERTO BORGES',
    provincia: 'GUAYAS',
    ciudad: 'GUAYAQUIL',
    regimen: 'RIMPE NEGOCIO POPULAR',
    tipoContribuyente: 'NO OBLIGADO',
    estado: 'ACTIVO',
    obligadoLlevarContabilidad: false,
  },
  '1791234567001': {
    found: true,
    ruc: '1791234567001',
    razonSocial: 'EMPRESA DEMO CIA. LTDA.',
    nombreComercial: 'DEMO',
    direccion: 'AV. AMAZONAS N12-345 Y COLÓN',
    provincia: 'PICHINCHA',
    ciudad: 'QUITO',
    regimen: 'GENERAL',
    tipoContribuyente: 'OBLIGADO',
    estado: 'ACTIVO',
    obligadoLlevarContabilidad: true,
  },
};

function getCache(ruc) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + ruc);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + ruc);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCache(ruc, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + ruc, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // localStorage lleno o deshabilitado: ignoramos en silencio.
  }
}

async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function consultarMock(ruc) {
  // Simula latencia y un caso de "RUC válido en formato pero no existe en SRI"
  await new Promise((r) => setTimeout(r, 900));
  const data = MOCK_DB[ruc];
  if (data) return data;
  return { found: false, reason: 'NOT_FOUND' };
}

async function consultarLive(ruc) {
  const url = `/api/sri/consulta-ruc?ruc=${encodeURIComponent(ruc)}`;
  let lastError;
  for (let intento = 0; intento < 2; intento++) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.status >= 500) {
        lastError = new Error(`SRI proxy 5xx (${res.status})`);
        continue; // reintenta una vez
      }
      if (!res.ok) {
        return { found: false, reason: res.status === 404 ? 'NOT_FOUND' : 'INVALID' };
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') break; // no reintentes en timeout
    }
  }
  console.warn('[SRI] Falla consultando RUC:', lastError);
  return { found: false, reason: 'TIMEOUT' };
}

/**
 * Consulta los datos públicos de un RUC en el SRI.
 * @param {string} ruc - 13 dígitos
 * @returns {Promise<object>} respuesta normalizada
 */
export async function consultarRUC(ruc) {
  if (!ruc) return { found: false, reason: 'INVALID' };

  const cached = getCache(ruc);
  if (cached) return cached;

  const data = SRI_MODE === 'live' ? await consultarLive(ruc) : await consultarMock(ruc);
  if (data && data.found) setCache(ruc, data);
  return data;
}

/**
 * Limpia el cache de SRI (útil para testing).
 */
export function limpiarCacheSRI() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
