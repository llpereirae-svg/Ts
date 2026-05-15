/* screen-token.js — Pantalla 3 del wizard.
   Verificación con doble token: uno por email y uno por SMS al celular.
   Cuando entras a la pantalla se generan y "envían" automáticamente.
   La verificación es local mientras esté el mock; cuando el backend esté
   listo, token-service.js se encarga de hacer fetch al endpoint real. */

import { generarYEnviarToken, verificarToken, TOKEN_LENGTH } from './token-service.js?v=20260516t';

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
      Te enviamos un código de <strong>${TOKEN_LENGTH} dígitos</strong> a tu correo y otro al celular.
      Ingrésalos abajo para verificar tu identidad.
    </p>

    <div class="token-grid">
      <!-- EMAIL -->
      <div class="token-card">
        <div class="token-card-header">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>
          </svg>
          <div>
            <h4>Código por correo</h4>
            <p class="token-destino">${escapeHtml(email)}</p>
          </div>
        </div>
        <fieldset class="token-inputs" id="t-email-inputs" aria-label="Código de correo">
          ${renderInputs('te')}
        </fieldset>
        <p class="token-status" id="t-email-status">Enviando…</p>
        <button type="button" class="token-reenviar" id="t-email-reenviar" disabled>Reenviar</button>
      </div>

      <!-- SMS -->
      <div class="token-card">
        <div class="token-card-header">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>
          </svg>
          <div>
            <h4>Código por SMS</h4>
            <p class="token-destino">${escapeHtml(celular)}</p>
          </div>
        </div>
        <fieldset class="token-inputs" id="t-sms-inputs" aria-label="Código de SMS">
          ${renderInputs('ts')}
        </fieldset>
        <p class="token-status" id="t-sms-status">Enviando…</p>
        <button type="button" class="token-reenviar" id="t-sms-reenviar" disabled>Reenviar</button>
      </div>
    </div>

    <div class="token-debug" id="t-debug" hidden></div>
  `;

  wireTokenScreen(body, wizardData);

  // Auto-generar y enviar ambos tokens al entrar a la pantalla
  await enviarAmbos(body, wizardData);
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

async function enviarAmbos(root, wizardData) {
  // Reset estado de pantalla
  _state.emailToken = null;
  _state.smsToken = null;
  wizardData.tokenEmailOk = false;
  wizardData.tokenSmsOk = false;

  setStatus(root, 'email', 'Enviando…');
  setStatus(root, 'sms', 'Enviando…');

  // Enviar en paralelo
  const [emailRes, smsRes] = await Promise.all([
    generarYEnviarToken({ canal: 'email', destino: wizardData.email }).catch((err) => ({ ok: false, error: err.message })),
    generarYEnviarToken({ canal: 'sms', destino: wizardData.celular }).catch((err) => ({ ok: false, error: err.message })),
  ]);

  if (emailRes.ok) {
    _state.emailToken = { token: emailRes.token, expiraEn: emailRes.expiraEn };
    setStatus(root, 'email', `Código enviado. Revisa tu bandeja de entrada (y spam).`);
  } else {
    setStatus(root, 'email', `No pudimos enviar el código por correo: ${emailRes.error || 'reintenta'}`, true);
  }

  if (smsRes.ok) {
    _state.smsToken = { token: smsRes.token, expiraEn: smsRes.expiraEn };
    setStatus(root, 'sms', `Código enviado a tu celular.`);
  } else {
    setStatus(root, 'sms', `No pudimos enviar el SMS: ${smsRes.error || 'reintenta'}`, true);
  }

  // Activar cooldown del Reenviar en ambos
  iniciarCooldown(root, 'email');
  iniciarCooldown(root, 'sms');

  // Mostrar los códigos en modo demo (MIENTRAS ES MOCK)
  // Quitar este bloque cuando el backend esté integrado.
  const debug = root.querySelector('#t-debug');
  if (debug && _state.emailToken && _state.smsToken) {
    debug.hidden = false;
    debug.innerHTML = `
      <strong>MODO DEMO</strong> · Los códigos generados son:
      <span class="token-debug-code">Email: ${_state.emailToken.token}</span>
      <span class="token-debug-code">SMS: ${_state.smsToken.token}</span>
      <small>En producción los tokens llegarán a tu correo y celular, no se mostrarán aquí.</small>
    `;
  }
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

    // Refresh demo display
    const debug = root.querySelector('#t-debug');
    if (debug && _state.emailToken && _state.smsToken) {
      debug.innerHTML = `
        <strong>MODO DEMO</strong> · Los códigos generados son:
        <span class="token-debug-code">Email: ${_state.emailToken.token}</span>
        <span class="token-debug-code">SMS: ${_state.smsToken.token}</span>
        <small>En producción los tokens llegarán a tu correo y celular, no se mostrarán aquí.</small>
      `;
    }
  } catch (err) {
    setStatus(root, canal, `Error: ${err.message}`, true);
  }
}

function verificarSi(canal, root, wizardData) {
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
    if (canal === 'email') wizardData.tokenEmailOk = true;
    else wizardData.tokenSmsOk = true;
    // Marcar inputs como exitosos
    inputs.forEach((i) => i.classList.add('is-ok'));
  } else {
    setStatus(root, canal, res.reason, true);
    inputs.forEach((i) => i.classList.add('is-error'));
    // Limpiar después de un momento para que pueda reintentar
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
