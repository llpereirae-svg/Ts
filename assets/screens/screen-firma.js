import { validarFirmaP12 } from '../parsers/firma-validator.js?v=20260929a';
import { validarRUC } from '../utils/ruc-validation.js?v=20260929a';
import { showLoading, hideLoading } from '../wizard.js?v=20260929a';

const MAX_FILE_SIZE = 8 * 1024 * 1024;

export function renderPantallaFirma(body, data) {
  body.innerHTML = `
    <div class="signature-layout">
      <div class="signature-main">
        <div class="upload-zone" id="firma-drop">
          <input id="firma-file" type="file" accept=".p12,.pfx,application/x-pkcs12" class="sr-only">
          <span class="upload-icon" aria-hidden="true">↥</span>
          <div><strong id="firma-file-label">Selecciona tu archivo de firma</strong><span>.p12 o .pfx · máximo 8 MB</span></div>
          <button type="button" class="btn btn--secondary" id="firma-pick">Elegir archivo</button>
        </div>
        <div class="field-group firma-password" ${data.firma?.valid ? 'hidden' : ''}>
          <label for="firma-password">Clave de la firma</label>
          <div class="input-action"><input id="firma-password" type="password" autocomplete="off" spellcheck="false"><button type="button" id="firma-validate" class="btn btn--primary">Leer firma</button></div>
          <p class="field-help">La clave se usa una sola vez en memoria y se limpia al terminar.</p>
        </div>
        <div id="firma-error" class="field-error" role="alert" aria-live="assertive"></div>
        <div id="firma-result" class="signature-result" ${data.firma?.valid ? '' : 'hidden'}></div>
      </div>
      <aside class="privacy-note">
        <span class="privacy-note__icon" aria-hidden="true">◇</span>
        <div><strong>Tu firma se queda contigo</strong><p>El archivo y su clave se procesan localmente. TributaSoft solo prepara los metadatos mínimos necesarios para validar el registro.</p></div>
      </aside>
    </div>
    <label class="consent-row">
      <input id="firma-terms" type="checkbox" ${data.terminos ? 'checked' : ''}>
      <span>Acepto los <button type="button" class="link-button" id="firma-open-terms">Términos y Condiciones</button> y la <a href="./Politica-de-Privacidad.txt" target="_blank" rel="noopener">Política de Privacidad</a>.</span>
    </label>`;

  const fileInput = body.querySelector('#firma-file');
  const fileLabel = body.querySelector('#firma-file-label');
  const password = body.querySelector('#firma-password');
  const error = body.querySelector('#firma-error');
  const drop = body.querySelector('#firma-drop');

  if (data.firma?.archivo) fileLabel.textContent = data.firma.archivo;
  if (data.firma?.valid) paintResult(body, data.firma);

  body.querySelector('#firma-pick').addEventListener('click', () => fileInput.click());
  drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('is-dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault(); drop.classList.remove('is-dragging');
    if (event.dataTransfer.files[0]) { fileInput.files = event.dataTransfer.files; prepareFile(event.dataTransfer.files[0]); }
  });
  fileInput.addEventListener('change', () => prepareFile(fileInput.files[0]));
  body.querySelector('#firma-terms').addEventListener('change', (event) => { data.terminos = event.target.checked; });
  body.querySelector('#firma-open-terms').addEventListener('click', () => openTerms(body.querySelector('#firma-terms')));
  body.querySelector('#firma-validate').addEventListener('click', validate);
  password.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); validate(); } });

  function prepareFile(file) {
    error.textContent = '';
    data.firma = null;
    body.querySelector('#firma-result').hidden = true;
    body.querySelector('.firma-password').hidden = false;
    if (!file) return;
    if (!/\.(p12|pfx)$/i.test(file.name)) { error.textContent = 'Selecciona un archivo .p12 o .pfx.'; fileInput.value = ''; return; }
    if (file.size > MAX_FILE_SIZE) { error.textContent = 'El archivo supera el límite de 8 MB.'; fileInput.value = ''; return; }
    fileLabel.textContent = file.name;
    password.focus();
  }

  async function validate() {
    const file = fileInput.files[0];
    error.textContent = '';
    if (!file) { error.textContent = 'Selecciona el archivo de firma.'; return; }
    if (!password.value) { error.textContent = 'Ingresa la clave de la firma.'; password.focus(); return; }
    showLoading('Leyendo tu firma de forma local…');
    const result = await validarFirmaP12(file, password.value, '');
    password.value = '';
    hideLoading();
    if (!result.valid) { error.textContent = result.reason || 'No pudimos validar la firma.'; return; }
    const rucCheck = validarRUC(result.ruc || '');
    if (!rucCheck.valid) { error.textContent = `La firma contiene un RUC no válido: ${rucCheck.reason}`; return; }
    data.firma = { ...result, archivo: file.name };
    data.rucManual = result.ruc;
    data.razonSocial ||= result.razonSocial || result.titular || '';
    data.representanteLegal ||= result.repLegal || null;
    data.sriStatus = 'PENDING';
    paintResult(body, data.firma);
    body.querySelector('.firma-password').hidden = true;
  }
}

function paintResult(body, firma) {
  const target = body.querySelector('#firma-result');
  target.hidden = false;
  target.innerHTML = `
    <div class="success-line"><span aria-hidden="true">✓</span><strong>Firma leída correctamente</strong></div>
    <dl class="signature-data">
      <div><dt>Razón social / titular</dt><dd>${escapeHtml(firma.razonSocial || firma.titular || '—')}</dd></div>
      <div><dt>RUC</dt><dd>${escapeHtml(maskRuc(firma.ruc))}</dd></div>
      ${firma.repLegal?.nombreCompleto ? `<div><dt>Representante legal</dt><dd>${escapeHtml(firma.repLegal.nombreCompleto)}</dd></div>` : ''}
      <div><dt>Caducidad</dt><dd>${escapeHtml(formatDate(firma.fechaCaducidad || firma.caducidad))}</dd></div>
    </dl>`;
}

function openTerms(checkbox) {
  const dialog = document.getElementById('modal-terms');
  if (!dialog) return;
  const body = document.getElementById('terms-body');
  const accept = document.getElementById('terms-aceptar');
  const cancel = document.getElementById('terms-cancelar');
  body.scrollTop = 0; accept.disabled = true;
  const onAccept = () => { checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true })); cleanup(); dialog.close(); };
  const cleanup = () => { accept.removeEventListener('click', onAccept); cancel.removeEventListener('click', cleanup); };
  accept.addEventListener('click', onAccept);
  cancel.addEventListener('click', cleanup, { once: true });
  dialog.showModal();
}

export function validarPantallaFirma(data) {
  const body = document.querySelector('[data-body="firma"]');
  const error = body?.querySelector('#firma-error');
  if (!data.firma?.valid) { if (error) error.textContent = 'Valida tu firma electrónica para continuar.'; return false; }
  if (!data.terminos) { if (error) error.textContent = 'Debes aceptar los Términos y la Política de Privacidad.'; body?.querySelector('#firma-terms')?.focus(); return false; }
  return true;
}

function maskRuc(value) { const ruc = String(value || ''); return ruc.length === 13 ? `${ruc.slice(0, 4)}••••••${ruc.slice(-3)}` : ruc; }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
