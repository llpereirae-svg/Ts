/* wizard.js — Motor de navegación del wizard TurboTax-style.
   Bloque 1: chasís, transiciones, loading, resumen con "Editar" funcional.
   Bloques posteriores rellenan cada pantalla con su lógica real. */

// ---------------- Definición de pantallas ----------------
// El orden importa: define la barra de progreso y los botones siguiente/atrás.
export const SCREENS = [
  { id: 'firma',      label: 'Identidad',      title: 'Términos, firma y RUC',
    eyebrow: 'Paso 1 de 8',
    lead: 'Para registrarte solo necesitas dos archivos: tu firma electrónica (.p12) y tu certificado de RUC (PDF).' },
  { id: 'datos',      label: 'Datos',          title: 'Tus datos',
    eyebrow: 'Paso 2 de 8',
    lead: 'Revisa la información que extrajimos de tu firma y completa lo que falte.' },
  { id: 'token',      label: 'Verificación',   title: 'Verifica tu identidad',
    eyebrow: 'Paso 3 de 8',
    lead: 'Te enviamos un código por correo y otro por SMS. Ingrésalos abajo.' },
  { id: 'tributaria', label: 'Tributaria',     title: 'Información tributaria',
    eyebrow: 'Paso 4 de 8',
    lead: 'Cuéntanos sobre tu régimen y tipo de contribuyente.' },
  { id: 'facturacion',label: 'Facturación',    title: 'Situación de facturación',
    eyebrow: 'Paso 5 de 8',
    lead: '¿Empiezas desde cero o ya venías facturando electrónicamente?' },
  { id: 'clave',      label: 'Clave',          title: 'Crea tu clave',
    eyebrow: 'Paso 6 de 8',
    lead: 'Esta será la clave con la que ingresarás al portal de TributaSoft.' },
  { id: 'logo',       label: 'Logo',           title: 'Tu logo',
    eyebrow: 'Paso 7 de 8 · opcional',
    lead: 'Sube tu logo o generamos uno con tu nombre comercial. Lo puedes saltar.' },
  { id: 'resumen',    label: 'Resumen',        title: 'Revisa tus datos antes de finalizar',
    eyebrow: 'Paso 8 de 8',
    lead: 'Estos son los datos que vamos a registrar. Puedes editar cualquier sección antes de confirmar.' }
];

// Mapa rápido id → índice
const SCREEN_INDEX = new Map(SCREENS.map((s, i) => [s.id, i]));

// ---------------- Estado del wizard ----------------
export const wizardData = {
  // firma
  terminos: false,
  firma: null,       // { archivo, ruc, titular, razonSocial, repLegal, datosExtra... }
  rucManual: '',
  certificadoRuc: null, // { archivo, razonSocial, nombreComercial, provincia, ciudad... }
  // datos
  razonSocial: '',
  nombreComercial: '',
  direccion: '',
  provincia: '',
  ciudad: '',
  email: '',
  celular: '',
  celularPais: 'EC',
  // token (no se persiste el código)
  tokenEmailOk: false,
  tokenSmsOk: false,
  // tributaria
  regimen: '',
  tipoContribuyente: '',
  noResolucion: '',
  // facturacion
  modoFacturacion: 'nuevo', // 'nuevo' | 'continuar'
  codEstablecimiento: '001',
  codPunto: '001',
  nombrePunto: 'Electrónicas',
  secuencias: {},
  // clave
  clave: '',
  // logo
  logoDataUrl: null,
  logoSource: null
};

let currentIdx = 0;
let onNavigateCb = null;   // permite a otros módulos reaccionar al cambio de pantalla
const screenRenderers = new Map(); // id → función que renderiza el cuerpo

// Detectamos una sola vez al cargar el módulo. La duración del loading se
// adapta al tipo de dispositivo: laptop se siente acelerado, móvil/tablet no.
let DEVICE = null;
function getDevice() {
  if (!DEVICE) DEVICE = detectDevice();
  return DEVICE;
}

// ---------------- Detección de dispositivo ----------------
export function detectDevice() {
  const ua = navigator.userAgent.toLowerCase();
  const isTablet = /ipad|android(?!.*mobile)|tablet|playbook|silk/.test(ua) ||
                   (navigator.maxTouchPoints > 1 && window.innerWidth >= 600 && window.innerWidth <= 1180);
  const isMobile = /iphone|android.*mobile|windows phone|blackberry|opera mini/.test(ua);
  return { isTablet, isMobile, isPC: !isTablet && !isMobile };
}

// ---------------- Construcción del DOM ----------------
export function mountWizard(rootEl) {
  rootEl.innerHTML = `
    <div class="wizard" id="wizard">
      <div class="wiz-progress" role="navigation" aria-label="Progreso del registro">
        <div class="wiz-progress-track" id="wiz-progress-track"></div>
      </div>

      <div id="wiz-screens"></div>
    </div>

    <nav class="wiz-nav" id="wiz-nav" aria-label="Navegación del wizard">
      <div class="wiz-nav-inner">
        <button type="button" class="btn btn--ghost" id="wiz-back">Atrás</button>
        <button type="button" class="btn btn--primary" id="wiz-next">Continuar</button>
      </div>
    </nav>

    <div class="wiz-loading" id="wiz-loading" aria-hidden="true">
      <img src="./assets/Logo%20TributaSoft.png" alt="" class="wiz-loading-logo">
      <p class="wiz-loading-text" id="wiz-loading-text">Cargando…</p>
    </div>
  `;

  buildProgress();
  buildScreens();

  document.getElementById('wiz-back').addEventListener('click', goBack);
  document.getElementById('wiz-next').addEventListener('click', goNext);

  document.body.classList.add('wiz-mode');

  // Marca de dispositivo para que el CSS adapte la animación de loading.
  const dev = getDevice();
  if (dev.isPC) document.body.classList.add('is-pc');
  else if (dev.isTablet) document.body.classList.add('is-tablet');
  else if (dev.isMobile) document.body.classList.add('is-mobile');

  // Mostrar primera pantalla
  showScreen(0, { skipAnim: true });
}

function buildProgress() {
  const track = document.getElementById('wiz-progress-track');
  track.innerHTML = SCREENS.map((s, i) => `
    <div class="wiz-step" data-state="pending" data-idx="${i}" data-id="${s.id}">
      <div class="wiz-step-dot">${i + 1}</div>
      <div class="wiz-step-label">${s.label}</div>
    </div>
  `).join('');
}

function buildScreens() {
  const container = document.getElementById('wiz-screens');
  container.innerHTML = SCREENS.map((s) => `
    <section class="wiz-screen" id="wiz-screen-${s.id}" data-id="${s.id}" aria-labelledby="wiz-h-${s.id}">
      <header class="wiz-screen-header">
        <p class="wiz-screen-eyebrow">${s.eyebrow}</p>
        <h2 id="wiz-h-${s.id}">${s.title}</h2>
        <p class="wiz-screen-lead">${s.lead}</p>
      </header>
      <div class="wiz-screen-body" data-body="${s.id}">
        <div class="wiz-placeholder">
          <strong>Pantalla "${s.title}"</strong>
          <span>El contenido se implementa en el siguiente bloque.</span>
        </div>
      </div>
    </section>
  `).join('');
}

// ---------------- API para registrar renderizadores por pantalla ----------------
// En bloques siguientes, cada pantalla llamará a registerScreen('firma', renderFn)
// para inyectar su contenido real dentro de .wiz-screen-body.
export function registerScreen(id, renderFn) {
  screenRenderers.set(id, renderFn);
  // Si la pantalla ya existe, renderizar ahora
  const body = document.querySelector(`[data-body="${id}"]`);
  if (body) {
    body.innerHTML = '';
    renderFn(body, wizardData);
  }
}

// ---------------- Navegación ----------------
export async function goNext() {
  // Validar pantalla actual antes de avanzar
  const ok = await validateCurrent();
  if (!ok) return;

  // Marcar como completada
  const stepEl = document.querySelector(`.wiz-step[data-idx="${currentIdx}"]`);
  if (stepEl) stepEl.dataset.state = 'done';

  if (currentIdx >= SCREENS.length - 1) {
    // Última pantalla = resumen → confirmar
    finishWizard();
    return;
  }
  await transitionTo(currentIdx + 1);
}

export async function goBack() {
  if (currentIdx === 0) return;
  await transitionTo(currentIdx - 1);
}

export async function goTo(idOrIdx) {
  const idx = typeof idOrIdx === 'number' ? idOrIdx : SCREEN_INDEX.get(idOrIdx);
  if (idx == null || idx < 0 || idx >= SCREENS.length) return;
  await transitionTo(idx);
}

async function transitionTo(newIdx) {
  // Transición rápida entre pantallas (sin overlay de loading).
  // El loading overlay queda reservado para operaciones async reales:
  // validar firma .p12, parsear PDF, enviar al backend, etc.
  // Cada pantalla puede llamar showLoading()/hideLoading() manualmente
  // cuando realmente esté esperando algo.
  const currentScreen = document.querySelector('.wiz-screen.is-active');
  if (currentScreen) {
    currentScreen.classList.add('is-leaving');
    await wait(180);
    currentScreen.classList.remove('is-leaving');
  }
  showScreen(newIdx);
}

function showScreen(idx, { skipAnim = false } = {}) {
  // Ocultar todas
  document.querySelectorAll('.wiz-screen').forEach((el) => el.classList.remove('is-active'));

  // Mostrar la nueva
  const screenId = SCREENS[idx].id;
  const screen = document.getElementById(`wiz-screen-${screenId}`);
  screen.classList.add('is-active');

  // Actualizar progress bar
  document.querySelectorAll('.wiz-step').forEach((el, i) => {
    if (i < idx) el.dataset.state = 'done';
    else if (i === idx) el.dataset.state = 'active';
    else el.dataset.state = 'pending';
  });

  // Botones nav
  document.getElementById('wiz-back').disabled = (idx === 0);
  const nextBtn = document.getElementById('wiz-next');
  nextBtn.textContent = (idx === SCREENS.length - 1) ? 'Confirmar y finalizar' : 'Continuar';

  // Re-renderizar el cuerpo si tiene un renderer registrado.
  // Esto permite que cada pantalla recoja los datos más frescos de wizardData
  // (ej: datos auto-llenados desde la firma validada en la pantalla anterior).
  const renderer = screenRenderers.get(screenId);
  if (renderer) {
    const body = document.querySelector(`[data-body="${screenId}"]`);
    if (body) {
      try {
        renderer(body, wizardData);
      } catch (err) {
        console.error(`[wizard] error renderizando pantalla "${screenId}"`, err);
      }
    }
  }

  // El resumen tiene su renderer propio (definido en este módulo)
  if (screenId === 'resumen') renderSummary();

  currentIdx = idx;
  if (onNavigateCb) onNavigateCb(screenId, idx);

  // Scroll al inicio
  window.scrollTo({ top: 0, behavior: skipAnim ? 'auto' : 'smooth' });
}

// ---------------- Validación por pantalla ----------------
// Cada pantalla puede registrar su propio validador con setValidator(id, fn).
// Si no hay validador, se considera válida (placeholder).
const validators = new Map();
export function setValidator(id, fn) { validators.set(id, fn); }

async function validateCurrent() {
  const id = SCREENS[currentIdx].id;
  const fn = validators.get(id);
  if (!fn) return true;
  try {
    return await fn(wizardData);
  } catch (err) {
    console.error('Error validando pantalla', id, err);
    return false;
  }
}

// ---------------- Pantalla de resumen ----------------
function renderSummary() {
  const body = document.querySelector('[data-body="resumen"]');
  if (!body) return;

  const sections = [
    {
      id: 'firma',
      title: 'Firma y RUC',
      rows: [
        ['Términos aceptados', wizardData.terminos ? 'Sí' : '—'],
        ['Firma electrónica', wizardData.firma ? `${wizardData.firma.titular || '—'} (vence ${formatFecha(wizardData.firma.caducidad)})` : '—'],
        ['RUC', wizardData.rucManual || '—'],
        ['Certificado RUC', wizardData.certificadoRuc ? 'Cargado' : '—']
      ]
    },
    {
      id: 'datos',
      title: 'Datos personales',
      rows: [
        ['Razón social', wizardData.razonSocial],
        ['Nombre comercial', wizardData.nombreComercial],
        ['Dirección', wizardData.direccion],
        ['Provincia', wizardData.provincia],
        ['Ciudad', wizardData.ciudad],
        ['Correo electrónico', wizardData.email],
        ['Celular', wizardData.celular ? `+${wizardData.celularPais} ${wizardData.celular}` : '']
      ]
    },
    {
      id: 'token',
      title: 'Verificación',
      rows: [
        ['Email verificado', wizardData.tokenEmailOk ? 'Sí' : '—'],
        ['SMS verificado', wizardData.tokenSmsOk ? 'Sí' : '—']
      ]
    },
    {
      id: 'tributaria',
      title: 'Información tributaria',
      rows: [
        ['Régimen', wizardData.regimen],
        ['Tipo de contribuyente', labelTipoContribuyente(wizardData.tipoContribuyente)],
        ['No. Resolución', wizardData.noResolucion]
      ]
    },
    {
      id: 'facturacion',
      title: 'Facturación',
      rows: [
        ['Modo', wizardData.modoFacturacion === 'nuevo' ? 'Empezar desde cero' : 'Continuar con mi facturación'],
        ['Establecimiento', wizardData.codEstablecimiento],
        ['Punto de emisión', wizardData.codPunto],
        ['Descripción', wizardData.nombrePunto]
      ]
    },
    {
      id: 'clave',
      title: 'Clave del sistema',
      rows: [
        ['Clave', wizardData.clave ? '•'.repeat(wizardData.clave.length) : '—']
      ]
    },
    {
      id: 'logo',
      title: 'Logo',
      rows: [
        ['Logo', wizardData.logoDataUrl ? 'Configurado' : 'No configurado (opcional)']
      ]
    }
  ];

  body.innerHTML = `
    <div class="wiz-summary">
      ${sections.map((sec) => `
        <article class="wiz-summary-card">
          <header class="wiz-summary-card-header">
            <h3 class="wiz-summary-card-title">${sec.title}</h3>
            <button type="button" class="wiz-summary-edit" data-edit="${sec.id}">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              Editar
            </button>
          </header>
          <dl class="wiz-summary-rows">
            ${sec.rows.map(([k, v]) => `
              <dt>${k}</dt>
              <dd>${v && String(v).trim() ? escapeHtml(v) : '<span class="wiz-summary-empty">— sin completar —</span>'}</dd>
            `).join('')}
          </dl>
        </article>
      `).join('')}
    </div>
  `;

  // Wire-up de los botones Editar → vuelve a esa pantalla
  body.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => goTo(btn.dataset.edit));
  });
}

// ---------------- Finalización ----------------
async function finishWizard() {
  showLoading('Creando tu cuenta…');
  await wait(900);
  // Próximamente: envío real al backend con sanitize()
  console.log('[wizard] datos a enviar:', sanitizeForBackend(wizardData));
  hideLoading();
  alert('Bloque 1: aquí iría la confirmación final (en bloque siguiente).');
}

// ---------------- Sanitización para backend ----------------
// UPPERCASE + ñ → NI + sin tildes.
// IMPORTANTE: el reemplazo de Ñ va ANTES de normalize('NFD'), porque la
// normalización descompone Ñ en N + combining-tilde, y el strip de
// combining marks la dejaría como N (perdiendo la regla "año" → "ANIO").
export function sanitizeStr(str) {
  if (str == null) return '';
  return String(str)
    .toUpperCase()
    .replace(/Ñ/g, 'NI')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}
export function sanitizeForBackend(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[k] = sanitizeStr(v);
    else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = sanitizeForBackend(v);
    else out[k] = v;
  }
  return out;
}

// ---------------- Loading overlay ----------------
export function showLoading(msg = 'Cargando…') {
  const ov = document.getElementById('wiz-loading');
  const txt = document.getElementById('wiz-loading-text');
  if (txt) txt.textContent = msg;
  ov.classList.add('is-active');
  ov.setAttribute('aria-hidden', 'false');
}
export function hideLoading() {
  const ov = document.getElementById('wiz-loading');
  ov.classList.remove('is-active');
  ov.setAttribute('aria-hidden', 'true');
}

// ---------------- Helpers ----------------
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFecha(d) {
  if (!d) return '—';
  try {
    const dt = (d instanceof Date) ? d : new Date(d);
    return dt.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

function labelTipoContribuyente(t) {
  const map = {
    NO_OBLIGADO: 'No obligado a llevar contabilidad',
    OBLIGADO: 'Obligado a llevar contabilidad',
    AGENTE_RETENCION: 'Agente de Retención',
    CONTRIBUYENTE_ESPECIAL: 'Contribuyente Especial',
    GRAN_CONTRIBUYENTE: 'Gran Contribuyente'
  };
  return map[t] || t || '';
}

// ---------------- Auto-arranque ----------------
export async function startWizard() {
  const root = document.getElementById('wizard-root');
  if (!root) {
    console.error('[wizard] no se encontró #wizard-root en el DOM');
    return;
  }
  mountWizard(root);

  // Cargar e instalar las pantallas con contenido real.
  // Cada bloque del rewrite agrega más imports aquí.
  try {
    const [firmaMod, datosMod, tokenMod, tribMod] = await Promise.all([
      import('./screen-firma.js?v=20260516s'),
      import('./screen-datos.js?v=20260516s'),
      import('./screen-token.js?v=20260516s'),
      import('./screen-tributaria.js?v=20260516s'),
    ]);
    registerScreen('firma', firmaMod.renderPantallaFirma);
    setValidator('firma', firmaMod.validarPantallaFirma);

    registerScreen('datos', datosMod.renderPantallaDatos);
    setValidator('datos', datosMod.validarPantallaDatos);

    registerScreen('token', tokenMod.renderPantallaToken);
    setValidator('token', tokenMod.validarPantallaToken);

    registerScreen('tributaria', tribMod.renderPantallaTributaria);
    setValidator('tributaria', tribMod.validarPantallaTributaria);
  } catch (err) {
    console.error('[wizard] error cargando pantallas', err);
  }
}

// API pública para que otros módulos hagan callback al cambiar de pantalla
export function onNavigate(fn) { onNavigateCb = fn; }
