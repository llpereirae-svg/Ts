// app.js — Orquestador principal: conecta la máquina de estados, los validators,
// el cliente SRI y los mocks del backend con el DOM.

import {
  validarRUC, validarCelular, validarEmail, validarClave,
  validarFirmaArchivo, validarCodigoToken,
} from './validators.js';
import { createMachine, STATES, EVENTS } from './state-machine.js';
import { consultarRUC } from './sri-client.js';
import {
  clienteExiste, iniciarRegistro, verificarToken,
  establecerClave, validarFirma, finalizarRegistro,
} from './api-mocks.js';

// ---------- Analytics ----------
function track(name, detail = {}) {
  window.dispatchEvent(new CustomEvent('tributasoft:event', { detail: { name, ...detail } }));
  // Eco a consola para que durante el prototipo se vea qué se está disparando.
  console.log('[analytics]', name, detail);
}

// ---------- Drafts (sin datos sensibles) ----------
const DRAFT_KEY = 'tsoft:draft';
function saveDraft(data) {
  try {
    const safe = { ...data };
    delete safe.clave;
    delete safe.confirmarClave;
    delete safe.token;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(safe));
  } catch { /* ignore */ }
}
function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// ---------- DOM helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function show(el) { if (el) el.hidden = false; }
function hide(el) { if (el) el.hidden = true; }
function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function showBanner(msg, tipo = 'info', auto = 5000) {
  const banner = $('#network-banner');
  if (!banner) return;
  banner.textContent = msg;
  banner.dataset.tipo = tipo;
  banner.hidden = false;
  if (auto) setTimeout(() => { banner.hidden = true; }, auto);
}

// ---------- Modales con focus trap simple ----------
function openModal(modal) {
  if (!modal) return;
  modal.showModal?.();
  modal.classList.add('is-open');
  const firstFocus = modal.querySelector('[autofocus], input, button, select, textarea');
  firstFocus?.focus();
}
function closeModal(modal) {
  if (!modal) return;
  modal.close?.();
  modal.classList.remove('is-open');
}

// ---------- Máquina ----------
const machine = createMachine();

// ---------- Datos transitorios del flujo ----------
const flow = {
  ruc: '',
  rucInfo: null,
  registroId: null,
  canal: 'email',
  email: '',
  celular: '',
  razonSocial: '',
  tokenSentTo: '',
};

// ---------- Wire up ----------
document.addEventListener('DOMContentLoaded', () => {
  track('landing_view', { url: location.href });

  // Restaura draft si existe
  const draft = loadDraft();
  if (draft?.ruc) {
    $('#ruc').value = draft.ruc;
  }

  // RUC input
  const rucInput = $('#ruc');
  const ctaPrimary = $('#cta-primary');
  rucInput.addEventListener('input', (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 13);
    e.target.value = v;
    machine.send(EVENTS.RUC_EDIT, { ruc: v });
    flow.ruc = v;
    saveDraft(flow);
  });

  rucInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && flow.ruc.length === 13) {
      e.preventDefault();
      ctaPrimary.click();
    }
  });

  ctaPrimary.addEventListener('click', onContinuar);

  // Form principal
  $('#registration-form').addEventListener('submit', onFormSubmit);

  // Modal token
  setupTokenInputs();
  $('#verificar-token').addEventListener('click', onVerificarToken);
  $('#reenviar').addEventListener('click', onReenviarToken);

  // Modal clave
  $('#clave').addEventListener('input', onClaveInput);
  $('#confirmar-clave').addEventListener('input', onClaveInput);
  $('#continuar-clave').addEventListener('click', onContinuarClave);

  // Modal firma
  $('#subir-firma').addEventListener('click', () => $('#firma-uploader').click());
  $('#firma-uploader').addEventListener('change', onFirmaFile);
  $('#firma-clave-confirmar').addEventListener('click', onValidarFirma);
  $('#saltar-firma').addEventListener('click', () => {
    track('firma_skipped');
    machine.send(EVENTS.FIRMA_SKIP);
    finalizarFlow();
  });

  // Success
  $('#go-to-account').addEventListener('click', () => {
    window.location.href = 'https://app.tributasoft.ec/login';
  });

  // Cerrar modales con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $$('dialog.is-open').forEach(closeModal);
    }
  });

  // Suscripción a cambios de estado para renderizar la UI según el estado.
  machine.subscribe(render);
});

// ---------- Handlers ----------

async function onContinuar() {
  const ruc = $('#ruc').value;
  flow.ruc = ruc;

  track('ruc_entered', { length: ruc.length });
  machine.send(EVENTS.RUC_TYPED, { ruc });

  const result = validarRUC(ruc);
  if (!result.valid) {
    machine.send(EVENTS.RUC_FORMAT_BAD, { rucError: result.reason });
    return;
  }
  track('ruc_valid', { type: result.type });
  machine.send(EVENTS.RUC_FORMAT_OK, { rucType: result.type });

  setBusy($('#cta-primary'), true);
  try {
    const dbResp = await clienteExiste(ruc);
    if (dbResp.existe) {
      track('ruc_existing_redirect', { url: dbResp.url_redirect });
      machine.send(EVENTS.DB_EXISTS, { redirectUrl: dbResp.url_redirect });
      // Da un breve respiro al usuario para ver el mensaje antes de redirigir.
      setTimeout(() => { window.location.href = dbResp.url_redirect; }, 1500);
      return;
    }
    machine.send(EVENTS.DB_NEW);

    // Consulta SRI sin bloquear el render
    const sri = await consultarRUC(ruc);
    if (sri && sri.found) {
      flow.rucInfo = sri;
      flow.razonSocial = sri.razonSocial || '';
      track('sri_query_success');
      machine.send(EVENTS.SRI_OK, { rucInfo: sri });
    } else {
      track('sri_query_failure', { reason: sri?.reason || 'UNKNOWN' });
      machine.send(EVENTS.SRI_FAIL);
    }
    track('form_open');
    prefilledFormUI();
  } catch (err) {
    console.error(err);
    showBanner('No pudimos contactar al servidor. Intenta de nuevo en un momento.', 'error');
  } finally {
    setBusy($('#cta-primary'), false);
  }
}

function prefilledFormUI() {
  const form = $('#registration-form');
  show(form);
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (flow.rucInfo) {
    $('#razon-social').value = flow.rucInfo.razonSocial || '';
    $('#regimen').value = flow.rucInfo.regimen || '';
    $('#sri-banner').hidden = true;
  } else {
    $('#razon-social').value = '';
    $('#sri-banner').hidden = false;
  }

  $('#razon-social-static').textContent = flow.rucInfo?.razonSocial || '—';
  $('#ruc-display').textContent = flow.ruc;

  // Mueve foco al primer campo nuevo (accesibilidad)
  setTimeout(() => $('#email').focus(), 250);
}

async function onFormSubmit(e) {
  e.preventDefault();
  const email = $('#email').value;
  const celular = $('#celular').value;
  const canal = $('input[name="canal-token"]:checked')?.value || 'email';
  const razonSocial = $('#razon-social').value.trim();

  // Validaciones
  const emailV = validarEmail(email);
  const celularV = validarCelular(celular);

  setFieldError('email', emailV.valid ? '' : emailV.reason);
  setFieldError('celular', celularV.valid ? '' : celularV.reason);
  if (!emailV.valid || !celularV.valid) return;
  if (!razonSocial) { setFieldError('razon-social', 'Ingresa la razón social.'); return; }

  flow.email = emailV.normalizado;
  flow.celular = celularV.normalizado;
  flow.canal = canal;
  flow.razonSocial = razonSocial;
  saveDraft(flow);
  track('form_submitted', { canal });

  const submitBtn = $('#submit-registro');
  setBusy(submitBtn, true);
  try {
    machine.send(EVENTS.FORM_SUBMIT);
    const resp = await iniciarRegistro({
      ruc: flow.ruc,
      razonSocial,
      email: flow.email,
      celular: flow.celular,
      canal,
      datosSRI: flow.rucInfo,
    });
    flow.registroId = resp.registroId;
    flow.tokenSentTo = resp.tokenSentTo;
    track('token_sent_' + canal, { sentTo: resp.tokenSentTo });
    machine.send(EVENTS.TOKEN_SENT, { tokenSentTo: resp.tokenSentTo, _mockHint: resp._mockHint });

    $('#token-destino').textContent = resp.tokenSentTo;
    const hint = resp._mockHint ? `(${resp._mockHint})` : '';
    $('#token-hint').textContent = hint;
    openModal($('#modal-token'));
    startResendTimer(30);
  } catch (err) {
    console.error(err);
    showBanner('No pudimos enviar el código. Intenta de nuevo.', 'error');
  } finally {
    setBusy(submitBtn, false);
  }
}

function setupTokenInputs() {
  const inputs = $$('#codigo-input input');
  inputs.forEach((inp, idx) => {
    inp.addEventListener('input', (e) => {
      const v = e.target.value.replace(/\D/g, '').slice(0, 1);
      e.target.value = v;
      if (v && idx < inputs.length - 1) inputs[idx + 1].focus();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        inputs[idx - 1].focus();
      }
    });
    inp.addEventListener('paste', (e) => {
      const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
      if (text.length === 6) {
        e.preventDefault();
        text.split('').forEach((ch, i) => inputs[i].value = ch);
        inputs[5].focus();
      }
    });
  });
}

async function onVerificarToken() {
  const codigo = $$('#codigo-input input').map((i) => i.value).join('');
  const v = validarCodigoToken(codigo);
  if (!v.valid) {
    $('#token-error').textContent = 'Ingresa los 6 dígitos del código.';
    return;
  }
  setBusy($('#verificar-token'), true);
  try {
    const resp = await verificarToken({ registroId: flow.registroId, codigo });
    if (resp.verificado) {
      track('token_verified');
      machine.send(EVENTS.TOKEN_OK);
      closeModal($('#modal-token'));
      openModal($('#modal-clave'));
      $('#clave').focus();
    } else {
      track('token_failed', { attemptsLeft: resp.attemptsLeft });
      machine.send(EVENTS.TOKEN_WRONG);
      if (resp.attemptsLeft <= 0) {
        machine.send(EVENTS.TOKEN_LOCKED);
        $('#token-error').textContent = 'Demasiados intentos. Por seguridad, debes empezar de nuevo.';
        $('#verificar-token').disabled = true;
      } else {
        $('#token-error').textContent = `Código incorrecto. Intentos restantes: ${resp.attemptsLeft}.`;
      }
    }
  } catch (err) {
    showBanner('Error verificando el código. Intenta de nuevo.', 'error');
  } finally {
    setBusy($('#verificar-token'), false);
  }
}

let resendTimer;
function startResendTimer(seconds) {
  const btn = $('#reenviar');
  btn.disabled = true;
  let remaining = seconds;
  btn.textContent = `Reenviar en ${remaining}s`;
  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(resendTimer);
      btn.disabled = false;
      btn.textContent = 'Reenviar código';
    } else {
      btn.textContent = `Reenviar en ${remaining}s`;
    }
  }, 1000);
}

async function onReenviarToken() {
  setBusy($('#reenviar'), true);
  try {
    const resp = await iniciarRegistro({
      ruc: flow.ruc,
      razonSocial: flow.razonSocial,
      email: flow.email,
      celular: flow.celular,
      canal: flow.canal,
      datosSRI: flow.rucInfo,
    });
    flow.registroId = resp.registroId;
    $('#token-destino').textContent = resp.tokenSentTo;
    $$('#codigo-input input').forEach((i) => i.value = '');
    $('#token-error').textContent = '';
    startResendTimer(30);
  } catch (err) {
    showBanner('No pudimos reenviar el código.', 'error');
  } finally {
    setBusy($('#reenviar'), false);
  }
}

function onClaveInput() {
  const c = $('#clave').value;
  const v = validarClave(c);
  const bar = $('#fuerza-clave');
  bar.dataset.nivel = String(v.fuerza);
  const labels = ['Débil', 'Regular', 'Buena', 'Fuerte'];
  bar.setAttribute('aria-label', `Fuerza de clave: ${labels[v.fuerza]}`);
  bar.querySelector('span').textContent = labels[v.fuerza];

  // Lista de requisitos
  $$('#requisitos-clave li').forEach((li) => {
    const key = li.dataset.req;
    if (v.requisitos[key]) li.classList.add('cumplido');
    else li.classList.remove('cumplido');
  });

  // Confirmación
  const confirm = $('#confirmar-clave').value;
  const coincide = confirm && c === confirm;
  $('#confirmar-error').textContent = (confirm && !coincide) ? 'Las claves no coinciden.' : '';

  $('#continuar-clave').disabled = !(v.valid && coincide);
}

async function onContinuarClave() {
  const clave = $('#clave').value;
  const confirm = $('#confirmar-clave').value;
  const v = validarClave(clave);
  if (!v.valid || clave !== confirm) return;

  setBusy($('#continuar-clave'), true);
  try {
    const resp = await establecerClave({ registroId: flow.registroId, clave });
    if (!resp.ok) {
      showBanner('No pudimos guardar la clave. Intenta de nuevo.', 'error');
      return;
    }
    track('password_created');
    machine.send(EVENTS.PASSWORD_OK);
    closeModal($('#modal-clave'));
    openModal($('#modal-firma'));
  } catch (err) {
    showBanner('Error guardando la clave.', 'error');
  } finally {
    setBusy($('#continuar-clave'), false);
  }
}

let firmaFileSeleccionada = null;
function onFirmaFile(e) {
  const file = e.target.files[0];
  const v = validarFirmaArchivo(file);
  if (!v.valid) {
    $('#firma-error').textContent = v.reason;
    return;
  }
  firmaFileSeleccionada = file;
  $('#firma-nombre').textContent = file.name;
  $('#firma-error').textContent = '';
  show($('#firma-clave-step'));
  $('#firma-clave').focus();
}

async function onValidarFirma() {
  const clave = $('#firma-clave').value;
  if (!firmaFileSeleccionada) return;
  if (!clave) { $('#firma-error').textContent = 'Ingresa la clave de la firma.'; return; }

  setBusy($('#firma-clave-confirmar'), true);
  machine.send(EVENTS.FIRMA_UPLOAD);
  try {
    const resp = await validarFirma({ file: firmaFileSeleccionada, clave });
    if (resp.valida) {
      track('firma_uploaded_valid', { fechaCaducidad: resp.fechaCaducidad });
      machine.send(EVENTS.FIRMA_OK);
      closeModal($('#modal-firma'));
      finalizarFlow();
    } else {
      track('firma_uploaded_invalid', { error: resp.error });
      machine.send(EVENTS.FIRMA_BAD);
      const hint = resp._mockHint ? ` (${resp._mockHint})` : '';
      $('#firma-error').textContent = (resp.error || 'La firma no es válida.') + hint;
    }
  } catch (err) {
    $('#firma-error').textContent = 'Error validando la firma.';
  } finally {
    setBusy($('#firma-clave-confirmar'), false);
  }
}

async function finalizarFlow() {
  try {
    const resp = await finalizarRegistro({ registroId: flow.registroId });
    clearDraft();
    track('registration_complete', { redirectUrl: resp.redirectUrl });
    machine.send(EVENTS.FINALIZED);
    show($('#success'));
    $('#success').scrollIntoView({ behavior: 'smooth' });

    setTimeout(() => {
      window.location.href = resp.redirectUrl || 'https://app.tributasoft.ec/login';
    }, 3000);
  } catch (err) {
    showBanner('Error finalizando el registro.', 'error');
  }
}

// ---------- Render según estado ----------
function render({ state, context }) {
  document.body.dataset.state = state;

  const feedback = $('#ruc-feedback');
  if (!feedback) return;

  switch (state) {
    case STATES.IDLE:
      feedback.textContent = '';
      feedback.className = 'feedback';
      break;
    case STATES.VALIDATING_FORMAT:
      feedback.textContent = 'Validando RUC…';
      feedback.className = 'feedback feedback--info';
      break;
    case STATES.ERROR_FORMAT:
      feedback.textContent = context.rucError || 'RUC inválido.';
      feedback.className = 'feedback feedback--error';
      break;
    case STATES.CHECKING_DB:
      feedback.textContent = 'Revisando si ya tienes cuenta…';
      feedback.className = 'feedback feedback--info';
      break;
    case STATES.REDIRECT_COTIZADOR:
      feedback.textContent = 'Ya tienes cuenta con nosotros — te llevamos al cotizador.';
      feedback.className = 'feedback feedback--info';
      break;
    case STATES.QUERYING_SRI:
      feedback.textContent = 'Consultando tus datos en el SRI…';
      feedback.className = 'feedback feedback--info';
      break;
    case STATES.FORM_OPEN_PREFILLED:
      feedback.textContent = '¡Listo! Encontramos tus datos en el SRI.';
      feedback.className = 'feedback feedback--ok';
      break;
    case STATES.FORM_OPEN_EMPTY:
      feedback.textContent = 'No pudimos validar en el SRI, pero puedes continuar.';
      feedback.className = 'feedback feedback--warn';
      break;
    case STATES.SUCCESS:
      feedback.textContent = '';
      break;
  }
}

function setFieldError(fieldId, msg) {
  const el = $(`#${fieldId}-error`);
  if (el) el.textContent = msg || '';
  const input = $(`#${fieldId}`);
  if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
