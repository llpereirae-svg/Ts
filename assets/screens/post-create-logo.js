import { lockModalScroll } from '../utils/modal-scroll-lock.js?v=20260929a';

export const LOGO_SPEC = Object.freeze({
  width: 2970,
  height: 300,
  ratio: 9.9,
  ratioTolerance: 0.10,
  maxBytes: 500 * 1024,
  mimeTypes: Object.freeze(['image/png', 'image/jpeg']),
  extensions: Object.freeze(['png', 'jpg', 'jpeg']),
});

const MESSAGE_RATIO = 'El archivo no tiene la proporción recomendada para el logo de TributaSoft. Puedes corregirlo más adelante. Por ahora utilizaremos tu razón social como logo provisional.';

export function detectImageMime(bytes) {
  if (bytes?.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png';
  if (bytes?.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  return '';
}

function validateLogoEnvelope({ name = '', type = '', size = 0, bytes }) {
  const extension = String(name).split('.').pop()?.toLowerCase() || '';
  const detectedType = detectImageMime(bytes);
  if (!LOGO_SPEC.extensions.includes(extension) || !LOGO_SPEC.mimeTypes.includes(type) || detectedType !== type) {
    return { ok: false, reason: 'Selecciona una imagen JPG o PNG válida.' };
  }
  if (!Number.isFinite(size) || size <= 0 || size > LOGO_SPEC.maxBytes) {
    return { ok: false, reason: 'El archivo debe pesar máximo 500 KB.' };
  }
  return { ok: true };
}

export function validateLogoMetadata({ name = '', type = '', size = 0, bytes, width = 0, height = 0 }) {
  const envelope = validateLogoEnvelope({ name, type, size, bytes });
  if (!envelope.ok) return envelope;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, reason: 'No pudimos leer la imagen. Intenta con otro archivo.' };
  }
  const ratio = width / height;
  const minRatio = LOGO_SPEC.ratio * (1 - LOGO_SPEC.ratioTolerance);
  const maxRatio = LOGO_SPEC.ratio * (1 + LOGO_SPEC.ratioTolerance);
  if (ratio < minRatio || ratio > maxRatio) return { ok: false, reason: MESSAGE_RATIO, incompatible: true };
  return { ok: true, width, height, ratio, exact: width === LOGO_SPEC.width && height === LOGO_SPEC.height };
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('IMAGE_DECODE_FAILED')); };
    image.src = url;
  });
}

export async function validateLogoFile(file) {
  try {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const envelope = validateLogoEnvelope({ name: file.name, type: file.type, size: file.size, bytes });
    if (!envelope.ok) return envelope;
    const dimensions = await decodeImage(file);
    return validateLogoMetadata({ name: file.name, type: file.type, size: file.size, bytes, ...dimensions });
  } catch {
    return { ok: false, reason: 'No pudimos leer la imagen. Intenta con otro archivo.' };
  }
}

export function buildProvisionalLogoMarkup({ razonSocial = '', email = '', celular = '' } = {}) {
  const contacts = [
    email ? `<span class="post-logo-provisional-contact-item">${contactIcon('email')}<span class="post-logo-provisional-value">${escapeHtml(email)}</span></span>` : '',
    celular ? `<span class="post-logo-provisional-contact-item">${contactIcon('phone')}<span class="post-logo-provisional-value">${escapeHtml(celular)}</span></span>` : '',
  ].filter(Boolean).join('');
  return `<span class="post-logo-provisional">
    <strong class="post-logo-provisional-name">${escapeHtml(razonSocial || 'Tu razón social')}</strong>
    ${contacts ? `<span class="post-logo-provisional-contact">${contacts}</span>` : ''}
  </span>`;
}

export function mostrarPersonalizacionLogo({ razonSocial = '', email = '', celular = '' } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'post-create-logo';
  dialog.setAttribute('aria-labelledby', 'post-logo-title');
  dialog.innerHTML = `
    <h2 id="post-logo-title">Personaliza tu cuenta</h2>
    <p class="post-logo-copy">¿Tienes un logo? Cárgalo ahora.</p>
    <p class="post-logo-meta">JPG o PNG · máximo 500 KB · recomendado ${LOGO_SPEC.width} × ${LOGO_SPEC.height} px (${LOGO_SPEC.ratio}:1)</p>
    <input id="post-logo-file" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" hidden>
    <div class="post-logo-preview" hidden>
      <div class="post-logo-banner" aria-label="Vista previa del logo"></div>
      <p class="post-logo-file-meta"></p>
    </div>
    <p class="post-logo-status" role="alert" aria-live="polite"></p>
    <div class="post-logo-actions">
      <button type="button" class="btn btn--primary post-logo-upload">Cargar logo</button>
      <button type="button" class="btn btn--ghost post-logo-continue">Continuar sin logo</button>
    </div>`;
  document.body.append(dialog);
  const input = dialog.querySelector('#post-logo-file');
  const preview = dialog.querySelector('.post-logo-preview');
  const banner = dialog.querySelector('.post-logo-banner');
  const metadata = dialog.querySelector('.post-logo-file-meta');
  const status = dialog.querySelector('.post-logo-status');
  const upload = dialog.querySelector('.post-logo-upload');
  const proceed = dialog.querySelector('.post-logo-continue');
  const unlock = lockModalScroll(dialog);
  let selectedFile = null;
  let objectUrl = '';
  let provisional = false;

  const clearObjectUrl = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = ''; };
  const prioritize = (target) => {
    upload.classList.toggle('btn--primary', target === 'upload');
    upload.classList.toggle('btn--ghost', target !== 'upload');
    proceed.classList.toggle('btn--primary', target === 'proceed');
    proceed.classList.toggle('btn--ghost', target !== 'proceed');
  };
  const showFallback = (message = '') => {
    clearObjectUrl();
    selectedFile = null;
    provisional = true;
    preview.hidden = false;
    banner.innerHTML = buildProvisionalLogoMarkup({ razonSocial, email, celular });
    metadata.textContent = 'Logo provisional';
    status.textContent = message;
    proceed.textContent = 'Continuar con este logo';
    prioritize('upload');
  };

  return new Promise(resolve => {
    const finish = () => {
      const result = selectedFile
        ? { kind: 'file', file: selectedFile, specification: LOGO_SPEC }
        : { kind: 'provisional', razonSocial, email, celular, specification: LOGO_SPEC };
      clearObjectUrl();
      dialog.close();
      dialog.remove();
      unlock();
      resolve(result);
    };
    upload.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      upload.disabled = proceed.disabled = true;
      status.textContent = 'Revisando imagen…';
      const validation = await validateLogoFile(file);
      upload.disabled = proceed.disabled = false;
      if (!validation.ok) { showFallback(validation.reason); return; }
      clearObjectUrl();
      selectedFile = file;
      provisional = false;
      objectUrl = URL.createObjectURL(file);
      preview.hidden = false;
      banner.innerHTML = `<img src="${objectUrl}" alt="Vista previa del logo seleccionado">`;
      metadata.textContent = `${file.name} · ${validation.width} × ${validation.height} px`;
      status.textContent = validation.exact ? 'La imagen cumple el formato recomendado.' : 'La imagen se ajustará proporcionalmente, sin recortes.';
      upload.textContent = 'Cambiar logo';
      proceed.textContent = 'Confirmar logo';
      prioritize('proceed');
    });
    proceed.addEventListener('click', () => {
      if (!selectedFile && !provisional) { showFallback(); return; }
      finish();
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); showFallback(); });
    try { dialog.showModal(); } catch { showFallback(); finish(); }
  });
}

function contactIcon(type) {
  if (type === 'email') {
    return '<svg class="post-logo-provisional-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4zM4 7l8 6 8-6"/></svg>';
  }
  return '<svg class="post-logo-provisional-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h3l1 5-2 1a15 15 0 0 0 6 6l1-2 5 1v3c0 2-2 4-4 4C9 20 4 15 3 7c0-2 2-4 4-4Z"/></svg>';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
