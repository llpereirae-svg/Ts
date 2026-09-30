import { validarFirmaP12 } from '../parsers/firma-validator.js?v=20260929a';
import { validarRUC } from '../utils/ruc-validation.js?v=20260929a';
import { showLoading, hideLoading } from '../wizard.js?v=20260929a';
import { signatureHelpMarkup, wireSignatureHelp } from './signature-offer.js?v=20260929a';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
let pendingFile = null;

export function renderPantallaFirma(body, data) {
  body.innerHTML = `
    <div class="signature-main">
      <label class="upload-zone ${data.firma?.archivo || pendingFile ? 'has-file' : ''}" id="firma-drop" for="firma-file">
        <input id="firma-file" type="file" accept=".p12,.pfx,application/x-pkcs12" class="sr-only">
        <svg class="signature-upload-icon" width="32" height="36" viewBox="0 0 32 36" fill="none" aria-hidden="true"><path d="M19 3H7a2 2 0 0 0-2 2v26a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V11L19 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M19 3v8h8M10 16h11M10 21h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10 28c4-7 2 3 6-2s3 3 6-1" stroke="#EF7306" stroke-width="1.7" stroke-linecap="round"/></svg>
        <span class="signature-upload-copy"><strong id="firma-file-label">${escapeHtml(data.firma?.archivo || pendingFile?.name || 'Subir firma electrónica')}</strong>
        <span id="firma-file-meta">${data.firma?.archivo || pendingFile ? 'Archivo seleccionado' : 'Archivo .p12 o .pfx · máximo 8 MB'}</span>
        <span class="signature-change">Cambiar archivo</span></span>
      </label>
      <span id="firma-file-error" class="field-error" role="alert"></span>
      ${signatureHelpMarkup(Boolean(data.firma?.archivo || data.firma?.valid || pendingFile))}

      <div class="field-group firma-password" ${data.firma?.valid ? 'hidden' : ''}>
        <label for="firma-password">Clave de la firma</label>
        <input id="firma-password" type="password" autocomplete="off" spellcheck="false" aria-describedby="firma-password-error">
        <span id="firma-password-error" class="field-error" role="alert"></span>
      </div>

      <div id="firma-result" class="signature-result" ${data.firma?.valid ? '' : 'hidden'} aria-live="polite"></div>

      <label class="consent-row">
        <input id="firma-terms" type="checkbox" ${data.terminos ? 'checked' : ''}>
        <span>Acepto los <a href="./Terminos-y-Condiciones.txt" target="_blank" rel="noopener">Términos y Condiciones</a> y la <a href="./Politica-de-Privacidad.txt" target="_blank" rel="noopener">Política de Privacidad</a>.</span>
      </label>
      <span id="firma-terms-error" class="field-error consent-error" role="alert"></span>
    </div>`;

  const fileInput = body.querySelector('#firma-file');
  wireSignatureHelp(body);
  const password = body.querySelector('#firma-password');
  const drop = body.querySelector('#firma-drop');
  if (data.firma?.valid) paintResult(body, data.firma);

  drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('is-dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('is-dragging');
    prepareFile(body, data, event.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => prepareFile(body, data, fileInput.files[0]));
  body.querySelector('#firma-terms').addEventListener('change', (event) => {
    data.terminos = event.target.checked;
    body.querySelector('#firma-terms-error').textContent = '';
  });
  password.addEventListener('input', () => { body.querySelector('#firma-password-error').textContent = ''; });
  password.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('wiz-next')?.click();
    }
  });
}

function prepareFile(body, data, file) {
  clearErrors(body);
  if (!file) return;
  if (!/\.(p12|pfx)$/i.test(file.name)) {
    pendingFile = null;
    body.querySelector('#firma-file-error').textContent = 'Selecciona un archivo .p12 o .pfx.';
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    pendingFile = null;
    body.querySelector('#firma-file-error').textContent = 'El archivo supera el límite de 8 MB.';
    return;
  }

  pendingFile = file;
  data.firma = null;
  data.clienteGate = { status: 'IDLE' };
  body.querySelector('.signature-help').hidden = true;
  body.querySelector('#firma-result').hidden = true;
  body.querySelector('.firma-password').hidden = false;
  body.querySelector('#firma-file-label').textContent = file.name;
  body.querySelector('#firma-file-meta').textContent = `${formatBytes(file.size)} · listo para validar`;
  body.querySelector('#firma-drop').classList.add('has-file');
  body.querySelector('#firma-password').focus();
}

export async function validarPantallaFirma(data) {
  const body = document.querySelector('[data-body="firma"]');
  if (!body) return false;
  clearErrors(body);

  if (data.firma?.valid) {
    if (!data.terminos) return requireTerms(body);
    return true;
  }

  const password = body.querySelector('#firma-password');
  let valid = true;
  if (!pendingFile) {
    body.querySelector('#firma-file-error').textContent = 'Selecciona tu archivo de firma.';
    valid = false;
  }
  if (!password.value) {
    body.querySelector('#firma-password-error').textContent = 'Ingresa la clave de la firma.';
    if (valid) password.focus();
    valid = false;
  }
  if (!data.terminos) {
    requireTerms(body, false);
    valid = false;
  }
  if (!valid) return false;

  showLoading('Leyendo tu firma…');
  const result = await validarFirmaP12(pendingFile, password.value, '');
  password.value = '';
  hideLoading();

  if (!result.valid) {
    const target = result.error === 'CLAVE_INCORRECTA' || result.error === 'NO_PASSWORD'
      ? body.querySelector('#firma-password-error')
      : body.querySelector('#firma-file-error');
    target.textContent = result.reason || 'No pudimos validar la firma.';
    if (target.id === 'firma-password-error') password.focus();
    return false;
  }

  const rucCheck = validarRUC(result.ruc || '');
  if (!rucCheck.valid) {
    body.querySelector('#firma-file-error').textContent = `La firma contiene un RUC no válido: ${rucCheck.reason}`;
    return false;
  }

  const fileName = pendingFile.name;
  data.firma = { ...result, archivo: fileName };
  // El PKCS#12 ya fue leído. Conservar solo metadatos evita retener el archivo
  // sensible durante el resto del wizard.
  pendingFile = null;
  body.querySelector('#firma-file').value = '';
  data.rucManual = result.ruc;
  data.razonSocial ||= result.razonSocial || result.titular || '';
  data.sriStatus = 'PENDING';
  paintResult(body, data.firma);
  body.querySelector('.firma-password').hidden = true;
  body.querySelector('#firma-drop').classList.add('has-file', 'is-validated');
  return true;
}

function paintResult(body, firma) {
  const target = body.querySelector('#firma-result');
  target.hidden = false;
  target.innerHTML = `
    <p class="signature-result-title">Firma verificada</p>
    <dl class="signature-data">
      <div><dt>Razón social / titular</dt><dd>${escapeHtml(firma.razonSocial || firma.titular || '—')}</dd></div>
      <div><dt>RUC</dt><dd>${escapeHtml(maskRuc(firma.ruc))}</dd></div>
      ${firma.repLegal?.nombreCompleto ? `<div><dt>Representante legal</dt><dd>${escapeHtml(firma.repLegal.nombreCompleto)}</dd></div>` : ''}
      <div><dt>Caducidad</dt><dd>${escapeHtml(formatDate(firma.fechaCaducidad || firma.caducidad))}</dd></div>
    </dl>`;
  requestAnimationFrame(() => target.classList.add('is-visible'));
}

function requireTerms(body, focus = true) {
  body.querySelector('#firma-terms-error').textContent = 'Debes aceptar los Términos y la Política de Privacidad.';
  if (focus) body.querySelector('#firma-terms').focus();
  return false;
}

function clearErrors(body) {
  body.querySelectorAll('.field-error').forEach((element) => { element.textContent = ''; });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Archivo seleccionado';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function maskRuc(value) { const ruc = String(value || ''); return ruc.length === 13 ? `${ruc.slice(0, 4)}••••••${ruc.slice(-3)}` : ruc; }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
