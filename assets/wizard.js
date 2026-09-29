/* Orquestador del registro 300 documentos gratis — cinco etapas. */

export const SCREENS = [
  { id: 'firma', label: 'Firma', title: 'Comencemos con tu firma electrónica', eyebrow: 'Paso 1 de 5', lead: 'La procesamos dentro de este navegador; la clave y el archivo no se guardan ni se envían.' },
  { id: 'datos', label: 'Datos', title: 'Confirma tus datos', eyebrow: 'Paso 2 de 5', lead: 'Consultamos tu RUC mediante el servidor de TributaSoft y completamos lo que esté disponible.' },
  { id: 'token', label: 'Correo', title: 'Verifica tu correo', eyebrow: 'Paso 3 de 5', lead: 'Usaremos este correo para confirmar el registro y enviarte las instrucciones de acceso.' },
  { id: 'facturacion', label: 'Facturación', title: 'Información de facturación', eyebrow: 'Paso 4 de 5', lead: 'Cuéntanos si ya has emitido comprobantes electrónicos anteriormente.' },
  { id: 'resumen', label: 'Revisión', title: 'Revisa y crea tu cuenta', eyebrow: 'Paso 5 de 5', lead: 'Confirma que todo esté correcto. Puedes editar cualquier sección antes de continuar.' },
];

const SCREEN_INDEX = new Map(SCREENS.map((screen, index) => [screen.id, index]));
const renderers = new Map();
const validators = new Map();
let currentIdx = 0;
let onNavigateCb = null;

export const wizardData = {
  terminos: false, firma: null, rucManual: '', sriStatus: 'PENDING', sriValidacionPendiente: false, sriAdvertencias: [],
  razonSocial: '', nombreComercial: '', actividadEconomica: '', estadoContribuyenteRuc: '', representanteLegal: null,
  regimen: '', tipoContribuyente: '', noResolucion: '', direccion: '', provincia: '', ciudad: '',
  email: '', celular: '', celularPais: 'EC', tokenEmailOk: false,
  modoFacturacion: 'nuevo', codEstablecimiento: '001', codPunto: '001', nombrePunto: 'Electrónicas', secuencias: {},
};

export function mountWizard(root) {
  root.innerHTML = `
    <div class="wizard" id="wizard">
      <div class="wiz-progress" aria-label="Progreso del registro">
        <div class="wiz-progress-copy"><span id="wiz-progress-label">Paso 1 de 5</span><strong id="wiz-progress-title">Firma</strong></div>
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
        <p class="wiz-screen-eyebrow">${screen.eyebrow}</p>
        <h2 id="wiz-h-${screen.id}">${screen.title}</h2>
        <p class="wiz-screen-lead">${screen.lead}</p>
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
  if (body) renderer(body, wizardData);
}
export function setValidator(id, validator) { validators.set(id, validator); }

export async function goNext() {
  const validator = validators.get(SCREENS[currentIdx].id);
  if (validator && !(await validator(wizardData))) return;
  if (currentIdx === SCREENS.length - 1) return finishWizard();
  await transitionTo(currentIdx + 1);
}
export async function goBack() { if (currentIdx > 0) await transitionTo(currentIdx - 1); }
export async function goTo(idOrIndex) {
  const index = typeof idOrIndex === 'number' ? idOrIndex : SCREEN_INDEX.get(idOrIndex);
  if (Number.isInteger(index) && index >= 0 && index < SCREENS.length) await transitionTo(index);
}

async function transitionTo(index) {
  const active = document.querySelector('.wiz-screen.is-active');
  if (active) { active.classList.add('is-leaving'); await wait(190); }
  showScreen(index);
}

function showScreen(index, { skipScroll = false } = {}) {
  document.querySelectorAll('.wiz-screen').forEach((screen) => screen.classList.remove('is-active', 'is-leaving'));
  const config = SCREENS[index];
  const screen = document.getElementById(`wiz-screen-${config.id}`);
  screen.classList.add('is-active');
  document.querySelectorAll('.wiz-step').forEach((step, i) => { step.dataset.state = i < index ? 'done' : i === index ? 'active' : 'pending'; });
  document.getElementById('wiz-progress-label').textContent = `Paso ${index + 1} de ${SCREENS.length}`;
  document.getElementById('wiz-progress-title').textContent = config.label;
  document.getElementById('wiz-progress-fill').style.width = `${((index + 1) / SCREENS.length) * 100}%`;
  document.getElementById('wiz-back').disabled = index === 0;
  document.getElementById('wiz-next').textContent = index === SCREENS.length - 1 ? 'Crear mi cuenta' : 'Continuar';

  const body = document.querySelector(`[data-body="${config.id}"]`);
  renderers.get(config.id)?.(body, wizardData);
  if (config.id === 'resumen') renderSummary(body);
  currentIdx = index;
  onNavigateCb?.(config.id, index);
  if (!skipScroll) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  setTimeout(() => screen.querySelector('input, button, select, textarea')?.focus({ preventScroll: true }), 220);
}

function renderSummary(body) {
  const representative = wizardData.representanteLegal;
  const repName = representative && typeof representative === 'object'
    ? (representative.nombre || representative.nombreCompleto || representative.razonSocial || '') : '';
  const sections = [
    { id: 'firma', title: 'Identidad', rows: [['Titular', wizardData.firma?.titular || wizardData.razonSocial], ['RUC', wizardData.rucManual], ['Firma válida hasta', formatDate(wizardData.firma?.fechaCaducidad || wizardData.firma?.caducidad)]] },
    { id: 'datos', title: 'Datos tributarios', rows: [['Razón social', wizardData.razonSocial], ['Estado', wizardData.estadoContribuyenteRuc || 'Validación pendiente'], ['Actividad', wizardData.actividadEconomica], ['Régimen', wizardData.regimen], ...(repName ? [['Representante legal', repName]] : [])] },
    { id: 'datos', title: 'Contacto', rows: [['Correo', wizardData.email], ['Celular', wizardData.celular]] },
    { id: 'facturacion', title: 'Facturación', rows: [['Experiencia previa', wizardData.modoFacturacion === 'continuar' ? 'Sí, ya emitía comprobantes' : 'No, empezaré ahora'], ['Establecimiento / punto', `${wizardData.codEstablecimiento}-${wizardData.codPunto}`]] },
  ];
  body.innerHTML = `
    ${wizardData.sriValidacionPendiente ? '<div class="status-callout status-callout--warning" role="status"><strong>Validación SRI pendiente</strong><span>El servicio no estuvo disponible. El backend debe validar estos datos antes del alta definitiva.</span></div>' : ''}
    <div class="wiz-summary">${sections.map((section) => `<article class="wiz-summary-card">
      <header class="wiz-summary-card-header"><h3>${section.title}</h3><button type="button" class="wiz-summary-edit" data-edit="${section.id}">Editar</button></header>
      <dl class="wiz-summary-rows">${section.rows.map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value || '—')}</dd>`).join('')}</dl>
    </article>`).join('')}</div>`;
  body.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => goTo(button.dataset.edit)));
}

async function finishWizard() {
  showLoading('Preparando tu registro…');
  try {
    const { validateAntiBot } = await import('./utils/anti-bot.js?v=20260929a');
    if (!validateAntiBot().ok) throw new Error('No pudimos validar la sesión. Recarga la página e intenta de nuevo.');
    const { crearRegistro } = await import('./services/registration-service.js?v=20260929a');
    const result = await crearRegistro(buildRegistrationPayload());
    hideLoading(); renderSuccess(result.demo);
  } catch (error) { hideLoading(); showFormError(error?.message || 'No pudimos completar el registro. Intenta de nuevo.'); }
}

function buildRegistrationPayload() {
  return {
    ruc: wizardData.rucManual, razonSocial: wizardData.razonSocial, nombreComercial: wizardData.nombreComercial,
    estadoContribuyenteRuc: wizardData.estadoContribuyenteRuc, actividadEconomica: wizardData.actividadEconomica,
    regimen: wizardData.regimen, tipoContribuyente: wizardData.tipoContribuyente, representanteLegal: wizardData.representanteLegal,
    email: wizardData.email, celular: wizardData.celular,
    facturacion: { modo: wizardData.modoFacturacion, establecimiento: wizardData.codEstablecimiento, puntoEmision: wizardData.codPunto, secuencias: wizardData.secuencias },
    firma: wizardData.firma ? { titular: wizardData.firma.titular, ruc: wizardData.firma.ruc, caducidad: wizardData.firma.fechaCaducidad || wizardData.firma.caducidad, esJuridica: wizardData.firma.esJuridica } : null,
    terminosAceptados: wizardData.terminos, validacionSriPendiente: wizardData.sriValidacionPendiente,
  };
}

function renderSuccess(demo) {
  document.getElementById('wizard-root').innerHTML = `<section class="wiz-success"><span class="wiz-success-check" aria-hidden="true">✓</span><p class="wiz-screen-eyebrow">Registro completado</p><h2>${demo ? 'Tu solicitud quedó preparada' : 'Tu cuenta fue creada'}</h2><p>${demo ? 'Esta versión local no envía datos ni crea cuentas reales. El contrato de alta está listo para conectarse al backend.' : `Enviamos la confirmación a <strong>${escapeHtml(wizardData.email)}</strong>.`}</p></section>`;
  document.getElementById('wiz-nav')?.remove();
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
  const { startSession } = await import('./utils/anti-bot.js?v=20260929a'); startSession();
  const [firma, datos, token, facturacion] = await Promise.all([
    import('./screens/screen-firma.js?v=20260929a'), import('./screens/screen-datos.js?v=20260929a'),
    import('./screens/screen-token.js?v=20260929a'), import('./screens/screen-facturacion.js?v=20260929a'),
  ]);
  registerScreen('firma', firma.renderPantallaFirma); setValidator('firma', firma.validarPantallaFirma);
  registerScreen('datos', datos.renderPantallaDatos); setValidator('datos', datos.validarPantallaDatos);
  registerScreen('token', token.renderPantallaToken); setValidator('token', token.validarPantallaToken);
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
