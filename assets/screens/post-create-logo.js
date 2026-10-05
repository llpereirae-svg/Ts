import { lockModalScroll } from '../utils/modal-scroll-lock.js?v=20261005p';

export const LOGO_SPEC = Object.freeze({
  width: 2970,
  height: 300,
  ratio: 9.9,
  ratioTolerance: 0.10,
  maxBytes: 250 * 1024,
  mimeTypes: Object.freeze(['image/png', 'image/jpeg']),
  extensions: Object.freeze(['png', 'jpg', 'jpeg']),
});

const MESSAGE_RATIO = `El logo debe conservar una proporción cercana a ${LOGO_SPEC.width} × ${LOGO_SPEC.height} px.`;

export function detectImageMime(bytes) {
  if (bytes?.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png';
  if (bytes?.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  return '';
}

function validateLogoEnvelope({ name = '', type = '', size = 0, bytes }) {
  const extension = String(name).split('.').pop()?.toLowerCase() || '';
  const detectedType = detectImageMime(bytes);
  if (!LOGO_SPEC.extensions.includes(extension) || !LOGO_SPEC.mimeTypes.includes(type) || detectedType !== type) {
    return { ok: false, reason: 'Sube una imagen JPG o PNG válida.' };
  }
  if (!Number.isFinite(size) || size <= 0 || size > LOGO_SPEC.maxBytes) {
    return { ok: false, reason: 'El logo debe pesar máximo 250 KB.' };
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

function drawMailIcon(ctx, x, y, size) {
  const width = size * 1.3;
  ctx.beginPath();
  ctx.rect(x, y - size / 2, width, size);
  ctx.moveTo(x, y - size / 2);
  ctx.lineTo(x + width / 2, y + size * .08);
  ctx.lineTo(x + width, y - size / 2);
  ctx.stroke();
}

function drawPhoneIcon(ctx, x, y, size) {
  ctx.beginPath();
  ctx.moveTo(x + size * .18, y - size * .5);
  ctx.quadraticCurveTo(x - size * .05, y - size * .15, x + size * .34, y + size * .25);
  ctx.quadraticCurveTo(x + size * .72, y + size * .62, x + size, y + size * .32);
  ctx.lineTo(x + size * .75, y + size * .08);
  ctx.quadraticCurveTo(x + size * .62, y, x + size * .5, y + size * .1);
  ctx.lineTo(x + size * .37, y - size * .03);
  ctx.quadraticCurveTo(x + size * .28, y - size * .13, x + size * .34, y - size * .25);
  ctx.closePath();
  ctx.stroke();
}

export function drawProvisionalLogo(canvas, razonSocial = '', { email = '', celular = '' } = {}) {
  const ctx = canvas.getContext('2d');
  const text = String(razonSocial || 'Tu razón social').trim();
  ctx.clearRect(0, 0, LOGO_SPEC.width, LOGO_SPEC.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LOGO_SPEC.width, LOGO_SPEC.height);
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 124;
  const maxWidth = LOGO_SPEC.width - 180;
  do {
    ctx.font = `300 ${size}px "Roboto Condensed", "Arial Narrow", sans-serif`;
    if (ctx.measureText(text).width <= maxWidth || size <= 58) break;
    size -= 6;
  } while (size > 58);
  ctx.fillText(text, LOGO_SPEC.width / 2, 105, maxWidth);

  const contacts = [
    { kind: 'email', value: String(email).trim() },
    { kind: 'phone', value: String(celular).trim() },
  ].filter(item => item.value);
  if (contacts.length) {
    const contactSize = 48;
    const iconSize = 34;
    const iconGap = 22;
    const itemGap = 92;
    ctx.font = `400 ${contactSize}px "Roboto Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const widths = contacts.map(item => iconSize * 1.3 + iconGap + ctx.measureText(item.value).width);
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + itemGap * (contacts.length - 1);
    let x = (LOGO_SPEC.width - totalWidth) / 2;
    contacts.forEach((item, index) => {
      ctx.strokeStyle = '#0b2d6b';
      if (item.kind === 'email') drawMailIcon(ctx, x, 220, iconSize);
      else drawPhoneIcon(ctx, x, 220, iconSize);
      x += iconSize * 1.3 + iconGap;
      ctx.fillStyle = '#475467';
      ctx.fillText(item.value, x, 220);
      x += ctx.measureText(item.value).width + (index < contacts.length - 1 ? itemGap : 0);
    });
  }
  return canvas;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('LOGO_ENCODE_FAILED')), 'image/jpeg', quality));
}

export async function generateProvisionalLogoFile(razonSocial = '', contact = {}) {
  await document.fonts?.load?.('300 156px "Roboto Condensed"');
  const canvas = document.createElement('canvas');
  canvas.width = LOGO_SPEC.width;
  canvas.height = LOGO_SPEC.height;
  drawProvisionalLogo(canvas, razonSocial, contact);
  let blob;
  for (const quality of [0.92, 0.82, 0.70, 0.58, 0.46]) {
    blob = await canvasToBlob(canvas, quality);
    if (blob.size <= LOGO_SPEC.maxBytes) break;
  }
  if (!blob || blob.size > LOGO_SPEC.maxBytes) throw new Error('LOGO_TOO_LARGE');
  return new File([blob], 'logo-provisional.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}

export function mostrarPersonalizacionLogo({ razonSocial = '', email = '', celular = '' } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'post-create-logo';
  dialog.setAttribute('aria-labelledby', 'post-logo-title');
  dialog.innerHTML = `
    <h2 id="post-logo-title">Personaliza tu cuenta</h2>
    <p class="post-logo-copy">Sube el logo de tu negocio o continúa con el que preparamos para ti.</p>
    <div class="post-logo-requirements" aria-label="Requisitos del logo">
      <span>JPG o PNG</span><span>${LOGO_SPEC.width} × ${LOGO_SPEC.height} px</span><span>Máximo 250 KB</span>
    </div>
    <input id="post-logo-file" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" hidden>
    <div class="post-logo-preview">
      <div class="post-logo-banner" aria-label="Vista previa del logo"><span class="post-logo-preparing">Preparando vista previa…</span></div>
      <p class="post-logo-file-meta"></p>
    </div>
    <p class="post-logo-status" role="alert" aria-live="polite"></p>
    <div class="post-logo-actions">
      <button type="button" class="btn btn--ghost post-logo-upload">Cargar mi logo</button>
      <button type="button" class="btn btn--primary post-logo-continue" disabled>Continuar con este logo</button>
    </div>`;
  document.body.append(dialog);
  const input = dialog.querySelector('#post-logo-file');
  const banner = dialog.querySelector('.post-logo-banner');
  const metadata = dialog.querySelector('.post-logo-file-meta');
  const status = dialog.querySelector('.post-logo-status');
  const upload = dialog.querySelector('.post-logo-upload');
  const proceed = dialog.querySelector('.post-logo-continue');
  const unlock = lockModalScroll(dialog);
  let selectedFile = null;
  let generated = true;
  let objectUrl = '';

  const clearObjectUrl = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = ''; };
  const showFile = (file, label) => {
    clearObjectUrl();
    selectedFile = file;
    objectUrl = URL.createObjectURL(file);
    banner.innerHTML = `<img src="${objectUrl}" alt="Vista previa del logo">`;
    metadata.textContent = label;
    proceed.disabled = false;
  };
  const prepareGenerated = async () => {
    proceed.disabled = upload.disabled = true;
    status.textContent = '';
    try {
      const file = await generateProvisionalLogoFile(razonSocial, { email, celular });
      generated = true;
      showFile(file, 'Este es un logo pregenerado. Si deseas usar el logo de tu negocio, selecciona Cargar mi logo.');
    } catch {
      status.textContent = 'No pudimos generar el logo. Intenta cargar una imagen.';
    } finally {
      upload.disabled = false;
    }
  };

  return new Promise(resolve => {
    const finish = () => {
      if (!selectedFile) return;
      const result = { kind: 'file', file: selectedFile, generated, specification: LOGO_SPEC };
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
      upload.disabled = false;
      if (!validation.ok) {
        status.textContent = validation.reason;
        proceed.disabled = !selectedFile;
        input.value = '';
        return;
      }
      generated = false;
      showFile(file, `${file.name} · ${validation.width} × ${validation.height} px · ${Math.ceil(file.size / 1024)} KB`);
      status.textContent = validation.exact ? 'La imagen cumple el formato recomendado.' : 'La imagen conserva la proporción requerida.';
      upload.textContent = 'Cambiar logo';
    });
    proceed.addEventListener('click', finish);
    dialog.addEventListener('cancel', event => event.preventDefault());
    try { dialog.showModal(); prepareGenerated(); } catch { prepareGenerated().then(finish); }
  });
}
