/* screen-logo.js — Pantalla 7 del wizard (opcional).
   El usuario puede:
     1. Subir un PNG/JPG. Si encaja EXACTO en 2970×300 px → se usa tal cual.
        Si tiene otras dimensiones → lo escalamos manteniendo aspecto y lo
        centramos en el banner blanco. NO se agrega texto: respetamos el
        logo del usuario sin tocarlo más que para que entre en la caja.
     2. Generar uno automático: solo texto (Nombre Comercial + Razón Social
        en Lobster) sobre fondo blanco. Solo se genera texto en esta opción.
     3. Omitir este paso. */

const BANNER_W = 2970;
const BANNER_H = 300;
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB

// Conectores que se dejan en minúscula dentro de una razón social
// (estilo corporativo: "Boticas Unidas del Ecuador" en vez de "Del").
// Solo aplica cuando NO son la primera palabra.
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'el', 'en', 'da', 'do', 'das', 'dos']);

/**
 * Convierte un nombre en MAYÚSCULAS al case ideal para un logo:
 *   - Primera letra de cada palabra en mayúscula, resto en minúscula
 *   - Conectores ('de', 'del', 'la', etc.) van en minúscula (excepto si son la primera palabra)
 *   - Palabras que contienen punto (siglas tipo "S.A.", "C.A.", "Cía.") quedan EN MAYÚSCULAS
 *
 * Ejemplos:
 *   "TRIBUTASOFT S.A."                  → "Tributasoft S.A."
 *   "BOTICAS UNIDAS DEL ECUADOR C.A."   → "Boticas Unidas del Ecuador C.A."
 *   "PEREIRA ESPINOZA LENIN LEONARDO"   → "Pereira Espinoza Lenin Leonardo"
 *   "CÍA. EJEMPLO LTDA."                → "CÍA. Ejemplo LTDA."
 */
function toBrandCase(s) {
  if (!s) return '';
  return String(s).split(/\s+/).map((word, idx) => {
    if (!word) return '';
    // Siglas con punto → mayúscula
    if (word.includes('.')) return word.toUpperCase();
    const lower = word.toLocaleLowerCase('es-EC');
    // Conectores en minúscula (no la primera palabra)
    if (idx > 0 && CONECTORES.has(lower)) return lower;
    // Title case
    return word.charAt(0).toLocaleUpperCase('es-EC') + lower.slice(1);
  }).join(' ');
}

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
        // No encaja → solo ajustamos la imagen al banner (sin agregar texto)
        drawLogoAjustado(canvas, img);
        fuente = `${file.name} · ajustado a ${BANNER_W}×${BANNER_H} px (sin texto)`;
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
 * Ajusta la imagen subida al banner 2970×300 manteniendo el aspect ratio.
 * NO agrega texto — solo centra y escala el logo del usuario sobre fondo blanco.
 *
 * Estrategia: la imagen se escala para que QUEPA completa dentro del banner
 * (contain, no cover) y se centra. Si el aspect ratio del logo no coincide
 * con el del banner, queda banda blanca a los costados o arriba/abajo.
 * Se respeta un padding mínimo de 20 px arriba/abajo y 40 px a los lados.
 */
function drawLogoAjustado(canvas, img) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, BANNER_W, BANNER_H);

  // Fondo blanco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, BANNER_W, BANNER_H);

  // Calcular el escalado tipo "contain" con padding
  const padX = 40;
  const padY = 20;
  const maxW = BANNER_W - padX * 2;
  const maxH = BANNER_H - padY * 2;

  const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;

  // Centrar en el banner
  const drawX = (BANNER_W - drawW) / 2;
  const drawY = (BANNER_H - drawH) / 2;

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
}

/**
 * Banner solo de texto: opción "Generar uno" — pinta el nombre comercial
 * (o la razón social) en Lobster sobre fondo blanco. Único caso donde
 * generamos texto.
 */
function drawTextoSolo(canvas, wd) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, BANNER_W, BANNER_H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, BANNER_W, BANNER_H);
  drawTextoCentrado(ctx, wd);
}

function drawTextoCentrado(ctx, wd) {
  const nombreComercial = (wd.nombreComercial && !wd.nombreComercialNA) ? toBrandCase(wd.nombreComercial) : '';
  const razonSocial = toBrandCase(wd.razonSocial || '');
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
