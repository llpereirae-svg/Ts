/* screen-logo.js — Pantalla 7 del wizard (opcional).
   El usuario puede:
     1. Subir un PNG/JPG. Si encaja EXACTO en 2970×300 px → se usa tal cual.
        Si tiene otras dimensiones → lo alineamos a la izquierda y a la
        derecha pintamos en Lobster el Nombre Comercial (grande) y debajo
        la Razón Social (más pequeña).
     2. Generar uno automático: solo texto, mismo layout Nombre Comercial +
        Razón Social en Lobster sobre fondo blanco.
     3. Omitir este paso. */

const BANNER_W = 2970;
const BANNER_H = 300;
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB

export function renderPantallaLogo(body, wizardData) {
  body.innerHTML = `
    <p class="datos-intro">
      Sube tu logo o generamos uno con tu nombre comercial. El banner final
      tendrá <strong>${BANNER_W}×${BANNER_H} px</strong> (PNG). Este paso es opcional —
      si prefieres, puedes omitirlo y subirlo después desde el portal.
    </p>

    <div class="logo-options" id="l-options">
      <button type="button" id="l-upload-btn" class="btn btn--ghost">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:.4rem">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        Subir mi logo
      </button>
      <button type="button" id="l-generar-btn" class="btn btn--primary">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:.4rem">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        Generar uno
      </button>
    </div>
    <input type="file" id="l-uploader" accept=".png,.jpg,.jpeg,image/png,image/jpeg" hidden>

    <p id="l-error" class="error" role="alert" aria-live="polite"></p>

    <div id="l-preview-wrap" class="logo-preview-wrap" hidden>
      <p class="logo-preview-label">Vista previa del banner (${BANNER_W}×${BANNER_H} px):</p>
      <div class="logo-preview-frame">
        <canvas id="l-canvas" width="${BANNER_W}" height="${BANNER_H}"></canvas>
      </div>
      <p id="l-source" class="logo-preview-source"></p>

      <div class="modal-actions modal-actions--split">
        <button type="button" id="l-rehacer" class="btn btn--ghost">Rehacer</button>
        <button type="button" id="l-quitar" class="btn btn--ghost">Quitar logo</button>
      </div>
    </div>

    <p class="logo-skip-hint">
      ¿Prefieres omitir este paso? Dale Continuar sin subir ni generar nada.
    </p>
  `;

  wireLogoScreen(body, wizardData);

  // Si ya había logo (volvió desde resumen), re-mostrar preview
  if (wizardData.logoDataUrl) {
    paintFromDataUrl(wizardData.logoDataUrl);
    showPreview(body, wizardData.logoSource || 'Logo configurado');
  }
}

function wireLogoScreen(root, wd) {
  const uploader = root.querySelector('#l-uploader');
  const uploadBtn = root.querySelector('#l-upload-btn');
  const generarBtn = root.querySelector('#l-generar-btn');
  const rehacerBtn = root.querySelector('#l-rehacer');
  const quitarBtn = root.querySelector('#l-quitar');
  const errorEl = root.querySelector('#l-error');

  uploadBtn.addEventListener('click', () => uploader.click());

  uploader.addEventListener('change', async () => {
    const file = uploader.files?.[0];
    if (!file) return;
    errorEl.textContent = '';
    if (file.size > MAX_FILE_SIZE) {
      errorEl.textContent = 'El archivo es muy grande (máx. 4 MB).';
      return;
    }
    try {
      const img = await loadImage(file);
      const canvas = root.querySelector('#l-canvas');
      let fuente;
      if (img.naturalWidth === BANNER_W && img.naturalHeight === BANNER_H) {
        // Encaja perfecto → pegar tal cual
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, BANNER_W, BANNER_H);
        ctx.drawImage(img, 0, 0, BANNER_W, BANNER_H);
        fuente = `${file.name} · usado tal cual (${BANNER_W}×${BANNER_H} px)`;
      } else {
        // No encaja → logo a la izquierda + texto a la derecha en Lobster
        drawLogoConTexto(canvas, img, wd);
        fuente = `${file.name} · alineado a la izquierda con tu nombre comercial al lado`;
      }
      wd.logoDataUrl = canvas.toDataURL('image/png');
      wd.logoSource = fuente;
      showPreview(root, fuente);
    } catch (err) {
      console.error('[logo] error', err);
      errorEl.textContent = 'No pudimos procesar la imagen. Intenta otro archivo.';
    }
  });

  generarBtn.addEventListener('click', () => {
    errorEl.textContent = '';
    const canvas = root.querySelector('#l-canvas');
    drawTextoSolo(canvas, wd);
    const fuente = 'Generado automáticamente con tu nombre comercial';
    wd.logoDataUrl = canvas.toDataURL('image/png');
    wd.logoSource = fuente;
    showPreview(root, fuente);
  });

  rehacerBtn?.addEventListener('click', () => {
    wd.logoDataUrl = null;
    wd.logoSource = null;
    root.querySelector('#l-preview-wrap').hidden = true;
    uploader.value = '';
    errorEl.textContent = '';
  });

  quitarBtn?.addEventListener('click', () => {
    wd.logoDataUrl = null;
    wd.logoSource = null;
    root.querySelector('#l-preview-wrap').hidden = true;
    uploader.value = '';
    errorEl.textContent = '';
  });
}

function paintFromDataUrl(dataUrl) {
  const canvas = document.querySelector('#l-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, BANNER_W, BANNER_H);
    ctx.drawImage(img, 0, 0, BANNER_W, BANNER_H);
  };
  img.src = dataUrl;
}

function showPreview(root, fuenteTexto) {
  root.querySelector('#l-preview-wrap').hidden = false;
  root.querySelector('#l-source').textContent = fuenteTexto;
}

/**
 * Logo a la izquierda + texto a la derecha en Lobster.
 * Layout:
 *   [PADDING]  LOGO (altura completa - padding, ancho proporcional)  [GAP]  TEXTO  [PADDING]
 */
function drawLogoConTexto(canvas, img, wd) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, BANNER_W, BANNER_H);

  // Fondo blanco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, BANNER_W, BANNER_H);

  // Logo a la izquierda
  const padding = 40;
  const gap = 60;
  const maxLogoHeight = BANNER_H - padding * 2; // 220 px
  const maxLogoWidth = 900;
  const aspect = img.naturalWidth / img.naturalHeight;
  let logoH = maxLogoHeight;
  let logoW = logoH * aspect;
  if (logoW > maxLogoWidth) {
    logoW = maxLogoWidth;
    logoH = logoW / aspect;
  }
  const logoX = padding;
  const logoY = (BANNER_H - logoH) / 2;
  ctx.drawImage(img, logoX, logoY, logoW, logoH);

  // Texto a la derecha
  drawTextoLateral(ctx, logoX + logoW + gap, BANNER_W - padding, wd);
}

/**
 * Banner solo de texto: si no hay logo, ponemos el texto centrado.
 */
function drawTextoSolo(canvas, wd) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, BANNER_W, BANNER_H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, BANNER_W, BANNER_H);
  drawTextoCentrado(ctx, wd);
}

function drawTextoLateral(ctx, x, xMax, wd) {
  const nombreComercial = (wd.nombreComercial && !wd.nombreComercialNA) ? wd.nombreComercial : '';
  const razonSocial = wd.razonSocial || '';
  const widthDisponible = xMax - x;

  // Si no hay nombre comercial, ponemos solo razón social grande
  if (!nombreComercial) {
    ctx.fillStyle = '#00236f';
    ctx.font = 'bold 130px "Lobster", cursive';
    ctx.textBaseline = 'middle';
    drawShrinkToFit(ctx, razonSocial, x, BANNER_H / 2, widthDisponible, 130, 60);
    return;
  }

  // Nombre Comercial en Lobster grande
  ctx.fillStyle = '#00236f';
  ctx.font = 'bold 150px "Lobster", cursive';
  ctx.textBaseline = 'middle';
  drawShrinkToFit(ctx, nombreComercial, x, 110, widthDisponible, 150, 70);

  // Razón Social abajo
  ctx.fillStyle = '#444651';
  ctx.font = '500 60px "DM Sans", "Inter", sans-serif';
  ctx.textBaseline = 'middle';
  drawShrinkToFit(ctx, razonSocial, x, 220, widthDisponible, 60, 28);
}

function drawTextoCentrado(ctx, wd) {
  const nombreComercial = (wd.nombreComercial && !wd.nombreComercialNA) ? wd.nombreComercial : '';
  const razonSocial = wd.razonSocial || '';
  const padding = 60;
  const w = BANNER_W - padding * 2;

  if (!nombreComercial) {
    ctx.fillStyle = '#00236f';
    ctx.font = 'bold 160px "Lobster", cursive';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawShrinkToFitCentrado(ctx, razonSocial, BANNER_W / 2, BANNER_H / 2, w, 160, 70);
    ctx.textAlign = 'left';
    return;
  }

  ctx.fillStyle = '#00236f';
  ctx.font = 'bold 180px "Lobster", cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawShrinkToFitCentrado(ctx, nombreComercial, BANNER_W / 2, 115, w, 180, 80);

  ctx.fillStyle = '#444651';
  ctx.font = '500 70px "DM Sans", "Inter", sans-serif';
  drawShrinkToFitCentrado(ctx, razonSocial, BANNER_W / 2, 230, w, 70, 32);

  ctx.textAlign = 'left';
}

/**
 * Pinta texto reduciendo el tamaño de fuente hasta que quepa en maxWidth.
 */
function drawShrinkToFit(ctx, text, x, y, maxWidth, initialSize, minSize) {
  if (!text) return;
  let size = initialSize;
  while (size > minSize) {
    ctx.font = ctx.font.replace(/\d+(\.\d+)?px/, size + 'px');
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 5;
  }
  ctx.fillText(text, x, y);
}

function drawShrinkToFitCentrado(ctx, text, x, y, maxWidth, initialSize, minSize) {
  drawShrinkToFit(ctx, text, x, y, maxWidth, initialSize, minSize);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image decode error'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Esta pantalla es OPCIONAL: siempre deja avanzar.
// Si el usuario no configuró logo, wizardData.logoDataUrl queda null y
// el backend puede generar uno default o dejar la cuenta sin banner.
export function validarPantallaLogo() {
  return true;
}
