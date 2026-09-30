import { generarYEnviarToken, verificarToken, TOKEN_LENGTH } from '../services/token-service.js?v=20260929a';
import { correoVerificado, invalidarCorreo } from '../utils/registration-data.js?v=20260929a';
import { lockModalScroll } from '../utils/modal-scroll-lock.js?v=20260929a';

export function ocultarCorreo(email) {
  const [local, domain = ''] = String(email).split('@');
  return `${local.slice(0, 1)}•••@${domain.slice(0, 1)}•••${domain.includes('.') ? domain.slice(domain.lastIndexOf('.')) : ''}`;
}

export function solicitarVerificacionCorreo(data, { onChangeEmail = () => {} } = {}) {
  if (correoVerificado(data)) return Promise.resolve(true);
  const destination = data.email;
  const dialog = document.createElement('dialog');
  dialog.className = 'email-verification';
  dialog.setAttribute('aria-labelledby', 'email-verification-title');
  dialog.setAttribute('aria-describedby', 'email-verification-destination');
  dialog.innerHTML = `
    <button type="button" class="email-verification-close" aria-label="Cerrar verificación">×</button>
    <h2 id="email-verification-title">Verifica tu correo</h2>
    <p id="email-verification-destination"></p>
    <form novalidate>
      <label for="email-code">Código de verificación</label>
      <input id="email-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="${TOKEN_LENGTH}" aria-describedby="email-code-status" autofocus>
      <p id="email-code-status" role="status" aria-live="polite"></p>
      <p id="email-code-demo" hidden></p>
      <button type="submit" class="btn btn--primary email-code-verify">Verificar y continuar</button>
    </form>
    <div class="email-code-actions"><button type="button" class="link-button email-code-resend">Reenviar código</button><button type="button" class="link-button email-code-change">Cambiar correo</button></div>`;
  dialog.querySelector('#email-verification-destination').textContent = ocultarCorreo(destination);
  document.body.append(dialog);
  const code = dialog.querySelector('#email-code');
  const status = dialog.querySelector('#email-code-status');
  const resend = dialog.querySelector('.email-code-resend');
  const submit = dialog.querySelector('.email-code-verify');
  let timer;
  let settled = false;
  let request = 0;
  let busy = false;
  const origin = document.activeElement;
  const unlockScroll = lockModalScroll(dialog);

  return new Promise((resolve) => {
    function finish(verified, changeEmail = false) {
      if (settled) return;
      settled = true;
      request += 1;
      clearTimeout(timer);
      dialog.close();
      dialog.remove();
      unlockScroll();
      if (changeEmail) { invalidarCorreo(data); onChangeEmail(); }
      else origin?.focus?.({ preventScroll: true });
      resolve(verified);
    }
    function cooldown() {
      clearTimeout(timer);
      if (settled) return;
      const seconds = Math.max(0, Math.ceil(((data._emailResendAfter || 0) - Date.now()) / 1000));
      resend.disabled = busy || seconds > 0;
      resend.textContent = seconds ? `Reenviar en ${seconds}s` : 'Reenviar código';
      if (seconds) timer = setTimeout(cooldown, 1000);
    }
    function showDemo() {
      const demo = dialog.querySelector('#email-code-demo');
      demo.hidden = !data._emailToken;
      demo.textContent = data._emailToken ? `Modo demostración: no se envió ningún correo. Código de prueba: ${data._emailToken}` : '';
    }
    async function send() {
      if (busy || (data._emailResendAfter || 0) > Date.now()) return;
      const id = ++request;
      busy = true;
      submit.disabled = resend.disabled = true;
      status.textContent = 'Solicitando código…';
      try {
        const result = await generarYEnviarToken({ canal: 'email', destino: destination });
        if (settled || id !== request || data.email !== destination) return;
        Object.assign(data, { _emailToken: result.token, _emailTokenExpires: result.expiraEn, _emailTokenFor: destination, _emailCodeSent: true, _emailResendAfter: Date.now() + 60_000 });
        code.value = '';
        code.removeAttribute('aria-invalid');
        status.textContent = result.token ? 'Ingresa el código de prueba.' : 'Código enviado. Vence en 5 minutos.';
        showDemo();
      } catch {
        if (!settled && id === request) status.textContent = 'No pudimos enviar el código. El servicio de correo no está disponible. Intenta nuevamente.';
      } finally {
        if (!settled && id === request) { busy = false; submit.disabled = !data._emailCodeSent; cooldown(); }
      }
    }
    dialog.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy || !data._emailCodeSent) return;
      busy = true;
      submit.disabled = resend.disabled = true;
      status.textContent = 'Verificando…';
      const id = ++request;
      try {
        const result = await verificarToken({ canal: 'email', destino: destination, codigo: code.value, tokenEsperado: data._emailToken, expiraEn: data._emailTokenExpires });
        if (settled || id !== request || data.email !== destination) return;
        if (!result.valid) { status.textContent = result.reason; code.setAttribute('aria-invalid', 'true'); code.focus(); return; }
        data.tokenEmailOk = true;
        data._verifiedEmail = destination;
        finish(true);
      } catch {
        if (!settled) status.textContent = 'No pudimos verificar el código. Intenta nuevamente.';
      } finally {
        if (!settled && id === request) { busy = false; submit.disabled = false; cooldown(); }
      }
    });
    code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, TOKEN_LENGTH); code.removeAttribute('aria-invalid'); });
    dialog.querySelector('.email-verification-close').addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); });
    dialog.addEventListener('close', () => finish(false));
    dialog.querySelector('.email-code-change').addEventListener('click', () => finish(false, true));
    resend.addEventListener('click', send);
    try { dialog.showModal(); } catch { finish(false); return; }
    if (data._emailCodeSent && data._emailTokenFor === destination && new Date(data._emailTokenExpires).getTime() > Date.now()) {
      status.textContent = data._emailToken ? 'Ingresa el código de prueba.' : 'Ingresa el código que recibiste.';
      showDemo(); cooldown();
    } else {
      invalidarCorreo(data);
      send();
    }
  });
}
