// app.js — Orquestador principal: conecta la máquina de estados, los validators,
// el cliente SRI y los mocks del backend con el DOM.

import {
  validarRUC, validarCelular, validarEmail, validarClave,
  validarFirmaArchivo, validarCodigoToken,
} from './validators.js';
import { createMachine, STATES, EVENTS } from './state-machine.js';
import { consultarRUC } from './sri-client.js';
import { COUNTRIES, findCountry, regionalIndicator } from './countries.js';
import {
  clienteExiste, iniciarRegistro, verificarToken,
  establecerClave, validarFirma, finalizarRegistro,
} from './api-mocks.js';

// ---------- Analytics ----------
function track(name, detail = {}) {
  window.dispatchEvent(new CustomEvent('tributasoft:event', { detail: { name, ...detail } }));
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

// ---------- Modales ----------
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
  celularPais: 'EC',          // ISO alpha-2 del país del celular
  celularEsEcuador: true,
  razonSocial: '',
  nombreComercial: '',
  nombreComercialNA: false,
  direccion: '',
  provincia: '',
  ciudad: '',
  regimen: '',
  modoFacturacion: 'nuevo',
  establecimientos: [],
  tokenSentTo: '',
};

// Tipos de documento para configurar secuencia
const TIPOS_DOCUMENTO = [
  { id: 'factura', label: 'Facturas' },
  { id: 'nc', label: 'Notas de crédito' },
  { id: 'nd', label: 'Notas de débito' },
  { id: 'retencion', label: 'Comprobantes de retención' },
  { id: 'guia', label: 'Guías de remisión' },
];

// ---------- Wire up ----------
document.addEventListener('DOMContentLoaded', () => {
  track('landing_view', { url: location.href });

  const draft = loadDraft();
  if (draft?.ruc) { $('#ruc').value = draft.ruc; }

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

  // Nombre comercial "No aplica"
  $('#nombre-comercial-na').addEventListener('change', onNombreComercialNAToggle);

  // Poblar select de país y configurar listener
  poblarSelectPaises();
  $('#celular-pais').addEventListener('change', onPaisChange);

  // Celular: re-evaluar canales disponibles al escribir
  $('#celular').addEventListener('input', onCelularInput);

  // Modo de facturación
  $$('input[name="modo-facturacion"]').forEach((r) =>
    r.addEventListener('change', onModoFacturacionChange)
  );

  // Agregar establecimiento
  $('#btn-add-establecimiento').addEventListener('click', () => {
    addEstablecimiento();
  });

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
    if (e.key === 'Escape') $$('dialog.is-open').forEach(closeModal);
  });

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
      setTimeout(() => { window.location.href = dbResp.url_redirect; }, 1500);
      return;
    }
    machine.send(EVENTS.DB_NEW);

    const sri = await consultarRUC(ruc);
    if (sri && sri.found) {
      flow.rucInfo = sri;
      flow.razonSocial = sri.razonSocial || '';
      flow.nombreComercial = sri.nombreComercial || '';
      flow.direccion = sri.direccion || '';
      flow.provincia = sri.provincia || '';
      flow.ciudad = sri.ciudad || '';
      flow.regimen = sri.regimen || '';
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

  // Razón social
  $('#razon-social').value = flow.razonSocial || '';

  // Nombre comercial
  $('#nombre-comercial').value = flow.nombreComercial || '';

  // Dirección / Provincia / Ciudad
  $('#direccion').value = flow.direccion || '';
  if (flow.provincia) {
    const sel = $('#provincia');
    // Buscar match case-insensitive
    const opt = Array.from(sel.options).find(
      (o) => o.value.toUpperCase() === (flow.provincia || '').toUpperCase()
    );
    if (opt) sel.value = opt.value;
  }
  $('#ciudad').value = flow.ciudad || '';

  // Régimen — match a una de las 3 opciones del combobox
  if (flow.regimen) {
    const sel = $('#regimen');
    const upper = flow.regimen.toUpperCase();
    let match = '';
    if (upper.includes('NEGOCIO POPULAR')) match = 'RIMPE - NEGOCIO POPULAR';
    else if (upper.includes('EMPRENDEDOR')) match = 'RIMPE - EMPRENDEDOR';
    else if (upper.includes('GENERAL')) match = 'GENERAL';
    if (match) sel.value = match;
  }

  // Banner SRI: si falló → mostrar y resaltar campos editables
  $('#sri-banner').hidden = !!flow.rucInfo;

  // Header
  $('#razon-social-static').textContent = flow.razonSocial || flow.ruc;
  $('#ruc-display').textContent = flow.ruc;

  // Inicializa establecimientos según modo (por defecto "nuevo")
  flow.modoFacturacion = $('input[name="modo-facturacion"]:checked')?.value || 'nuevo';
  flow.establecimientos = [crearEstablecimientoVacio(true)];
  renderEstablecimientos();

  // Inicializa canales según celular actual (vacío al inicio)
  actualizarCanalesDisponibles();

  // Foco al primer campo
  setTimeout(() => $('#email').focus(), 250);
}

// ---------- Nombre Comercial — "No aplica" ----------
function onNombreComercialNAToggle(e) {
  const na = e.target.checked;
  flow.nombreComercialNA = na;
  const input = $('#nombre-comercial');
  if (na) {
    input.value = '';
    input.disabled = true;
    input.setAttribute('aria-invalid', 'false');
    setFieldError('nombre-comercial', '');
  } else {
    input.disabled = false;
    input.focus();
  }
}

// ---------- Celular + país + canales ----------
function poblarSelectPaises() {
  const sel = $('#celular-pais');
  if (!sel) return;
  sel.innerHTML = '';
  COUNTRIES.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.code;
    opt.textContent = `${regionalIndicator(c.code)} ${c.name} (+${c.dial})`;
    sel.appendChild(opt);
  });
  sel.value = 'EC';
  flow.celularPais = 'EC';
}

function onPaisChange(e) {
  flow.celularPais = e.target.value;
  const pais = findCountry(flow.celularPais);
  // Actualizar placeholder e input
  const input = $('#celular');
  input.placeholder = pais.placeholder || 'XXXXXXXX';
  input.value = ''; // reset al cambiar de país para evitar mezcla
  actualizarCanalesDisponibles();
  input.focus();
}

function onCelularInput() {
  actualizarCanalesDisponibles();
}

function actualizarCanalesDisponibles() {
  const pais = findCountry(flow.celularPais);
  const esEcuador = pais.code === 'EC';
  flow.celularEsEcuador = esEcuador;

  const warn = $('#celular-warn');
  const hint = $('#celular-hint');

  // Actualizar hint con el formato esperado del país
  if (hint) {
    hint.textContent = `Formato para ${pais.name}: ${pais.placeholder || 'sólo dígitos'}.`;
  }

  // Habilitar/deshabilitar SMS sólo si el país es Ecuador
  const smsLabel = $('#canal-options label[data-canal="sms"]');
  const smsRadio = smsLabel.querySelector('input[type="radio"]');
  if (!esEcuador) {
    smsLabel.classList.add('canal-disabled');
    smsRadio.disabled = true;
    if (smsRadio.checked) {
      const waRadio = $('#canal-options input[value="whatsapp"]');
      waRadio.checked = true;
      flow.canal = 'whatsapp';
    }
    warn.textContent = `Para ${pais.name} sólo disponible WhatsApp o Email (SMS bloqueado fuera de Ecuador).`;
  } else {
    smsLabel.classList.remove('canal-disabled');
    smsRadio.disabled = false;
    warn.textContent = '';
  }
}

// ---------- Modo de facturación + Establecimientos ----------
const MAX_ESTABLECIMIENTOS = 3;
const MAX_PUNTOS_POR_EST = 2;
const NOMBRE_PUNTO_REGEX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .,_-]{0,50}$/;

function onModoFacturacionChange(e) {
  flow.modoFacturacion = e.target.value;
  // En todos los modos arranca con 001/Matriz por defecto.
  // El lápiz le permite al usuario editarlo después.
  flow.establecimientos = [crearEstablecimientoVacio(true)];
  renderEstablecimientos();
}

function crearPuntoEmision(codigo = '', nombre = '') {
  const secuencias = {};
  TIPOS_DOCUMENTO.forEach((t) => { secuencias[t.id] = '1'; });
  return {
    id: 'pe-' + Math.random().toString(36).slice(2, 9),
    codigo,
    nombre,
    secuencias,
  };
}

function crearEstablecimientoVacio(esDefault = false) {
  return {
    id: 'est-' + Math.random().toString(36).slice(2, 9),
    establecimiento: esDefault ? '001' : '',
    editando: false,
    puntos: [crearPuntoEmision(esDefault ? '001' : '', esDefault ? 'Matriz' : '')],
  };
}

function addEstablecimiento() {
  if (flow.establecimientos.length >= MAX_ESTABLECIMIENTOS) return;
  const usados = flow.establecimientos
    .map((e) => parseInt(e.establecimiento, 10))
    .filter((n) => !isNaN(n));
  const siguiente = (Math.max(0, ...usados) + 1).toString().padStart(3, '0');

  const nuevo = {
    id: 'est-' + Math.random().toString(36).slice(2, 9),
    establecimiento: siguiente,
    editando: false, // arranca bloqueado; el usuario hace clic en el lápiz para editar
    puntos: [crearPuntoEmision('001', 'Matriz')],
  };
  flow.establecimientos.push(nuevo);
  renderEstablecimientos();
}

function removeEstablecimiento(id) {
  if (flow.establecimientos.length <= 1) return;
  flow.establecimientos = flow.establecimientos.filter((e) => e.id !== id);
  renderEstablecimientos();
}

function toggleEditEstablecimiento(id) {
  const est = flow.establecimientos.find((e) => e.id === id);
  if (!est) return;
  // Si estábamos editando y vamos a cerrar, validamos el código antes de guardar.
  if (est.editando) {
    const raw = (est.establecimiento || '').replace(/\D/g, '');
    if (!raw) est.establecimiento = '001';
    else {
      const padded = raw.padStart(3, '0'); // pad SÓLO a la izquierda
      if (padded === '000') {
        showBanner('El código del establecimiento debe estar entre 001 y 999.', 'warn');
        est.establecimiento = '001';
      } else {
        est.establecimiento = padded;
      }
    }
  }
  est.editando = !est.editando;
  renderEstablecimientos();
}

function addPunto(estId) {
  const est = flow.establecimientos.find((e) => e.id === estId);
  if (!est || est.puntos.length >= MAX_PUNTOS_POR_EST) return;
  const usados = est.puntos.map((p) => parseInt(p.codigo, 10)).filter((n) => !isNaN(n));
  const siguiente = (Math.max(0, ...usados) + 1).toString().padStart(3, '0');
  est.puntos.push(crearPuntoEmision(siguiente, ''));
  renderEstablecimientos();
}

function removePunto(estId, puntoId) {
  const est = flow.establecimientos.find((e) => e.id === estId);
  if (!est || est.puntos.length <= 1) return;
  est.puntos = est.puntos.filter((p) => p.id !== puntoId);
  renderEstablecimientos();
}

function renderEstablecimientos() {
  const list = $('#establecimientos-list');
  const counter = $('#establecimientos-counter');
  const addBtn = $('#btn-add-establecimiento');
  if (!list) return;

  const modo = flow.modoFacturacion;
  const muestraSecuencia = modo === 'continuar' || modo === 'reiniciar';

  counter.textContent = `${flow.establecimientos.length} de ${MAX_ESTABLECIMIENTOS}`;
  addBtn.disabled = flow.establecimientos.length >= MAX_ESTABLECIMIENTOS;

  list.innerHTML = '';
  flow.establecimientos.forEach((est, idx) => {
    const div = document.createElement('div');
    div.className = 'establecimiento-item';
    div.dataset.id = est.id;

    // Por defecto el código del establecimiento queda bloqueado tras crearse.
    // Sólo se edita cuando el usuario hace clic en el lápiz (toggle est.editando).
    const puedeEditarCodigo = !!est.editando;

    const puntosHtml = est.puntos.map((punto, pIdx) => `
      <div class="punto-item" data-punto-id="${punto.id}">
        <div class="punto-header">
          <span class="punto-label">Punto de emisión #${pIdx + 1}</span>
          ${est.puntos.length > 1 ? `
            <button type="button" class="btn-icon" data-action="remove-punto" aria-label="Quitar punto de emisión">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <line x1="6" y1="6" x2="18" y2="18"/>
                <line x1="6" y1="18" x2="18" y2="6"/>
              </svg>
            </button>
          ` : ''}
        </div>
        <div class="punto-fields">
          <div class="field">
            <label>Código</label>
            <input type="text" maxlength="3" class="punto-codigo" data-punto-campo="codigo" value="${punto.codigo}" inputmode="numeric">
          </div>
          <div class="field">
            <label>Nombre corto (máx 50)</label>
            <input type="text" maxlength="50" data-punto-campo="nombre" value="${escapeAttr(punto.nombre)}" placeholder="Ej: Matriz, Sucursal Norte">
          </div>
        </div>
        ${muestraSecuencia ? `
          <div class="secuencias">
            <p class="secuencias-titulo">Próxima secuencia por tipo de documento</p>
            <div class="secuencias-grid">
              ${TIPOS_DOCUMENTO.map((t) => `
                <div class="secuencia-row">
                  <span class="secuencia-label">${t.label}</span>
                  <input type="text" data-punto-secuencia="${t.id}" value="${punto.secuencias[t.id] || '1'}" inputmode="numeric" maxlength="9">
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `).join('');

    div.innerHTML = `
      <div class="establecimiento-header">
        <span class="establecimiento-label">Establecimiento #${idx + 1}</span>
        <div class="establecimiento-actions">
          <button type="button" class="btn-icon" data-action="edit" aria-label="${est.editando ? 'Guardar' : 'Editar establecimiento'}" title="${est.editando ? 'Guardar' : 'Editar código'}">
            ${est.editando ? `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ` : `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            `}
          </button>
          ${flow.establecimientos.length > 1 ? `
            <button type="button" class="btn-icon" data-action="remove" aria-label="Quitar establecimiento">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <line x1="6" y1="6" x2="18" y2="18"/>
                <line x1="6" y1="18" x2="18" y2="6"/>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
      <div class="establecimiento-codigos">
        <div class="field">
          <label>Código de establecimiento</label>
          <input type="text" maxlength="3" class="establecimiento-codigo-input" data-campo="establecimiento" value="${est.establecimiento}" ${puedeEditarCodigo ? '' : 'disabled'} inputmode="numeric">
        </div>
      </div>
      <div class="puntos-emision">
        <p class="puntos-emision-titulo">
          <span>Puntos de emisión</span>
          <span class="hint" style="margin:0;text-transform:none;letter-spacing:0">${est.puntos.length} de ${MAX_PUNTOS_POR_EST}</span>
        </p>
        ${puntosHtml}
        <button type="button" class="btn-add-punto" data-action="add-punto" ${est.puntos.length >= MAX_PUNTOS_POR_EST ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Agregar punto de emisión
        </button>
      </div>
    `;

    list.appendChild(div);

    // Listeners: establecimiento código
    // - Sólo dígitos, máx 3.
    // - Al perder foco, completa con ceros a la izquierda (NUNCA a la derecha).
    // - Rechaza "000": revierte al último valor válido o, en su defecto, a "001".
    div.querySelectorAll('input[data-campo]').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const v = e.target.value.replace(/\D/g, '').slice(0, 3);
        e.target.value = v;
        est[e.target.dataset.campo] = v;
      });
      inp.addEventListener('blur', (e) => {
        const raw = e.target.value.replace(/\D/g, '');
        if (!raw) {
          // Vacío: revertir al valor previo o a 001
          const fallback = (est[e.target.dataset.campo] && /^\d{3}$/.test(est[e.target.dataset.campo]) && est[e.target.dataset.campo] !== '000')
            ? est[e.target.dataset.campo]
            : '001';
          e.target.value = fallback;
          est[e.target.dataset.campo] = fallback;
          return;
        }
        // Pad SÓLO a la izquierda (padStart, nunca padEnd)
        const padded = raw.padStart(3, '0');
        if (padded === '000') {
          showBanner('El código del establecimiento debe estar entre 001 y 999.', 'warn');
          e.target.value = '001';
          est[e.target.dataset.campo] = '001';
          return;
        }
        e.target.value = padded;
        est[e.target.dataset.campo] = padded;
      });
    });

    // Listeners: puntos
    div.querySelectorAll('.punto-item').forEach((puntoDiv) => {
      const puntoId = puntoDiv.dataset.puntoId;
      const punto = est.puntos.find((p) => p.id === puntoId);
      if (!punto) return;

      // Código del punto (3 dígitos, 001-999, pad sólo a la izquierda)
      const codigoInp = puntoDiv.querySelector('input[data-punto-campo="codigo"]');
      codigoInp.addEventListener('input', (e) => {
        const v = e.target.value.replace(/\D/g, '').slice(0, 3);
        e.target.value = v;
        punto.codigo = v;
      });
      codigoInp.addEventListener('blur', (e) => {
        const raw = e.target.value.replace(/\D/g, '');
        if (!raw) {
          const fallback = (punto.codigo && /^\d{3}$/.test(punto.codigo) && punto.codigo !== '000') ? punto.codigo : '001';
          e.target.value = fallback;
          punto.codigo = fallback;
          return;
        }
        const padded = raw.padStart(3, '0'); // pad SÓLO a la izquierda
        if (padded === '000') {
          showBanner('El código del punto de emisión debe estar entre 001 y 999.', 'warn');
          e.target.value = '001';
          punto.codigo = '001';
          return;
        }
        e.target.value = padded;
        punto.codigo = padded;
      });

      // Nombre corto (sin caracteres especiales, máx 50)
      const nombreInp = puntoDiv.querySelector('input[data-punto-campo="nombre"]');
      nombreInp.addEventListener('input', (e) => {
        const filtered = e.target.value
          .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .,_-]/g, '')
          .slice(0, 50);
        if (filtered !== e.target.value) e.target.value = filtered;
        punto.nombre = filtered;
        nombreInp.setAttribute('aria-invalid', NOMBRE_PUNTO_REGEX.test(punto.nombre) ? 'false' : 'true');
      });

      // Secuencias por tipo de documento (sólo si modo lo muestra)
      puntoDiv.querySelectorAll('input[data-punto-secuencia]').forEach((inp) => {
        inp.addEventListener('input', (e) => {
          const v = e.target.value.replace(/\D/g, '');
          e.target.value = v;
          punto.secuencias[e.target.dataset.puntoSecuencia] = v || '1';
        });
      });

      const removePuntoBtn = puntoDiv.querySelector('[data-action="remove-punto"]');
      if (removePuntoBtn) removePuntoBtn.addEventListener('click', () => removePunto(est.id, punto.id));
    });

    const editBtn = div.querySelector('[data-action="edit"]');
    if (editBtn) editBtn.addEventListener('click', () => toggleEditEstablecimiento(est.id));
    const removeBtn = div.querySelector('[data-action="remove"]');
    if (removeBtn) removeBtn.addEventListener('click', () => removeEstablecimiento(est.id));
    const addPuntoBtn = div.querySelector('[data-action="add-punto"]');
    if (addPuntoBtn) addPuntoBtn.addEventListener('click', () => addPunto(est.id));
  });
}

function escapeAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- Submit del form ----------
async function onFormSubmit(e) {
  e.preventDefault();

  const razonSocial = $('#razon-social').value.trim();
  const nombreComercial = $('#nombre-comercial').value.trim();
  const nombreComercialNA = $('#nombre-comercial-na').checked;
  const direccion = $('#direccion').value.trim();
  const provincia = $('#provincia').value;
  const ciudad = $('#ciudad').value.trim();
  const regimen = $('#regimen').value;
  const email = $('#email').value;
  const celular = $('#celular').value;
  const canal = $('input[name="canal-token"]:checked')?.value || 'email';

  // Validaciones
  let hayError = false;

  if (!razonSocial) {
    setFieldError('razon-social', 'Ingresa la razón social.');
    hayError = true;
  } else setFieldError('razon-social', '');

  if (!nombreComercial && !nombreComercialNA) {
    setFieldError('nombre-comercial', 'Ingresa el nombre comercial o marca "No aplica".');
    hayError = true;
  } else setFieldError('nombre-comercial', '');

  if (!direccion) {
    setFieldError('direccion', 'Ingresa la dirección.');
    hayError = true;
  } else setFieldError('direccion', '');

  if (!provincia) {
    setFieldError('provincia', 'Selecciona una provincia.');
    hayError = true;
  } else setFieldError('provincia', '');

  if (!ciudad) {
    setFieldError('ciudad', 'Ingresa la ciudad.');
    hayError = true;
  } else setFieldError('ciudad', '');

  if (!regimen) {
    showBanner('Selecciona un régimen tributario.', 'warn');
    hayError = true;
  }

  const emailV = validarEmail(email);
  setFieldError('email', emailV.valid ? '' : emailV.reason);
  if (!emailV.valid) hayError = true;

  const celularV = validarCelular(celular, flow.celularPais);
  setFieldError('celular', celularV.valid ? '' : celularV.reason);
  if (!celularV.valid) hayError = true;

  // Validar establecimientos: código de 3 dígitos + al menos 1 punto válido con nombre
  let estsError = null;
  for (const est of flow.establecimientos) {
    if (!/^\d{3}$/.test(est.establecimiento)) {
      estsError = 'Cada establecimiento debe tener un código de 3 dígitos.'; break;
    }
    if (!est.puntos.length) {
      estsError = 'Cada establecimiento debe tener al menos un punto de emisión.'; break;
    }
    for (const p of est.puntos) {
      if (!/^\d{3}$/.test(p.codigo)) {
        estsError = 'Cada punto de emisión debe tener un código de 3 dígitos.'; break;
      }
      if (!p.nombre || !p.nombre.trim()) {
        estsError = 'Cada punto de emisión debe tener un nombre corto.'; break;
      }
      if (!NOMBRE_PUNTO_REGEX.test(p.nombre)) {
        estsError = 'El nombre del punto de emisión sólo admite letras, números y . , _ - (máx 50).'; break;
      }
    }
    if (estsError) break;
  }
  if (estsError) {
    showBanner(estsError, 'warn');
    hayError = true;
  }

  if (hayError) return;

  // Persistir en flow
  flow.razonSocial = razonSocial;
  flow.nombreComercial = nombreComercialNA ? '' : nombreComercial;
  flow.nombreComercialNA = nombreComercialNA;
  flow.direccion = direccion;
  flow.provincia = provincia;
  flow.ciudad = ciudad;
  flow.regimen = regimen;
  flow.email = emailV.normalizado;
  flow.celular = celularV.normalizado;
  flow.celularEsEcuador = celularV.esEcuador;
  flow.canal = canal;
  saveDraft(flow);
  track('form_submitted', { canal, modoFacturacion: flow.modoFacturacion, esEcuador: celularV.esEcuador });

  const submitBtn = $('#submit-registro');
  setBusy(submitBtn, true);
  try {
    machine.send(EVENTS.FORM_SUBMIT);
    const resp = await iniciarRegistro({
      ruc: flow.ruc,
      razonSocial,
      nombreComercial: flow.nombreComercial,
      direccion,
      provincia,
      ciudad,
      regimen,
      email: flow.email,
      celular: flow.celular,
      celularPais: flow.celularPais,
      canal,
      modoFacturacion: flow.modoFacturacion,
      establecimientos: flow.establecimientos,
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

  $$('#requisitos-clave li').forEach((li) => {
    const key = li.dataset.req;
    if (v.requisitos[key]) li.classList.add('cumplido');
    else li.classList.remove('cumplido');
  });

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
