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
  establecerClave, finalizarRegistro,
} from './api-mocks.js';
import { validarFirmaP12 } from './firma-validator.js';

// URL del portal de inicio de sesión final. Cuando el usuario confirma,
// lo enviamos aquí con su usuario (primeros 10 dígitos del RUC) como hint
// en la query (?u=...) — útil para que la página de login pre-rellene el
// campo si soporta ese parámetro.
const PORTAL_URL = 'https://tbc.tributasoft.com.ec';

// Tipos de contribuyente que requieren No. Resolución
const TIPOS_CON_RESOLUCION = new Set(['AGENTE_RETENCION', 'CONTRIBUYENTE_ESPECIAL', 'GRAN_CONTRIBUYENTE']);

const TIPOS_DOCUMENTO = [
  { id: 'factura', label: 'Facturas' },
  { id: 'nc', label: 'Notas de crédito' },
  { id: 'nd', label: 'Notas de débito' },
  { id: 'retencion', label: 'Comprobantes de retención' },
  { id: 'guia', label: 'Guías de remisión' },
];

// Descripción del punto de emisión: sólo letras (con tildes y ñ) y dígitos.
// Sin caracteres especiales. Espacios permitidos para nombres compuestos
// (ej. "Sucursal Norte"). Tope: 50 caracteres.
const NOMBRE_PUNTO_REGEX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ]{1,50}$/;

const NOMBRE_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// SVGs inline para los botones "Copiar". Inyectados por JS para no repetirlos
// en cada botón del HTML. Declarados arriba para que estén disponibles cuando
// init() corre durante la evaluación del módulo (sin caer en TDZ).
const COPY_ICON_DEFAULT = `<svg class="copy-btn__icon copy-btn__icon--default" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const COPY_ICON_SUCCESS = `<svg class="copy-btn__icon copy-btn__icon--success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

// Textos de los tooltips informativos (íconos "i" en establecimiento, punto y secuencias)
const TOOLTIPS = {
  est: {
    title: 'Establecimiento',
    body:
      'Sucursal o local desde donde se emite el comprobante.\n\n' +
      'Ejemplo: en 001-002-000000123, el establecimiento es 001.',
  },
  punto: {
    title: 'Punto de emisión',
    body:
      'Punto autorizado dentro del establecimiento desde donde se emite el comprobante.\n\n' +
      'Ejemplo: en 001-002-000000123, el punto de emisión es 002.',
  },
  factura: {
    title: 'Facturas',
    body:
      'Ingrese la última secuencia emitida en facturas.\n\n' +
      'Ejemplo: si la última factura fue 000000026, registre 000000026 y el sistema emitirá la siguiente como 000000027.',
  },
  nc: {
    title: 'Notas de crédito',
    body:
      'Ingrese la última secuencia emitida en notas de crédito.\n\n' +
      'Ejemplo: si la última nota de crédito fue 000000010, registre 000000010 y el sistema emitirá la siguiente como 000000011.',
  },
  nd: {
    title: 'Notas de débito',
    body:
      'Ingrese la última secuencia emitida en notas de débito.\n\n' +
      'Ejemplo: si la última nota de débito fue 000000005, registre 000000005 y el sistema emitirá la siguiente como 000000006.',
  },
  retencion: {
    title: 'Comprobantes de retención',
    body:
      'Ingrese la última secuencia emitida en comprobantes de retención.\n\n' +
      'Ejemplo: si el último comprobante fue 000000018, registre 000000018 y el sistema emitirá el siguiente como 000000019.',
  },
  guia: {
    title: 'Guías de remisión',
    body:
      'Ingrese la última secuencia emitida en guías de remisión.\n\n' +
      'Ejemplo: si la última guía fue 000000003, registre 000000003 y el sistema emitirá la siguiente como 000000004.',
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
  // Empujamos un estado al historial para que el botón Atrás del navegador
  // cierre este modal (popstate). Útil tanto para móvil como para usuarios
  // que usan la flecha del navegador en escritorio.
  pushHistoryStep(modal.id);
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
    nombrePunto: 'Electrónicas',
    // Secuencias en 9 dígitos con pad a la izquierda (siempre 9 dígitos numéricos)
    secuencias: TIPOS_DOCUMENTO.reduce((acc, t) => { acc[t.id] = '000000001'; return acc; }, {}),
  },
  tokenSentTo: '',
  firmaPendienteDespues: false,
  // Tracking del bloque "Continuar facturación": true sólo cuando el usuario
  // tocó "Guardar configuración" y los datos pasaron validación. Cualquier
  // edición posterior lo vuelve a false.
  bloqueGuardado: false,
  clave: '', // sólo en memoria, para la PasswordCredential del modal final
};

// ---------- Wire up ----------
// Importante: cargamos app.js con `import()` dinámico desde index.html (cache-busting).
// Como el import es async, para cuando este módulo termina de evaluarse,
// DOMContentLoaded ya disparó y un listener tardío nunca correría.
// Por eso: si el DOM ya está listo, ejecutamos init() de inmediato;
// si no, esperamos al evento.
function init() {
  track('landing_view', { url: location.href });

  const draft = loadDraft();
  if (draft?.ruc) { $('#ruc').value = draft.ruc; }

  // Inyectar contenido de Términos en el modal
  const termsBody = $('#terms-body');
  if (termsBody) termsBody.innerHTML = TERMS_HTML;

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

  // Régimen → filtra opciones válidas de Tipo de Contribuyente
  $('#regimen').addEventListener('change', onRegimenChange);

  // Tipo de contribuyente → mostrar/ocultar No. Resolución
  $('#tipo-contribuyente').addEventListener('change', onTipoContribuyenteChange);

  // No. Resolución: filtrar a alfanuméricos + "-" en input, y validar al blur
  // (mín 10 / máx 30 alfanuméricos, sin contar guiones).
  $('#no-resolucion').addEventListener('input', onNoResolucionInput);
  $('#no-resolucion').addEventListener('blur', onNoResolucionBlur);

  // Modo de facturación
  $$('input[name="modo-facturacion"]').forEach((r) =>
    r.addEventListener('change', onModoFacturacionChange)
  );

  // Botón "Guardar" del bloque de facturación (ya no hay Editar — los campos
  // empiezan habilitados desde el primer momento).
  $('#btn-guardar-est').addEventListener('click', onGuardarBloque);

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
  $('#cambiar-firma').addEventListener('click', () => {
    $('#firma-uploader').value = '';
    $('#firma-uploader').click();
  });
  $('#firma-continuar').addEventListener('click', () => {
    track('firma_confirmada');
    closeModal($('#modal-firma'));
    openLogoStep();
  });
  $('#firma-cancelar').addEventListener('click', () => {
    track('firma_cancelada_tras_validar');
    resetFirmaActions();
    $('#firma-resumen').hidden = true;
    $('#firma-clave-step').hidden = true;
    $('#firma-uploader').value = '';
    firmaFileSeleccionada = null;
    machine.send(EVENTS.FIRMA_BAD);
  });
  $('#saltar-firma').addEventListener('click', () => {
    track('firma_skipped');
    flow.firmaPendienteDespues = true;
    machine.send(EVENTS.FIRMA_SKIP);
    closeModal($('#modal-firma'));
    openLogoStep();
  });

  // Modal logo / banner — se abre tras firma OK o firma saltada.
  $('#logo-upload-btn').addEventListener('click', () => $('#logo-uploader').click());
  $('#logo-uploader').addEventListener('change', onLogoUploaded);
  $('#logo-generar-btn').addEventListener('click', onLogoGenerar);
  $('#logo-rehacer').addEventListener('click', resetLogoStep);
  $('#logo-continuar').addEventListener('click', () => {
    // Tras firma + logo, antes de saltar al portal, pedimos confirmación
    // explícita ("¿estás seguro? no podrás cambiar"). El usuario también
    // decide ahí si quiere guardar credenciales en el navegador.
    closeModal($('#modal-logo'));
    openFinalConfirm();
  });

  // Modal de confirmación final
  $('#confirm-cancelar').addEventListener('click', () => closeModal($('#modal-confirm-final')));
  $('#confirm-aceptar').addEventListener('click', onConfirmAceptar);

  // Success — usa la URL devuelta por el backend si está disponible
  $('#go-to-account').addEventListener('click', () => {
    window.location.href = flow.redirectUrlFinal || PORTAL_URL;
  });

  // Header: Cotizar (abre modal-cotizar) + Ayuda (mock)
  $('#btn-cotizar').addEventListener('click', openCotizar);
  $('#btn-help').addEventListener('click', () => {
    // De momento, mostramos un banner. Más adelante puede abrir un modal de FAQ
    // o redirigir a un chat de soporte.
    showBanner('Soporte: escríbenos por WhatsApp al +593 96 917 3466.', 'info');
  });

  // Cotizador
  $('#cot-calcular').addEventListener('click', onCotCalcular);
  $('#cot-refrescar').addEventListener('click', onCotRefrescar);
  $('#cot-contratar').addEventListener('click', onCotContratar);
  $('#cot-docs').addEventListener('input', (e) => {
    // Filtrar a sólo dígitos y limitar al máximo
    const v = e.target.value.replace(/\D/g, '').slice(0, 9);
    e.target.value = v;
    $('#cot-docs-error').textContent = '';
  });

  // Pago: información bancaria, cambios de inputs, soporte, envío
  $('#btn-info-bank').addEventListener('click', () => openModal($('#modal-bank')));
  $('#btn-bank-close').addEventListener('click', () => closeModal($('#modal-bank')));
  $('#pago-archivo').addEventListener('change', onPagoArchivoChange);
  ['#pago-banco', '#pago-fecha', '#pago-forma'].forEach((sel) => {
    $(sel).addEventListener('change', updatePagoSubmit);
  });
  $('#pago-acepta-terminos').addEventListener('change', updatePagoSubmit);
  $('#pago-enviar').addEventListener('click', onPagoEnviar);

  // Términos y condiciones (modal con scroll-to-bottom)
  $('#link-terminos').addEventListener('click', (e) => openTerms('acepta-terminos'));
  $('#pago-link-terms').addEventListener('click', (e) => openTerms('pago-acepta-terminos'));
  $('#terms-body').addEventListener('scroll', checkTermsBottom);
  $('#terms-aceptar').addEventListener('click', onTermsAceptar);
  $('#terms-cancelar').addEventListener('click', () => closeModal($('#modal-terms')));

  // Tooltips (íconos "i") + botones Copiar — delegación global de clicks
  document.addEventListener('click', onDocumentClick);
  $('#tooltip-popover-close').addEventListener('click', closeTooltip);
  window.addEventListener('resize', closeTooltip);
  window.addEventListener('scroll', closeTooltip, { passive: true });

  // Inyectar los íconos SVG en todos los .copy-btn — un solo lugar de mantenimiento.
  injectCopyIcons();

  // Botón Atrás del navegador (y de los .back-btn dentro del DOM) — el popstate
  // cierra el modal abierto o vuelve del formulario al RUC.
  window.addEventListener('popstate', onPopState);

  // Cerrar modales con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTooltip();
      $$('dialog.is-open').forEach(closeModal);
    }
  });

  machine.subscribe(render);

  // Pre-render del bloque facturación (oculto en modo "nuevo" por defecto)
  renderSecuencias();
  aplicarModoFacturacion();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // El DOM ya está parseado (caso típico con import() dinámico).
  init();
}

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
  pushHistoryStep('form');

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
  aplicarFiltroTipoContribuyente();

  // El banner de "no pudimos validar el SRI" y la línea con razón social
  // duplicada se eliminaron: el usuario completa siempre manualmente,
  // y los datos del SRI sólo prellenarán cuando vengan (sin avisos).
  $('#ruc-display').textContent = flow.ruc;

  // Reset modo a "nuevo" y aplicar
  $('input[name="modo-facturacion"][value="nuevo"]').checked = true;
  flow.modoFacturacion = 'nuevo';
  aplicarModoFacturacion();

  actualizarCanalesDisponibles();

  scrollARazonSocial();
}

function scrollARazonSocial() {
  const target = document.querySelector('#razon-social');
  if (!target) return;

  const doScroll = () => {
    const headerOffset = 80;
    const rect = target.getBoundingClientRect();
    const y = rect.top + window.pageYOffset - headerOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  const animate = () => {
    target.classList.add('is-highlighted');
    setTimeout(() => target.classList.remove('is-highlighted'), 1700);
  };

  const run = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      doScroll();
      animate();
      setTimeout(doScroll, 700);
    }));
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(run, run);
  } else {
    run();
  }
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
const TIPOS_CONTRIBUYENTE_POR_REGIMEN = {
  'GENERAL': ['NO_OBLIGADO', 'OBLIGADO', 'AGENTE_RETENCION', 'CONTRIBUYENTE_ESPECIAL', 'GRAN_CONTRIBUYENTE'],
  'RIMPE - EMPRENDEDOR': ['NO_OBLIGADO', 'OBLIGADO', 'AGENTE_RETENCION'],
  'RIMPE - NEGOCIO POPULAR': ['NO_OBLIGADO'],
};

let _tiposOpcionesOriginales = null;
function _getTiposOpcionesOriginales() {
  if (_tiposOpcionesOriginales) return _tiposOpcionesOriginales;
  const sel = $('#tipo-contribuyente');
  _tiposOpcionesOriginales = Array.from(sel.options).map((o) => ({
    value: o.value, text: o.textContent,
  }));
  return _tiposOpcionesOriginales;
}

function onRegimenChange() {
  aplicarFiltroTipoContribuyente();
}

function aplicarFiltroTipoContribuyente() {
  const regimen = $('#regimen').value;
  const sel = $('#tipo-contribuyente');
  const todas = _getTiposOpcionesOriginales();
  const permitidos = TIPOS_CONTRIBUYENTE_POR_REGIMEN[regimen];

  const valoresValidos = permitidos || todas.map((o) => o.value).filter(Boolean);

  const valorActual = sel.value;
  sel.innerHTML = '';
  todas.forEach((o) => {
    if (o.value === '' || valoresValidos.includes(o.value)) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.text;
      sel.appendChild(opt);
    }
  });

  if (regimen === 'RIMPE - NEGOCIO POPULAR') {
    sel.value = 'NO_OBLIGADO';
    sel.disabled = true;
    flow.tipoContribuyente = 'NO_OBLIGADO';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    sel.disabled = false;
    if (valorActual && valoresValidos.includes(valorActual)) {
      sel.value = valorActual;
    } else {
      sel.value = '';
      flow.tipoContribuyente = '';
      $('#no-resolucion-wrap').hidden = true;
      $('#no-resolucion').value = '';
      flow.noResolucion = '';
    }
  }
}

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
  // Filtrar a alfanuméricos + "-"; max 30 caracteres totales (incluyendo guiones).
  // La validación de longitud (10-30 alfanuméricos) corre en blur y submit.
  const v = e.target.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 30);
  if (v !== e.target.value) e.target.value = v;
  flow.noResolucion = v;
  // Si el usuario corrige tras un error previo, limpiar el mensaje hasta el
  // próximo blur — evita rojo permanente mientras tipea.
  if ($('#no-resolucion').getAttribute('aria-invalid') === 'true') {
    setFieldError('no-resolucion', '');
  }
}

function onNoResolucionBlur() {
  // Sólo validamos si el tipo de contribuyente exige resolución; en caso
  // contrario el campo no debería estar visible y un mensaje sería ruido.
  if (!TIPOS_CON_RESOLUCION.has(flow.tipoContribuyente)) {
    setFieldError('no-resolucion', '');
    return;
  }
  const val = ($('#no-resolucion').value || '').trim();
  if (!val) { setFieldError('no-resolucion', ''); return; }
  const v = validarNoResolucion(val);
  setFieldError('no-resolucion', v.valid ? '' : v.reason);
}

// ---------- Celular + país + canales (Email + WhatsApp, sin SMS) ----------
function poblarSelectPaises() {
  const sel = $('#celular-pais');
  if (!sel) return;
  sel.innerHTML = '';
  COUNTRIES.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.code;
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
  // Ya sólo manejamos dos canales: Email y WhatsApp. Ambos están disponibles
  // en todos los países, por lo que no hay nada que deshabilitar.
  const pais = findCountry(flow.celularPais);
  const hint = $('#celular-hint');
  if (hint) {
    hint.textContent = pais.code === 'EC'
      ? 'Formato para Ecuador: 09XXXXXXXX (10 dígitos).'
      : `Formato para ${pais.name}: ${pais.placeholder || 'sólo dígitos'}.`;
  }
  const warn = $('#celular-warn');
  if (warn) warn.textContent = '';
}

// ---------- Modos de facturación + Bloque único (siempre editable) ----------
function onModoFacturacionChange(e) {
  flow.modoFacturacion = e.target.value;
  aplicarModoFacturacion();
}

function aplicarModoFacturacion() {
  const bloque = $('#establecimiento-bloque');
  const guardado = $('#bloque-guardado');

  if (flow.modoFacturacion === 'nuevo') {
    // "Empezar desde cero": ocultamos el bloque y forzamos defaults.
    bloque.hidden = true;
    bloque.classList.remove('is-required');
    flow.facturacion.establecimiento = '001';
    flow.facturacion.puntoEmision = '001';
    flow.facturacion.nombrePunto = 'Electrónicas';
    TIPOS_DOCUMENTO.forEach((t) => { flow.facturacion.secuencias[t.id] = '000000001'; });
    flow.bloqueGuardado = false;  // no aplica en modo "nuevo"
  } else {
    // "Continuar con mi facturación": muestra el bloque con TODOS los campos
    // habilitados desde el primer momento. Pre-rellenamos punto de emisión
    // en 002 — asumimos que el contribuyente ya tiene 001 en uso en su
    // sistema previo y arranca en 002 con TributaSoft. El usuario puede
    // cambiarlo libremente.
    bloque.hidden = false;
    if (guardado) guardado.hidden = true;
    flow.facturacion.puntoEmision = '002';
    const puntoInp = $('#cod-punto');
    if (puntoInp) puntoInp.value = '002';
    bloque.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function onGuardarBloque() {
  if (!validarBloqueFacturacion()) return;
  flow.bloqueGuardado = true;
  const ok = $('#bloque-guardado');
  if (ok) ok.hidden = false;  // queda visible hasta que el usuario edite algo
  const bloque = $('#establecimiento-bloque');
  if (bloque) bloque.classList.remove('is-required');
  track('bloque_facturacion_guardado', { ...flow.facturacion });
}

function marcarBloqueComoNoGuardado() {
  // Llamada desde los listeners de los inputs del bloque: cualquier cambio
  // invalida el "guardado" anterior y obliga a tocar Guardar de nuevo.
  if (flow.modoFacturacion !== 'continuar') return;
  if (!flow.bloqueGuardado) return;
  flow.bloqueGuardado = false;
  const ok = $('#bloque-guardado');
  if (ok) ok.hidden = true;
}

function renderSecuencias() {
  const grid = $('#secuencias-grid');
  if (!grid) return;
  grid.innerHTML = TIPOS_DOCUMENTO.map((t) => `
    <div class="secuencia-row">
      <span class="secuencia-label">
        ${t.label}
        <button type="button" class="tooltip-i" data-tooltip="${t.id}" aria-label="Información sobre ${t.label}">i</button>
      </span>
      <input type="text" data-secuencia="${t.id}" value="${flow.facturacion.secuencias[t.id] || '000000001'}" inputmode="numeric" maxlength="9">
    </div>
  `).join('');

  grid.querySelectorAll('input[data-secuencia]').forEach((inp) => {
    inp.addEventListener('input', (e) => {
      marcarBloqueComoNoGuardado();
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
        e.target.value = '000000001';
        flow.facturacion.secuencias[e.target.dataset.secuencia] = '000000001';
        return;
      }
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

  [estInp, punInp].forEach((inp) => {
    if (!inp) return;
    inp.addEventListener('input', (e) => {
      marcarBloqueComoNoGuardado();
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

  if (nomInp) {
    nomInp.addEventListener('input', (e) => {
      marcarBloqueComoNoGuardado();
      // Sólo alfanuméricos + espacio (sin . , _ -)
      const filtered = e.target.value
        .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ]/g, '')
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

  // Régimen y tipo de contribuyente: marcar aria-invalid en el select mismo
  // (para que el borde se ponga en rojo). Los selects no tienen un nodo de
  // error inline propio, así que usamos un id de error compartido o sólo
  // pintamos el borde.
  if (!regimen) {
    $('#regimen').setAttribute('aria-invalid', 'true');
    hayError = true;
  } else {
    $('#regimen').setAttribute('aria-invalid', 'false');
  }

  if (!tipoContribuyente) {
    $('#tipo-contribuyente').setAttribute('aria-invalid', 'true');
    hayError = true;
  } else {
    $('#tipo-contribuyente').setAttribute('aria-invalid', 'false');
    if (TIPOS_CON_RESOLUCION.has(tipoContribuyente)) {
      const v = validarNoResolucion(noResolucion);
      if (!v.valid) {
        setFieldError('no-resolucion', v.reason); hayError = true;
      } else {
        setFieldError('no-resolucion', '');
        flow.noResolucion = v.normalizado;
      }
    }
  }

  const emailV = validarEmail(email);
  setFieldError('email', emailV.valid ? '' : emailV.reason);
  if (!emailV.valid) hayError = true;

  const celularV = validarCelular(celular, flow.celularPais);
  setFieldError('celular', celularV.valid ? '' : celularV.reason);
  if (!celularV.valid) hayError = true;

  // Modo "Continuar con mi facturación": el bloque debe estar GUARDADO
  // (no sólo válido). Forzamos al usuario a tocar "Guardar configuración"
  // antes de poder enviar el registro.
  if (flow.modoFacturacion === 'continuar' && !flow.bloqueGuardado) {
    showBanner('Guarda primero tu configuración de facturación.', 'warn', 5000);
    const bloque = $('#establecimiento-bloque');
    if (bloque) bloque.classList.add('is-required');
    hayError = true;
  }

  if (hayError) {
    scrollToFirstError();
    return;
  }

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
  const labelP = $('#fuerza-clave-label');
  const labelText = $('#fuerza-clave-label-text');
  const labels = ['Baja', 'Media', 'Alta'];

  bar.dataset.nivel = String(v.fuerza);
  bar.setAttribute('aria-label', `Nivel de seguridad: ${labels[v.fuerza]}`);
  if (labelP) labelP.dataset.nivel = String(v.fuerza);
  if (labelText) labelText.textContent = labels[v.fuerza];

  const confirm = $('#confirmar-clave').value;
  const coincide = confirm && c === confirm;
  $('#confirmar-error').textContent = (confirm && !coincide) ? 'Las claves no coinciden.' : '';
  // El botón "Continuar" se habilita en cuanto la clave cumpla el mínimo
  // (4 caracteres) y la confirmación coincida. El nivel de fuerza es
  // informativo, no bloquea el flujo.
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
    // Guardamos la clave en memoria del flow para poder ofrecerla al
    // navegador (PasswordCredential) en el modal de confirmación final.
    // No se persiste en sessionStorage — saveDraft la borra al serializar.
    flow.clave = clave;
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
  if (!file) return;
  const v = validarFirmaArchivo(file);
  if (!v.valid) {
    $('#firma-error').textContent = v.reason;
    return;
  }
  firmaFileSeleccionada = file;
  $('#firma-nombre').textContent = file.name;
  $('#firma-clave').value = '';
  $('#firma-error').textContent = '';
  $('#firma-resumen').hidden = true;
  $('#firma-actions-validar').hidden = false;
  $('#firma-actions-confirmar').hidden = true;
  $('#firma-clave-confirmar').disabled = false;
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
    const resp = await validarFirmaP12(firmaFileSeleccionada, clave, flow.ruc);

    if (resp.valid) {
      track('firma_uploaded_valid', { fechaCaducidad: resp.fechaCaducidad?.toISOString?.() });
      machine.send(EVENTS.FIRMA_OK);

      $('#firma-titular').textContent = resp.titular || '—';
      $('#firma-ruc').textContent = resp.ruc || flow.ruc;
      $('#firma-caducidad').textContent = formatearFecha(resp.fechaCaducidad);
      $('#firma-resumen').hidden = false;

      $('#firma-actions-validar').hidden = true;
      $('#firma-actions-confirmar').hidden = false;
    } else {
      track('firma_uploaded_invalid', { error: resp.error });
      machine.send(EVENTS.FIRMA_BAD);
      $('#firma-error').textContent = resp.reason || 'La firma no es válida.';
    }
  } catch (err) {
    console.error('Error validando firma:', err);
    $('#firma-error').textContent = 'Error inesperado validando la firma. Intenta de nuevo.';
  } finally {
    setBusy($('#firma-clave-confirmar'), false);
  }
}

function formatearFecha(value) {
  if (!value) return '—';
  if (value instanceof Date) {
    const d = String(value.getDate()).padStart(2, '0');
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const y = value.getFullYear();
    return `${d}/${m}/${y}`;
  }
  if (typeof value === 'string') {
    const [y, m, d] = value.split('-');
    if (y && m && d) return `${d}/${m}/${y}`;
    return value;
  }
  return '—';
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
    flow.redirectUrlFinal = resp.redirectUrl || PORTAL_URL;
    show($('#success'));
    $('#success').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showBanner('Error finalizando el registro.', 'error');
  }
}

function resetFirmaActions() {
  $('#firma-actions-validar').hidden = false;
  $('#firma-actions-confirmar').hidden = true;
  $('#firma-resumen').hidden = true;
  $('#firma-clave').value = '';
  $('#firma-error').textContent = '';
}

// =========================================================================
//   COTIZADOR (modal independiente al flujo de registro)
// =========================================================================

function openCotizar() {
  track('cotizador_abierto');
  // Reset siempre que se abre
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
  closeModal($('#modal-cotizar'));
  resetPagoForm();
  $('#pago-fecha').value = todayISO();
  openModal($('#modal-pago'));
  track('cotizador_contratar');
}

function formatMoney(n) {
  return '$' + n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatMiles(n) {
  return n.toLocaleString('es-EC');
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
//   PAGO (renovación prepago)
// =========================================================================

const PAGO_MAX_BYTES = 400 * 1024;
const PAGO_MIME_OK = new Set(['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']);

function onPagoArchivoChange(e) {
  const err = $('#pago-archivo-error');
  err.textContent = '';
  const file = e.target.files[0];
  if (!file) { updatePagoSubmit(); return; }

  // Algunos navegadores reportan jpg como image/jpeg; aceptamos ambos.
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
  // Mock: en el backend real haríamos POST con FormData (archivo + datos).
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

// Quién (qué checkbox) recibirá el "tick" cuando el usuario acepta.
let _termsTargetId = null;

function openTerms(targetCheckboxId) {
  _termsTargetId = targetCheckboxId || null;
  const body = $('#terms-body');
  body.scrollTop = 0;
  $('#terms-aceptar').disabled = true;
  $('#terms-hint').textContent = 'Desliza hasta el final del documento para habilitar la aceptación.';
  $('#terms-hint').classList.remove('is-bottom');
  openModal($('#modal-terms'));
  // En caso de que el contenido sea corto o no haya scroll, marcar como leído.
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
//   TOOLTIPS (íconos "i" en establecimiento / punto / secuencias)
// =========================================================================

let _tooltipAnchor = null;

function onDocumentClick(e) {
  // 0) Botón Atrás (flecha) — disparable desde el form o desde cualquier
  //    modal. Simplemente delega en history.back() para que el manejador
  //    popstate haga la limpieza visual.
  const backTrigger = e.target.closest('.back-btn');
  if (backTrigger) {
    e.preventDefault();
    e.stopPropagation();
    try { history.back(); } catch { /* ignore */ }
    return;
  }

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

  // 3) Click fuera del popover de tooltip → cerrar
  if (!e.target.closest('#tooltip-popover')) {
    closeTooltip();
  }
}

function injectCopyIcons() {
  // Centraliza el SVG para no repetirlo en cada botón del HTML.
  $$('.copy-btn').forEach((btn) => {
    if (btn.querySelector('svg')) return;
    btn.innerHTML = COPY_ICON_DEFAULT + COPY_ICON_SUCCESS;
  });
}

async function handleCopy(button) {
  const text = button.dataset.copy || '';
  if (!text) return;

  let ok = false;

  // 1) Camino moderno (Clipboard API). Requiere gesto del usuario y contexto
  //    seguro. En navegadores reales con click real funciona; si rechaza
  //    (permisos, gesto sintético, http no-localhost) caemos al fallback.
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch { /* fallthrough al fallback */ }
  }

  // 2) Fallback con <textarea> oculto + execCommand('copy'). Sigue siendo
  //    el camino confiable en http://localhost o cuando la Clipboard API
  //    no está disponible.
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
  // Posicionar inmediatamente. `getBoundingClientRect()` fuerza un layout
  // síncrono, así que las medidas son válidas aunque acabemos de mostrar el
  // elemento. No usamos requestAnimationFrame porque no es confiable cuando
  // la pestaña está en background (motores headless / tabs ocultos).
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

// =========================================================================
//   LOGO / BANNER (paso opcional tras la firma — antes de la pantalla SUCCESS)
//
//   Output: 2970 × 300 px PNG. Dos rutas posibles:
//     a) El usuario sube un PNG/JPG y lo ajustamos al banner (contain, centrado).
//        Funciona igual si el logo es muy grande (se reduce) o muy pequeño
//        (se amplía), preservando la proporción.
//     b) El usuario pide auto-generación: dibujamos su nombre comercial
//        (con fallback a razón social) en tipografía Lobster, normalizado a
//        capitalización tipo título — "lEnin PerEira" → "Lenin Pereira".
//   El resultado (Blob PNG) queda en flow.bannerBlob para que el backend lo
//   reciba y persista en la base de datos.
// =========================================================================

const BANNER_W = 2970;
const BANNER_H = 300;
const LOGO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB para el archivo del logo subido

function toTitleCase(str) {
  // Capitaliza la primera letra de cada palabra, considerando como
  // separadores el inicio del string, espacios en blanco, puntos, guiones
  // y barras. \p{L} con flag /u abarca también acentos y la ñ.
  if (!str) return '';
  const lower = String(str).trim().toLowerCase();
  return lower.replace(/(^|[\s.\-/])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

function bannerNameFor(state) {
  // Si el usuario marcó "No aplica" para nombre comercial, usamos la razón
  // social. Último recurso: el RUC.
  const nc = state.nombreComercialNA ? '' : (state.nombreComercial || '');
  const raw = nc || state.razonSocial || state.ruc || 'TributaSoft';
  return toTitleCase(raw);
}

async function ensureLobsterLoaded() {
  // Espera a que la fuente Lobster esté disponible para que el canvas la use.
  // Sin esto, canvas dibujaría con la fuente de fallback al primer intento.
  try {
    if (document.fonts && document.fonts.load) {
      await document.fonts.load('200px "Lobster"');
    }
  } catch { /* fuentes no disponibles — seguimos con fallback cursive */ }
}

async function generateBannerFromText(text) {
  await ensureLobsterLoaded();
  const canvas = document.createElement('canvas');
  canvas.width = BANNER_W;
  canvas.height = BANNER_H;
  const ctx = canvas.getContext('2d');

  // Fondo blanco — sirve como base limpia para impresión y para el portal.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, BANNER_W, BANNER_H);

  // Barra decorativa sutil con los colores del logo arriba y abajo.
  ctx.fillStyle = '#87C7DC';
  ctx.fillRect(0, 0, BANNER_W, 6);
  ctx.fillStyle = '#EF7306';
  ctx.fillRect(0, BANNER_H - 6, BANNER_W, 6);

  // Texto en Lobster, color azul del logo. Auto-fit del tamaño para que
  // siempre quepa con un margen lateral cómodo.
  ctx.fillStyle = '#00236f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxWidth = BANNER_W - 240;
  let fontSize = 220;
  do {
    ctx.font = `${fontSize}px "Lobster", cursive`;
    if (ctx.measureText(text).width <= maxWidth) break;
    fontSize -= 4;
  } while (fontSize > 60);

  ctx.fillText(text, BANNER_W / 2, BANNER_H / 2 + 4);
  return canvas;
}

function fitLogoToBanner(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = BANNER_W;
      canvas.height = BANNER_H;
      const ctx = canvas.getContext('2d');

      // Fondo blanco — el "padding" alrededor del logo si no llena los 9.9:1.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, BANNER_W, BANNER_H);

      // Contain: escalamos uniformemente para que el lado más restrictivo
      // toque el borde del banner. Funciona igual para imágenes grandes
      // (downscale) y pequeñas (upscale).
      const scale = Math.min(BANNER_W / img.width, BANNER_H / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (BANNER_W - w) / 2;
      const y = (BANNER_H - h) / 2;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, x, y, w, h);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No pudimos leer la imagen.'));
    };
    img.src = url;
  });
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function paintPreview(sourceCanvas) {
  // El canvas del modal tiene resolución interna 2970×300 (alta calidad),
  // pero CSS lo escala al ancho disponible. Sólo lo "sincronizamos" con
  // el canvas fuente para que muestre el mismo resultado.
  const preview = $('#logo-preview-canvas');
  preview.width = sourceCanvas.width;
  preview.height = sourceCanvas.height;
  preview.getContext('2d').drawImage(sourceCanvas, 0, 0);
}

function openLogoStep() {
  resetLogoStep();
  openModal($('#modal-logo'));
}

function resetLogoStep() {
  $('#logo-preview-wrap').hidden = true;
  $('#logo-actions').hidden = true;
  $('#logo-uploader').value = '';
  $('#logo-error').textContent = '';
  $('#logo-preview-source').textContent = '';
  flow.bannerBlob = null;
  flow.bannerSource = null;
}

async function onLogoGenerar() {
  $('#logo-error').textContent = '';
  const text = bannerNameFor(flow);
  try {
    const canvas = await generateBannerFromText(text);
    paintPreview(canvas);
    flow.bannerBlob = await canvasToPngBlob(canvas);
    flow.bannerSource = 'generated';
    $('#logo-preview-source').textContent = `Texto: "${text}"`;
    $('#logo-preview-wrap').hidden = false;
    $('#logo-actions').hidden = false;
    track('banner_generado', { source: 'text', text, bytes: flow.bannerBlob?.size || 0 });
  } catch (err) {
    console.error(err);
    $('#logo-error').textContent = 'No pudimos generar el banner. Intenta de nuevo.';
  }
}

async function onLogoUploaded(e) {
  $('#logo-error').textContent = '';
  const file = e.target.files[0];
  if (!file) return;

  const name = (file.name || '').toLowerCase();
  const extOk = name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg');
  const mimeOk = !file.type || file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg';
  if (!extOk || !mimeOk) {
    $('#logo-error').textContent = 'Sólo se aceptan archivos PNG o JPG.';
    e.target.value = '';
    return;
  }
  if (file.size > LOGO_MAX_BYTES) {
    $('#logo-error').textContent = 'El logo no puede pesar más de 5 MB.';
    e.target.value = '';
    return;
  }

  try {
    const canvas = await fitLogoToBanner(file);
    paintPreview(canvas);
    flow.bannerBlob = await canvasToPngBlob(canvas);
    flow.bannerSource = 'uploaded';
    $('#logo-preview-source').textContent = `Archivo: ${file.name} · ajustado a 2970×300`;
    $('#logo-preview-wrap').hidden = false;
    $('#logo-actions').hidden = false;
    track('banner_generado', { source: 'upload', original: file.name, bytes: flow.bannerBlob?.size || 0 });
  } catch (err) {
    console.error(err);
    $('#logo-error').textContent = 'No pudimos procesar la imagen. Prueba con otra.';
    e.target.value = '';
  }
}

// =========================================================================
//   SCROLL A PRIMER ERROR — usado al enviar el formulario si hay campos
//   inválidos. Encuentra el primer elemento con aria-invalid="true" o el
//   primer mensaje de error visible, y hace scroll suave hasta él.
// =========================================================================
function scrollToFirstError() {
  // Prioridad: campos marcados como aria-invalid="true" (input/select/textarea)
  const fields = Array.from(document.querySelectorAll(
    '.registration-form [aria-invalid="true"]'
  )).filter((el) => el.offsetParent !== null);

  // Bloque "Continuar facturación" sin guardar — también cuenta como error
  const bloqueRequired = document.querySelector('.establecimiento-bloque.is-required');
  if (bloqueRequired && bloqueRequired.offsetParent !== null) {
    fields.push(bloqueRequired);
  }

  if (!fields.length) return;

  // Ordenar por posición vertical en el documento y tomar el más alto.
  fields.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const target = fields[0];
  const targetWrap = target.closest('.field') || target;
  const top = targetWrap.getBoundingClientRect().top + window.pageYOffset - 100;
  window.scrollTo({ top, behavior: 'smooth' });
  // Focus en el input si es focuseable — ayuda a screen readers y deja
  // listo al usuario para corregir.
  if (target.matches('input, select, textarea')) {
    try { target.focus({ preventScroll: true }); } catch { /* ignore */ }
  }
}

// =========================================================================
//   CONFIRMACIÓN FINAL — modal antes de saltar a tbc.tributasoft.com.ec.
//   Pregunta si el usuario quiere guardar credenciales y luego redirige.
// =========================================================================

function openFinalConfirm() {
  // Mostrar el usuario que tendrá: primeros 10 dígitos del RUC.
  const usuario = (flow.ruc || '').substring(0, 10);
  $('#confirm-user').textContent = usuario || '—';
  // Por defecto dejamos el checkbox marcado — lo más cómodo para el usuario.
  $('#save-credentials').checked = true;
  openModal($('#modal-confirm-final'));
}

async function onConfirmAceptar() {
  const usuario = (flow.ruc || '').substring(0, 10);
  const guardarCreds = $('#save-credentials').checked;

  // 1) Si pidió guardar credenciales, intentamos almacenar la PasswordCredential.
  //    NOTA: el navegador guarda esto vinculado al ORIGEN actual (donde corre
  //    el frontend). El autocompletado en tbc.tributasoft.com.ec sólo será
  //    automático cuando frontend y portal compartan el mismo dominio raíz
  //    (ej. *.tributasoft.com.ec). En todo caso el guardado queda hecho.
  if (guardarCreds && flow.clave && 'PasswordCredential' in window) {
    try {
      const cred = new window.PasswordCredential({
        id: usuario,
        password: flow.clave,
        name: flow.razonSocial || 'TributaSoft',
      });
      await navigator.credentials.store(cred);
      track('credentials_saved');
    } catch (err) {
      console.warn('No se pudieron guardar credenciales:', err);
    }
  }

  // 2) Cerrar modal de confirmación
  closeModal($('#modal-confirm-final'));

  // 3) Finalizar el registro contra el backend (mock por ahora) y redirigir.
  try {
    const resp = await finalizarRegistro({ registroId: flow.registroId });
    clearDraft();
    track('registration_complete', {
      redirectUrl: resp.redirectUrl,
      firmaPendienteDespues: flow.firmaPendienteDespues,
      bannerSource: flow.bannerSource,
    });
    machine.send(EVENTS.FINALIZED);
    // Pasamos el usuario como hint en la URL para que el portal pueda
    // pre-rellenar el campo (?u=0930452024). El portal puede ignorarlo.
    const portal = resp.redirectUrl || PORTAL_URL;
    const sep = portal.includes('?') ? '&' : '?';
    window.location.href = `${portal}${sep}u=${encodeURIComponent(usuario)}`;
  } catch (err) {
    showBanner('Error finalizando el registro. Intenta de nuevo.', 'error');
  }
}

// =========================================================================
//   HISTORIAL (back button) — push state al avanzar; popstate cierra el
//   modal/paso más reciente. El usuario puede usar la flecha del navegador
//   o cualquier botón con clase .back-btn dentro del DOM.
// =========================================================================

function pushHistoryStep(name) {
  try {
    history.pushState({ tsoftStep: name, t: Date.now() }, '');
  } catch { /* algunos navegadores antiguos no soportan pushState */ }
}

function onPopState() {
  // Cierra el modal abierto (si hay) o esconde el formulario y vuelve al RUC.
  const openDialog = document.querySelector('dialog[open]');
  if (openDialog) {
    closeModal(openDialog);
    return;
  }
  const form = $('#registration-form');
  if (form && !form.hidden) {
    form.hidden = true;
    const card = $('#ruc-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('#ruc')?.focus(), 200);
  }
}

// Render según estado ----------
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
      // Sin aviso de SRI fallido: el registro manual es el camino normal.
      feedback.textContent = '';
      feedback.className = 'feedback';
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
