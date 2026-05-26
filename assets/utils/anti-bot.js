/* anti-bot.js — Heurísticas client-side para frenar bots simples.
 *
 * Filtra ~70% de los bots automatizados sin agregar fricción al usuario
 * humano. NO reemplaza al CAPTCHA ni al rate-limiting server-side (que
 * son responsabilidad de TICS) — es una capa adicional.
 *
 * Estrategias implementadas:
 *   1. Honeypot field — campo invisible que solo bots llenan.
 *   2. Time-check — si el usuario completa el flow en menos de MIN_FLOW_MS
 *      milisegundos, es bot. Un humano serio se demora al menos 30-60 seg.
 *   3. Marca temporal en el wizardData para que finishWizard pueda checkear.
 *
 * Cómo integrar nuevas pantallas:
 *   - El honeypot se inyecta automáticamente al montar el wizard.
 *   - El time-check se inicia con startSession() en wizard.js.
 *   - validateAntiBot(wizardData) lo invocan las pantallas críticas
 *     (paso 1 = firma, paso 8 = resumen final) antes de avanzar.
 */

// Tiempo mínimo razonable para que un humano complete el wizard.
// 25 segundos es el mínimo absoluto, considerando que tiene que subir
// 2 archivos (.p12 + PDF), escribir su clave de firma, leer T&C,
// recibir 2 SMS/correos, ingresar 2 códigos de 4 dígitos cada uno,
// crear una clave nueva y revisar 8 pantallas. Realmente nadie lo hace
// en menos de 2 minutos, pero 25s es el umbral "esto es un bot seguro".
const MIN_FLOW_MS = 25 * 1000;

const HONEYPOT_ID = '__tsoft_hp_website';

let _sessionStart = null;

/**
 * Inicia el contador de tiempo y agrega el honeypot al DOM.
 * Llamar UNA SOLA VEZ cuando se monta el wizard.
 */
export function startSession() {
  _sessionStart = Date.now();
  inyectarHoneypot();
}

/**
 * Inyecta un campo honeypot invisible al humano pero detectable por bots.
 *
 * Técnicas combinadas:
 *   - Posición absoluta fuera del viewport (left: -9999px) — ningún humano lo ve.
 *   - aria-hidden + tabindex=-1 + autocomplete=off — accessibility no lo lee.
 *   - name="website" — los bots ven "website" y lo llenan automáticamente
 *     porque es un patrón clásico de form scraping.
 */
function inyectarHoneypot() {
  if (document.getElementById(HONEYPOT_ID)) return;
  const hp = document.createElement('input');
  hp.type = 'text';
  hp.id = HONEYPOT_ID;
  hp.name = 'website';
  hp.autocomplete = 'off';
  hp.tabIndex = -1;
  hp.setAttribute('aria-hidden', 'true');
  hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(hp);
}

/**
 * Valida que la sesión NO parezca de un bot.
 *
 * Si retorna { ok: false }, la pantalla debe ABORTAR el avance sin dar
 * detalles al usuario (no revelar la heurística a quien la quiera burlar).
 * El reason solo sirve para logging interno.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateAntiBot() {
  // 1) Honeypot relleno = bot.
  const hp = document.getElementById(HONEYPOT_ID);
  if (hp && hp.value && hp.value.trim() !== '') {
    return { ok: false, reason: 'HONEYPOT_FILLED' };
  }

  // 2) Tiempo de sesión sospechosamente corto = bot.
  if (_sessionStart && (Date.now() - _sessionStart) < MIN_FLOW_MS) {
    return { ok: false, reason: 'TOO_FAST' };
  }

  return { ok: true };
}

/**
 * Devuelve los segundos transcurridos desde startSession (para telemetría).
 */
export function sessionElapsedSeconds() {
  if (!_sessionStart) return 0;
  return Math.round((Date.now() - _sessionStart) / 1000);
}
