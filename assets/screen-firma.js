/* screen-firma.js — Pantalla 1 del wizard.
   Términos + firma electrónica (.p12) + RUC manual + Certificado RUC (PDF).
   Solo deja avanzar cuando los 4 gates pasan. */

import { validarFirmaP12 } from './firma-validator.js?v=20260516j';
import { validarRUC } from './validators.js?v=20260515a';
import { parseCertificadoRUC } from './pdf-parser.js?v=20260516j';
import { showLoading, hideLoading, detectDevice } from './wizard.js?v=20260516j';

const WHATSAPP_FIRMA = 'https://wa.me/593969173466?text=Hola%2C+necesito+ayuda+para+obtener+mi+firma+electr%C3%B3nica.';

export function renderPantallaFirma(body, wizardData) {
  const dev = detectDevice();
  const deviceWarning = (!dev.isPC) ? `
    <div class="wiz-device-warning" role="status">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <div>
        <strong>Te recomendamos completar este registro desde una PC</strong>
        Vas a necesitar tu archivo de firma electrónica (.p12), que normalmente no está disponible en celular o tablet.
      </div>
    </div>
  ` : '';

  body.innerHTML = `
    ${deviceWarning}

    <!-- GATE 1: Términos y condiciones -->
    <div class="firma-block firma-block--terms">
      <label class="firma-terms">
        <input type="checkbox" id="f-terminos" ${wizardData.terminos ? 'checked' : ''}>
        <span>Acepto los <button type="button" class="link-button" id="f-link-terms">términos y condiciones</button> de TributaSoft.</span>
      </label>
    </div>

    <!-- GATE 2: Firma electrónica -->
    <div class="firma-block" id="f-firma-block" ${wizardData.terminos ? '' : 'data-locked="true"'}>
      <div class="firma-block-header">
        <span class="firma-block-step">1</span>
        <h3>Sube tu firma electrónica</h3>
      </div>
      <p class="firma-block-help">Aceptamos solo archivos <strong>.p12</strong>. La clave nunca sale de tu navegador.</p>

      <div class="firma-uploader-row">
        <button type="button" class="btn btn--ghost" id="f-firma-pick">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:.35rem">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Seleccionar archivo .p12
        </button>
        <span id="f-firma-nombre" class="firma-nombre"></span>
      </div>
      <input type="file" id="f-firma-file" accept=".p12,.pfx" hidden>

      <div class="field" id="f-firma-clave-wrap" hidden>
        <label for="f-firma-clave">Clave de la firma</label>
        <input id="f-firma-clave" type="password" autocomplete="off" placeholder="Clave que te dio tu proveedor">
      </div>

      <div class="modal-actions" id="f-firma-actions" hidden>
        <button type="button" class="btn btn--primary" id="f-firma-validar">Validar firma</button>
      </div>

      <div id="f-firma-error" class="firma-error" role="alert" aria-live="polite"></div>

      <div id="f-firma-resumen" class="firma-resumen" hidden>
        <p class="firma-resumen-titulo">✓ Firma validada</p>
        <div class="firma-resumen-row"><span class="firma-resumen-label">Titular</span><span class="firma-resumen-value" id="f-r-titular">—</span></div>
        <div class="firma-resumen-row"><span class="firma-resumen-label">RUC de la firma</span><span class="firma-resumen-value" id="f-r-ruc">—</span></div>
        <div class="firma-resumen-row" id="f-r-replegal-row" hidden><span class="firma-resumen-label">Firmado por</span><span class="firma-resumen-value" id="f-r-replegal">—</span></div>
        <div class="firma-resumen-row"><span class="firma-resumen-label">Caducidad</span><span class="firma-resumen-value" id="f-r-caducidad">—</span></div>
      </div>

      <button type="button" class="btn btn--ghost btn--soporte-firma" id="f-no-firma">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:.4rem">
          <path d="M20.5 12a8.5 8.5 0 1 1-3.6-6.93L20.5 3.5l-1.6 3.6A8.46 8.46 0 0 1 20.5 12z"/>
        </svg>
        No tengo firma electrónica
      </button>
    </div>

    <!-- GATE 3: RUC manual -->
    <div class="firma-block" id="f-ruc-block" data-locked="true">
      <div class="firma-block-header">
        <span class="firma-block-step">2</span>
        <h3>Confirma tu RUC</h3>
      </div>
      <p class="firma-block-help">Ingresa tu RUC manualmente. Vamos a verificar que coincida con el de tu firma.</p>

      <div class="field">
        <label for="f-ruc">RUC (13 dígitos)</label>
        <input id="f-ruc" type="tel" inputmode="numeric" maxlength="13" placeholder="0000000000001" autocomplete="off" value="${wizardData.rucManual || ''}">
      </div>
      <div id="f-ruc-error" class="error" role="alert" aria-live="polite"></div>
      <p id="f-ruc-ok" class="firma-resumen-titulo" hidden>✓ RUC coincide con tu firma</p>
    </div>

    <!-- GATE 4: Certificado de RUC PDF -->
    <div class="firma-block" id="f-cert-block" data-locked="true">
      <div class="firma-block-header">
        <span class="firma-block-step">3</span>
        <h3>Sube tu Certificado de RUC</h3>
      </div>
      <p class="firma-block-help">PDF original del SRI (no foto ni escaneo). Lo leemos en tu navegador para autocompletar tus datos.</p>

      <div class="firma-uploader-row">
        <button type="button" class="btn btn--ghost" id="f-cert-pick">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:.35rem">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          Seleccionar PDF
        </button>
        <span id="f-cert-nombre" class="firma-nombre"></span>
      </div>
      <input type="file" id="f-cert-file" accept=".pdf,application/pdf" hidden>

      <div id="f-cert-error" class="firma-error" role="alert" aria-live="polite"></div>

      <div id="f-cert-resumen" class="firma-resumen" hidden>
        <p class="firma-resumen-titulo">✓ Certificado leído</p>
        <div class="firma-resumen-row"><span class="firma-resumen-label">Razón social</span><span class="firma-resumen-value" id="f-c-razon">—</span></div>
        <div class="firma-resumen-row"><span class="firma-resumen-label">Nombre comercial</span><span class="firma-resumen-value" id="f-c-comercial">—</span></div>
        <div class="firma-resumen-row"><span class="firma-resumen-label">Provincia / Cantón</span><span class="firma-resumen-value" id="f-c-prov">—</span></div>
      </div>
    </div>
  `;

  wireFirmaScreen(body, wizardData);

  // Si ya estaba la firma validada (volvió desde otra pantalla), re-pintar
  if (wizardData.firma?.valid) reRenderFirmaState(wizardData);
  if (wizardData.certificadoRuc?.valid) reRenderCertState(wizardData);
}

function wireFirmaScreen(root, wizardData) {
  // -------- T&C --------
  const tc = root.querySelector('#f-terminos');
  tc.addEventListener('change', () => {
    wizardData.terminos = tc.checked;
    toggleLock(root.querySelector('#f-firma-block'), !tc.checked);
    updateSubsequentLocks(root, wizardData);
  });

  root.querySelector('#f-link-terms').addEventListener('click', () => {
    const modal = document.getElementById('modal-terms');
    if (modal) {
      try { modal.showModal(); } catch { modal.setAttribute('open', ''); }
    }
  });

  // Si modal de Términos dispara aceptación, marcamos el checkbox
  document.addEventListener('terms-accepted', () => {
    tc.checked = true;
    wizardData.terminos = true;
    toggleLock(root.querySelector('#f-firma-block'), false);
    updateSubsequentLocks(root, wizardData);
  });

  // -------- Firma --------
  const firmaFile = root.querySelector('#f-firma-file');
  const firmaPick = root.querySelector('#f-firma-pick');
  const firmaNombre = root.querySelector('#f-firma-nombre');
  const claveWrap = root.querySelector('#f-firma-clave-wrap');
  const claveInput = root.querySelector('#f-firma-clave');
  const actionsWrap = root.querySelector('#f-firma-actions');
  const validarBtn = root.querySelector('#f-firma-validar');
  const firmaError = root.querySelector('#f-firma-error');
  const resumen = root.querySelector('#f-firma-resumen');

  firmaPick.addEventListener('click', () => firmaFile.click());

  firmaFile.addEventListener('change', () => {
    const file = firmaFile.files?.[0];
    if (!file) return;
    if (!/\.(p12|pfx)$/i.test(file.name)) {
      firmaError.textContent = 'El archivo debe ser .p12 o .pfx';
      return;
    }
    firmaError.textContent = '';
    firmaNombre.textContent = file.name;
    claveWrap.hidden = false;
    actionsWrap.hidden = false;
    resumen.hidden = true;
    wizardData.firma = null;
    updateSubsequentLocks(root, wizardData);
  });

  validarBtn.addEventListener('click', async () => {
    const file = firmaFile.files?.[0];
    const clave = claveInput.value;
    if (!file || !clave) {
      firmaError.textContent = 'Selecciona el archivo y escribe la clave.';
      return;
    }
    firmaError.textContent = '';
    showLoading('Validando firma…');
    try {
      const res = await validarFirmaP12(file, clave, null); // sin rucEsperado: validamos solo formato/clave
      hideLoading();
      if (!res.valid) {
        firmaError.textContent = res.reason || 'No pudimos validar la firma.';
        wizardData.firma = null;
        resumen.hidden = true;
      } else {
        wizardData.firma = {
          valid: true,
          archivo: file.name,
          titular: res.titular,
          ruc: res.ruc,
          esJuridica: res.esJuridica,
          razonSocial: res.razonSocial,
          repLegal: res.repLegal,
          datosExtra: res.datosExtra,
          caducidad: res.fechaCaducidad
        };
        renderFirmaResumen(root, wizardData.firma);
        // Si el RUC manual ya está escrito, re-validar la coincidencia
        validarMatchRuc(root, wizardData);
      }
      updateSubsequentLocks(root, wizardData);
    } catch (err) {
      hideLoading();
      console.error('[firma] excepción al validar', err);
      firmaError.textContent = 'Error inesperado al validar la firma. Intenta de nuevo.';
    }
  });

  root.querySelector('#f-no-firma').addEventListener('click', () => {
    window.open(WHATSAPP_FIRMA, '_blank', 'noopener');
  });

  // -------- RUC manual --------
  const rucInput = root.querySelector('#f-ruc');
  rucInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 13);
    wizardData.rucManual = e.target.value;
    validarMatchRuc(root, wizardData);
  });

  // -------- Cert RUC PDF --------
  const certFile = root.querySelector('#f-cert-file');
  const certPick = root.querySelector('#f-cert-pick');
  const certNombre = root.querySelector('#f-cert-nombre');
  const certError = root.querySelector('#f-cert-error');

  certPick.addEventListener('click', () => certFile.click());

  certFile.addEventListener('change', async () => {
    const file = certFile.files?.[0];
    if (!file) return;
    certError.textContent = '';
    certNombre.textContent = file.name;
    showLoading('Leyendo certificado…');
    try {
      const res = await parseCertificadoRUC(file);
      hideLoading();
      if (!res.valid) {
        certError.textContent = res.reason || 'No pudimos leer el certificado.';
        wizardData.certificadoRuc = null;
      } else {
        wizardData.certificadoRuc = { ...res, archivo: file.name };
        renderCertResumen(root, wizardData.certificadoRuc);
        // Si el RUC del PDF no coincide con el manual ingresado, avisar
        if (wizardData.rucManual && res.ruc && wizardData.rucManual !== res.ruc) {
          certError.textContent = `El RUC del PDF (${res.ruc}) no coincide con el que ingresaste (${wizardData.rucManual}).`;
        }
      }
    } catch (err) {
      hideLoading();
      console.error('[pdf] excepción al parsear', err);
      certError.textContent = 'Error inesperado al leer el PDF.';
    }
  });
}

function validarMatchRuc(root, wizardData) {
  const rucInput = root.querySelector('#f-ruc');
  const errBox = root.querySelector('#f-ruc-error');
  const okBox = root.querySelector('#f-ruc-ok');
  const ruc = rucInput.value;

  okBox.hidden = true;
  errBox.textContent = '';

  if (ruc.length !== 13) {
    if (ruc.length > 0) errBox.textContent = 'El RUC debe tener 13 dígitos.';
    updateSubsequentLocks(root, wizardData);
    return;
  }

  const v = validarRUC(ruc);
  if (!v.valid) {
    errBox.textContent = v.reason || 'RUC inválido.';
    updateSubsequentLocks(root, wizardData);
    return;
  }

  // Comparar con la firma
  if (wizardData.firma?.ruc && wizardData.firma.ruc !== ruc) {
    errBox.textContent = `El RUC de tu firma es ${wizardData.firma.ruc}. Ingresa ese mismo RUC.`;
    updateSubsequentLocks(root, wizardData);
    return;
  }

  if (wizardData.firma?.valid) okBox.hidden = false;
  updateSubsequentLocks(root, wizardData);
}

function renderFirmaResumen(root, firma) {
  root.querySelector('#f-firma-resumen').hidden = false;
  // Máscaras: mostramos parcialmente datos sensibles. Solo la caducidad va completa.
  root.querySelector('#f-r-titular').textContent = maskName(firma.titular) || '—';
  root.querySelector('#f-r-ruc').textContent = maskRuc(firma.ruc) || '—';
  root.querySelector('#f-r-caducidad').textContent = formatFechaLarga(firma.caducidad);
  const replegalRow = root.querySelector('#f-r-replegal-row');
  if (firma.esJuridica && firma.repLegal?.nombreCompleto) {
    replegalRow.hidden = false;
    root.querySelector('#f-r-replegal').textContent = maskName(firma.repLegal.nombreCompleto);
  } else {
    replegalRow.hidden = true;
  }
}

/**
 * Enmascara un RUC mostrando primeros 4 y últimos 3 dígitos.
 * Ej: 0992703601001 → 0992******001
 */
function maskRuc(ruc) {
  if (!ruc) return '';
  const s = String(ruc);
  if (s.length < 8) return s;
  return s.slice(0, 4) + '*'.repeat(s.length - 7) + s.slice(-3);
}

/**
 * Enmascara un nombre mostrando primeros 3 y últimos 3 caracteres.
 * Ej: "TRIBUTASOFT S A" → "TRI*********S A"
 *     "KEPTI LENIN PEREIRA TINOCO" → "KEP*******************OCO"
 * Si el nombre es corto, lo muestra entero.
 */
function maskName(name) {
  if (!name) return '';
  const s = String(name).trim();
  if (s.length < 7) return s;
  return s.slice(0, 3) + '*'.repeat(s.length - 6) + s.slice(-3);
}

function reRenderFirmaState(wizardData) {
  // Cuando volvemos a la pantalla, re-pintar los nombres si ya hay archivos
  const root = document.querySelector('[data-body="firma"]');
  if (wizardData.firma?.archivo) {
    root.querySelector('#f-firma-nombre').textContent = wizardData.firma.archivo;
    root.querySelector('#f-firma-clave-wrap').hidden = false;
  }
  if (wizardData.firma?.valid) {
    renderFirmaResumen(root, wizardData.firma);
    validarMatchRuc(root, wizardData);
  }
  updateSubsequentLocks(root, wizardData);
}

function renderCertResumen(root, cert) {
  root.querySelector('#f-cert-resumen').hidden = false;
  root.querySelector('#f-c-razon').textContent = cert.razonSocial || '—';
  root.querySelector('#f-c-comercial').textContent = cert.nombreComercial || '—';
  const prov = [cert.provincia, cert.canton].filter(Boolean).join(' / ') || '—';
  root.querySelector('#f-c-prov').textContent = prov;
}

function reRenderCertState(wizardData) {
  const root = document.querySelector('[data-body="firma"]');
  if (wizardData.certificadoRuc?.archivo) {
    root.querySelector('#f-cert-nombre').textContent = wizardData.certificadoRuc.archivo;
  }
  if (wizardData.certificadoRuc?.valid) {
    renderCertResumen(root, wizardData.certificadoRuc);
  }
}

function toggleLock(el, locked) {
  if (!el) return;
  if (locked) el.setAttribute('data-locked', 'true');
  else el.removeAttribute('data-locked');
}

function updateSubsequentLocks(root, wizardData) {
  // RUC block desbloquea cuando firma válida
  toggleLock(root.querySelector('#f-ruc-block'), !wizardData.firma?.valid);
  // Cert block desbloquea cuando RUC manual coincide
  const rucOk = wizardData.firma?.valid &&
                wizardData.rucManual?.length === 13 &&
                wizardData.rucManual === wizardData.firma.ruc;
  toggleLock(root.querySelector('#f-cert-block'), !rucOk);
}

function formatFechaLarga(d) {
  if (!d) return '—';
  try {
    const dt = (d instanceof Date) ? d : new Date(d);
    return dt.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return '—'; }
}

// Validador del wizard: solo deja avanzar cuando todos los gates pasan.
export function validarPantallaFirma(wizardData) {
  if (!wizardData.terminos) {
    alert('Debes aceptar los términos y condiciones para continuar.');
    return false;
  }
  if (!wizardData.firma?.valid) {
    alert('Sube y valida tu firma electrónica antes de continuar.');
    return false;
  }
  if (!wizardData.rucManual || wizardData.rucManual.length !== 13) {
    alert('Ingresa tu RUC de 13 dígitos.');
    return false;
  }
  if (wizardData.rucManual !== wizardData.firma.ruc) {
    alert(`El RUC que ingresaste no coincide con el de tu firma (${wizardData.firma.ruc}).`);
    return false;
  }
  if (!wizardData.certificadoRuc?.valid) {
    alert('Sube tu Certificado de RUC (PDF) para continuar.');
    return false;
  }
  return true;
}
