import { generarYEnviarToken, verificarToken, TOKEN_LENGTH } from '../services/token-service.js?v=20260929a';
import { goTo } from '../wizard.js?v=20260929a';

export function renderPantallaToken(body, data) {
  body.innerHTML = `
    <div class="email-target"><span>Enviaremos el código a</span><strong>${escapeHtml(data.email || '—')}</strong><button type="button" class="link-button" id="change-email">Cambiar correo</button></div>
    <div class="otp-panel">
      <div class="otp-icon" aria-hidden="true">✉</div>
      <h3>${data.tokenEmailOk ? 'Correo verificado' : 'Ingresa el código de 4 dígitos'}</h3>
      <p>${data.tokenEmailOk ? 'Tu correo quedó confirmado.' : 'El código vence en 5 minutos.'}</p>
      <div class="otp-inputs" id="otp-inputs">${Array.from({ length: TOKEN_LENGTH }, (_, index) => `<input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="1" aria-label="Dígito ${index + 1}" ${data.tokenEmailOk ? 'disabled value="•"' : ''}>`).join('')}</div>
      <div id="token-status" class="field-error" role="alert" aria-live="polite"></div>
      <button type="button" class="btn btn--secondary" id="verify-code" ${data.tokenEmailOk ? 'hidden' : ''}>Verificar código</button>
      <div class="resend-row" ${data.tokenEmailOk ? 'hidden' : ''}><span id="resend-copy">¿No llegó?</span><button type="button" class="link-button" id="resend-code">Reenviar código</button></div>
      <p id="demo-code" class="demo-code" hidden></p>
    </div>`;

  body.querySelector('#change-email').addEventListener('click', () => { data.tokenEmailOk = false; goTo('datos'); });
  const inputs = [...body.querySelectorAll('#otp-inputs input')];
  inputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(-1);
      if (input.value && inputs[index + 1]) inputs[index + 1].focus();
    });
    input.addEventListener('keydown', (event) => { if (event.key === 'Backspace' && !input.value && inputs[index - 1]) inputs[index - 1].focus(); });
    input.addEventListener('paste', (event) => {
      const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, TOKEN_LENGTH);
      if (digits.length === TOKEN_LENGTH) { event.preventDefault(); digits.split('').forEach((digit, i) => { inputs[i].value = digit; }); inputs.at(-1).focus(); }
    });
  });
  body.querySelector('#verify-code')?.addEventListener('click', () => verify(body, data));
  body.querySelector('#resend-code')?.addEventListener('click', () => sendCode(body, data, true));
  if (!data.tokenEmailOk && (!data._emailToken || data._emailTokenFor !== data.email)) sendCode(body, data, false);
}

async function sendCode(body, data, isResend) {
  const status = body.querySelector('#token-status');
  const resend = body.querySelector('#resend-code');
  status.textContent = isResend ? 'Reenviando…' : 'Enviando código…';
  resend.disabled = true;
  try {
    const result = await generarYEnviarToken({ canal: 'email', destino: data.email });
    data._emailToken = result.token;
    data._emailTokenExpires = result.expiraEn;
    data._emailTokenFor = data.email;
    status.textContent = 'Código enviado.';
    if (result.token) {
      const demo = body.querySelector('#demo-code');
      demo.hidden = false;
      demo.textContent = `Modo demostración · código: ${result.token}`;
    }
    startCooldown(resend, body.querySelector('#resend-copy'));
  } catch {
    status.textContent = 'No pudimos enviar el código. Intenta nuevamente.';
    resend.disabled = false;
  }
}

async function verify(body, data) {
  const code = [...body.querySelectorAll('#otp-inputs input')].map((input) => input.value).join('');
  const result = await verificarToken({ canal: 'email', destino: data.email, codigo: code, tokenEsperado: data._emailToken, expiraEn: data._emailTokenExpires });
  if (!result.valid) { body.querySelector('#token-status').textContent = result.reason; return; }
  data.tokenEmailOk = true;
  renderPantallaToken(body, data);
}

function startCooldown(button, copy) {
  let seconds = 60;
  button.disabled = true;
  const timer = setInterval(() => {
    seconds -= 1; copy.textContent = `Puedes reenviar en ${seconds}s`;
    if (seconds <= 0) { clearInterval(timer); copy.textContent = '¿No llegó?'; button.disabled = false; }
  }, 1000);
}

export function validarPantallaToken(data) {
  if (!data.tokenEmailOk) {
    document.querySelector('[data-body="token"] #token-status').textContent = 'Verifica tu correo para continuar.';
    return false;
  }
  return true;
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
