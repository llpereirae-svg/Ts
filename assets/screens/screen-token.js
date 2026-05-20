/* screen-token.js — Pantalla 3 del wizard.
   Verificación con doble token: uno por email y uno por SMS al celular.
   Cuando entras a la pantalla se generan y "envían" automáticamente.
   La verificación es local mientras esté el mock; cuando el backend esté
   listo, token-service.js se encarga de hacer fetch al endpoint real. */

import { generarYEnviarToken, verificarToken, TOKEN_LENGTH } from '../services/token-service.js?v=20260518e';

const REENVIAR_COOLDOWN_S = 30;

// Estado interno de la pantalla (no se expone en wizardData.summary).
// Se reinicia cada vez que se entra a la pantalla.
const _state = {
  emailToken: null,    // { token, expiraEn }
  smsToken: null,      // { token, expiraEn }
  enviado: false,
};

export async function renderPantallaToken(body, wizardData) {
  const email = wizardData.email || '—';
  const celular = wizardData.celular ? `+${dialDe(wizardData.celularPais)} ${wizardData.celular}` : '—';

  body.innerHTML = `
    <p class="datos-intro">
      Te enviamos un código de <strong>${TOKEN_LENGTH} dígitos</strong> al celular.
      Cuando lo confirmes, te enviamos el segundo al correo.
    </p>

    <div class="token-grid">
      <!-- SMS (PRIMERO) -->
      <div class="token-card" id="t-sms-card">
        <div class="token-card-header">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>
          </svg>
          <div>
            <h4>Paso 1 · Código por SMS</h4>
            <p class="token-destino">${escapeHtml(celular)}</p>
          </div>
        </div>
        <fieldset class="token-inputs" id="t-sms-inputs" aria-label="Código de SMS">
          ${renderInputs('ts')}
        </fieldset>
        <p class="token-status" id="t-sms-status">Enviando…</p>
        <button type="button" class="token-reenviar" id="t-sms-reenviar" disabled>Reenviar</button>
      </div>

      <!-- EMAIL (SE DESBLOQUEA AL VALIDAR SMS) -->
      <div class="token-card" id="t-email-card" data-locked="true">
        <div class="token-card-header">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>
          </svg>
          <div>
            <h4>Paso 2 · Código por correo</h4>
            <p class="token-destino">${escapeHtml(email)}</p>
          </div>
        </div>
        <fieldset class="token-inputs" id="t-email-inputs" aria-label="Código de correo">
          ${renderInputs('te')}
        </fieldset>
        <p class="token-status" id="t-email-status">Primero valida el código del SMS.</p>
        <button type="button" class="token-reenviar" id="t-email-reenviar" disabled>Reenviar</button>
      </div>
    </div>

    <div class="token-debug" id="t-debug" hidden></div>
  `;

  wireTokenScreen(body, wizardData);

  // Solo enviamos el SMS al entrar. El email se envía cuando el SMS quede validado.
  await enviarSms(body, wizardData);
}

function renderInputs(prefix) {
  let html = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    html += `<input type="tel" inputmode="numeric" maxlength="1" autocomplete="off"
                    pattern="[0-9]" data-prefix="${prefix}" data-idx="${i}"
                    aria-label="Dígito ${i + 1}">`;
  }
  return html;
}

function wireTokenScreen(root, wizardData) {
  // Auto-tab + verificación al completar
  wireInputs(root, 'te', () => verificarSi('email', root, wizardData));
  wireInputs(root, 'ts', () => verificarSi('sms', root, wizardData));

  // Reenviar buttons
  root.querySelector('#t-email-reenviar').addEventListener('click', () => {
    reenviar(root, wizardData, 'email');
  });
  root.querySelector('#t-sms-reenviar').addEventListener('click', () => {
    reenviar(root, wizardData, 'sms');
  });
}

function wireInputs(root, prefix, onComplete) {
  const inputs = root.querySelectorAll(`input[data-prefix="${prefix}"]`);

  inputs.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
      // Solo dígitos
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 1);
      if (e.target.value && idx + 1 < inputs.length) {
        inputs[idx + 1].focus();
      }
      // Si todos están llenos, intentar verificar
      const todos = Array.from(inputs).every((inp) => inp.value);
      if (todos) onComplete();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        inputs[idx - 1].focus();
        inputs[idx - 1].select();
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        inputs[idx - 1].focus();
      } else if (e.key === 'ArrowRight' && idx + 1 < inputs.length) {
        inputs[idx + 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      const digits = text.replace(/\D/g, '').slice(0, inputs.length);
      if (digits.length === 0) return;
      e.preventDefault();
      digits.split('').forEach((d, i) => {
        if (inputs[i]) inputs[i].value = d;
      });
      // Focus al último input lleno
      const lastIdx = Math.min(digits.length, inputs.length) - 1;
      if (inputs[lastIdx + 1]) inputs[lastIdx + 1].focus();
      else inputs[lastIdx].focus();
      // Si quedó completo, verificar
      const todos = Array.from(inputs).every((inp) => inp.value);
      if (todos) onComplete();
    });
  });
}

/**
 * Envío del SMS (Paso 1). Se llama al entrar a la pantalla.
 * El email NO se envía aún — espera a que SMS quede validado.
 */
async function enviarSms(root, wizardData) {
  // Reset estado de pantalla
  _state.emailToken = null;
  _state.smsToken = null;
  wizardData.tokenEmailOk = false;
  wizardData.tokenSmsOk = false;

  setStatus(root, 'sms', 'Enviando…');

  try {
    const res = await generarYEnviarToken({ canal: 'sms', destino: wizardData.celular });
    _state.smsToken = { token: res.token, expiraEn: res.expiraEn };
    setStatus(root, 'sms', 'Código enviado a tu celular.');
    iniciarCooldown(root, 'sms');
    actualizarDebug(root);
  } catch (err) {
    setStatus(root, 'sms', `No pudimos enviar el SMS: ${err.message || 'reintenta'}`, true);
  }
}

/**
 * Envío del email (Paso 2). Se llama después que el SMS queda validado.
 */
async function enviarEmail(root, wizardData) {
  setStatus(root, 'email', 'Enviando…');

  try {
    const res = await generarYEnviarToken({ canal: 'email', destino: wizardData.email });
    _state.emailToken = { token: res.token, expiraEn: res.expiraEn };
    setStatus(root, 'email', 'Código enviado. Revisa tu bandeja de entrada (y spam).');
    iniciarCooldown(root, 'email');
    actualizarDebug(root);
  } catch (err) {
    setStatus(root, 'email', `No pudimos enviar el correo: ${err.message || 'reintenta'}`, true);
  }
}

/**
 * Refresca el bloque DEMO con los códigos generados (modo mock).
 * En producción este bloque queda oculto.
 */
function actualizarDebug(root) {
  const debug = root.querySelector('#t-debug');
  if (!debug) return;
  const partes = [];
  if (_state.smsToken) partes.push(`<span class="token-debug-code">SMS: ${_state.smsToken.token}</span>`);
  if (_state.emailToken) partes.push(`<span class="token-debug-code">Email: ${_state.emailToken.token}</span>`);
  if (partes.length === 0) { debug.hidden = true; return; }
  debug.hidden = false;
  debug.innerHTML = `
    <strong>MODO DEMO</strong> · Códigos generados:
    ${partes.join(' ')}
    <small>En producción los tokens llegarán a tu correo y celular, no se mostrarán aquí.</small>
  `;
}

/**
 * Desbloquea la tarjeta de email cuando el SMS quedó validado.
 */
function desbloquearEmail(root, wizardData) {
  const emailCard = root.querySelector('#t-email-card');
  if (emailCard) emailCard.removeAttribute('data-locked');
  // Enviar el código de email ahora
  enviarEmail(root, wizardData);
}

async function reenviar(root, wizardData, canal) {
  setStatus(root, canal, 'Reenviando…');
  try {
    const destino = canal === 'email' ? wizardData.email : wizardData.celular;
    const res = await generarYEnviarToken({ canal, destino });
    if (canal === 'email') _state.emailToken = { token: res.token, expiraEn: res.expiraEn };
    else _state.smsToken = { token: res.token, expiraEn: res.expiraEn };
    setStatus(root, canal, 'Nuevo código enviado.');
    iniciarCooldown(root, canal);
    actualizarDebug(root);
  } catch (err) {
    setStatus(root, canal, `Error: ${err.message}`, true);
  }
}

function verificarSi(canal, root, wizardData) {
  // Si la tarjeta está bloqueada (caso del email antes de validar SMS), ignorar
  const card = root.querySelector(`#t-${canal}-card`);
  if (card?.hasAttribute('data-locked')) return;

  const prefix = canal === 'email' ? 'te' : 'ts';
  const inputs = root.querySelectorAll(`input[data-prefix="${prefix}"]`);
  const codigo = Array.from(inputs).map((i) => i.value).join('');
  const esperado = canal === 'email' ? _state.emailToken : _state.smsToken;
  if (!esperado) {
    setStatus(root, canal, 'Espera a que se envíe el código…');
    return;
  }
  const res = verificarToken({
    canal,
    codigo,
    tokenEsperado: esperado.token,
    expiraEn: esperado.expiraEn,
  });
  if (res.valid) {
    setStatus(root, canal, '✓ Código correcto');
    inputs.forEach((i) => i.classList.add('is-ok'));
    if (canal === 'sms') {
      wizardData.tokenSmsOk = true;
      // Desbloquear email después de validar SMS
      if (!_state.emailToken) {
        desbloquearEmail(root, wizardData);
      }
    } else {
      wizardData.tokenEmailOk = true;
    }
  } else {
    setStatus(root, canal, res.reason, true);
    inputs.forEach((i) => i.classList.add('is-error'));
    setTimeout(() => {
      inputs.forEach((i) => { i.classList.remove('is-error'); i.value = ''; });
      inputs[0].focus();
    }, 1500);
  }
}

function setStatus(root, canal, msg, isError = false) {
  const el = root.querySelector(`#t-${canal}-status`);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('is-error', isError);
  el.classList.toggle('is-ok', msg.startsWith('✓'));
}

function iniciarCooldown(root, canal) {
  const btn = root.querySelector(`#t-${canal}-reenviar`);
  if (!btn) return;
  let seg = REENVIAR_COOLDOWN_S;
  btn.disabled = true;
  btn.textContent = `Reenviar en ${seg}s`;
  const tick = setInterval(() => {
    seg--;
    if (seg <= 0) {
      clearInterval(tick);
      btn.disabled = false;
      btn.textContent = 'Reenviar';
    } else {
      btn.textContent = `Reenviar en ${seg}s`;
    }
  }, 1000);
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function dialDe(code) {
  // Mapa mínimo; el wizard usa countries.js para esto, pero aquí lo simplificamos
  const map = { EC: '593', AR: '54', BO: '591', BR: '55', CL: '56', CO: '57', PE: '51', MX: '52', US: '1' };
  return map[code] || '';
}

// Validador de la pantalla
export function validarPantallaToken(wizardData) {
  if (!wizardData.tokenEmailOk) {
    alert('Ingresa correctamente el código que enviamos a tu correo.');
    return false;
  }
  if (!wizardData.tokenSmsOk) {
    alert('Ingresa correctamente el código que enviamos a tu celular.');
    return false;
  }
  return true;
}
