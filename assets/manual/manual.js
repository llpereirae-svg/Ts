// manual.js — Manual interactivo de TributaSoft.
// - Modal full-screen con tabs por proceso.
// - Animaciones nativas (cursor virtual, typing effect, click pulse).
// - Persistencia del progreso en localStorage.
// - Popup contextual de ayuda al cursor sobre errores.
// - Generación del manual estático en PDF (Roboto Condensed embebida).

import { MANUAL, ERROR_TO_MANUAL, FIELD_TO_MANUAL } from './manual-data.js?v=20260520e';
import { detectDevice } from '../wizard.js?v=20260520e';

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
      <div class="mock-form-header">Tus datos</div>
      <!-- Campos bloqueados (vienen del cert) -->
      <div class="mock-row"><span class="mock-flabel">Razón social</span><input class="mock-input mock-tiny mock-locked" value="TRIBUTASOFT S.A." readonly></div>
      <div class="mock-row"><span class="mock-flabel">Provincia</span><input class="mock-input mock-tiny mock-locked" value="GUAYAS" readonly></div>
      <div class="mock-row"><span class="mock-flabel">Ciudad</span><input class="mock-input mock-tiny mock-locked" value="Daule" readonly></div>
      <!-- Campos editables (los anima el renderer) -->
      <div class="mock-row"><span class="mock-flabel">Dirección</span><input class="mock-input mock-tiny" data-anim="direccion" readonly placeholder="Av., calles, número"></div>
      <div class="mock-row"><span class="mock-flabel">Email</span><input class="mock-input mock-tiny" data-anim="email" readonly placeholder="tu@empresa.com"></div>
      <div class="mock-row mock-row--phone">
        <span class="mock-flabel">Celular</span>
        <span class="mock-pais-pill" data-anim="celularPais">EC +593</span>
        <input class="mock-input mock-tiny mock-input--phone" data-anim="celular" readonly placeholder="09XXXXXXXX">
      </div>
      <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="datosBtn">Continuar</button>
    </div>
  `,
  tokenCard: () => `
    <div class="mock mock-token mock-token--dual">
      <div class="mock-token-title">Verifica tu identidad</div>
      <div class="mock-token-block">
        <div class="mock-token-chan"><span class="mock-token-ico">✉</span> Correo · <strong>tu@email.com</strong></div>
        <div class="mock-codigo">
          ${[1,2,3,4].map((i) => `<input class="mock-cdig" data-anim="e${i}" readonly>`).join('')}
        </div>
      </div>
      <div class="mock-token-block">
        <div class="mock-token-chan"><span class="mock-token-ico">📱</span> SMS · <strong>099-842-9901</strong></div>
        <div class="mock-codigo">
          ${[1,2,3,4].map((i) => `<input class="mock-cdig" data-anim="s${i}" readonly>`).join('')}
        </div>
      </div>
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
  // Renombrado: ahora es la pantalla 8 'Revisa tus datos antes de finalizar'.
  // Mantenemos el id 'confirmCard' por compatibilidad con animaciones existentes.
  confirmCard: () => `
    <div class="mock mock-firma">
      <div class="mock-form-header">Revisa tus datos</div>
      <p class="mock-help">Cada tarjeta tiene un botón "Editar" que regresa a esa pantalla.</p>
      <div class="mock-confirm-user">Usuario: <strong data-anim="user">—</strong></div>
      <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="confirmBtn">Confirmar y finalizar</button>
    </div>
  `,
  // Pantalla 4 — Información tributaria
  tributariaCard: () => `
    <div class="mock mock-form">
      <div class="mock-form-header">Información tributaria</div>
      <div class="mock-row"><span class="mock-flabel">Régimen</span><input class="mock-input mock-tiny mock-locked" value="GENERAL" readonly></div>
      <div class="mock-row"><span class="mock-flabel">Tipo de Contribuyente</span><input class="mock-input mock-tiny mock-locked" value="Agente de Retención" readonly></div>
      <div class="mock-row" data-anim="tribResWrap"><span class="mock-flabel">No. Resolución</span><input class="mock-input mock-tiny" data-anim="tribRes" readonly placeholder="NAC-..."></div>
      <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="tribBtn">Continuar</button>
    </div>
  `,
  // Pantalla 5 — Situación de facturación
  facturacionCard: () => `
    <div class="mock mock-form">
      <div class="mock-form-header">Situación de facturación</div>
      <div class="mock-radio-row">
        <label class="mock-radio" data-anim="modoNuevo"><span class="mock-radio-dot"></span> Empezar desde cero</label>
        <label class="mock-radio" data-anim="modoCont"><span class="mock-radio-dot"></span> Continuar con mi facturación</label>
      </div>
      <div data-anim="factCont" hidden>
        <div class="mock-row mock-row--split">
          <span class="mock-flabel">Establecimiento</span><input class="mock-input mock-tiny" data-anim="factEst" value="001" readonly>
          <span class="mock-flabel">Punto</span><input class="mock-input mock-tiny" data-anim="factPto" value="002" readonly>
        </div>
        <div class="mock-row"><span class="mock-flabel">Factura</span><input class="mock-input mock-tiny" data-anim="factSeq" value="000000027" readonly></div>
      </div>
      <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="factBtn">Continuar</button>
    </div>
  `,
  // Pantalla 8 — Resumen con cards Editar
  resumenCard: () => `
    <div class="mock mock-resumen">
      <div class="mock-resumen-card">
        <div class="mock-resumen-head">
          <strong>Datos personales</strong>
          <button class="mock-btn mock-btn--ghost mock-btn--small" data-anim="editDatos">Editar</button>
        </div>
        <div class="mock-resumen-row"><span>Razón social</span><span>TRIBUTASOFT S.A.</span></div>
        <div class="mock-resumen-row"><span>Email</span><span>tributasoft@gmail.com</span></div>
      </div>
      <div class="mock-resumen-card">
        <div class="mock-resumen-head">
          <strong>Acceso al portal</strong>
          <button class="mock-btn mock-btn--ghost mock-btn--small" data-anim="editClave">Editar</button>
        </div>
        <div class="mock-resumen-row"><span>Usuario</span><span data-anim="resUser">—</span></div>
        <div class="mock-resumen-row"><span>Clave</span><span>••••••</span></div>
      </div>
      <button class="mock-btn mock-btn--cta mock-btn--small" data-anim="resBtn">Confirmar y finalizar</button>
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
    // Solo animamos los campos EDITABLES. Razón social, provincia y ciudad
    // vienen del cert RUC y aparecen ya bloqueados (gris) — no se tocan.
    const fields = ['direccion', 'email', 'celular'];
    const values = ['AV. SAMBORONDÓN KM 14', 'ventas@empresa.ec', '0998765432'];
    for (let i = 0; i < fields.length; i++) {
      if (signal?.aborted) return;
      const f = stage.querySelector(`[data-anim="${fields[i]}"]`);
      await moveCursor(cursor, f, 500);
      f.classList.add('mock-focused');
      await typeText(f, values[i], 30, signal);
      f.classList.remove('mock-focused');
      await wait(120);
    }
    const btn = stage.querySelector('[data-anim="datosBtn"]');
    await moveCursor(cursor, btn);
    await clickPulse(btn);
  },

  token: async (stage, signal) => {
    stage.innerHTML = MOCK.tokenCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    // Dos códigos independientes: email (4 dígitos) y SMS (4 dígitos)
    const emailCode = '7559';
    const smsCode = '3273';
    // Email
    for (let i = 1; i <= 4; i++) {
      if (signal?.aborted) return;
      const d = stage.querySelector(`[data-anim="e${i}"]`);
      await moveCursor(cursor, d, 230);
      d.classList.add('mock-focused');
      d.value = emailCode[i - 1];
      d.classList.add('mock-cdig-filled');
      await wait(110);
      d.classList.remove('mock-focused');
    }
    // SMS
    for (let i = 1; i <= 4; i++) {
      if (signal?.aborted) return;
      const d = stage.querySelector(`[data-anim="s${i}"]`);
      await moveCursor(cursor, d, 230);
      d.classList.add('mock-focused');
      d.value = smsCode[i - 1];
      d.classList.add('mock-cdig-filled');
      await wait(110);
      d.classList.remove('mock-focused');
    }
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

  // Pantalla 4 — Información tributaria (paso nuevo)
  tributaria: async (stage, signal) => {
    stage.innerHTML = MOCK.tributariaCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const resInput = stage.querySelector('[data-anim="tribRes"]');
    await wait(400);
    await moveCursor(cursor, resInput);
    if (signal?.aborted) return;
    resInput.classList.add('mock-focused');
    await typeText(resInput, 'NAC-DGERCGC23-00012345', 35, signal);
    resInput.classList.remove('mock-focused');
    const btn = stage.querySelector('[data-anim="tribBtn"]');
    await moveCursor(cursor, btn);
    await clickPulse(btn);
  },

  // Pantalla 5 — Facturación (paso nuevo)
  facturacion: async (stage, signal) => {
    stage.innerHTML = MOCK.facturacionCard() + `<div class="mock-cursor" data-anim="cursor"></div>`;
    const cursor = stage.querySelector('[data-anim="cursor"]');
    const modoCont = stage.querySelector('[data-anim="modoCont"]');
    await wait(400);
    await moveCursor(cursor, modoCont);
    if (signal?.aborted) return;
    await clickPulse(modoCont);
    modoCont.classList.add('mock-radio-active');
    const factCont = stage.querySelector('[data-anim="factCont"]');
    factCont.hidden = false;
    await wait(300);
    const btn = stage.querySelector('[data-anim="factBtn"]');
    await moveCursor(cursor, btn);
    await clickPulse(btn);
  },

  // Pantalla 8 — Resumen: overview ESTÁTICO (sin cursor/typing), porque
  // este paso es un repaso visual de lo registrado, no una acción a animar.
  resumen: async (stage, signal) => {
    stage.innerHTML = `
      <div class="mock mock-resumen-static">
        <div class="mock-form-header">Tu cuenta está casi lista</div>
        <p class="mock-help mock-help--center">
          Antes de confirmar, revisa cada sección. Si algo está mal,
          el botón <strong>Editar</strong> de cada tarjeta te devuelve
          a esa pantalla.
        </p>
        <div class="mock-resumen">
          <div class="mock-resumen-card">
            <div class="mock-resumen-head">
              <strong>Datos personales</strong>
              <button class="mock-btn mock-btn--ghost mock-btn--small">Editar</button>
            </div>
            <div class="mock-resumen-row"><span>Razón social</span><span>TRIBUTASOFT S.A.</span></div>
            <div class="mock-resumen-row"><span>Email</span><span>tributasoft@gmail.com</span></div>
            <div class="mock-resumen-row"><span>Celular</span><span>099-842-9901</span></div>
          </div>
          <div class="mock-resumen-card">
            <div class="mock-resumen-head">
              <strong>Información tributaria</strong>
              <button class="mock-btn mock-btn--ghost mock-btn--small">Editar</button>
            </div>
            <div class="mock-resumen-row"><span>Régimen</span><span>GENERAL</span></div>
            <div class="mock-resumen-row"><span>Tipo</span><span>Agente de Retención</span></div>
          </div>
          <div class="mock-resumen-card mock-resumen-card--creds">
            <div class="mock-resumen-head">
              <strong>Acceso al portal</strong>
              <button class="mock-btn mock-btn--ghost mock-btn--small">Editar</button>
            </div>
            <div class="mock-resumen-row"><span>Usuario</span><span class="mock-mono">0992703601</span></div>
            <div class="mock-resumen-row"><span>Clave</span><span>•••••••••</span></div>
          </div>
        </div>
        <button class="mock-btn mock-btn--cta mock-btn--small mock-btn--full">Confirmar y finalizar</button>
        <p class="mock-help mock-help--center mock-help--tiny">
          Al confirmar, te llega un correo de bienvenida con tu resumen y credenciales.
        </p>
      </div>
    `;
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
      <header class="manual-header manual-header--brand">
        <a class="manual-brand-block" href="https://tributasoft.com.ec" target="_blank" rel="noopener">
          <img class="manual-brand-mark" src="./assets/Logo%20TributaSoft.png" alt="">
          <span class="manual-brand-wordmark">
            <span class="manual-brand-tributa">Tributa</span><span class="manual-brand-soft">Soft</span>
          </span>
          <span class="manual-brand-tagline">...todo bajo control</span>
        </a>
        <div class="manual-header-actions">
          <!-- Botón Volver: se muestra solo cuando el manual fue abierto
               desde Cotizar o Pago para que el usuario regrese a su contexto. -->
          <button class="manual-volver" id="manual-volver" type="button" hidden>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
            <span id="manual-volver-text">Volver</span>
          </button>
          <button class="manual-pdf-btn" id="manual-download-pdf" type="button" title="Descargar manual en PDF">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            PDF
          </button>
          <button class="manual-close" id="manual-close" type="button" aria-label="Cerrar">×</button>
        </div>
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
            <!-- El stage se ajusta automáticamente al dispositivo del usuario
                 (data-device="pc|tablet|mobile" se setea al abrir el manual
                 según la detección de detectDevice() del wizard). -->
            <div class="manual-stage" id="manual-stage" data-device="pc"></div>
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
              <h4>Mensajes que puedes ver</h4>
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
        <div class="manual-trace" id="manual-trace">
          <span class="manual-trace-prefix">Manual de Usuario · </span>
          <span class="manual-trace-procs">
            ${Object.entries(MANUAL).map(([key, p], i, arr) => `
              <span class="manual-trace-proc" data-proceso="${key}">${p.label}</span>${i < arr.length - 1 ? '<span class="manual-trace-sep">|</span>' : ''}
            `).join('')}
          </span>
        </div>
        <div class="manual-footer-row">
          <button class="manual-prev" id="manual-prev" type="button">← Anterior</button>
          <div class="manual-progress">
            <div class="manual-progress-bar"><div class="manual-progress-fill" id="manual-progress-fill"></div></div>
            <span class="manual-progress-text" id="manual-progress-text">0%</span>
          </div>
          <button class="manual-next" id="manual-next" type="button">Siguiente →</button>
        </div>
      </footer>
    </div>
  `;
  document.body.appendChild(dlg);

  // Wire eventos
  $('#manual-close').addEventListener('click', () => closeManual());
  $('#manual-volver').addEventListener('click', () => {
    const target = _returnTo;
    closeManual();
    // Reabrir el modal de origen tras un pequeño delay para que la
    // transición de cerrado del manual termine antes.
    setTimeout(() => {
      if (target === 'cotizar') {
        const m = document.getElementById('modal-cotizar');
        if (m) { try { m.showModal(); } catch { m.setAttribute('open', ''); } }
      } else if (target === 'pago') {
        const m = document.getElementById('modal-pago');
        if (m) { try { m.showModal(); } catch { m.setAttribute('open', ''); } }
      }
    }, 200);
  });
  $('#manual-prev').addEventListener('click', () => goPrev());
  $('#manual-next').addEventListener('click', () => goNext());
  $('#manual-replay').addEventListener('click', () => playCurrent());
  $('#manual-download-pdf').addEventListener('click', () => descargarManualPDF());
  $$('#modal-manual .manual-tab').forEach((t) => {
    t.addEventListener('click', () => switchProceso(t.dataset.proceso));
  });
  $$('#modal-manual .manual-trace-proc').forEach((p) => {
    p.addEventListener('click', () => switchProceso(p.dataset.proceso));
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
  $$('#modal-manual .manual-trace-proc').forEach((p) => {
    p.classList.toggle('is-active', p.dataset.proceso === _currentProceso);
  });
}

function renderStep(proceso, idx) {
  const step = MANUAL[proceso].steps[idx];
  if (!step) return;
  const total = MANUAL[proceso].steps.length;
  $('#manual-step-num').textContent = `Paso ${idx + 1} de ${total}`;
  $('#manual-step-title').textContent = step.title;
  $('#manual-step-intro').textContent = step.intro;

  // step.rules viene de manual-data.js (contenido estático nuestro, no input
  // del usuario), pero igual escapamos por defensive coding contra inyecciones
  // accidentales si alguien edita manual-data.js a futuro.
  $('#manual-rules').innerHTML = step.rules.map((r) => `<li>${escapeHtml(r)}</li>`).join('');

  const errs = Object.entries(step.errors || {});
  $('#manual-errors').innerHTML = errs.length
    ? errs.map(([code, msg]) => `<li>${escapeHtml(msg)}</li>`).join('')
    : `<li class="manual-no-errors">No hay mensajes de error en este paso. Solo continúa.</li>`;

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

// _returnTo: 'cotizar' | 'pago' | null
// Recordamos desde dónde se abrió el manual para mostrar el botón "Volver"
// que regresa al modal correspondiente.
let _returnTo = null;

export function openManual(proceso, paso, returnTo) {
  _returnTo = returnTo || null;
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
  // Auto-detectar dispositivo del usuario y ajustar el stage para que el
  // mock se vea con el ancho real del dispositivo (sin toggle visible).
  const dev = detectDevice();
  const device = dev.isPC ? 'pc' : dev.isTablet ? 'tablet' : 'mobile';
  const stage = $('#manual-stage');
  if (stage) stage.dataset.device = device;
  // Mostrar/ocultar el botón Volver según el contexto desde donde se abrió
  const volverBtn = $('#manual-volver');
  const volverText = $('#manual-volver-text');
  if (volverBtn && volverText) {
    if (_returnTo === 'cotizar') {
      volverBtn.hidden = false;
      volverText.textContent = 'Volver al cotizador';
    } else if (_returnTo === 'pago') {
      volverBtn.hidden = false;
      volverText.textContent = 'Volver al pago';
    } else {
      volverBtn.hidden = true;
    }
  }
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
function drawFooterOnPage(doc, pageNum, pageW, pageH, MARGIN_X, RIGHT, currentProc) {
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_X, pageH - 14, RIGHT, pageH - 14);
  doc.setFont('RC', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);

  // "Manual de Usuario · Registro de usuario | Cotización | Pago" — el
  // proceso actual va en bold + navy, los demás quedan en gris.
  let x = MARGIN_X;
  doc.text('Manual de Usuario · ', x, pageH - 9);
  x += doc.getTextWidth('Manual de Usuario · ');
  const procs = Object.entries(MANUAL);
  procs.forEach(([key, p], i) => {
    const isCurrent = key === currentProc;
    if (isCurrent) {
      doc.setFont('RC', 'bold');
      doc.setTextColor(...COLORS.navy);
    } else {
      doc.setFont('RC', 'normal');
      doc.setTextColor(...COLORS.muted);
    }
    doc.text(p.label, x, pageH - 9);
    x += doc.getTextWidth(p.label);
    if (i < procs.length - 1) {
      doc.setFont('RC', 'normal');
      doc.setTextColor(...COLORS.muted);
      doc.text(' | ', x, pageH - 9);
      x += doc.getTextWidth(' | ');
    }
  });

  // Número de página (alineado a la derecha)
  doc.setFont('RC', 'normal');
  doc.setTextColor(...COLORS.muted);
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
    let currentProc = 'registro'; // se actualiza al entrar a cada sección

    drawHeaderOnPage(doc, PAGE_W, MARGIN_X, RIGHT, logoData);

    function newPage() {
      drawFooterOnPage(doc, pageNum, PAGE_W, PAGE_H, MARGIN_X, RIGHT, currentProc);
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
      currentProc = key; // actualizar antes del newPage para que el footer quede correcto
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

    drawFooterOnPage(doc, pageNum, PAGE_W, PAGE_H, MARGIN_X, RIGHT, currentProc);

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

// Escape para HTML — defensive coding contra inyecciones accidentales.
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
