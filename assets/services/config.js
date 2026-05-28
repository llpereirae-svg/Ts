/* config.js — Configuración global del frontend (entorno + integraciones).
 *
 * Detecta automáticamente si estamos en:
 *   - DEMO (GitHub Pages)         → mocks activos, pixel apagado
 *   - DEV  (localhost)            → backend del dev local, pixel apagado
 *   - PROD (Digital Ocean)        → backend real, pixel + CAPI activos
 *
 * Al deployar a producción solo hay que cambiar el dominio en PROD_HOSTS
 * (línea 22). El resto se ajusta solo.
 */

// =========================================================================
//   DETECCIÓN DE ENTORNO
// =========================================================================

const HOSTNAME = (typeof window !== 'undefined' && window.location.hostname) || '';

// Dominios de producción reales. Cuando el dev mueva la landing a Digital
// Ocean, agregar el dominio acá. Mientras tanto, GitHub Pages se trata como
// DEMO (sin tracking, sin backend real).
const PROD_HOSTS = [
  'www.tributasoft.com.ec',
  'tributasoft.com.ec',
  'app.tributasoft.ec',
];

const DEMO_HOSTS = [
  'llpereirae-svg.github.io',
];

const DEV_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
];

export const ENV =
  PROD_HOSTS.includes(HOSTNAME) ? 'production' :
  DEV_HOSTS.includes(HOSTNAME)  ? 'development' :
                                  'demo'; // default = GitHub Pages

// =========================================================================
//   BACKEND
// =========================================================================

// URL base de la API REST. El dev del backend cambia esto cuando arme su
// servidor (puede ir Spring Boot en Java, Express en Node, FastAPI, etc.).
const BACKEND_URLS = {
  production:  'https://api.tributasoft.ec',     // Digital Ocean (cuando exista)
  development: 'http://localhost:8080',          // backend local del dev
  demo:        null,                             // GitHub Pages: sin backend
};
export const BACKEND_URL = BACKEND_URLS[ENV];

// Mientras BACKEND_URL sea null, los servicios (token-service.js,
// email-service.js) usan sus implementaciones MOCK.
export const USE_MOCKS = BACKEND_URL === null;

// =========================================================================
//   META PIXEL + CONVERSIONS API (CAPI)
// =========================================================================

// Dataset ID (también llamado Pixel ID) de Meta Events Manager.
// Es público — identifica nuestra cuenta de pixel. NO es secreto.
// El ACCESS_TOKEN para CAPI lo configura el backend como variable de entorno
// (NUNCA exponerlo en este archivo).
export const META_DATASET_ID = '1476572470933060';

// Activa/desactiva el Meta Pixel del navegador. Solo se activa en producción
// real (Digital Ocean). En demo y dev queda apagado para no contaminar las
// métricas con pruebas internas, ni gastar el presupuesto del pixel mientras
// se hacen demos al equipo de marketing/admin.
export const ENABLE_PIXEL = ENV === 'production';

// Eventos de Meta que la landing dispara:
//   Lead                → al validar firma + cert en paso 1
//   CompleteRegistration→ al finalizar el wizard en paso 8
//   ViewContent         → al abrir el modal Cotizar
// El backend (CAPI) debe disparar los mismos eventos con el mismo event_id
// para que Meta los deduplique. El event_id se genera en frontend con
// crypto.randomUUID() y se envía al backend dentro del payload.

// =========================================================================
//   HELPER
// =========================================================================

// Genera un event_id único compartido entre Pixel y CAPI para deduplicar.
export function nuevoEventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback simple (Date + random) — no debería usarse en navegadores modernos
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

// Marca de log para debug del entorno (solo aparece en consola al cargar).
if (typeof console !== 'undefined') {
  console.log(`[tributasoft] env=${ENV} | backend=${BACKEND_URL || 'mock'} | pixel=${ENABLE_PIXEL ? 'on' : 'off'}`);
}
