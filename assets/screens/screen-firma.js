/* screen-firma.js — Pantalla 1 del wizard.
   Términos + firma electrónica (.p12) + Certificado RUC (PDF).
   El RUC ya NO se ingresa manualmente: viene de la firma y se valida
   contra el RUC del certificado. */

import { validarFirmaP12 } from '../parsers/firma-validator.js?v=20260518b';
import { parseCertificadoRUC, validarFechaEmisionCert } from '../parsers/pdf-parser.js?v=20260518b';
import { showLoading, hideLoading, detectDevice } from '../wizard.js?v=20260518b';

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

    <!-- BLOQUE 1: Términos y condiciones.
         El checkbox está deshabilitado hasta que el usuario lea el modal
         (con scroll-to-bottom) y haga click en "Acepto". Solo el modal
         puede marcarlo. Sin esto, el usuario podría aceptar sin leer. -->
    <div class="firma-block firma-block--terms">
      <div class="firma-terms" id="f-terms-row">
        <input type="checkbox" id="f-terminos"
          ${wizardData.terminos ? 'checked' : ''}
          ${wizardData.terminos ? '' : 'disabled'}>
        <span>
          Acepto los
          <button type="button" class="link-button" id="f-link-terms">términos y condiciones</button>
          de TributaSoft.
        </span>
      </div>
      ${!wizardData.terminos ? `
        <p class="terms-hint-row">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Haz clic en el link para leerlos. El checkbox se marcará cuando aceptes.
        </p>
      ` : ''}
    </div>

    <!-- BLOQUE 2: Firma electrónica -->
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
        <p class="firma-resumen-titulo">Firma validada</p>
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

    <!-- BLOQUE 3: Certificado de RUC PDF -->
    <div class="firma-block" id="f-cert-block" data-locked="true">
      <div class="firma-block-header">
        <span class="firma-block-step">2</span>
        <h3>Sube tu Certificado de RUC</h3>
      </div>
      <p class="firma-block-help">
        PDF original del SRI (no foto ni escaneo). Lo leemos en tu navegador para
        validar que el RUC del certificado coincida con el de tu firma y para
        autocompletar tus datos.
      </p>

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
        <p class="firma-resumen-titulo">Certificado validado</p>
        <div class="firma-resumen-row"><span class="firma-resumen-label">RUC</span><span class="firma-resumen-value" id="f-c-ruc">—</span></div>
        <div class="firma-resumen-row"><span class="firma-resumen-label">Razón social</span><span class="firma-resumen-value" id="f-c-razon">—</span></div>
        <div class="firma-resumen-row"><span class="firma-resumen-label">Provincia / Cantón</span><span class="firma-resumen-value" id="f-c-prov">—</span></div>
        <div class="firma-resumen-row"><span class="firma-resumen-label">Emitido</span><span class="firma-resumen-value" id="f-c-fecha">—</span></div>
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
  // El checkbox arranca DISABLED + UNCHECKED. Solo se habilita y marca cuando
  // el usuario abre el modal, scrollea hasta el final y hace click en "Acepto".
  // El usuario nunca puede marcarlo directamente.
  const tc = root.querySelector('#f-terminos');

  tc.addEventListener('change', () => {
    wizardData.terminos = tc.checked;
    toggleLock(root.querySelector('#f-firma-block'), !tc.checked);
    updateCertLock(root, wizardData);
    // Refresh hint
    const hint = root.querySelector('.terms-hint-row');
    if (tc.checked && hint) hint.remove();
  });

  // El link "términos y condiciones" abre el modal.
  root.querySelector('#f-link-terms').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openTermsModalForCheckbox(tc);
  });

  // También permitir click en la fila completa para abrir el modal (mejor UX)
  root.querySelector('#f-terms-row').addEventListener('click', (e) => {
    // Si clickeó directamente el checkbox o el link, sus handlers ya actuaron
    if (e.target === tc) {
      // El checkbox está disabled, no pasa nada — pero igual abrimos modal si aún no aceptaron
      if (!wizardData.terminos) {
        e.preventDefault();
        openTermsModalForCheckbox(tc);
      }
      return;
    }
    if (e.target.id === 'f-link-terms') return;
    // Click en el área de la fila → abrir modal si aún no aceptó
    if (!wizardData.terminos) {
      openTermsModalForCheckbox(tc);
    }
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
    updateCertLock(root, wizardData);
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
      const res = await validarFirmaP12(file, clave, null);
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
        // Si el cert ya estaba subido, re-validar que coincida
        if (wizardData.certificadoRuc?.ruc) {
          revalidarCertContraFirma(root, wizardData);
        }
      }
      updateCertLock(root, wizardData);
    } catch (err) {
      hideLoading();
      console.error('[firma] excepción al validar', err);
      firmaError.textContent = 'Error inesperado al validar la firma. Intenta de nuevo.';
    }
  });

  root.querySelector('#f-no-firma').addEventListener('click', () => {
    window.open(WHATSAPP_FIRMA, '_blank', 'noopener');
  });

  // -------- Cert RUC PDF --------
  const certFile = root.querySelector('#f-cert-file');
  const certPick = root.querySelector('#f-cert-pick');
  const certNombre = root.querySelector('#f-cert-nombre');
  const certError = root.querySelector('#f-cert-error');
  const certResumen = root.querySelector('#f-cert-resumen');

  certPick.addEventListener('click', () => certFile.click());

  certFile.addEventListener('change', async () => {
    const file = certFile.files?.[0];
    if (!file) return;
    certError.textContent = '';
    certNombre.textContent = file.name;
    certResumen.hidden = true;
    wizardData.certificadoRuc = null;

    showLoading('Leyendo certificado…');
    try {
      const res = await parseCertificadoRUC(file);
      hideLoading();

      // 1) Parser pudo extraer
      if (!res.valid) {
        certError.textContent = res.reason || 'No pudimos leer el certificado.';
        return;
      }

      // 2) Fecha de emisión: máx. 1 mes, no futura
      const fechaCheck = validarFechaEmisionCert(res.fechaEmision);
      if (!fechaCheck.valid) {
        certError.textContent = fechaCheck.reason;
        return;
      }

      // 3) RUC del cert debe coincidir con RUC de la firma
      if (wizardData.firma?.ruc && res.ruc !== wizardData.firma.ruc) {
        certError.textContent = `El RUC del certificado (${res.ruc}) no coincide con el de tu firma (${wizardData.firma.ruc}). Sube el certificado correspondiente a tu firma.`;
        return;
      }

      // Todo OK: guardar
      wizardData.certificadoRuc = { ...res, archivo: file.name };
      renderCertResumen(root, wizardData.certificadoRuc);
    } catch (err) {
      hideLoading();
      console.error('[pdf] excepción al parsear', err);
      certError.textContent = 'Error inesperado al leer el PDF.';
    }
  });
}

function revalidarCertContraFirma(root, wizardData) {
  // Llamado cuando la firma se validó después que el cert ya estaba subido.
  // Verifica que los RUCs coincidan y muestra error si no.
  const cert = wizardData.certificadoRuc;
  if (!cert?.ruc) return;
  const certError = root.querySelector('#f-cert-error');
  if (cert.ruc !== wizardData.firma.ruc) {
    certError.textContent = `El RUC del certificado (${cert.ruc}) no coincide con el de tu firma (${wizardData.firma.ruc}). Sube el certificado correspondiente a tu firma.`;
    wizardData.certificadoRuc = null;
    root.querySelector('#f-cert-resumen').hidden = true;
  } else {
    certError.textContent = '';
  }
}

function renderFirmaResumen(root, firma) {
  root.querySelector('#f-firma-resumen').hidden = false;
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

function reRenderFirmaState(wizardData) {
  const root = document.querySelector('[data-body="firma"]');
  if (!root) return;
  if (wizardData.firma?.archivo) {
    root.querySelector('#f-firma-nombre').textContent = wizardData.firma.archivo;
    root.querySelector('#f-firma-clave-wrap').hidden = false;
  }
  if (wizardData.firma?.valid) {
    renderFirmaResumen(root, wizardData.firma);
  }
  updateCertLock(root, wizardData);
}

function renderCertResumen(root, cert) {
  root.querySelector('#f-cert-resumen').hidden = false;
  root.querySelector('#f-c-ruc').textContent = maskRuc(cert.ruc) || '—';
  root.querySelector('#f-c-razon').textContent = cert.razonSocial || '—';
  const prov = [cert.provincia, cert.canton].filter(Boolean).join(' / ') || '—';
  root.querySelector('#f-c-prov').textContent = prov;
  root.querySelector('#f-c-fecha').textContent = cert.fechaEmision
    ? formatFechaCorta(cert.fechaEmision)
    : '—';
}

function reRenderCertState(wizardData) {
  const root = document.querySelector('[data-body="firma"]');
  if (!root) return;
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

/**
 * Abre el modal de Términos y Condiciones y configura un handler one-shot
 * en el botón "Acepto" para marcar el checkbox específico cuando se acepte.
 * El botón "Acepto" del modal está deshabilitado hasta que el usuario haga
 * scroll hasta el final (lógica que vive en app.js sobre #terms-body).
 */
function openTermsModalForCheckbox(checkbox) {
  const modal = document.getElementById('modal-terms');
  if (!modal) return;

  const body = document.getElementById('terms-body');
  const aceptarBtn = document.getElementById('terms-aceptar');
  const cancelarBtn = document.getElementById('terms-cancelar');
  const hint = document.getElementById('terms-hint');

  // Reset estado del modal cada vez que se abre
  if (body) body.scrollTop = 0;
  if (aceptarBtn) aceptarBtn.disabled = true;
  if (hint) {
    hint.textContent = 'Desliza hasta el final del documento para habilitar la aceptación.';
    hint.classList.remove('is-bottom');
  }

  // Handler nuestro de "Acepto" — usa { once: true } para no acumular listeners.
  // Cuando se hace click, habilitamos el checkbox, lo marcamos y disparamos change.
  const onAceptar = () => {
    if (cancelarBtn) cancelarBtn.removeEventListener('click', onCancelar);
    checkbox.disabled = false;
    if (!checkbox.checked) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    try { modal.close(); } catch { modal.removeAttribute('open'); }
  };
  const onCancelar = () => {
    if (aceptarBtn) aceptarBtn.removeEventListener('click', onAceptar);
  };

  if (aceptarBtn) aceptarBtn.addEventListener('click', onAceptar, { once: true });
  if (cancelarBtn) cancelarBtn.addEventListener('click', onCancelar, { once: true });

  // Si el contenido cabe sin scroll, habilitamos de inmediato (el usuario
  // ya está viendo todo el texto).
  setTimeout(() => {
    if (body && aceptarBtn && body.scrollHeight <= body.clientHeight + 8) {
      aceptarBtn.disabled = false;
      if (hint) {
        hint.textContent = '✓ Ya puedes aceptar los términos.';
        hint.classList.add('is-bottom');
      }
    }
  }, 80);

  try { modal.showModal(); } catch { modal.setAttribute('open', ''); }
}

function updateCertLock(root, wizardData) {
  // Cert se desbloquea solo cuando la firma está validada
  toggleLock(root.querySelector('#f-cert-block'), !wizardData.firma?.valid);
}

/**
 * Enmascara un RUC: 0992703601001 → 0992******001
 */
function maskRuc(ruc) {
  if (!ruc) return '';
  const s = String(ruc);
  if (s.length < 8) return s;
  return s.slice(0, 4) + '*'.repeat(s.length - 7) + s.slice(-3);
}

/**
 * Enmascara un nombre: primeros 3 + últimos 3 visibles.
 */
function maskName(name) {
  if (!name) return '';
  const s = String(name).trim();
  if (s.length < 7) return s;
  return s.slice(0, 3) + '*'.repeat(s.length - 6) + s.slice(-3);
}

function formatFechaLarga(d) {
  if (!d) return '—';
  try {
    const dt = (d instanceof Date) ? d : new Date(d);
    return dt.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return '—'; }
}

function formatFechaCorta(d) {
  if (!d) return '—';
  try {
    const dt = (d instanceof Date) ? d : new Date(d);
    return dt.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

// Validador del wizard: solo deja avanzar cuando los 3 gates pasan.
export function validarPantallaFirma(wizardData) {
  if (!wizardData.terminos) {
    alert('Debes aceptar los términos y condiciones para continuar.');
    return false;
  }
  if (!wizardData.firma?.valid) {
    alert('Sube y valida tu firma electrónica antes de continuar.');
    return false;
  }
  if (!wizardData.certificadoRuc?.valid) {
    alert('Sube tu Certificado de RUC (PDF) para continuar.');
    return false;
  }
  // Sincronizar rucManual con el RUC validado (lo usa el resumen final)
  wizardData.rucManual = wizardData.firma.ruc;
  return true;
}
