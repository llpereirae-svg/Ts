// app.js — Modales auxiliares + cotizador + helpers.
//
// El registro de usuarios vive 100% en wizard.js + screens/. Este archivo
// solo maneja lo que NO está en el wizard:
//   - Header: botones Cotizar y Ayuda
//   - Modal Cotizar (cálculo + generación de PDF con marca corporativa)
//   - Modal Pago (renovación prepago — subida de comprobante)
//   - Modal Términos (con scroll-to-bottom)
//   - Modal Información Bancaria
//   - Modal Contratar (validación del RUC antes del pago)
//   - Tooltips informativos (íconos "i")
//   - Botones "Copiar al portapapeles"
//   - Bootstrap del manual interactivo
//
// Imports mínimos: solo lo realmente usado por el código vivo.

import { validarRUC } from './utils/validators.js?v=20260520c';
import { initManual, openManual } from './manual/manual.js?v=20260520c';

// =========================================================================
//   CONSTANTES
// =========================================================================

const PORTAL_URL = 'https://tbc.tributasoft.ec/Erp-web/templates/registro/login.xhtml?faces-redirect=true';

const NOMBRE_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// SVGs inline para los botones "Copiar". Inyectados por JS para no repetirlos
// en cada botón del HTML.
const COPY_ICON_DEFAULT = `<svg class="copy-btn__icon copy-btn__icon--default" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const COPY_ICON_SUCCESS = `<svg class="copy-btn__icon copy-btn__icon--success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

// Textos de los tooltips informativos. Algunos están en el wizard (que tiene
// sus propios tooltips), otros podrían reactivarse si se agregan íconos "i"
// a los modales activos. Los mantenemos por extensibilidad.
const TOOLTIPS = {
  est: {
    title: 'Establecimiento',
    body: 'Sucursal o local desde donde se emite el comprobante.\n\nEjemplo: en 001-002-000000123, el establecimiento es 001.',
  },
  punto: {
    title: 'Punto de emisión',
    body: 'Punto autorizado dentro del establecimiento desde donde se emite el comprobante.\n\nEjemplo: en 001-002-000000123, el punto de emisión es 002.',
  },
  factura: {
    title: 'Próxima factura a emitir',
    body: 'Ingresa el número de la próxima factura que vas a emitir.\n\nEjemplo: si tu última factura emitida fue 000000026, registra 000000027 — esa será tu próxima factura.',
  },
};

// Términos y condiciones — redactados en estilo jurídico formal y aplicables
// tanto al registro inicial como al pago de renovación prepago.
const TERMS_HTML = `
  <h3>1. Objeto</h3>
  <p>TRIBUTASOFT S.A., en adelante "TRIBUTASOFT", pone a disposición del usuario (en adelante, el "USUARIO" o el "CLIENTE") una plataforma electrónica destinada a la emisión, registro, anulación y administración de comprobantes electrónicos autorizados por el Servicio de Rentas Internas del Ecuador (SRI), conforme a la normativa tributaria vigente.</p>

  <h3>2. Promoción inicial</h3>
  <p>TRIBUTASOFT otorga al USUARIO una promoción inicial sin costo correspondiente a:</p>
  <ol>
    <li>Trescientos (300) documentos electrónicos; o</li>
    <li>Un periodo máximo de tres (3) meses calendario,</li>
  </ol>
  <p>contados desde la fecha de activación de la cuenta, lo que ocurra primero. Cumplido cualquiera de los dos límites, el servicio quedará sujeto a la contratación de un plan vigente.</p>

  <h3>3. Cómputo de documentos electrónicos</h3>
  <p>Para los efectos del cómputo previsto en la cláusula anterior y de cualquier plan o renovación posterior, se considerará un (1) "documento electrónico" todo aquel que, de manera indistinta:</p>
  <ol>
    <li>Sea <strong>emitido</strong> por el USUARIO a través de la plataforma;</li>
    <li>Sea <strong>registrado</strong> en el sistema, aun cuando no se hubiere autorizado por el SRI; o</li>
    <li>Sea <strong>anulado</strong> dentro del sistema, conforme la normativa tributaria aplicable.</li>
  </ol>

  <h3>4. Modificaciones al sistema</h3>
  <p>El USUARIO reconoce y acepta que TRIBUTASOFT podrá efectuar, en cualquier momento y a su entera discreción, modificaciones, mejoras, actualizaciones o cambios en la plataforma, sus funcionalidades, interfaces y procesos, atendiendo a sus propias necesidades técnicas, operativas, comerciales o regulatorias. Dichos cambios no requerirán autorización previa del USUARIO y se entenderán aceptados con el uso continuado del servicio.</p>

  <h3>5. Protección de datos personales</h3>
  <p>TRIBUTASOFT trata los datos personales del USUARIO con estricta sujeción a la <strong>Ley Orgánica de Protección de Datos Personales del Ecuador</strong> y sus normas reglamentarias. Los datos serán utilizados exclusivamente para los fines del servicio contratado, su facturación, su soporte y el cumplimiento de obligaciones legales o tributarias. El USUARIO podrá ejercer en cualquier momento sus derechos de acceso, rectificación, actualización, eliminación, oposición, anulación y portabilidad mediante comunicación dirigida a TRIBUTASOFT por los canales habilitados.</p>

  <h3>6. Responsabilidad del USUARIO</h3>
  <p>El USUARIO es responsable de la veracidad de la información proporcionada al registrarse, del resguardo y uso adecuado de sus credenciales de acceso y del contenido de los comprobantes que emita a través de la plataforma. Cualquier perjuicio derivado de un uso indebido, negligente o fraudulento será de su exclusiva responsabilidad.</p>

  <h3>7. Condiciones del pago (renovación prepago)</h3>
  <p>El reporte del pago de planes prepago se entiende efectuado al momento de cargar el comprobante en la plataforma. La validación del pago será realizada por los operadores de TRIBUTASOFT dentro de un plazo máximo de <strong>dos (2) horas</strong> desde el reporte.</p>
  <p>En caso de que el valor reportado no corresponda al efectivamente acreditado en las cuentas bancarias de TRIBUTASOFT, o de detectarse indicios de pago erróneo, duplicado o fraudulento, el servicio será <strong>suspendido de manera inmediata</strong> hasta la regularización del pago o la baja definitiva del servicio, según corresponda. TRIBUTASOFT no asume responsabilidad alguna por las interrupciones derivadas de pagos no acreditados o inexactos.</p>

  <h3>8. Suspensión y terminación</h3>
  <p>TRIBUTASOFT se reserva el derecho de suspender o dar por terminado el servicio en caso de incumplimiento de los presentes términos, uso indebido de la plataforma o causal legal aplicable, sin que ello genere responsabilidad alguna a su cargo, y sin perjuicio de las acciones legales que correspondan.</p>

  <h3>9. Aceptación</h3>
  <p>La marcación de la casilla de aceptación, una vez deslizado hasta el final del presente documento, constituye declaración expresa de conocimiento y aceptación íntegra de estos términos por parte del USUARIO, conforme a lo previsto en el Código de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos, el Código Civil y demás normativa aplicable de la República del Ecuador.</p>
`;

// =========================================================================
//   ANALYTICS
// =========================================================================

// Aquí es donde se enchufa Meta Pixel / Google Analytics cuando se integren:
// el `track()` ya dispara un CustomEvent global y loguea a consola — basta
// agregar un listener `window.addEventListener('tributasoft:event', ...)`
// o llamar a `fbq('trackCustom', name, detail)` adentro.
function track(name, detail = {}) {
  window.dispatchEvent(new CustomEvent('tributasoft:event', { detail: { name, ...detail } }));
  console.log('[analytics]', name, detail);
}

// =========================================================================
//   DOM HELPERS
// =========================================================================

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

function openModal(modal) {
  if (!modal) return;
  modal.showModal?.();
  modal.classList.add('is-open');
  const firstFocus = modal.querySelector('[autofocus], input:not([readonly]), button:not(.back-btn), select, textarea');
  firstFocus?.focus();
}

function closeModal(modal) {
  if (!modal) return;
  modal.close?.();
  modal.classList.remove('is-open');
}

// =========================================================================
//   BOOTSTRAP
// =========================================================================

// app.js se carga con import() dinámico desde index.html. Si el DOM ya
// terminó de parsear cuando este módulo evalúa, ejecutamos init() de una;
// si no, esperamos al DOMContentLoaded.
function init() {
  track('landing_view', { url: location.href });

  // Inyectar contenido de Términos en el modal compartido (Cotizar + Pago)
  const termsBody = $('#terms-body');
  if (termsBody) termsBody.innerHTML = TERMS_HTML;

  // ---- Header ----
  $('#btn-cotizar')?.addEventListener('click', openCotizar);
  $('#btn-help')?.addEventListener('click', () => {
    track('manual_open', { trigger: 'header' });
    // Si el usuario está en una pantalla del wizard, abrir el manual en el
    // paso correspondiente. La pantalla "resumen" no tiene paso propio en
    // el manual, así que cae al último (logo).
    const activeScreenEl = document.querySelector('.wiz-screen.is-active');
    const screenId = activeScreenEl?.dataset?.id;
    if (screenId === 'resumen') {
      openManual('registro', 'logo');
    } else if (screenId) {
      openManual('registro', screenId);
    } else {
      openManual();
    }
  });

  // Ayuda dentro del cotizador → abre manual en tab Cotización + Volver
  $('#cot-help-btn')?.addEventListener('click', () => {
    track('manual_open', { trigger: 'cotizar' });
    const m = document.getElementById('modal-cotizar');
    try { m.close(); } catch { m.removeAttribute('open'); }
    openManual('cotizacion', null, 'cotizar');
  });

  // Ayuda dentro del pago → abre manual en tab Pago + Volver
  $('#pago-help-btn')?.addEventListener('click', () => {
    track('manual_open', { trigger: 'pago' });
    const m = document.getElementById('modal-pago');
    try { m.close(); } catch { m.removeAttribute('open'); }
    openManual('contratacion', null, 'pago');
  });

  initManual();

  // ---- Cotizador ----
  $('#cot-calcular')?.addEventListener('click', onCotCalcular);
  $('#cot-refrescar')?.addEventListener('click', onCotRefrescar);
  $('#cot-contratar')?.addEventListener('click', onCotContratar);
  $('#cot-descargar')?.addEventListener('click', descargarCotizacionPDF);
  $('#cot-docs')?.addEventListener('input', (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 9);
    e.target.value = v;
    const err = $('#cot-docs-error');
    if (err) err.textContent = '';
  });

  // ---- Modal contratar RUC (entre cotizador y pago) ----
  $('#contratar-ruc-continuar')?.addEventListener('click', onContratarRucContinuar);
  $('#contratar-ruc-cancelar')?.addEventListener('click', () => closeModal($('#modal-contratar-ruc')));
  $('#contratar-ruc')?.addEventListener('input', (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 13);
    if (v !== e.target.value) e.target.value = v;
    const errEl = $('#contratar-ruc-error');
    if ($('#contratar-ruc').getAttribute('aria-invalid') === 'true') {
      if (errEl) errEl.textContent = '';
      $('#contratar-ruc').setAttribute('aria-invalid', 'false');
    }
  });

  // ---- Modal Pago ----
  $('#btn-info-bank')?.addEventListener('click', () => openModal($('#modal-bank')));
  $('#btn-bank-close')?.addEventListener('click', () => closeModal($('#modal-bank')));
  $('#pago-archivo')?.addEventListener('change', onPagoArchivoChange);
  ['#pago-banco', '#pago-fecha', '#pago-forma'].forEach((sel) => {
    $(sel)?.addEventListener('change', updatePagoSubmit);
  });
  $('#pago-acepta-terminos')?.addEventListener('change', updatePagoSubmit);
  $('#pago-enviar')?.addEventListener('click', onPagoEnviar);

  // ---- Modal Términos (scroll-to-bottom) ----
  $('#pago-link-terms')?.addEventListener('click', () => openTerms('pago-acepta-terminos'));
  $('#terms-body')?.addEventListener('scroll', checkTermsBottom);
  $('#terms-aceptar')?.addEventListener('click', onTermsAceptar);
  $('#terms-cancelar')?.addEventListener('click', () => closeModal($('#modal-terms')));

  // ---- Tooltips + Copy buttons (delegación global) ----
  document.addEventListener('click', onDocumentClick);
  $('#tooltip-popover-close')?.addEventListener('click', closeTooltip);
  window.addEventListener('resize', closeTooltip);
  window.addEventListener('scroll', closeTooltip, { passive: true });
  injectCopyIcons();

  // ---- Atajos de teclado ----
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTooltip();
      $$('dialog.is-open').forEach(closeModal);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// =========================================================================
//   COTIZADOR
// =========================================================================

function openCotizar() {
  track('cotizador_abierto');
  $('#cot-docs').value = '';
  $('#cot-docs-error').textContent = '';
  $('#cot-resumen').hidden = true;
  openModal($('#modal-cotizar'));
  setTimeout(() => $('#cot-docs').focus(), 120);
}

function onCotCalcular() {
  const raw = $('#cot-docs').value;
  const docs = parseInt(raw, 10);
  if (!Number.isInteger(docs) || docs < 1 || docs > 100000000) {
    $('#cot-docs-error').textContent = 'Ingresa un número entre 1 y 100,000,000.';
    return;
  }
  $('#cot-docs-error').textContent = '';

  const anual = docs * 12;
  const subtotal = 6 + anual * 0.20;
  const iva = subtotal * 0.15;
  const total = subtotal + iva;

  $('#cot-anual').textContent = formatMiles(anual);
  $('#cot-subtotal').textContent = formatMoney(subtotal);
  $('#cot-iva').textContent = formatMoney(iva);
  $('#cot-total').textContent = formatMoney(total);

  const hoy = new Date();
  const vence = new Date(hoy.getFullYear() + 1, hoy.getMonth(), hoy.getDate());
  $('#cot-vigencia-fecha').textContent = formatFechaLarga(vence);

  $('#cot-resumen').hidden = false;
  $('#cot-resumen').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  track('cotizador_calculado', { docs, anual, total: total.toFixed(2) });
}

function onCotRefrescar() {
  $('#cot-docs').value = '';
  $('#cot-docs-error').textContent = '';
  $('#cot-resumen').hidden = true;
  $('#cot-docs').focus();
  track('cotizador_refrescado');
}

function onCotContratar() {
  // Antes del modal de pago, pedimos el RUC del contratante para validarlo.
  closeModal($('#modal-cotizar'));
  $('#contratar-ruc').value = '';
  $('#contratar-ruc-error').textContent = '';
  $('#contratar-ruc-ok').hidden = true;
  $('#contratar-ruc-ok').textContent = '';
  openModal($('#modal-contratar-ruc'));
  track('cotizador_contratar_init');
}

async function onContratarRucContinuar() {
  const ruc = ($('#contratar-ruc').value || '').replace(/\D/g, '');
  $('#contratar-ruc').value = ruc;
  $('#contratar-ruc-error').textContent = '';
  $('#contratar-ruc-ok').hidden = true;

  // Validación de estructura (mismo algoritmo de dígito verificador del SRI).
  const struct = validarRUC(ruc);
  if (!struct.valid) {
    $('#contratar-ruc-error').textContent = struct.reason;
    $('#contratar-ruc').setAttribute('aria-invalid', 'true');
    return;
  }
  $('#contratar-ruc').setAttribute('aria-invalid', 'false');

  // NOTA: la validación "este RUC existe como empresa registrada" la hará el
  // backend cuando esté el endpoint. Por ahora, si la estructura es válida,
  // avanzamos al pago. TICS reemplazará este bloque por un fetch real.
  $('#contratar-ruc-ok').textContent = `RUC válido: ${ruc}. Continuando al pago…`;
  $('#contratar-ruc-ok').hidden = false;
  track('contratar_ruc_validado', { ruc });

  setTimeout(() => {
    closeModal($('#modal-contratar-ruc'));
    resetPagoForm();
    $('#pago-fecha').value = todayISO();
    openModal($('#modal-pago'));
  }, 700);
}

// =========================================================================
//   FORMATEOS COMPARTIDOS (cotizador + PDF)
// =========================================================================

function formatMoney(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatMiles(n) {
  return n.toLocaleString('en-US');
}
function formatFechaLarga(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mes = NOMBRE_MESES[d.getMonth()];
  const yy = d.getFullYear();
  return `${dd}-${mes}-${yy}`;
}
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// =========================================================================
//   PDF DE COTIZACIÓN
//   Generación 100% nativa con jsPDF. Cuerpo en Roboto Condensed (TTF
//   embebido) — texto seleccionable. Header como imagen Canvas con
//   Avenida + Lobster del navegador. Resultado: ~150-200 KB.
// =========================================================================

const JSPDF_CDN = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
const RC_REGULAR_TTF = './assets/fonts/RobotoCondensed-Regular.ttf';
const RC_BOLD_TTF    = './assets/fonts/RobotoCondensed-Bold.ttf';

let _jspdfPromise = null;
function loadJsPDF() {
  if (typeof window !== 'undefined' && window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (_jspdfPromise) return _jspdfPromise;
  _jspdfPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSPDF_CDN;
    s.async = true;
    s.onload = () => window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('jsPDF no se inicializó'));
    s.onerror = () => reject(new Error('No se pudo cargar jsPDF'));
    document.head.appendChild(s);
  });
  return _jspdfPromise;
}

const _fontCache = {};
async function fetchTTFAsBase64(url) {
  if (_fontCache[url]) return _fontCache[url];
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`No se pudo cargar la fuente: ${url}`);
  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  _fontCache[url] = btoa(binary);
  return _fontCache[url];
}

async function ensureRobotoCondensedInPdf(doc) {
  const [reg, bold] = await Promise.all([
    fetchTTFAsBase64(RC_REGULAR_TTF),
    fetchTTFAsBase64(RC_BOLD_TTF),
  ]);
  doc.addFileToVFS('RobotoCondensed-Regular.ttf', reg);
  doc.addFont('RobotoCondensed-Regular.ttf', 'RobotoCondensed', 'normal');
  doc.addFileToVFS('RobotoCondensed-Bold.ttf', bold);
  doc.addFont('RobotoCondensed-Bold.ttf', 'RobotoCondensed', 'bold');
}

function loadLogoImage() {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = './assets/Logo%20TributaSoft.png';
  });
}

async function renderCotizacionHeaderImage() {
  if (document.fonts?.load) {
    await Promise.all([
      document.fonts.load('44px "Avenida"'),
      document.fonts.load('44px "Lobster"'),
      document.fonts.load('22px "Lobster"'),
    ]).catch(() => {});
  }
  if (document.fonts?.ready) await document.fonts.ready;

  const W = 794;
  const H = 80;
  const SCALE = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const logoImg = await loadLogoImage();
  let cursorX = 50;
  if (logoImg && logoImg.width && logoImg.height) {
    const logoH = 56;
    const logoW = logoImg.width * (logoH / logoImg.height);
    ctx.drawImage(logoImg, cursorX, 6, logoW, logoH);
    cursorX += logoW + 14;
  }

  ctx.textBaseline = 'alphabetic';
  ctx.font = '44px Avenida, "DM Sans", sans-serif';
  ctx.fillStyle = '#c9dee9';
  const baselineY = 44;
  ctx.fillText('Tributa', cursorX, baselineY);
  const tributaW = ctx.measureText('Tributa').width;

  ctx.font = '44px Lobster, cursive';
  ctx.fillStyle = '#EF7306';
  ctx.fillText('Soft', cursorX + tributaW, baselineY);
  const softW = ctx.measureText('Soft').width;

  ctx.font = '22px Lobster, cursive';
  ctx.fillStyle = '#6b7280';
  ctx.fillText('...todo bajo control', cursorX + tributaW + softW + 18, baselineY);

  ctx.strokeStyle = '#00236f';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(50, 70);
  ctx.lineTo(W - 50, 70);
  ctx.stroke();

  return { dataUrl: canvas.toDataURL('image/png'), w: W, h: H };
}

// Iconos Feather dibujados con primitivas jsPDF (líneas/rect/círculos).
function drawIconHome(doc, x, y, s = 3.5) {
  doc.line(x, y + s * 0.55, x + s / 2, y);
  doc.line(x + s / 2, y, x + s, y + s * 0.55);
  doc.line(x + s * 0.12, y + s * 0.5, x + s * 0.12, y + s);
  doc.line(x + s * 0.88, y + s * 0.5, x + s * 0.88, y + s);
  doc.line(x + s * 0.12, y + s, x + s * 0.88, y + s);
  doc.line(x + s * 0.4, y + s * 0.7, x + s * 0.4, y + s);
  doc.line(x + s * 0.6, y + s * 0.7, x + s * 0.6, y + s);
  doc.line(x + s * 0.4, y + s * 0.7, x + s * 0.6, y + s * 0.7);
}
function drawIconMail(doc, x, y, s = 3.5) {
  doc.rect(x, y + s * 0.2, s, s * 0.6);
  doc.line(x, y + s * 0.2, x + s / 2, y + s * 0.55);
  doc.line(x + s / 2, y + s * 0.55, x + s, y + s * 0.2);
}
function drawIconPhone(doc, x, y, s = 3.5) {
  doc.roundedRect(x + s * 0.2, y, s * 0.6, s, 0.4, 0.4);
  doc.line(x + s * 0.42, y + s * 0.85, x + s * 0.58, y + s * 0.85);
}
function drawIconGlobe(doc, x, y, s = 3.5) {
  doc.circle(x + s / 2, y + s / 2, s / 2);
  doc.line(x, y + s / 2, x + s, y + s / 2);
  doc.line(x + s / 2, y, x + s / 2, y + s);
  doc.ellipse(x + s / 2, y + s / 2, s * 0.22, s / 2);
}
function drawIconWA(doc, x, y, s = 3.5) {
  doc.circle(x + s / 2, y + s / 2, s * 0.48);
  doc.line(x + s * 0.32, y + s * 0.42, x + s * 0.45, y + s * 0.55);
  doc.line(x + s * 0.45, y + s * 0.55, x + s * 0.6, y + s * 0.65);
  doc.line(x + s * 0.6, y + s * 0.65, x + s * 0.7, y + s * 0.55);
}

function drawIconText(doc, drawFn, x, y, label) {
  const iconSize = 3.2;
  const iconY = y - iconSize + 0.4;
  doc.setLineWidth(0.25);
  doc.setDrawColor(107, 114, 128);
  drawFn(doc, x, iconY, iconSize);
  doc.setTextColor(107, 114, 128);
  doc.text(label, x + iconSize + 1.3, y);
  return iconSize + 1.3 + doc.getTextWidth(label);
}

async function descargarCotizacionPDF() {
  const btn = $('#cot-descargar');
  setBusy(btn, true);
  try {
    const docsMes = parseInt($('#cot-docs').value, 10);
    if (!Number.isInteger(docsMes) || docsMes < 1) {
      showBanner('Calcula primero la cotización antes de descargar.', 'warn');
      return;
    }
    const anual = docsMes * 12;
    const subtotal = 6 + anual * 0.20;
    const iva = subtotal * 0.15;
    const total = subtotal + iva;
    const hoy = new Date();
    const vence = new Date(hoy.getFullYear() + 1, hoy.getMonth(), hoy.getDate());

    const JsPDFCtor = await loadJsPDF();
    const doc = new JsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });

    const [, headerImg] = await Promise.all([
      ensureRobotoCondensedInPdf(doc),
      renderCotizacionHeaderImage(),
    ]);

    const PAGE_W = 210;
    const PAGE_H = 297;
    const MARGIN_X = 18;
    const RIGHT = PAGE_W - MARGIN_X;
    const NAVY = [0, 35, 111];
    const ORANGE = [239, 115, 6];
    const TEXT = [40, 40, 40];
    const MUTED = [107, 114, 128];
    const SUBTLE = [75, 85, 99];

    // ---- HEADER (Canvas con tipografía corporativa) ----
    const headerWmm = PAGE_W;
    const headerHmm = headerImg.h * headerWmm / headerImg.w;
    doc.addImage(headerImg.dataUrl, 'PNG', 0, 6, headerWmm, headerHmm);
    let y = 6 + headerHmm + 4;

    doc.setFont('RobotoCondensed', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...SUBTLE);
    const fechaLarga = `Guayaquil, ${hoy.getDate()} de ${NOMBRE_MESES[hoy.getMonth()].toLowerCase()} del ${hoy.getFullYear()}`;
    doc.text(fechaLarga, RIGHT, y, { align: 'right' });

    // ---- TÍTULO + INTRO ----
    y += 10;
    doc.setFont('RobotoCondensed', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...NAVY);
    doc.text('Cotización de servicios', MARGIN_X, y);

    y += 7;
    doc.setFont('RobotoCondensed', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...TEXT);
    doc.text('Estimado cliente:', MARGIN_X, y);
    y += 5;
    const intro = 'A continuación, el detalle de la cotización personalizada para su plan de facturación electrónica con TributaSoft, calculada sobre el volumen mensual de comprobantes indicado.';
    const introLines = doc.splitTextToSize(intro, RIGHT - MARGIN_X);
    doc.text(introLines, MARGIN_X, y);
    y += introLines.length * 4.5 + 3;

    // ---- TABLA ----
    const tblX = MARGIN_X;
    const tblW = RIGHT - MARGIN_X;
    const valX = RIGHT - 2;
    const headH = 7;
    const rowH = 6;
    const totalH = 8;

    doc.setFillColor(...NAVY);
    doc.rect(tblX, y, tblW, headH, 'F');
    doc.setFont('RobotoCondensed', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.text('Concepto', tblX + 3, y + 4.7);
    doc.text('Valor', valX, y + 4.7, { align: 'right' });
    y += headH;

    const filas = [
      ['Documentos promedio por mes', docsMes.toLocaleString('en-US')],
      ['Documentos por año', formatMiles(anual)],
      ['Subtotal', formatMoney(subtotal)],
      ['IVA (15%)', formatMoney(iva)],
    ];
    doc.setFont('RobotoCondensed', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...TEXT);
    filas.forEach((row, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(tblX, y, tblW, rowH, 'F');
      }
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.15);
      doc.line(tblX, y + rowH, tblX + tblW, y + rowH);
      doc.text(row[0], tblX + 3, y + 4);
      doc.text(row[1], valX, y + 4, { align: 'right' });
      y += rowH;
    });

    doc.setFillColor(...ORANGE);
    doc.rect(tblX, y, tblW, totalH, 'F');
    doc.setFont('RobotoCondensed', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text('Total', tblX + 3, y + 5.5);
    doc.text(formatMoney(total), valX, y + 5.5, { align: 'right' });
    y += totalH + 6;

    // ---- VIGENCIA + NOTAS ----
    doc.setFont('RobotoCondensed', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...SUBTLE);
    doc.text('Plan vigente hasta el ', MARGIN_X, y);
    const vigPrefixW = doc.getTextWidth('Plan vigente hasta el ');
    doc.setFont('RobotoCondensed', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(`${formatFechaLarga(vence)}.`, MARGIN_X + vigPrefixW, y);

    y += 6;
    doc.setFont('RobotoCondensed', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    const notas = 'Los valores expresados están en dólares de los Estados Unidos de América (USD). El plan se renueva al cumplir 12 meses desde la fecha de contratación o al alcanzar el volumen anual contratado, lo que ocurra primero.';
    const notasLines = doc.splitTextToSize(notas, RIGHT - MARGIN_X);
    doc.text(notasLines, MARGIN_X, y);
    y += notasLines.length * 3.8 + 8;

    // ---- FIRMA ----
    doc.setFont('RobotoCondensed', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...TEXT);
    doc.text('Atentamente,', MARGIN_X, y);
    y += 5;
    doc.setFont('RobotoCondensed', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    doc.text('TributaSoft S.A.', MARGIN_X, y);
    y += 5;
    doc.setFont('RobotoCondensed', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...SUBTLE);
    doc.text('Departamento de Facturación Electrónica Pre-Pago', MARGIN_X, y);
    y += 4.5;
    doc.text('RUC: 0992703601001', MARGIN_X, y);

    // ---- FOOTER ----
    const footY = PAGE_H - 22;
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_X, footY, RIGHT, footY);

    doc.setFont('RobotoCondensed', 'normal');
    doc.setFontSize(8.5);
    let fy = footY + 5.2;
    let fx = MARGIN_X;
    fx += drawIconText(doc, drawIconHome, fx, fy, 'Machala 1002 y Hurtado, Edificio Coral, Piso 1, Oficina 15');
    fx += 6;
    drawIconText(doc, drawIconMail, fx, fy, 'ventas@tributasoft.ec');

    fy += 5;
    fx = MARGIN_X;
    fx += drawIconText(doc, drawIconPhone, fx, fy, '099-6345-284  ·  099-842-9901');
    fx += 6;
    fx += drawIconText(doc, drawIconWA, fx, fy, '04-600-4992');
    fx += 6;
    drawIconText(doc, drawIconGlobe, fx, fy, 'www.tributasoft.ec');

    // ---- GUARDAR ----
    const stamp = `${hoy.getFullYear()}${String(hoy.getMonth()+1).padStart(2,'0')}${String(hoy.getDate()).padStart(2,'0')}`;
    doc.save(`cotizacion-tributasoft-${stamp}.pdf`);

    try {
      const blob = doc.output('blob');
      track('cotizacion_pdf_descargada', { docsMes, total: total.toFixed(2), bytes: blob.size });
    } catch {
      track('cotizacion_pdf_descargada', { docsMes, total: total.toFixed(2) });
    }
  } catch (err) {
    console.error(err);
    showBanner('No pudimos generar el PDF. Revisa tu conexión e intenta de nuevo.', 'error');
  } finally {
    setBusy(btn, false);
  }
}

// =========================================================================
//   PAGO (renovación prepago)
// =========================================================================

const PAGO_MAX_BYTES = 400 * 1024;
const PAGO_MIME_OK = new Set(['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']);

function onPagoArchivoChange(e) {
  const err = $('#pago-archivo-error');
  err.textContent = '';
  const file = e.target.files[0];
  if (!file) { updatePagoSubmit(); return; }

  const lower = (file.name || '').toLowerCase();
  const extOk = lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.pdf');
  const mimeOk = PAGO_MIME_OK.has(file.type) || (!file.type && extOk);

  if (!extOk || !mimeOk) {
    err.textContent = 'Sólo se aceptan archivos JPG, PNG o PDF.';
    e.target.value = '';
    updatePagoSubmit();
    return;
  }
  if (file.size > PAGO_MAX_BYTES) {
    err.textContent = 'El archivo no puede pesar más de 400 KB.';
    e.target.value = '';
    updatePagoSubmit();
    return;
  }
  updatePagoSubmit();
}

function updatePagoSubmit() {
  const ok =
    !!$('#pago-banco').value &&
    !!$('#pago-fecha').value &&
    !!$('#pago-forma').value &&
    $('#pago-archivo').files.length > 0 &&
    !!$('#pago-acepta-terminos').checked;
  $('#pago-enviar').disabled = !ok;
}

function onPagoEnviar() {
  track('pago_enviado', {
    banco: $('#pago-banco').value,
    fecha: $('#pago-fecha').value,
    forma: $('#pago-forma').value,
    tamaño: $('#pago-archivo').files[0]?.size || 0,
  });
  showBanner('Pago reportado. Validaremos en máximo 2 horas y te avisaremos por correo.', 'info', 7000);
  closeModal($('#modal-pago'));
  resetPagoForm();
}

function resetPagoForm() {
  $('#pago-banco').value = '';
  $('#pago-fecha').value = '';
  $('#pago-forma').value = '';
  $('#pago-archivo').value = '';
  $('#pago-acepta-terminos').checked = false;
  $('#pago-archivo-error').textContent = '';
  $('#pago-enviar').disabled = true;
}

// =========================================================================
//   TÉRMINOS Y CONDICIONES (modal con scroll-to-bottom)
// =========================================================================

let _termsTargetId = null;

function openTerms(targetCheckboxId) {
  _termsTargetId = targetCheckboxId || null;
  const body = $('#terms-body');
  body.scrollTop = 0;
  $('#terms-aceptar').disabled = true;
  $('#terms-hint').textContent = 'Desliza hasta el final del documento para habilitar la aceptación.';
  $('#terms-hint').classList.remove('is-bottom');
  openModal($('#modal-terms'));
  setTimeout(checkTermsBottom, 60);
}

function checkTermsBottom() {
  const body = $('#terms-body');
  if (!body) return;
  const reached = body.scrollTop + body.clientHeight >= body.scrollHeight - 8;
  if (reached) {
    $('#terms-aceptar').disabled = false;
    $('#terms-hint').textContent = '✓ Ya puedes aceptar los términos.';
    $('#terms-hint').classList.add('is-bottom');
  }
}

function onTermsAceptar() {
  if (_termsTargetId) {
    const cb = document.getElementById(_termsTargetId);
    if (cb && !cb.checked) {
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  track('terms_aceptados', { context: _termsTargetId });
  closeModal($('#modal-terms'));
}

// =========================================================================
//   TOOLTIPS + COPY BUTTONS (delegación global)
// =========================================================================

let _tooltipAnchor = null;

function onDocumentClick(e) {
  // 1) Botones Copiar al portapapeles
  const copyTrigger = e.target.closest('.copy-btn');
  if (copyTrigger) {
    e.preventDefault();
    e.stopPropagation();
    handleCopy(copyTrigger);
    return;
  }

  // 2) Tooltips informativos "i"
  const trigger = e.target.closest('.tooltip-i');
  if (trigger) {
    e.preventDefault();
    e.stopPropagation();
    const key = trigger.dataset.tooltip;
    if (_tooltipAnchor === trigger && !$('#tooltip-popover').hidden) {
      closeTooltip();
      return;
    }
    showTooltip(key, trigger);
    return;
  }

  // 3) Click fuera del popover → cerrar
  if (!e.target.closest('#tooltip-popover')) {
    closeTooltip();
  }
}

function injectCopyIcons() {
  $$('.copy-btn').forEach((btn) => {
    if (btn.querySelector('svg')) return;
    btn.innerHTML = COPY_ICON_DEFAULT + COPY_ICON_SUCCESS;
  });
}

async function handleCopy(button) {
  const text = button.dataset.copy || '';
  if (!text) return;

  let ok = false;

  // 1) Camino moderno (Clipboard API).
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch { /* fallthrough */ }
  }

  // 2) Fallback con <textarea> + execCommand('copy').
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      document.body.removeChild(ta);
    } catch { ok = false; }
  }

  if (ok) {
    button.classList.add('is-copied');
    const prevLabel = button.getAttribute('aria-label') || '';
    button.setAttribute('aria-label', 'Copiado al portapapeles');
    setTimeout(() => {
      button.classList.remove('is-copied');
      if (prevLabel) button.setAttribute('aria-label', prevLabel);
    }, 1500);
    track('clipboard_copy', { len: text.length });
  } else {
    showBanner('No pudimos copiar al portapapeles.', 'warn', 3000);
  }
}

function showTooltip(key, anchor) {
  const data = TOOLTIPS[key];
  if (!data) return;
  _tooltipAnchor = anchor;
  const pop = $('#tooltip-popover');
  $('#tooltip-popover-title').textContent = data.title;
  $('#tooltip-popover-body').textContent = data.body;
  pop.hidden = false;
  positionTooltip(pop, anchor);
}

function positionTooltip(pop, anchor) {
  const rect = anchor.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;

  let top = rect.bottom + 8;
  let left = rect.left;

  if (left + popRect.width > vw - margin) left = vw - popRect.width - margin;
  if (left < margin) left = margin;
  if (top + popRect.height > vh - margin) {
    top = rect.top - popRect.height - 8;
  }
  if (top < margin) top = margin;

  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}

function closeTooltip() {
  const pop = $('#tooltip-popover');
  if (pop) pop.hidden = true;
  _tooltipAnchor = null;
}
