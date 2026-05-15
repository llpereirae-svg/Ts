/* token-service.js — Servicio de generación y verificación de tokens.

   ESTRUCTURA: la lógica está dividida en dos capas para que el equipo
   de backend pueda reemplazar solo la parte de "envío real" sin tocar
   nada de la UI ni del wizard.

   Capa 1 (esta capa, intercambiable):
     - generarYEnviarToken({ canal, destino }) → { token, expiraEn, ttl }
     - verificarToken({ canal, codigo, tokenEsperado }) → { valid, error? }

   Capa 2 (mock por ahora — reemplazar con fetch al endpoint real):
     - sendEmail(destino, token)
     - sendSms(destino, token)

   Cuando el backend esté listo, basta con cambiar las dos funciones de
   Capa 2 para que hagan fetch a tus endpoints (POST /api/token/email,
   POST /api/token/sms). El resto del flujo del wizard no necesita
   cambios.

   El token es numérico de 4 dígitos, expira en 5 minutos. */

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
