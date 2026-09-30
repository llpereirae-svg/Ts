/* Orquestador del registro — cuatro etapas y verificación de correo en Datos. */
import { estadoSriPermiteContinuar, correoVerificado, LABEL_REGIMEN, LABEL_TIPO } from './utils/registration-data.js?v=20260930c';
import { construirFacturacion, DOCUMENTOS } from './utils/billing-data.js?v=20260930c';
import { crearGateCliente } from './utils/cliente-gate.js?v=20260930c';
import { CLIENTE_ESTADO } from './services/cliente-service.js?v=20260930c';
import { renderPantallaCliente } from './screens/screen-cliente.js?v=20260930c';
import { TRIBUTASOFT_LOGIN_URL } from './services/portal-config.js?v=20260930c';
import { TAX_DATA_STATUS } from './services/registration-contract.js?v=20260930c';
import { completarDraft, guardarLogo, newIdempotencyKey } from './services/draft-service.js?v=20260930c';

export const SCREENS = [
  { id: 'firma', label: 'Firma electrónica', title: 'Comencemos con tu firma electrónica', eyebrow: '', lead: '' },
  { id: 'datos', label: 'Datos', title: 'Confirma tus datos', eyebrow: '', lead: '' },
  { id: 'facturacion', label: 'Facturación', title: '¿Ya has emitido comprobantes electrónicos anteriormente?', eyebrow: '', lead: '' },
  { id: 'resumen', label: 'Revisión', title: 'Revisa y crea tu cuenta', eyebrow: '', lead: '' },
];

const SCREEN_INDEX = new Map(SCREENS.map((screen, index) => [screen.id, index]));
const renderers = new Map();
const validators = new Map();
let currentIdx = 0;
let onNavigateCb = null;
let validatingDatos = false;
const clienteGate = crearGateCliente();

export const wizardData = {
  terminos: false, firma: null, rucManual: '', sriStatus: 'PENDING', sriSource: '', sriTechnicalStatus: '', sriAttempts: 0, sriLastAttemptAt: '', sriErrorCode: '', sriValidacionPendiente: false, sriAdvertencias: [],
  razonSocial: '', nombreComercial: '', actividadEconomica: '', estadoContribuyenteRuc: '',
  regimen: '', tipoContribuyente: '', obligadoLlevarContabilidad: '', noResolucion: '', representanteLegalDeclarado: '', direccion: '', provincia: '', ciudad: '',
  email: '', celular: '', celularPais: 'EC', tokenEmailOk: false,
  modoFacturacion: 'nuevo', codEstablecimiento: '001', codPunto: '001', nombrePunto: 'Electrónicas', secuencias: {},
  clienteGate: { status: CLIENTE_ESTADO.IDLE },
  accountTaxDataStatus: '',
  registrationId: '', identityStatus: '', certificatePackageStatus: '', idempotencyKey: '',
};

export function mountWizard(root) {
  root.innerHTML = `
    <div class="wizard" id="wizard">
      <div class="wiz-progress" aria-label="Progreso del registro">
        <div class="wiz-progress-copy"><span id="wiz-progress-label">Paso 1 de ${SCREENS.length}</span><strong id="wiz-progress-title">Firma</strong></div>
        <div class="wiz-progress-bar" aria-hidden="true"><span id="wiz-progress-fill"></span></div>
        <div class="wiz-progress-track" id="wiz-progress-track"></div>
      </div>
      <div id="wiz-screens"></div>
      <footer class="wiz-copyright"><p>© 2026 TributaSoft S.A.</p></footer>
    </div>
    <nav class="wiz-nav" id="wiz-nav" aria-label="Navegación del registro">
      <div class="wiz-nav-inner">
        <button type="button" class="btn btn--ghost" id="wiz-back">Atrás</button>
        <button type="button" class="btn btn--primary" id="wiz-next">Continuar</button>
      </div>
    </nav>
    <div class="wiz-loading" id="wiz-loading" aria-hidden="true" role="status" aria-live="polite">
      <img src="./assets/Logo%20TributaSoft.png" alt="" class="wiz-loading-logo">
      <p class="wiz-loading-text" id="wiz-loading-text">Procesando…</p>
    </div>`;

  document.getElementById('wiz-progress-track').innerHTML = SCREENS.map((screen, index) => `
    <div class="wiz-step" data-state="pending" data-idx="${index}">
      <span class="wiz-step-dot">${index + 1}</span><span class="wiz-step-label">${screen.label}</span>
    </div>`).join('');
  document.getElementById('wiz-screens').innerHTML = SCREENS.map((screen) => `
    <section class="wiz-screen" id="wiz-screen-${screen.id}" data-id="${screen.id}" aria-labelledby="wiz-h-${screen.id}">
      <header class="wiz-screen-header">
        ${screen.eyebrow ? `<p class="wiz-screen-eyebrow">${screen.eyebrow}</p>` : ''}
        <h2 id="wiz-h-${screen.id}">${screen.title}</h2>
        ${screen.lead ? `<p class="wiz-screen-lead">${screen.lead}</p>` : ''}
      </header>
      <div class="wiz-screen-body" data-body="${screen.id}"></div>
    </section>`).join('');
  document.getElementById('wiz-back').addEventListener('click', goBack);
  document.getElementById('wiz-next').addEventListener('click', goNext);
  document.body.classList.add('wiz-mode');
  showScreen(0, { skipScroll: true });
}

export function registerScreen(id, renderer) {
  renderers.set(id, renderer);
  const body = document.querySelector(`[data-body="${id}"]`);
  if (body && SCREENS[currentIdx].id === id) renderer(body, wizardData);
}
export function setValidator(id, validator) { validators.set(id, validator); }

export async function goNext() {
  if (validatingDatos) return;
  const from = currentIdx;
  const validator = validators.get(SCREENS[currentIdx].id);
  validatingDatos = true;
  try {
    if (validator && !(await validator(wizardData))) return;
    if (SCREENS[from].id === 'firma') {
      const result = await clienteGate.verificar(wizardData, state => {
        if (state.status === CLIENTE_ESTADO.CHECKING) showLoading('Estamos verificando tu información...');
      });
      hideLoading();
      if (result.status !== CLIENTE_ESTADO.NEW_CLIENT) {
        if (result.status !== CLIENTE_ESTADO.IDLE) showCliente(result);
        return;
      }
    }
    if (currentIdx !== from) return;
  } finally { validatingDatos = false; }
  if (currentIdx >= SCREEN_INDEX.get('datos') && (!estadoSriPermiteContinuar(wizardData) || !correoVerificado(wizardData))) {
    await transitionTo(SCREEN_INDEX.get('datos')); return;
  }
  if (currentIdx === SCREENS.length - 1) return finishWizard();
  await transitionTo(currentIdx + 1);
}
export async function goBack() { if (currentIdx > 0) await transitionTo(currentIdx - 1); }
export async function goTo(idOrIndex) {
  let index = typeof idOrIndex === 'number' ? idOrIndex : SCREEN_INDEX.get(idOrIndex);
  if (index > SCREEN_INDEX.get('datos') && (!estadoSriPermiteContinuar(wizardData) || !correoVerificado(wizardData))) index = SCREEN_INDEX.get('datos');
  if (Number.isInteger(index) && index >= 0 && index < SCREENS.length) await transitionTo(index);
}

async function transitionTo(index) {
  if (index > 0 && !clienteGate.permite(wizardData)) {
    showScreen(0);
    return;
  }
  const active = document.querySelector('.wiz-screen.is-active');
  if (active) { active.classList.add('is-leaving'); await wait(190); }
  showScreen(index);
}

function showScreen(index, { skipScroll = false } = {}) {
  if (index > 0 && !clienteGate.permite(wizardData)) index = 0;
  document.getElementById('cliente-screen')?.remove();
  document.querySelectorAll('.wiz-screen').forEach((screen) => screen.classList.remove('is-active', 'is-leaving'));
  const config = SCREENS[index];
  document.body.dataset.wizardStep = config.id;
  const screen = document.getElementById(`wiz-screen-${config.id}`);
  screen.classList.add('is-active');
  document.querySelectorAll('.wiz-step').forEach((step, i) => { step.dataset.state = i < index ? 'done' : i === index ? 'active' : 'pending'; });
  document.getElementById('wiz-progress-label').textContent = `Paso ${index + 1} de ${SCREENS.length}`;
  document.getElementById('wiz-progress-title').textContent = config.label;
  document.getElementById('wiz-progress-fill').style.width = `${((index + 1) / SCREENS.length) * 100}%`;
  document.getElementById('wiz-back').disabled = index === 0;
  document.getElementById('wiz-back').hidden = index === 0;
  document.getElementById('wiz-next').textContent = index === SCREENS.length - 1 ? 'Crear cuenta' : 'Continuar';
  document.getElementById('wiz-next').disabled = false;

  const body = document.querySelector(`[data-body="${config.id}"]`);
  renderers.get(config.id)?.(body, wizardData);
  if (config.id === 'resumen') renderSummary(body);
  currentIdx = index;
  onNavigateCb?.(config.id, index);
  if (!skipScroll) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  setTimeout(() => screen.querySelector('input, button, select, textarea')?.focus({ preventScroll: true }), 220);
}

function showCliente(result) {
  document.querySelectorAll('.wiz-screen').forEach(screen => screen.classList.remove('is-active', 'is-leaving'));
  document.body.dataset.wizardStep = 'cliente';
  let section = document.getElementById('cliente-screen');
  if (!section) {
    section = document.createElement('section');
    section.id = 'cliente-screen';
    section.setAttribute('aria-labelledby', 'cliente-heading');
    document.getElementById('wizard').append(section);
  }
  renderPantallaCliente(section, result, { onRetry: goNext, onBack: () => showScreen(0) });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function buildSummarySections(data) {
  const facturacion = construirFacturacion(data);
  const codigo = documento => documento ? `${documento.establecimiento} - ${documento.punto_emision} - ${documento.secuencia}` : '—';
  return [
    { id: 'datos', title: 'Contribuyente', rows: [
      ['RUC', data.rucManual], ['Razón social', data.razonSocial],
      ...(data.nombreComercial ? [['Nombre comercial', data.nombreComercial]] : [])
    ] },
    { id: 'datos', title: 'Información tributaria', rows: [
      ['Régimen', LABEL_REGIMEN[data.regimen] || data.regimen],
      ['Tipo', LABEL_TIPO[data.tipoContribuyente] || data.tipoContribuyente],
      ...(data.sriSource === 'MANUAL_ENTRY' ? [['Origen', 'Declarado por el usuario · pendiente de validación SRI']] : []),
      ...(data.noResolucion ? [['N.º de resolución', data.noResolucion]] : [])
    ] },
    { id: 'datos', title: 'Contacto', rows: [['Correo', data.email], ['Celular', formatCelular(data.celular, data.celularPais)]] },
    { id: 'facturacion', title: 'Facturación inicial', rows: [
      ['Inicio', facturacion.modo === 'continuar' ? 'Continuar numeración' : 'Empezar a facturar'],
      ...facturacion.documentos.map(documento => [DOCUMENTOS[documento.tipo_documento] || documento.tipo_documento, codigo(documento)])
    ] },
  ];
}

export function renderSummary(body, data = wizardData) {
  const sections = buildSummarySections(data);
  body.innerHTML = `
    ${data.sriValidacionPendiente ? '<div class="status-callout status-callout--warning" role="status"><strong>Validación SRI pendiente</strong><span>Podrás crear la cuenta, pero la emisión electrónica permanecerá bloqueada hasta que el SRI confirme la información tributaria.</span></div>' : ''}
    <div class="wiz-summary">${sections.map((section) => `<section class="wiz-summary-section${section.id === 'facturacion' ? ' wiz-summary-section--billing is-collapsed' : ''}">
      <header class="wiz-summary-section-header"><h3>${section.title}</h3><span class="wiz-summary-section-actions"><button type="button" class="wiz-summary-edit" data-edit="${section.id}">Editar</button>${section.id === 'facturacion' ? '<button type="button" class="wiz-summary-toggle" aria-expanded="false" aria-label="Mostrar facturación inicial"><span aria-hidden="true"></span></button>' : ''}</span></header>
      <dl class="wiz-summary-rows">${section.rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value || '—')}</dd></div>`).join('')}</dl>
    </section>`).join('')}</div>`;
  body.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => goTo(button.dataset.edit)));
  body.querySelectorAll('.wiz-summary-toggle').forEach((button) => button.addEventListener('click', () => {
    const section = button.closest('.wiz-summary-section--billing');
    const expanded = section.classList.toggle('is-collapsed') === false;
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', `${expanded ? 'Ocultar' : 'Mostrar'} facturación inicial`);
  }));
}

async function finishWizard() {
  showLoading('Preparando tu registro…');
  try {
    const { validateAntiBot } = await import('./utils/anti-bot.js?v=20260930c');
    if (!validateAntiBot().ok) throw new Error('No pudimos validar la sesión. Recarga la página e intenta de nuevo.');
    if (!wizardData.registrationId) throw new Error('La sesión de registro expiró. Vuelve a validar la firma.');
    wizardData.idempotencyKey ||= newIdempotencyKey();
    const registration = await completarDraft(wizardData.registrationId, wizardData.idempotencyKey);
    wizardData.accountTaxDataStatus = registration.accountTaxDataStatus
      || (wizardData.sriSource === 'MANUAL_ENTRY'
        ? TAX_DATA_STATUS.PENDING_SRI_RECONCILIATION
        : TAX_DATA_STATUS.VERIFIED);
    hideLoading();
    const { mostrarPersonalizacionLogo } = await import('./screens/post-create-logo.js?v=20260930c');
    const logoSelection = await mostrarPersonalizacionLogo({
      razonSocial: wizardData.razonSocial,
    });
    await guardarLogo({ accountId: registration.accountId, postCreateToken: registration.postCreateToken, selection: logoSelection });
    renderSuccess(wizardData.accountTaxDataStatus);
  } catch (error) { hideLoading(); showFormError(error?.message || 'No pudimos completar el registro. Intenta de nuevo.'); }
}

export function buildRegistrationPayload() {
  const manualSri = wizardData.sriSource === 'MANUAL_ENTRY';
  return {
    ruc: wizardData.rucManual, razonSocial: wizardData.razonSocial, nombreComercial: wizardData.nombreComercial,
    estadoContribuyenteRuc: wizardData.estadoContribuyenteRuc, actividadEconomica: wizardData.actividadEconomica,
    regimen: wizardData.regimen, tipoContribuyente: wizardData.tipoContribuyente, noResolucion: wizardData.noResolucion,
    email: wizardData.email, celular: wizardData.celular,
    facturacion: construirFacturacion(wizardData),
    firma: wizardData.firma ? { titular: wizardData.firma.titular, ruc: wizardData.firma.ruc, caducidad: wizardData.firma.fechaCaducidad || wizardData.firma.caducidad, esJuridica: wizardData.firma.esJuridica } : null,
    sri: {
      source: wizardData.sriSource || (wizardData.sriStatus === 'OK' ? 'SRI' : ''),
      status: wizardData.sriStatus,
      attempts: wizardData.sriAttempts || 0,
      lastAttemptAt: wizardData.sriLastAttemptAt || null,
      errorCode: wizardData.sriErrorCode || null,
      declared: manualSri ? {
        razonSocial: wizardData.razonSocial,
        nombreComercial: wizardData.nombreComercial || null,
        regimen: wizardData.regimen,
        tipoContribuyente: wizardData.tipoContribuyente,
        obligadoLlevarContabilidad: wizardData.obligadoLlevarContabilidad,
        actividadEconomicaPrincipal: wizardData.actividadEconomica,
        agenteRetencion: wizardData.tipoContribuyente === 'AGENTE_RETENCION',
        contribuyenteEspecial: wizardData.tipoContribuyente === 'CONTRIBUYENTE_ESPECIAL',
        granContribuyente: wizardData.tipoContribuyente === 'GRAN_CONTRIBUYENTE',
      } : null,
    },
    terminosAceptados: wizardData.terminos, validacionSriPendiente: wizardData.sriValidacionPendiente,
  };
}

function renderSuccess(accountTaxDataStatus = '') {
  const pending = accountTaxDataStatus === TAX_DATA_STATUS.PENDING_SRI_RECONCILIATION;
  const detail = pending
    ? 'Tu cuenta está activa. La información tributaria queda pendiente de verificación y la emisión electrónica estará bloqueada hasta la conciliación con el SRI.'
    : 'Te llevaremos al portal de inicio de sesión.';
  document.getElementById('wizard-root').innerHTML = `<section class="wiz-success"><span class="wiz-success-check" aria-hidden="true">✓</span><p class="wiz-screen-eyebrow">Registro completado</p><h2>Bienvenido a TributaSoft</h2><p>${detail}</p></section>`;
  document.getElementById('wiz-nav')?.remove();
  window.setTimeout(() => window.location.assign(TRIBUTASOFT_LOGIN_URL), 1600);
}

function showFormError(message) {
  const body = document.querySelector('[data-body="resumen"]');
  let error = body?.querySelector('.wiz-final-error');
  if (!error && body) { error = document.createElement('div'); error.className = 'status-callout status-callout--error wiz-final-error'; error.setAttribute('role', 'alert'); body.prepend(error); }
  if (error) error.textContent = message;
}

export function showLoading(message = 'Procesando…') {
  const overlay = document.getElementById('wiz-loading');
  document.getElementById('wiz-loading-text').textContent = message;
  overlay.classList.add('is-active'); overlay.setAttribute('aria-hidden', 'false');
}
export function hideLoading() { const overlay = document.getElementById('wiz-loading'); overlay.classList.remove('is-active'); overlay.setAttribute('aria-hidden', 'true'); }

export async function startWizard() {
  const root = document.getElementById('wizard-root');
  if (!root) return;
  mountWizard(root);
  const { startSession } = await import('./utils/anti-bot.js?v=20260930c'); startSession();
  const [firma, datos, facturacion] = await Promise.all([
    import('./screens/screen-firma.js?v=20260930c'), import('./screens/screen-datos.js?v=20260930c'),
    import('./screens/screen-facturacion.js?v=20260930c'),
  ]);
  registerScreen('firma', firma.renderPantallaFirma); setValidator('firma', firma.validarPantallaFirma);
  registerScreen('datos', datos.renderPantallaDatos); setValidator('datos', datos.validarPantallaDatos);
  registerScreen('facturacion', facturacion.renderPantallaFacturacion); setValidator('facturacion', facturacion.validarPantallaFacturacion);
  showScreen(0, { skipScroll: true });
}

export function onNavigate(callback) { onNavigateCb = callback; }
export function detectDevice() {
  const ua = navigator.userAgent.toLowerCase();
  const isTablet = /ipad|android(?!.*mobile)|tablet/.test(ua) || (navigator.maxTouchPoints > 1 && window.innerWidth >= 600 && window.innerWidth <= 1180);
  const isMobile = /iphone|android.*mobile|windows phone/.test(ua);
  return { isTablet, isMobile, isPC: !isTablet && !isMobile };
}
export function formatCelular(value, country = 'EC') {
  const digits = String(value || '').replace(/\D/g, '');
  if (country === 'EC' && digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function prefersReducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function formatDate(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
