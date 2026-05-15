// manual.js — Manual interactivo de TributaSoft.
// - Modal full-screen con tabs por proceso.
// - Animaciones nativas (cursor virtual, typing effect, click pulse).
// - Persistencia del progreso en localStorage.
// - Popup contextual de ayuda al cursor sobre errores.
// - Generación del manual estático en PDF (Roboto Condensed embebida).

import { MANUAL, ERROR_TO_MANUAL, FIELD_TO_MANUAL } from './manual-data.js?v=20260514y';

// =========================================================================
// Helpers DOM y animación
// =========================================================================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let _animAbort = null;     // Token para cancelar animaciones en curso
let _currentProceso = 'registro';
let _currentStepIdx = 0;
let _autoplayPaused = false;

// Cursor virtual común — se mueve dentro del stage de animaciones.
function moveCursor(cursor, target, duration = 700) {
  if (!cursor || !target) return Promise.resolve();
  const targetRect = target.getBoundingClientRect();
  const stageRect = cursor.parentElement.getBoundingClientRect();
  const x = targetRect.left + targetRect.width / 2 - stageRect.left;
  const y = targetRect.top + targetRect.height / 2 - stageRect.top;
  cursor.style.transition = `transform ${duration}ms cubic-bezier(.42,0,.4,1)`;
  cursor.style.transform = `translate(${x}px, ${y}px)`;
  return wait(duration);
}

// Typing effect — escribe `text` letra por letra en `input`.
async function typeText(input, text, msPerChar = 70, signal) {
  input.value = '';
  for (let i = 0; i < text.length; i++) {
    if (signal?.aborted) return;
    input.value += text[i];
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(msPerChar);
  }
}

// Click pulse — anima un botón como si lo presionaran.
async function clickPulse(btn) {
  if (!btn) return;
  btn.classList.add('mock-clicked');
  await wait(200);
  btn.classList.remove('mock-clicked');
  btn.classList.add('mock-clicked-after');
  await wait(180);
  btn.classList.remove('mock-clicked-after');
}

// Pulso de éxito sobre un elemento (verde, 3 ondas).
async function successPulse(el) {
  if (!el) return;
  el.classList.add('mock-success');
  await wait(700);
}

// Aborta cualquier animación en curso.
function abortCurrentAnim() {
  if (_animAbort) { _animAbort.abort(); _animAbort = null; }
}

// =========================================================================
// Mock UI — fragmentos HTML que imitan al producto real (mismos colores,
// tipografía y espaciados que la landing).
// =========================================================================
const MOCK = {
  rucCard: () => `
    <div class="mock mock-rcard">
      <div class="mock-label">INGRESA TU RUC PARA EMPEZAR</div>
      <input class="mock-input mock-ruc" data-anim="rucInput" readonly placeholder="0000000000001">
      <p class="mock-help">El RUC debe tener 13 dígitos y terminar en 001.</p>
      <button class="mock-btn mock-btn--cta" data-anim="rucBtn">Continuar</button>
    </div>
  `,
  datosCard: () => `
    <div class="mock mock-form">
      <div class="mock-form-header">Completa tus datos</div>
      <div class="mock-row"><span class="mock-flabel">Razón social</span><input class="mock-input mock-tiny" data-anim="razon" readonly></div>
      <div class="mock-row"><span class="mock-flabel">Email</span><input class="mock-input mock-tiny" data-anim="email" readonly></div>
      <div class="mock-row"><span class="mock-flabel">Celular</span><input class="mock-input mock-tiny" data-anim="celular" readonly></div>
      <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="datosBtn">Registrarse</button>
    </div>
  `,
  tokenCard: () => `
    <div class="mock mock-token">
      <div class="mock-token-title">Verifica tu código</div>
      <div class="mock-token-sub">Te enviamos un código a <strong>tu@email.com</strong></div>
      <div class="mock-codigo">
        ${[1,2,3,4,5,6].map((i) => `<input class="mock-cdig" data-anim="d${i}" readonly>`).join('')}
      </div>
      <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="tokenBtn">Verificar</button>
    </div>
  `,
  claveCard: () => `
    <div class="mock mock-form">
      <div class="mock-form-header">Crea tu clave</div>
      <div class="mock-row"><span class="mock-flabel">Clave</span><input class="mock-input mock-tiny" type="password" data-anim="clave" readonly></div>
      <div class="mock-bar" data-anim="bar"><div class="mock-bar-fill" data-anim="barFill"></div></div>
      <p class="mock-bar-label">Nivel de seguridad: <strong data-anim="barLabel">Baja</strong></p>
      <div class="mock-row"><span class="mock-flabel">Confirmar</span><input class="mock-input mock-tiny" type="password" data-anim="claveConf" readonly></div>
      <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="claveBtn">Continuar</button>
    </div>
  `,
  firmaCard: () => `
    <div class="mock mock-firma">
      <div class="mock-form-header">Sube tu firma electrónica</div>
      <p class="mock-help mock-help--center">Aceptamos .p12 o .pfx. La clave nunca sale del navegador.</p>
      <div class="mock-firma-options">
        <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="firmaUp">Sí, subirla ahora</button>
        <button class="mock-btn mock-btn--ghost mock-btn--small" data-anim="firmaPostpone">Lo haré después</button>
        <button class="mock-btn mock-btn--wa mock-btn--small" data-anim="firmaWA">No tengo firma</button>
      </div>
      <div class="mock-firma-result" data-anim="firmaResult" hidden>
        <div class="mock-firma-row"><span>Titular</span><strong>Lenin Pereira</strong></div>
        <div class="mock-firma-row"><span>RUC</span><strong>1792060346001</strong></div>
        <div class="mock-firma-row"><span>Caducidad</span><strong>25/09/2029</strong></div>
      </div>
    </div>
  `,
  logoCard: () => `
    <div class="mock mock-firma">
      <div class="mock-form-header">Tu logo (opcional)</div>
      <div class="mock-logo-options">
        <button class="mock-btn mock-btn--ghost mock-btn--small" data-anim="logoUp">Subir mi logo</button>
        <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="logoGen">Generar uno</button>
      </div>
      <div class="mock-banner-wrap" data-anim="bannerWrap" hidden>
        <div class="mock-banner" data-anim="banner"></div>
      </div>
    </div>
  `,
  confirmCard: () => `
    <div class="mock mock-firma">
      <div class="mock-form-header">Estás a punto de finalizar</div>
      <p class="mock-help">Una vez confirmes, creamos tu cuenta y te llevamos al portal.</p>
      <div class="mock-confirm-user">Tu usuario será: <strong data-anim="user">—</strong></div>
      <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="confirmBtn">Confirmar y continuar</button>
    </div>
  `,
  cotizadorCard: () => `
    <div class="mock mock-cot">
      <div class="mock-form-header">Cotizador TributaSoft</div>
      <div class="mock-row"><span class="mock-flabel">RUC / ID</span><input class="mock-input mock-tiny" value="0999999999001" readonly></div>
      <div class="mock-row"><span class="mock-flabel">Documentos por mes</span><input class="mock-input mock-tiny" data-anim="cotDocs" readonly></div>
      <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="cotBtn">Calcular</button>
      <div class="mock-cot-resumen" data-anim="cotResumen" hidden>
        <div class="mock-cot-row"><span>Documentos por año</span><strong data-anim="cotAnual">—</strong></div>
        <div class="mock-cot-row"><span>Subtotal</span><strong data-anim="cotSub">—</strong></div>
        <div class="mock-cot-row"><span>IVA (15%)</span><strong data-anim="cotIVA">—</strong></div>
        <div class="mock-cot-row mock-cot-row--total"><span>Total</span><strong data-anim="cotTotal">—</strong></div>
        <button class="mock-btn mock-btn--ghost mock-btn--small" data-anim="cotPdf">Descargar PDF</button>
      </div>
    </div>
  `,
  contratarCard: () => `
    <div class="mock mock-firma">
      <div class="mock-form-header">Confirma tu RUC</div>
      <p class="mock-help mock-help--center">Validamos que tu RUC esté registrado en TributaSoft.</p>
      <div class="mock-row"><span class="mock-flabel">RUC</span><input class="mock-input mock-tiny" data-anim="contRuc" readonly placeholder="0000000000001"></div>
      <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="contBtn">Validar y continuar</button>
      <p class="mock-help mock-cont-result" data-anim="contResult" hidden style="color:#2E7A95">✓ Empresa encontrada: <strong>TributaSoft S.A.</strong></p>
    </div>
  `,
  pagoCard: () => `
    <div class="mock mock-form">
      <div class="mock-form-header">Confirma tu pago</div>
      <div class="mock-row"><span class="mock-flabel">Banco</span><input class="mock-input mock-tiny" data-anim="pBanco" readonly></div>
      <div class="mock-row"><span class="mock-flabel">Fecha</span><input class="mock-input mock-tiny" data-anim="pFecha" readonly></div>
      <div class="mock-row"><span class="mock-flabel">Forma</span><input class="mock-input mock-tiny" data-anim="pForma" readonly></div>
      <div class="mock-row"><span class="mock-flabel">Comprobante</span><div class="mock-file" data-anim="pFile">Sin archivo</div></div>
      <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="pBtn">Enviar pago</button>
    </div>
  `,
};

// =========================================================================
// Renderers — uno por cada animKey. Reciben el stage del modal y el AbortSignal.
// =========================================================================

const RENDERERS = {
  // ---------------- REGISTRO -----------------
  ruc: async (stage, signal) => {
    stage.innerHTML = MOCK.rucCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const input = stage.querySelector('[data-anim="rucInput"]');
    const btn = stage.querySelector('[data-anim="rucBtn"]');
    await wait(400);
    await moveCursor(cursor, input);
    if (signal?.aborted) return;
    input.classList.add('mock-focused');
    await typeText(input, '1792060346001', 60, signal);
    if (signal?.aborted) return;
    input.classList.remove('mock-focused');
    await wait(300);
    await moveCursor(cursor, btn);
    if (signal?.aborted) return;
    await clickPulse(btn);
    await successPulse(input);
  },

  datos: async (stage, signal) => {
    stage.innerHTML = MOCK.datosCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const fields = ['razon', 'email', 'celular'];
    const values = ['TRIBUTASOFT S.A.', 'ventas@empresa.ec', '0998765432'];
    for (let i = 0; i < fields.length; i++) {
      if (signal?.aborted) return;
      const f = stage.querySelector(`[data-anim="${fields[i]}"]`);
      await moveCursor(cursor, f, 500);
      f.classList.add('mock-focused');
      await typeText(f, values[i], 35, signal);
      f.classList.remove('mock-focused');
      await wait(150);
    }
    const btn = stage.querySelector('[data-anim="datosBtn"]');
    await moveCursor(cursor, btn);
    await clickPulse(btn);
  },

  token: async (stage, signal) => {
    stage.innerHTML = MOCK.tokenCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const codigo = '123456';
    for (let i = 1; i <= 6; i++) {
      if (signal?.aborted) return;
      const d = stage.querySelector(`[data-anim="d${i}"]`);
      await moveCursor(cursor, d, 250);
      d.classList.add('mock-focused');
      d.value = codigo[i - 1];
      d.classList.add('mock-cdig-filled');
      await wait(150);
      d.classList.remove('mock-focused');
    }
    const btn = stage.querySelector('[data-anim="tokenBtn"]');
    await moveCursor(cursor, btn);
    await clickPulse(btn);
    stage.querySelectorAll('.mock-cdig').forEach((d) => d.classList.add('mock-success'));
  },

  clave: async (stage, signal) => {
    stage.innerHTML = MOCK.claveCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const inp = stage.querySelector('[data-anim="clave"]');
    const conf = stage.querySelector('[data-anim="claveConf"]');
    const fill = stage.querySelector('[data-anim="barFill"]');
    const label = stage.querySelector('[data-anim="barLabel"]');

    await moveCursor(cursor, inp);
    inp.classList.add('mock-focused');
    // Tipear "Tributa$2026!" — fuerza Alta
    const clave = 'Tributa$2026!';
    for (let i = 0; i < clave.length; i++) {
      if (signal?.aborted) return;
      inp.value = '•'.repeat(i + 1);
      // Actualizar barra: simular crecimiento
      const pct = ((i + 1) / clave.length) * 100;
      fill.style.width = pct + '%';
      if (pct < 33)      { fill.style.background = '#ff931e'; label.textContent = 'Baja'; label.style.color = '#c95e02'; }
      else if (pct < 66) { fill.style.background = '#c9dee9'; label.textContent = 'Media'; label.style.color = '#2E7A95'; }
      else               { fill.style.background = '#42A2BC'; label.textContent = 'Alta'; label.style.color = '#1E5666'; }
      await wait(70);
    }
    inp.classList.remove('mock-focused');
    await wait(200);
    await moveCursor(cursor, conf);
    conf.classList.add('mock-focused');
    for (let i = 0; i < clave.length; i++) {
      if (signal?.aborted) return;
      conf.value = '•'.repeat(i + 1);
      await wait(60);
    }
    conf.classList.remove('mock-focused');
    const btn = stage.querySelector('[data-anim="claveBtn"]');
    await moveCursor(cursor, btn);
    await clickPulse(btn);
  },

  firma: async (stage, signal) => {
    stage.innerHTML = MOCK.firmaCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const upBtn = stage.querySelector('[data-anim="firmaUp"]');
    await moveCursor(cursor, upBtn);
    if (signal?.aborted) return;
    await clickPulse(upBtn);
    await wait(400);
    const result = stage.querySelector('[data-anim="firmaResult"]');
    result.hidden = false;
    result.classList.add('mock-success');
  },

  logo: async (stage, signal) => {
    stage.innerHTML = MOCK.logoCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const genBtn = stage.querySelector('[data-anim="logoGen"]');
    await moveCursor(cursor, genBtn);
    if (signal?.aborted) return;
    await clickPulse(genBtn);
    await wait(300);
    const wrap = stage.querySelector('[data-anim="bannerWrap"]');
    const banner = stage.querySelector('[data-anim="banner"]');
    wrap.hidden = false;
    banner.style.background = 'linear-gradient(180deg, #87C7DC 0 6px, #fff 6px calc(100% - 6px), #EF7306 calc(100% - 6px) 100%)';
    banner.innerHTML = '<span style="font-family:Lobster,cursive;color:#00236f;font-size:36px">Lenin Pereira</span>';
  },

  confirm: async (stage, signal) => {
    stage.innerHTML = MOCK.confirmCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const userEl = stage.querySelector('[data-anim="user"]');
    userEl.textContent = '1792060346';
    await wait(400);
    const btn = stage.querySelector('[data-anim="confirmBtn"]');
    await moveCursor(cursor, btn);
    if (signal?.aborted) return;
    await clickPulse(btn);
    await successPulse(btn);
  },

  // ---------------- COTIZACIÓN ---------------
  cotOpen: async (stage, signal) => {
    stage.innerHTML = `
      <div class="mock mock-pill-target">
        <div class="mock-pill" data-anim="pill">📄 Cotizar</div>
      </div>
      <div class="mock-cursor" data-anim="cursor"></div>
    `;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const pill = stage.querySelector('[data-anim="pill"]');
    await wait(400);
    await moveCursor(cursor, pill);
    if (signal?.aborted) return;
    await clickPulse(pill);
  },

  cotVol: async (stage, signal) => {
    stage.innerHTML = MOCK.cotizadorCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const inp = stage.querySelector('[data-anim="cotDocs"]');
    await moveCursor(cursor, inp);
    inp.classList.add('mock-focused');
    await typeText(inp, '100', 100, signal);
    inp.classList.remove('mock-focused');
  },

  cotCalc: async (stage, signal) => {
    stage.innerHTML = MOCK.cotizadorCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const inp = stage.querySelector('[data-anim="cotDocs"]');
    inp.value = '100';
    const btn = stage.querySelector('[data-anim="cotBtn"]');
    await moveCursor(cursor, btn);
    if (signal?.aborted) return;
    await clickPulse(btn);
    await wait(300);
    const r = stage.querySelector('[data-anim="cotResumen"]');
    r.hidden = false;
    stage.querySelector('[data-anim="cotAnual"]').textContent = '1,200';
    stage.querySelector('[data-anim="cotSub"]').textContent = '$246.00';
    stage.querySelector('[data-anim="cotIVA"]').textContent = '$36.90';
    stage.querySelector('[data-anim="cotTotal"]').textContent = '$282.90';
    await successPulse(r);
  },

  cotPdf: async (stage, signal) => {
    stage.innerHTML = MOCK.cotizadorCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    stage.querySelector('[data-anim="cotDocs"]').value = '100';
    const r = stage.querySelector('[data-anim="cotResumen"]');
    r.hidden = false;
    stage.querySelector('[data-anim="cotAnual"]').textContent = '1,200';
    stage.querySelector('[data-anim="cotSub"]').textContent = '$246.00';
    stage.querySelector('[data-anim="cotIVA"]').textContent = '$36.90';
    stage.querySelector('[data-anim="cotTotal"]').textContent = '$282.90';
    await wait(300);
    const pdf = stage.querySelector('[data-anim="cotPdf"]');
    await moveCursor(cursor, pdf);
    if (signal?.aborted) return;
    await clickPulse(pdf);
    await successPulse(pdf);
  },

  // ---------------- CONTRATACIÓN -------------
  contQuote: async (stage, signal) => {
    stage.innerHTML = MOCK.cotizadorCard();
    const r = stage.querySelector('[data-anim="cotResumen"]');
    r.hidden = false;
    stage.querySelector('[data-anim="cotDocs"]').value = '100';
    stage.querySelector('[data-anim="cotAnual"]').textContent = '1,200';
    stage.querySelector('[data-anim="cotSub"]').textContent = '$246.00';
    stage.querySelector('[data-anim="cotIVA"]').textContent = '$36.90';
    stage.querySelector('[data-anim="cotTotal"]').textContent = '$282.90';
  },

  contClick: async (stage, signal) => {
    stage.innerHTML = `
      <div class="mock mock-firma">
        <div class="mock-form-header">Resumen</div>
        <div class="mock-cot-row mock-cot-row--total"><span>Total anual</span><strong>$282.90</strong></div>
        <div class="mock-firma-options">
          <button class="mock-btn mock-btn--ghost mock-btn--small">Refrescar</button>
          <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="contratarBtn">Contratar</button>
        </div>
      </div>
      <div class="mock-cursor" data-anim="cursor"></div>
    `;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const btn = stage.querySelector('[data-anim="contratarBtn"]');
    await wait(400);
    await moveCursor(cursor, btn);
    if (signal?.aborted) return;
    await clickPulse(btn);
  },

  contRuc: async (stage, signal) => {
    stage.innerHTML = MOCK.contratarCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const inp = stage.querySelector('[data-anim="contRuc"]');
    await moveCursor(cursor, inp);
    inp.classList.add('mock-focused');
    await typeText(inp, '0992703601001', 60, signal);
    inp.classList.remove('mock-focused');
    const btn = stage.querySelector('[data-anim="contBtn"]');
    await moveCursor(cursor, btn);
    if (signal?.aborted) return;
    await clickPulse(btn);
    await wait(400);
    const ok = stage.querySelector('[data-anim="contResult"]');
    ok.hidden = false;
  },

  contPago: async (stage, signal) => {
    stage.innerHTML = MOCK.pagoCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const banco = stage.querySelector('[data-anim="pBanco"]');
    const fecha = stage.querySelector('[data-anim="pFecha"]');
    const forma = stage.querySelector('[data-anim="pForma"]');
    const file = stage.querySelector('[data-anim="pFile"]');

    await moveCursor(cursor, banco);
    banco.classList.add('mock-focused');
    await typeText(banco, 'Banco Pichincha C.A.', 30, signal);
    banco.classList.remove('mock-focused');

    await moveCursor(cursor, fecha, 400);
    fecha.classList.add('mock-focused');
    await typeText(fecha, '2026-05-14', 50, signal);
    fecha.classList.remove('mock-focused');

    await moveCursor(cursor, forma, 400);
    forma.classList.add('mock-focused');
    await typeText(forma, 'Transferencia', 40, signal);
    forma.classList.remove('mock-focused');

    await moveCursor(cursor, file, 400);
    if (signal?.aborted) return;
    await clickPulse(file);
    file.textContent = 'comprobante.pdf · 245 KB';
    file.classList.add('mock-file--ok');
  },

  contEnviar: async (stage, signal) => {
    stage.innerHTML = MOCK.pagoCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    stage.querySelector('[data-anim="pBanco"]').value = 'Banco Pichincha C.A.';
    stage.querySelector('[data-anim="pFecha"]').value = '2026-05-14';
    stage.querySelector('[data-anim="pForma"]').value = 'Transferencia';
    const file = stage.querySelector('[data-anim="pFile"]');
    file.textContent = 'comprobante.pdf · 245 KB';
    file.classList.add('mock-file--ok');
    const btn = stage.querySelector('[data-anim="pBtn"]');
    await wait(300);
    await moveCursor(cursor, btn);
    if (signal?.aborted) return;
    await clickPulse(btn);
    await successPulse(btn);
  },
};

// =========================================================================
// UI del manual — modal con tabs + stage + nav
// =========================================================================

function buildManualModal() {
  if ($('#modal-manual')) return;
  const dlg = document.createElement('dialog');
  dlg.id = 'modal-manual';
  dlg.className = 'manual-modal';
  dlg.innerHTML = `
    <div class="manual-shell">
      <header class="manual-header">
        <h2 class="manual-title">Manual interactivo de TributaSoft</h2>
        <button class="manual-pdf-btn" id="manual-download-pdf" type="button" title="Descargar manual en PDF">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          PDF
        </button>
        <button class="manual-close" id="manual-close" type="button" aria-label="Cerrar">×</button>
      </header>
      <nav class="manual-tabs" role="tablist">
        ${Object.entries(MANUAL).map(([key, p]) => `
          <button role="tab" class="manual-tab" data-proceso="${key}">
            <span class="manual-tab-label">${p.label}</span>
            <span class="manual-tab-count">${p.steps.length} pasos</span>
          </button>
        `).join('')}
      </nav>
      <div class="manual-body">
        <aside class="manual-sidebar">
          <div class="manual-sidebar-intro">
            <h3 id="manual-proc-title"></h3>
            <p id="manual-proc-desc"></p>
          </div>
          <ol class="manual-step-list" id="manual-step-list"></ol>
        </aside>
        <main class="manual-main">
          <div class="manual-stage-wrap">
            <div class="manual-stage" id="manual-stage"></div>
            <button class="manual-replay" id="manual-replay" title="Volver a reproducir">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              Reproducir de nuevo
            </button>
          </div>
          <div class="manual-content">
            <div class="manual-step-head">
              <span class="manual-step-num" id="manual-step-num">Paso 1 de 7</span>
              <h2 class="manual-step-title" id="manual-step-title"></h2>
            </div>
            <p class="manual-step-intro" id="manual-step-intro"></p>
            <div class="manual-section">
              <h4>Reglas</h4>
              <ul class="manual-rules" id="manual-rules"></ul>
            </div>
            <div class="manual-section manual-section--errors">
              <h4>Si algo falla</h4>
              <ul class="manual-errors" id="manual-errors"></ul>
            </div>
            <div class="manual-section manual-tip" id="manual-tip-wrap">
              <span class="manual-tip-icon">💡</span>
              <p id="manual-tip"></p>
            </div>
          </div>
        </main>
      </div>
      <footer class="manual-footer">
        <button class="manual-prev" id="manual-prev" type="button">← Anterior</button>
        <div class="manual-progress">
          <div class="manual-progress-bar"><div class="manual-progress-fill" id="manual-progress-fill"></div></div>
          <span class="manual-progress-text" id="manual-progress-text">0%</span>
        </div>
        <button class="manual-next" id="manual-next" type="button">Siguiente →</button>
      </footer>
    </div>
  `;
  document.body.appendChild(dlg);

  // Wire eventos
  $('#manual-close').addEventListener('click', () => closeManual());
  $('#manual-prev').addEventListener('click', () => goPrev());
  $('#manual-next').addEventListener('click', () => goNext());
  $('#manual-replay').addEventListener('click', () => playCurrent());
  $('#manual-download-pdf').addEventListener('click', () => descargarManualPDF());
  $$('#modal-manual .manual-tab').forEach((t) => {
    t.addEventListener('click', () => switchProceso(t.dataset.proceso));
  });
  // Click en backdrop cierra
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closeManual();
  });
  // Click en step de la sidebar salta
  $('#manual-step-list').addEventListener('click', (e) => {
    const li = e.target.closest('[data-step-idx]');
    if (li) jumpToStep(parseInt(li.dataset.stepIdx, 10));
  });
}

function renderSidebar(proceso) {
  const p = MANUAL[proceso];
  $('#manual-proc-title').textContent = p.title;
  $('#manual-proc-desc').textContent = p.description;
  $('#manual-step-list').innerHTML = p.steps.map((s, i) => `
    <li data-step-idx="${i}" class="manual-step-item">
      <span class="manual-step-bullet">${i + 1}</span>
      <span class="manual-step-name">${s.title}</span>
    </li>
  `).join('');
}

function highlightActiveStep() {
  $$('#manual-step-list .manual-step-item').forEach((li, i) => {
    li.classList.toggle('is-active', i === _currentStepIdx);
    li.classList.toggle('is-completed', i < _currentStepIdx);
  });
  $$('#modal-manual .manual-tab').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.proceso === _currentProceso);
  });
}

function renderStep(proceso, idx) {
  const step = MANUAL[proceso].steps[idx];
  if (!step) return;
  const total = MANUAL[proceso].steps.length;
  $('#manual-step-num').textContent = `Paso ${idx + 1} de ${total}`;
  $('#manual-step-title').textContent = step.title;
  $('#manual-step-intro').textContent = step.intro;

  $('#manual-rules').innerHTML = step.rules.map((r) => `<li>${r}</li>`).join('');

  const errs = Object.entries(step.errors || {});
  $('#manual-errors').innerHTML = errs.length
    ? errs.map(([code, msg]) => `<li><code>${code}</code> ${msg}</li>`).join('')
    : `<li class="manual-no-errors">No hay errores en este paso — sólo seguís adelante.</li>`;

  const tipWrap = $('#manual-tip-wrap');
  if (step.tip) {
    tipWrap.hidden = false;
    $('#manual-tip').textContent = step.tip;
  } else {
    tipWrap.hidden = true;
  }

  // Progress
  const pct = ((idx + 1) / total) * 100;
  $('#manual-progress-fill').style.width = pct + '%';
  $('#manual-progress-text').textContent = `${idx + 1} / ${total}`;

  $('#manual-prev').disabled = idx === 0;
  $('#manual-next').disabled = idx === total - 1;
  highlightActiveStep();

  // Persistir
  saveProgress(proceso, idx);

  // Animación
  playCurrent();
}

function playCurrent() {
  abortCurrentAnim();
  const step = MANUAL[_currentProceso].steps[_currentStepIdx];
  if (!step) return;
  const fn = RENDERERS[step.animKey];
  const stage = $('#manual-stage');
  if (!fn || !stage) return;
  _animAbort = new AbortController();
  const signal = _animAbort.signal;
  fn(stage, signal).catch((err) => {
    if (!signal.aborted) console.error('manual anim err', err);
  });
}

function switchProceso(proceso) {
  if (!MANUAL[proceso]) return;
  _currentProceso = proceso;
  _currentStepIdx = 0;
  renderSidebar(proceso);
  renderStep(proceso, 0);
}

function goPrev() {
  if (_currentStepIdx > 0) {
    _currentStepIdx--;
    renderStep(_currentProceso, _currentStepIdx);
  }
}
function goNext() {
  const max = MANUAL[_currentProceso].steps.length - 1;
  if (_currentStepIdx < max) {
    _currentStepIdx++;
    renderStep(_currentProceso, _currentStepIdx);
  }
}
function jumpToStep(idx) {
  const max = MANUAL[_currentProceso].steps.length - 1;
  _currentStepIdx = Math.max(0, Math.min(idx, max));
  renderStep(_currentProceso, _currentStepIdx);
}

// =========================================================================
// Persistencia + apertura
// =========================================================================
const PROGRESS_KEY = 'tsoft:manual:progress';
function saveProgress(proceso, idx) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify({ proceso, idx, t: Date.now() })); } catch {}
}
function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function openManual(proceso, paso) {
  buildManualModal();
  // Determinar qué mostrar
  let p = proceso, idx = 0;
  if (!p) {
    const saved = loadProgress();
    if (saved && MANUAL[saved.proceso]) {
      p = saved.proceso;
      idx = saved.idx || 0;
    } else {
      p = 'registro';
    }
  }
  if (paso) {
    const stepArr = MANUAL[p]?.steps || [];
    const found = stepArr.findIndex((s) => s.id === paso);
    if (found >= 0) idx = found;
  }
  _currentProceso = p;
  _currentStepIdx = idx;
  renderSidebar(p);
  renderStep(p, idx);
  const dlg = $('#modal-manual');
  dlg.showModal?.();
  dlg.classList.add('is-open');
}

export function closeManual() {
  abortCurrentAnim();
  const dlg = $('#modal-manual');
  if (dlg) {
    dlg.close?.();
    dlg.classList.remove('is-open');
  }
}

// =========================================================================
// Popup contextual de ayuda en errores
// =========================================================================

function ensureHelpPopover() {
  if ($('#help-popover')) return;
  const pop = document.createElement('div');
  pop.id = 'help-popover';
  pop.className = 'help-popover';
  pop.hidden = true;
  pop.innerHTML = `
    <button type="button" class="help-popover-trigger" id="help-popover-trigger">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      ¿Necesitás ayuda?
    </button>
  `;
  document.body.appendChild(pop);
  pop.querySelector('#help-popover-trigger').addEventListener('click', () => {
    const proc = pop.dataset.proceso;
    const step = pop.dataset.step;
    if (proc && step) openManual(proc, step);
    pop.hidden = true;
  });
  // Click fuera cierra
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest?.('[data-help-anchor]')) {
      pop.hidden = true;
    }
  });
}

function positionPopover(pop, anchor) {
  const r = anchor.getBoundingClientRect();
  const pr = pop.getBoundingClientRect();
  let top = r.bottom + 8;
  let left = r.left;
  if (left + pr.width > window.innerWidth - 12) left = window.innerWidth - pr.width - 12;
  if (top + pr.height > window.innerHeight - 12) top = r.top - pr.height - 8;
  pop.style.top = top + 'px';
  pop.style.left = left + 'px';
}

// API pública: enganchar el popup de ayuda a un input cuando tiene error.
export function attachErrorHelp(fieldId, errorCode) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  ensureHelpPopover();
  // Agregar badge "?" al lado del input si no existe.
  let badge = field.parentElement.querySelector(`.help-badge[data-for="${fieldId}"]`);
  if (!badge) {
    badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'help-badge';
    badge.dataset.for = fieldId;
    badge.dataset.helpAnchor = '1';
    badge.setAttribute('aria-label', 'Mostrar ayuda');
    badge.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    field.parentElement.appendChild(badge);
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = ERROR_TO_MANUAL[errorCode] || FIELD_TO_MANUAL[fieldId];
      if (!target) return;
      const pop = $('#help-popover');
      pop.dataset.proceso = target.proceso;
      pop.dataset.step = target.paso;
      pop.hidden = false;
      positionPopover(pop, badge);
    });
  }
  badge.dataset.errorCode = errorCode || '';
  badge.hidden = false;
}

export function detachErrorHelp(fieldId) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  const badge = field.parentElement.querySelector(`.help-badge[data-for="${fieldId}"]`);
  if (badge) badge.hidden = true;
  const pop = $('#help-popover');
  if (pop && !pop.hidden) pop.hidden = true;
}

// =========================================================================
// Inicialización: wire del botón Ayuda + observación de setFieldError
// =========================================================================

export function initManual() {
  buildManualModal();
  // Atajo Esc cierra modal del manual (además del default de <dialog>)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#modal-manual')?.open) closeManual();
  });
}

// =========================================================================
// PDF del manual estático — multi-página, Roboto Condensed embebido.
// Reusa la infraestructura del PDF de cotización (jsPDF + fonts locales).
// =========================================================================

const JSPDF_CDN_M = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
const RC_REG = './assets/fonts/RobotoCondensed-Regular.ttf';
const RC_BOLD = './assets/fonts/RobotoCondensed-Bold.ttf';
const _fontCacheM = {};

function loadJsPDFManual() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSPDF_CDN_M;
    s.async = true;
    s.onload = () => window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('jsPDF no inicializado'));
    s.onerror = () => reject(new Error('No se pudo cargar jsPDF'));
    document.head.appendChild(s);
  });
}
async function fetchTTFb64(url) {
  if (_fontCacheM[url]) return _fontCacheM[url];
  const r = await fetch(url);
  if (!r.ok) throw new Error('font fetch failed');
  const buf = await r.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const C = 0x8000;
  for (let i = 0; i < bytes.length; i += C) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + C));
  _fontCacheM[url] = btoa(bin);
  return _fontCacheM[url];
}
async function loadRCFonts(doc) {
  const [reg, bold] = await Promise.all([fetchTTFb64(RC_REG), fetchTTFb64(RC_BOLD)]);
  doc.addFileToVFS('RC-R.ttf', reg);
  doc.addFont('RC-R.ttf', 'RC', 'normal');
  doc.addFileToVFS('RC-B.ttf', bold);
  doc.addFont('RC-B.ttf', 'RC', 'bold');
}

async function loadLogoB64() {
  try {
    const r = await fetch('./assets/Logo%20TributaSoft.png');
    if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => res(null);
      fr.readAsDataURL(b);
    });
  } catch { return null; }
}

// Helpers de dibujo
const COLORS = {
  navy: [0, 35, 111],
  orange: [239, 115, 6],
  tealPale: [201, 222, 233],
  text: [40, 40, 40],
  muted: [107, 114, 128],
  subtle: [75, 85, 99],
  successBg: [227, 242, 248],
  successBorder: [135, 199, 220],
};

function drawHeaderOnPage(doc, pageW, MARGIN_X, RIGHT, logoData) {
  if (logoData) { try { doc.addImage(logoData, 'PNG', MARGIN_X, 12, 11, 11); } catch {} }
  doc.setFont('RC', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.tealPale);
  const wmX = MARGIN_X + 14;
  doc.text('Tributa', wmX, 20);
  const tw = doc.getTextWidth('Tributa');
  doc.setTextColor(...COLORS.orange);
  doc.text('Soft', wmX + tw, 20);
  doc.setFont('RC', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text('Manual de usuario', RIGHT, 20, { align: 'right' });
  doc.setDrawColor(...COLORS.navy);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, 26, RIGHT, 26);
}
function drawFooterOnPage(doc, pageNum, pageW, pageH, MARGIN_X, RIGHT) {
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_X, pageH - 14, RIGHT, pageH - 14);
  doc.setFont('RC', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text('TributaSoft S.A. — Departamento de Facturación Electrónica Pre-Pago', MARGIN_X, pageH - 9);
  doc.text(`${pageNum}`, RIGHT, pageH - 9, { align: 'right' });
}

export async function descargarManualPDF() {
  const btn = $('#manual-download-pdf');
  if (btn) btn.disabled = true;
  try {
    const JsPDFCtor = await loadJsPDFManual();
    const doc = new JsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const [, logoData] = await Promise.all([loadRCFonts(doc), loadLogoB64()]);

    const PAGE_W = 210, PAGE_H = 297;
    const MARGIN_X = 18, MARGIN_TOP = 36, MARGIN_BOTTOM = 22;
    const RIGHT = PAGE_W - MARGIN_X;
    let pageNum = 1;
    let y = MARGIN_TOP;

    drawHeaderOnPage(doc, PAGE_W, MARGIN_X, RIGHT, logoData);

    function newPage() {
      drawFooterOnPage(doc, pageNum, PAGE_W, PAGE_H, MARGIN_X, RIGHT);
      doc.addPage();
      pageNum++;
      drawHeaderOnPage(doc, PAGE_W, MARGIN_X, RIGHT, logoData);
      y = MARGIN_TOP;
    }
    function ensureSpace(n) {
      if (y + n > PAGE_H - MARGIN_BOTTOM) newPage();
    }

    // ---- COVER ----
    doc.setFont('RC', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(...COLORS.navy);
    doc.text('Manual de usuario', MARGIN_X, y + 10);
    doc.setFontSize(16);
    doc.setTextColor(...COLORS.muted);
    doc.text('Cómo registrarte, cotizar y contratar', MARGIN_X, y + 18);
    y += 30;
    doc.setFont('RC', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.text);
    const introCover = 'Esta guía cubre los tres procesos principales de TributaSoft. Cada paso incluye reglas, errores frecuentes y consejos prácticos. La versión interactiva con animaciones está disponible en el botón "Ayuda" de la landing.';
    doc.splitTextToSize(introCover, RIGHT - MARGIN_X).forEach((ln) => { doc.text(ln, MARGIN_X, y); y += 5.5; });
    y += 6;
    doc.setFont('RC', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.navy);
    doc.text('Contenido', MARGIN_X, y); y += 7;
    doc.setFont('RC', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.text);
    Object.entries(MANUAL).forEach(([key, p], i) => {
      doc.text(`${i + 1}.  ${p.title}`, MARGIN_X + 2, y);
      doc.setTextColor(...COLORS.muted);
      doc.setFontSize(10);
      doc.text(`(${p.steps.length} pasos)`, RIGHT - 2, y, { align: 'right' });
      doc.setFontSize(11);
      doc.setTextColor(...COLORS.text);
      y += 6;
    });

    // ---- PROCESOS ----
    Object.entries(MANUAL).forEach(([key, p], procIdx) => {
      newPage();
      // Título de proceso
      doc.setFont('RC', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(...COLORS.navy);
      doc.text(`${procIdx + 1}. ${p.title}`, MARGIN_X, y);
      y += 8;
      doc.setFont('RC', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(...COLORS.muted);
      doc.splitTextToSize(p.description, RIGHT - MARGIN_X).forEach((ln) => { doc.text(ln, MARGIN_X, y); y += 5; });
      y += 4;

      // Pasos
      p.steps.forEach((step, sIdx) => {
        ensureSpace(50);
        // Bullet con número en círculo navy
        doc.setFillColor(...COLORS.navy);
        doc.circle(MARGIN_X + 3, y + 1, 3, 'F');
        doc.setFont('RC', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(String(sIdx + 1), MARGIN_X + 3, y + 2.4, { align: 'center' });
        doc.setFontSize(13);
        doc.setTextColor(...COLORS.navy);
        doc.text(step.title, MARGIN_X + 9, y + 2.5);
        y += 8;

        doc.setFont('RC', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(...COLORS.text);
        doc.splitTextToSize(step.intro, RIGHT - MARGIN_X - 6).forEach((ln) => {
          ensureSpace(5);
          doc.text(ln, MARGIN_X + 6, y);
          y += 4.6;
        });
        y += 2;

        // Reglas
        if (step.rules?.length) {
          ensureSpace(8);
          doc.setFont('RC', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(...COLORS.navy);
          doc.text('Reglas', MARGIN_X + 6, y); y += 5;
          doc.setFont('RC', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(...COLORS.text);
          step.rules.forEach((r) => {
            doc.splitTextToSize('• ' + r, RIGHT - MARGIN_X - 8).forEach((ln, i) => {
              ensureSpace(5);
              doc.text(ln, MARGIN_X + 8 + (i === 0 ? 0 : 3), y);
              y += 4.4;
            });
          });
          y += 2;
        }

        // Errores
        const errs = Object.entries(step.errors || {});
        if (errs.length) {
          ensureSpace(8);
          doc.setFont('RC', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(...COLORS.orange);
          doc.text('Si algo falla', MARGIN_X + 6, y); y += 5;
          doc.setFont('RC', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(...COLORS.text);
          errs.forEach(([code, msg]) => {
            doc.splitTextToSize(`▸ [${code}] ${msg}`, RIGHT - MARGIN_X - 8).forEach((ln, i) => {
              ensureSpace(5);
              doc.text(ln, MARGIN_X + 8 + (i === 0 ? 0 : 3), y);
              y += 4.2;
            });
          });
          y += 2;
        }

        // Tip
        if (step.tip) {
          ensureSpace(12);
          doc.setFillColor(...COLORS.successBg);
          doc.setDrawColor(...COLORS.successBorder);
          doc.setLineWidth(0.2);
          const lines = doc.splitTextToSize('💡  ' + step.tip, RIGHT - MARGIN_X - 10);
          const tipH = lines.length * 4.4 + 4;
          doc.roundedRect(MARGIN_X + 6, y - 1, RIGHT - MARGIN_X - 6, tipH, 1.5, 1.5, 'FD');
          doc.setFont('RC', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(...COLORS.subtle);
          let ty = y + 3;
          lines.forEach((ln) => { doc.text(ln, MARGIN_X + 9, ty); ty += 4.4; });
          y += tipH + 3;
        }

        y += 4;
      });
    });

    drawFooterOnPage(doc, pageNum, PAGE_W, PAGE_H, MARGIN_X, RIGHT);

    const stamp = (() => {
      const d = new Date();
      return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    })();
    doc.save(`manual-tributasoft-${stamp}.pdf`);
  } catch (err) {
    console.error('manual pdf err', err);
  } finally {
    if (btn) btn.disabled = false;
  }
}
