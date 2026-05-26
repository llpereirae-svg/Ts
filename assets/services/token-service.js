/* token-service.js — Servicio de generación y verificación de tokens.
 *
 * ⚠️ ATENCIÓN TI/TICS ⚠️
 *
 * Esta arquitectura es MOCK / DESARROLLO. En producción, el modelo
 * actual es VULNERABLE al abuso porque:
 *
 *   1. El token se genera en el navegador del usuario.
 *   2. El navegador lo guarda en memoria y lo compara localmente.
 *   3. Un atacante con DevTools (F12) ve el token antes de que llegue
 *      al SMS/correo, o reescribe verificarToken() para que siempre
 *      retorne { valid: true }.
 *   4. Un script automatizado puede invocar generarYEnviarToken() miles
 *      de veces con destinos aleatorios → agota el crédito de Twilio/
 *      SendGrid y bombardea con SMS spam a números reales.
 *
 * MODELO CORRECTO PARA PRODUCCIÓN (responsabilidad de TICS):
 *
 *   - El frontend solo manda { canal, destino } al backend (sin token).
 *   - El backend genera el token con un RNG cripto-fuerte (no del cliente).
 *   - Lo guarda en una tabla `tokens_verificacion` con TTL 5 min y un
 *     contador de intentos (máx 5).
 *   - Lo envía por el canal correspondiente.
 *   - Devuelve solo { ok: true } al frontend (NUNCA el token).
 *   - Para verificar: frontend → POST /api/token/verify { canal, destino, codigo }
 *     → backend compara y responde { valid: bool, intentos_restantes: N }.
 *
 * Plus crítico (ver SECURITY-AUDIT.md):
 *   - Rate limiting por IP (máx 5 SMS / 15 min / IP).
 *   - Rate limiting por destino (máx 3 SMS / 1 hora / mismo número).
 *   - CAPTCHA invisible (Cloudflare Turnstile) antes de POST /api/token/sms.
 *
 * ESTRUCTURA del archivo (DOS CAPAS):
 *
 *   Capa 1 — Interfaz pública (intercambiable):
 *     - generarYEnviarToken({ canal, destino }) → { token, expiraEn, ttl }
 *     - verificarToken({ canal, codigo, tokenEsperado }) → { valid, error? }
 *
 *   Capa 2 — Envío real (mock por ahora):
 *     - sendEmail(destino, token)
 *     - sendSms(destino, token)
 *
 *   Cuando el backend esté listo, reemplazar TODA la Capa 2 + simplificar
 *   la Capa 1 para que delegue al backend (ver ejemplo más abajo). */

const TOKEN_LEN = 4;
const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Genera un código numérico de TOKEN_LEN dígitos.
 * Usa crypto.getRandomValues para entropía real (no Math.random).
 */
function generarCodigo() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const n = buf[0] % Math.pow(10, TOKEN_LEN);
    return String(n).padStart(TOKEN_LEN, '0');
  }
  // Fallback inseguro (no debería usarse en producción)
  return String(Math.floor(Math.random() * Math.pow(10, TOKEN_LEN))).padStart(TOKEN_LEN, '0');
}

// ============================================================
//   CAPA 2 — Envío real al canal (REEMPLAZAR ESTAS FUNCIONES)
// ============================================================

/**
 * Envía el token por email.
 * Por ahora: mock que loguea a consola.
 * Producción: reemplazar con fetch al endpoint.
 *
 * Ejemplo de implementación real:
 *   const res = await fetch('/api/token/email', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ destino, token })
 *   });
 *   if (!res.ok) throw new Error('Falló el envío del email');
 *
 * @param {string} destino - email address
 * @param {string} token   - código de TOKEN_LEN dígitos
 */
async function sendEmail(destino, token) {
  // SECURITY: este console.log existe SOLO en modo demo para que el dev pueda
  // ver el código sin tener mailbox configurado. Al reemplazar esta función
  // por el fetch real, BORRAR esta línea — un token de verificación NUNCA
  // debe quedar en logs/consola en producción.
  console.log(`[token-service MOCK] Email a ${destino}: código ${token}`);
  // Simular latencia de red
  await new Promise((r) => setTimeout(r, 250));
  return { ok: true };
}

/**
 * Envía el token por SMS (celular).
 * Por ahora: mock que loguea a consola.
 * Producción: reemplazar con fetch al endpoint.
 *
 * Ejemplo de implementación real:
 *   const res = await fetch('/api/token/sms', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ destino, token })
 *   });
 *
 * @param {string} destino - número celular con prefijo país
 * @param {string} token   - código de TOKEN_LEN dígitos
 */
async function sendSms(destino, token) {
  // SECURITY: este console.log existe SOLO en modo demo para que el dev pueda
  // ver el código sin tener gateway SMS configurado. Al reemplazar esta función
  // por el fetch real, BORRAR esta línea — un token de verificación NUNCA
  // debe quedar en logs/consola en producción.
  console.log(`[token-service MOCK] SMS a ${destino}: código ${token}`);
  await new Promise((r) => setTimeout(r, 250));
  return { ok: true };
}

// ============================================================
//   CAPA 1 — Interfaz pública (NO TOCAR cuando se integre backend)
// ============================================================

/**
 * Genera un código y lo envía por el canal indicado.
 * Devuelve el código (para que el frontend lo guarde y compare luego).
 *
 * NOTA SEGURIDAD: en producción, el token JAMÁS debería volver al frontend.
 * El backend lo guarda y compara internamente. Cuando se integre, esta
 * función cambia su firma a no devolver `token`, y verificarToken hace
 * fetch al backend en lugar de comparar localmente.
 *
 * @param {{ canal: 'email'|'sms', destino: string }} opts
 * @returns {Promise<{ token: string, expiraEn: Date, ttl: number, ok: boolean }>}
 */
export async function generarYEnviarToken({ canal, destino }) {
  if (!destino) throw new Error('Falta el destino del token');
  if (canal !== 'email' && canal !== 'sms') throw new Error(`Canal inválido: ${canal}`);

  const token = generarCodigo();
  const expiraEn = new Date(Date.now() + TOKEN_TTL_MS);

  if (canal === 'email') {
    await sendEmail(destino, token);
  } else {
    await sendSms(destino, token);
  }

  return { token, expiraEn, ttl: TOKEN_TTL_MS, ok: true };
}

/**
 * Verifica que el código ingresado coincida con el token enviado
 * y que no haya expirado.
 *
 * Cuando se integre el backend, esta función debería hacer:
 *   POST /api/token/verify { canal, codigo }
 * y el backend responde { valid: bool }. El `tokenEsperado` y `expiraEn`
 * dejarían de ser necesarios en el frontend.
 *
 * @param {{ canal: string, codigo: string, tokenEsperado: string, expiraEn: Date }} opts
 * @returns {{ valid: boolean, error?: string, reason?: string }}
 */
export function verificarToken({ canal, codigo, tokenEsperado, expiraEn }) {
  if (!codigo || codigo.length !== TOKEN_LEN || !/^\d+$/.test(codigo)) {
    return { valid: false, error: 'FORMATO', reason: `El código debe tener ${TOKEN_LEN} dígitos.` };
  }
  if (expiraEn && new Date() > new Date(expiraEn)) {
    return { valid: false, error: 'EXPIRADO', reason: 'El código expiró. Pide uno nuevo.' };
  }
  if (codigo !== tokenEsperado) {
    return { valid: false, error: 'INCORRECTO', reason: `El código de ${canal === 'email' ? 'correo' : 'celular'} no coincide.` };
  }
  return { valid: true };
}

export const TOKEN_LENGTH = TOKEN_LEN;
export const TOKEN_TTL = TOKEN_TTL_MS;
