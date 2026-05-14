// app.js — Orquestador principal: conecta la máquina de estados, los validators,
// el cliente SRI y los mocks del backend con el DOM.

import {
  validarRUC, validarCelular, validarEmail, validarClave,
  validarFirmaArchivo, validarCodigoToken, validarNoResolucion,
} from './validators.js';
import { createMachine, STATES, EVENTS } from './state-machine.js';
import { consultarRUC } from './sri-client.js';
import { COUNTRIES, findCountry } from './countries.js';
import { citiesFor } from './cities.js';
import {
  clienteExiste, iniciarRegistro, verificarToken,
  establecerClave, validarFirma, finalizarRegistro,
} from './api-mocks.js';

const PORTAL_URL = 'https://tbc.tributasoft.ec/Erp-web/templates/registro/login.xhtml?faces-redirect=true';

// Tipos de contribuyente que requieren No. Resolución
const TIPOS_CON_RESOLUCION = new Set(['AGENTE_RETENCION', 'CONTRIBUYENTE_ESPECIAL', 'GRAN_CONTRIBUYENTE']);

const TIPOS_DOCUMENTO = [
  { id: 'factura', label: 'Facturas' },
  { id: 'nc', label: 'Notas de crédito' },
  { id: 'nd', label: 'Notas de débito' },
  { id: 'retencion', label: 'Comprobantes de retención' },
  { id: 'guia', label: 'Guías de remisión' },
];

const NOMBRE_PUNTO_REGEX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .,_-]{1,50}$/;

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
  celularPais: 'EC',
  razonSocial: '',
  nombreComercial: '',
  nombreComercialNA: false,
  direccion: '',
  provincia: '',
  ciudad: '',
  regimen: '',
  tipoContribuyente: '',
  noResolucion: '',
  modoFacturacion: 'nuevo',
  // Bloque único de configuración de facturación
  facturacion: {
    establecimiento: '001',
    puntoEmision: '001',
    nombrePunto: 'Matriz',
    // Secuencias en 9 dígitos con pad a la izquierda (siempre 9 dígitos numéricos)
    secuencias: TIPOS_DOCUMENTO.reduce((acc, t) => { acc[t.id] = '000000001'; return acc; }, {}),
  },
  tokenSentTo: '',
  firmaPendienteDespues: false,
};

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

  $('#registration-form').addEventListener('submit', onFormSubmit);

  // Nombre comercial "No aplica"
  $('#nombre-comercial-na').addEventListener('change', onNombreComercialNAToggle);

  // Provincia → poblar ciudades
  $('#provincia').addEventListener('change', onProvinciaChange);

  // Tipo de contribuyente → mostrar/ocultar No. Resolución
  $('#tipo-contribuyente').addEventListener('change', onTipoContribuyenteChange);

  // No. Resolución: filtrar a alfanuméricos + "-"
  $('#no-resolucion').addEventListener('input', onNoResolucionInput);

  // Modo de facturación
  $$('input[name="modo-facturacion"]').forEach((r) =>
    r.addEventListener('change', onModoFacturacionChange)
  );

  // Botón "Editar" del bloque de facturación
  $('#btn-editar-est').addEventListener('click', onToggleEditar);

  // Términos y condiciones: habilita/deshabilita el botón Registrarse
  $('#acepta-terminos').addEventListener('change', onTerminosChange);

  // Inputs del bloque (códigos + nombre)
  setupBloqueEstablecimientoListeners();

  // Poblar select de país
  poblarSelectPaises();
  $('#celular-pais').addEventListener('change', onPaisChange);

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
    flow.firmaPendienteDespues = true;
    machine.send(EVENTS.FIRMA_SKIP);
    finalizarFlow();
  });

  // Success
  $('#go-to-account').addEventListener('click', () => {
    window.location.href = PORTAL_URL;
  });

  // Cerrar modales con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('dialog.is-open').forEach(closeModal);
  });

  machine.subscribe(render);

  // Pre-render del bloque facturación (oculto en modo "nuevo" por defecto)
  renderSecuencias();
  aplicarModoFacturacion();
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

  // Prefill
  $('#razon-social').value = flow.razonSocial || '';
  $('#nombre-comercial').value = flow.nombreComercial || '';
  $('#direccion').value = flow.direccion || '';
  if (flow.provincia) {
    const sel = $('#provincia');
    const opt = Array.from(sel.options).find(
      (o) => o.value.toUpperCase() === (flow.provincia || '').toUpperCase()
    );
    if (opt) sel.value = opt.value;
    poblarCiudadesPara(sel.value);
    // Intentar matchear la ciudad
    if (flow.ciudad) {
      const citySel = $('#ciudad');
      const cityOpt = Array.from(citySel.options).find(
        (o) => o.value.toUpperCase() === (flow.ciudad || '').toUpperCase()
      );
      if (cityOpt) citySel.value = cityOpt.value;
    }
  }
  if (flow.regimen) {
    const sel = $('#regimen');
    const upper = flow.regimen.toUpperCase();
    let match = '';
    if (upper.includes('NEGOCIO POPULAR')) match = 'RIMPE - NEGOCIO POPULAR';
    else if (upper.includes('EMPRENDEDOR')) match = 'RIMPE - EMPRENDEDOR';
    else if (upper.includes('GENERAL')) match = 'GENERAL';
    if (match) sel.value = match;
  }

  $('#sri-banner').hidden = !!flow.rucInfo;
  $('#razon-social-static').textContent = flow.razonSocial || flow.ruc;
  $('#ruc-display').textContent = flow.ruc;

  // Reset modo a "nuevo" y aplicar
  $('input[name="modo-facturacion"][value="nuevo"]').checked = true;
  flow.modoFacturacion = 'nuevo';
  aplicarModoFacturacion();

  // Inicializar canales y país
  actualizarCanalesDisponibles();

  // Scroll suave a Razón social + animación de highlight
  setTimeout(() => {
    const target = $('#razon-social');
    if (!target) return;
    const headerOffset = 80;
    const rect = target.getBoundingClientRect();
    const y = rect.top + window.pageYOffset - headerOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
    target.classList.add('is-highlighted');
    setTimeout(() => target.classList.remove('is-highlighted'), 1700);
    setTimeout(() => target.focus({ preventScroll: true }), 600);
  }, 250);
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

// ---------- Provincia → Ciudad dependiente ----------
function onProvinciaChange(e) {
  const prov = e.target.value;
  flow.provincia = prov;
  poblarCiudadesPara(prov);
}

function poblarCiudadesPara(provinciaCode) {
  const sel = $('#ciudad');
  const ciudades = citiesFor(provinciaCode);
  sel.innerHTML = '';
  if (!ciudades.length) {
    sel.innerHTML = '<option value="">Selecciona una provincia primero…</option>';
    sel.disabled = true;
    flow.ciudad = '';
    return;
  }
  sel.disabled = false;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecciona…';
  sel.appendChild(placeholder);
  ciudades.forEach((c) => {
    const o = document.createElement('option');
    o.value = c.toUpperCase();
    o.textContent = c;
    sel.appendChild(o);
  });
}

// ---------- Tipo de contribuyente → No. Resolución condicional ----------
function onTipoContribuyenteChange(e) {
  flow.tipoContribuyente = e.target.value;
  const wrap = $('#no-resolucion-wrap');
  if (TIPOS_CON_RESOLUCION.has(flow.tipoContribuyente)) {
    wrap.hidden = false;
    setTimeout(() => $('#no-resolucion').focus(), 100);
  } else {
    wrap.hidden = true;
    $('#no-resolucion').value = '';
    flow.noResolucion = '';
    setFieldError('no-resolucion', '');
  }
}

function onTerminosChange(e) {
  $('#submit-registro').disabled = !e.target.checked;
}

function onNoResolucionInput(e) {
  // Filtrar a alfanuméricos + "-"
  const v = e.target.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 50);
  if (v !== e.target.value) e.target.value = v;
  flow.noResolucion = v;
}

// ---------- Celular + país + canales ----------
function poblarSelectPaises() {
  const sel = $('#celular-pais');
  if (!sel) return;
  sel.innerHTML = '';
  COUNTRIES.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.code;
    // Nombre + código (sin abreviación/bandera)
    opt.textContent = `${c.name} (+${c.dial})`;
    sel.appendChild(opt);
  });
  sel.value = 'EC';
  flow.celularPais = 'EC';
}

function onPaisChange(e) {
  flow.celularPais = e.target.value;
  const pais = findCountry(flow.celularPais);
  const input = $('#celular');
  input.placeholder = pais.placeholder || 'XXXXXXXX';
  input.value = '';
  actualizarCanalesDisponibles();
  input.focus();
}

function actualizarCanalesDisponibles() {
  const pais = findCountry(flow.celularPais);
  const esEcuador = pais.code === 'EC';

  const hint = $('#celular-hint');
  if (hint) {
    hint.textContent = esEcuador
      ? 'Formato para Ecuador: 09XXXXXXXX (10 dígitos).'
      : `Formato para ${pais.name}: ${pais.placeholder || 'sólo dígitos'}.`;
  }

  const warn = $('#celular-warn');
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
    warn.textContent = `Para ${pais.name} sólo está disponible WhatsApp o Email (SMS bloqueado fuera de Ecuador).`;
  } else {
    smsLabel.classList.remove('canal-disabled');
    smsRadio.disabled = false;
    warn.textContent = '';
  }
}

// ---------- Modos de facturación + Bloque único ----------
function onModoFacturacionChange(e) {
  flow.modoFacturacion = e.target.value;
  aplicarModoFacturacion();
}

function aplicarModoFacturacion() {
  const bloque = $('#establecimiento-bloque');
  const editBtn = $('#btn-editar-est');
  const inputs = [$('#cod-establecimiento'), $('#cod-punto'), $('#nombre-punto')];
  const secuenciasInputs = $$('#secuencias-grid input');

  if (flow.modoFacturacion === 'nuevo') {
    // "Soy nuevo facturando": ocultamos el bloque y forzamos defaults.
    bloque.hidden = true;
    flow.facturacion.establecimiento = '001';
    flow.facturacion.puntoEmision = '001';
    flow.facturacion.nombrePunto = 'Matriz';
    TIPOS_DOCUMENTO.forEach((t) => { flow.facturacion.secuencias[t.id] = '000000001'; });
  } else {
    // "Quiero seguir facturando": muestra bloque, todo bloqueado hasta tocar "Editar".
    bloque.hidden = false;
    bloque.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    inputs.forEach((i) => { if (i) i.disabled = true; });
    secuenciasInputs.forEach((i) => { i.disabled = true; });
    editBtn.classList.remove('is-active');
    editBtn.textContent = 'Editar';
  }
}

function onToggleEditar() {
  const editBtn = $('#btn-editar-est');
  const inputs = [$('#cod-establecimiento'), $('#cod-punto'), $('#nombre-punto')];
  const secuenciasInputs = $$('#secuencias-grid input');
  const editing = editBtn.classList.contains('is-active');

  if (editing) {
    // Cerrar edición: validar y guardar
    if (!validarBloqueFacturacion(true)) return;
    inputs.forEach((i) => { if (i) i.disabled = true; });
    secuenciasInputs.forEach((i) => { i.disabled = true; });
    editBtn.classList.remove('is-active');
    editBtn.textContent = 'Editar';
  } else {
    // Abrir edición
    inputs.forEach((i) => { if (i) i.disabled = false; });
    secuenciasInputs.forEach((i) => { i.disabled = false; });
    editBtn.classList.add('is-active');
    editBtn.textContent = 'Guardar';
    setTimeout(() => $('#cod-establecimiento').focus(), 80);
  }
}

function renderSecuencias() {
  const grid = $('#secuencias-grid');
  if (!grid) return;
  grid.innerHTML = TIPOS_DOCUMENTO.map((t) => `
    <div class="secuencia-row">
      <span class="secuencia-label">${t.label}</span>
      <input type="text" data-secuencia="${t.id}" value="${flow.facturacion.secuencias[t.id] || '1'}" inputmode="numeric" maxlength="9" disabled>
    </div>
  `).join('');

  // Listeners para cada secuencia: sólo dígitos, máx 9, error si >9
  grid.querySelectorAll('input[data-secuencia]').forEach((inp) => {
    inp.addEventListener('input', (e) => {
      const original = e.target.value;
      const v = original.replace(/\D/g, '');
      if (v.length > 9) {
        showBanner('La secuencia no puede tener más de 9 dígitos.', 'warn', 3000);
        e.target.value = v.slice(0, 9);
      } else {
        e.target.value = v;
      }
      flow.facturacion.secuencias[e.target.dataset.secuencia] = e.target.value || '1';
    });
    inp.addEventListener('blur', (e) => {
      const raw = e.target.value.replace(/\D/g, '').slice(0, 9);
      if (!raw) {
        // Vacío → 000000001 (secuencia inicial)
        e.target.value = '000000001';
        flow.facturacion.secuencias[e.target.dataset.secuencia] = '000000001';
        return;
      }
      // Pad SÓLO a la izquierda hasta 9 dígitos
      const padded = raw.padStart(9, '0');
      e.target.value = padded;
      flow.facturacion.secuencias[e.target.dataset.secuencia] = padded;
    });
  });
}

function setupBloqueEstablecimientoListeners() {
  const estInp = $('#cod-establecimiento');
  const punInp = $('#cod-punto');
  const nomInp = $('#nombre-punto');

  // Establecimiento + Punto: 3 dígitos, pad sólo a la izquierda, 001-999
  [estInp, punInp].forEach((inp) => {
    if (!inp) return;
    inp.addEventListener('input', (e) => {
      const v = e.target.value.replace(/\D/g, '').slice(0, 3);
      e.target.value = v;
    });
    inp.addEventListener('blur', (e) => {
      const raw = e.target.value.replace(/\D/g, '');
      if (!raw) { e.target.value = '001'; }
      else {
        const padded = raw.padStart(3, '0');
        if (padded === '000') {
          showBanner('El código debe estar entre 001 y 999.', 'warn');
          e.target.value = '001';
        } else {
          e.target.value = padded;
        }
      }
      if (inp === estInp) flow.facturacion.establecimiento = e.target.value;
      else flow.facturacion.puntoEmision = e.target.value;
    });
  });

  // Nombre corto del punto: máx 50, sólo alfanuméricos + . , _ -
  if (nomInp) {
    nomInp.addEventListener('input', (e) => {
      const filtered = e.target.value
        .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .,_-]/g, '')
        .slice(0, 50);
      if (filtered !== e.target.value) e.target.value = filtered;
      flow.facturacion.nombrePunto = filtered;
    });
  }
}

function validarBloqueFacturacion(silencioso = false) {
  const est = ($('#cod-establecimiento').value || '').replace(/\D/g, '').padStart(3, '0');
  const punto = ($('#cod-punto').value || '').replace(/\D/g, '').padStart(3, '0');
  const nombre = ($('#nombre-punto').value || '').trim();

  if (est === '000' || !/^\d{3}$/.test(est)) {
    if (!silencioso) showBanner('Código de establecimiento inválido (001-999).', 'warn');
    return false;
  }
  if (punto === '000' || !/^\d{3}$/.test(punto)) {
    if (!silencioso) showBanner('Código de punto de emisión inválido (001-999).', 'warn');
    return false;
  }
  if (!nombre || !NOMBRE_PUNTO_REGEX.test(nombre)) {
    if (!silencioso) showBanner('Nombre del punto de emisión: 1-50 caracteres válidos.', 'warn');
    return false;
  }
  flow.facturacion.establecimiento = est;
  flow.facturacion.puntoEmision = punto;
  flow.facturacion.nombrePunto = nombre;
  return true;
}

// ---------- Submit ----------
async function onFormSubmit(e) {
  e.preventDefault();

  // Defensa: no permitir submit sin aceptar términos
  if (!$('#acepta-terminos').checked) {
    showBanner('Debes aceptar los términos y condiciones para continuar.', 'warn');
    return;
  }

  const razonSocial = $('#razon-social').value.trim();
  const nombreComercial = $('#nombre-comercial').value.trim();
  const nombreComercialNA = $('#nombre-comercial-na').checked;
  const direccion = $('#direccion').value.trim();
  const provincia = $('#provincia').value;
  const ciudad = $('#ciudad').value;
  const regimen = $('#regimen').value;
  const tipoContribuyente = $('#tipo-contribuyente').value;
  const noResolucion = $('#no-resolucion').value.trim();
  const email = $('#email').value;
  const celular = $('#celular').value;
  const canal = $('input[name="canal-token"]:checked')?.value || 'email';

  let hayError = false;

  if (!razonSocial) { setFieldError('razon-social', 'Ingresa la razón social.'); hayError = true; }
  else setFieldError('razon-social', '');

  if (!nombreComercial && !nombreComercialNA) {
    setFieldError('nombre-comercial', 'Ingresa el nombre comercial o marca "No aplica".'); hayError = true;
  } else setFieldError('nombre-comercial', '');

  if (!direccion) { setFieldError('direccion', 'Ingresa la dirección.'); hayError = true; }
  else setFieldError('direccion', '');

  if (!provincia) { setFieldError('provincia', 'Selecciona una provincia.'); hayError = true; }
  else setFieldError('provincia', '');

  if (!ciudad) { setFieldError('ciudad', 'Selecciona la ciudad.'); hayError = true; }
  else setFieldError('ciudad', '');

  if (!regimen) { showBanner('Selecciona un régimen tributario.', 'warn'); hayError = true; }

  if (!tipoContribuyente) {
    showBanner('Selecciona el tipo de contribuyente.', 'warn'); hayError = true;
  } else if (TIPOS_CON_RESOLUCION.has(tipoContribuyente)) {
    const v = validarNoResolucion(noResolucion);
    if (!v.valid) {
      setFieldError('no-resolucion', v.reason); hayError = true;
    } else {
      setFieldError('no-resolucion', '');
      flow.noResolucion = v.normalizado;
    }
  }

  const emailV = validarEmail(email);
  setFieldError('email', emailV.valid ? '' : emailV.reason);
  if (!emailV.valid) hayError = true;

  const celularV = validarCelular(celular, flow.celularPais);
  setFieldError('celular', celularV.valid ? '' : celularV.reason);
  if (!celularV.valid) hayError = true;

  // Validación del bloque facturación (sólo si modo === "continuar")
  if (flow.modoFacturacion === 'continuar' && !validarBloqueFacturacion()) {
    hayError = true;
  }

  if (hayError) return;

  // Persistir
  flow.razonSocial = razonSocial;
  flow.nombreComercial = nombreComercialNA ? '' : nombreComercial;
  flow.nombreComercialNA = nombreComercialNA;
  flow.direccion = direccion;
  flow.provincia = provincia;
  flow.ciudad = ciudad;
  flow.regimen = regimen;
  flow.tipoContribuyente = tipoContribuyente;
  flow.email = emailV.normalizado;
  flow.celular = celularV.normalizado;
  flow.canal = canal;
  saveDraft(flow);
  track('form_submitted', { canal, modo: flow.modoFacturacion, tipoContribuyente });

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
      tipoContribuyente,
      noResolucion: flow.noResolucion,
      email: flow.email,
      celular: flow.celular,
      celularPais: flow.celularPais,
      canal,
      modoFacturacion: flow.modoFacturacion,
      facturacion: flow.facturacion,
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
  $('#firma-resumen').hidden = true;
  show($('#firma-clave-step'));
  $('#firma-clave').focus();
}

async function onValidarFirma() {
  const clave = $('#firma-clave').value;
  if (!firmaFileSeleccionada) return;
  if (!clave) { $('#firma-error').textContent = 'Ingresa la clave de la firma.'; return; }

  setBusy($('#firma-clave-confirmar'), true);
  machine.send(EVENTS.FIRMA_UPLOAD);
  $('#firma-error').textContent = '';
  $('#firma-resumen').hidden = true;

  try {
    const resp = await validarFirma({
      file: firmaFileSeleccionada,
      clave,
      rucEsperado: flow.ruc,
    });

    if (resp.valida) {
      track('firma_uploaded_valid', { fechaCaducidad: resp.fechaCaducidad });
      machine.send(EVENTS.FIRMA_OK);

      // Mostrar resumen
      $('#firma-titular').textContent = resp.subject || '—';
      $('#firma-ruc').textContent = resp.rucCertificado || flow.ruc;
      $('#firma-caducidad').textContent = formatearFecha(resp.fechaCaducidad);
      $('#firma-resumen').hidden = false;

      // Pequeña pausa para que el usuario vea el resumen, luego finaliza
      setTimeout(() => {
        closeModal($('#modal-firma'));
        finalizarFlow();
      }, 1800);
    } else {
      track('firma_uploaded_invalid', { error: resp.error });
      machine.send(EVENTS.FIRMA_BAD);
      // Mensaje específico según el motivo
      let msg = resp.error || 'La firma no es válida.';
      if (resp._mockHint) msg += ` (${resp._mockHint})`;
      $('#firma-error').textContent = msg;
    }
  } catch (err) {
    $('#firma-error').textContent = 'Error validando la firma.';
  } finally {
    setBusy($('#firma-clave-confirmar'), false);
  }
}

function formatearFecha(yyyyMmDd) {
  if (!yyyyMmDd || typeof yyyyMmDd !== 'string') return '—';
  const [y, m, d] = yyyyMmDd.split('-');
  if (!y || !m || !d) return yyyyMmDd;
  return `${d}/${m}/${y}`;
}

async function finalizarFlow() {
  try {
    const resp = await finalizarRegistro({ registroId: flow.registroId });
    clearDraft();
    track('registration_complete', {
      redirectUrl: resp.redirectUrl,
      firmaPendienteDespues: flow.firmaPendienteDespues,
    });
    machine.send(EVENTS.FINALIZED);
    show($('#success'));
    $('#success').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
      window.location.href = resp.redirectUrl || PORTAL_URL;
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
