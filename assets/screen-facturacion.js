/* screen-facturacion.js — Pantalla 5 del wizard.
   El usuario indica si arranca desde cero o continúa con su facturación
   electrónica actual. Si continúa: pide establecimiento, punto de emisión,
   descripción y la PRÓXIMA factura a emitir.

   IMPORTANTE: en modo "continuar" solo se muestra Factura. Para los demás
   tipos de documento (NC, ND, retención, guía) se envía secuencia 1 al
   backend automáticamente. Si en el futuro queremos exponerlos visualmente,
   agregar el id de cada uno a TIPOS_VISIBLES. */

// Todos los tipos que se guardan en wizardData.secuencias
const TIPOS_DOCUMENTO = [
  { id: 'factura', label: 'Próxima factura a emitir' },
  { id: 'nc', label: 'Notas de crédito' },
  { id: 'nd', label: 'Notas de débito' },
  { id: 'retencion', label: 'Comprobantes de retención' },
  { id: 'guia', label: 'Guías de remisión' },
];

// IDs visibles en la UI; los demás se envían en silencio con '000000001'.
const TIPOS_VISIBLES = new Set(['factura']);

// Descripción del punto de emisión: sólo letras (con tildes/ñ) y dígitos.
const NOMBRE_PUNTO_REGEX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ]{1,50}$/;

export function renderPantallaFacturacion(body, wizardData) {
  // Defaults
  if (!wizardData.modoFacturacion) wizardData.modoFacturacion = 'nuevo';
  if (!wizardData.codEstablecimiento) wizardData.codEstablecimiento = '001';
  if (!wizardData.codPunto) wizardData.codPunto = '001';
  if (!wizardData.nombrePunto) wizardData.nombrePunto = 'Electrónicas';
  if (!wizardData.secuencias) {
    wizardData.secuencias = TIPOS_DOCUMENTO.reduce((acc, t) => { acc[t.id] = '000000001'; return acc; }, {});
  }

  const modo = wizardData.modoFacturacion;

  body.innerHTML = `
    <p class="datos-intro">
      Cuéntanos cómo es tu situación con la facturación electrónica.
    </p>

    <div class="field">
      <span class="field-label" style="font-weight:600;display:block;margin-bottom:.35rem;font-size:.92rem">¿Cuál es tu situación?</span>
      <div class="modo-facturacion" role="radiogroup" aria-label="Modo de facturación">
        <label>
          <input type="radio" name="f-modo" value="nuevo" ${modo === 'nuevo' ? 'checked' : ''}>
          <span class="modo-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </span>
          <div class="modo-content">
            <span class="modo-title">Empezar desde cero</span>
            <span class="modo-desc">Opción para contribuyentes que no hayan facturado electrónicamente anteriormente.</span>
          </div>
        </label>
        <label>
          <input type="radio" name="f-modo" value="continuar" ${modo === 'continuar' ? 'checked' : ''}>
          <span class="modo-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
              <polyline points="21 3 21 8 16 8"/>
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
              <polyline points="3 21 3 16 8 16"/>
            </svg>
          </span>
          <div class="modo-content">
            <span class="modo-title">Continuar con mi facturación</span>
            <span class="modo-desc">Opción para quienes ya facturan electrónicamente. Configura tu establecimiento, punto de emisión y secuencias actuales.</span>
          </div>
        </label>
      </div>
    </div>

    <!-- Bloque que se muestra solo en modo "continuar" -->
    <div class="establecimiento-bloque" id="f-est-bloque" ${modo === 'continuar' ? '' : 'hidden'}>
      <div class="establecimiento-bloque-header">
        <h4>Información de facturación</h4>
      </div>
      <div class="codigos-fila">
        <div class="field">
          <label for="f-establecimiento">
            Establecimiento
            <button type="button" class="tooltip-i" data-tooltip="est" aria-label="Información sobre Establecimiento">i</button>
          </label>
          <input id="f-establecimiento" type="text" maxlength="3" value="${escapeAttr(wizardData.codEstablecimiento)}" inputmode="numeric">
          <div id="f-establecimiento-error" class="error" role="alert" aria-live="polite"></div>
        </div>
        <div class="field">
          <label for="f-punto">
            Punto de emisión
            <button type="button" class="tooltip-i" data-tooltip="punto" aria-label="Información sobre Punto de emisión">i</button>
          </label>
          <input id="f-punto" type="text" maxlength="3" value="${escapeAttr(wizardData.codPunto)}" inputmode="numeric">
          <div id="f-punto-error" class="error" role="alert" aria-live="polite"></div>
        </div>
      </div>
      <div class="field">
        <label for="f-descripcion">Descripción</label>
        <input id="f-descripcion" type="text" maxlength="50" value="${escapeAttr(wizardData.nombrePunto)}" placeholder="Ej: Electrónicas">
        <div id="f-descripcion-error" class="error" role="alert" aria-live="polite"></div>
      </div>

      <div class="secuencias">
        ${TIPOS_DOCUMENTO.filter(t => TIPOS_VISIBLES.has(t.id)).map((t) => `
          <div class="field">
            <label for="f-seq-${t.id}">
              ${t.label}
              <button type="button" class="tooltip-i" data-tooltip="${t.id}" aria-label="Información sobre ${t.label}">i</button>
            </label>
            <input id="f-seq-${t.id}" type="text" maxlength="9" inputmode="numeric"
                   data-tipo="${t.id}" value="${escapeAttr(wizardData.secuencias[t.id] || '000000001')}">
            <div id="f-seq-${t.id}-error" class="error" role="alert" aria-live="polite"></div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- En modo "nuevo" sólo pedimos la descripción -->
    <div class="establecimiento-bloque" id="f-nuevo-bloque" ${modo === 'nuevo' ? '' : 'hidden'}>
      <div class="establecimiento-bloque-header">
        <h4>Información de facturación</h4>
      </div>
      <div class="field">
        <label for="f-descripcion-nuevo">Descripción</label>
        <input id="f-descripcion-nuevo" type="text" maxlength="50" value="${escapeAttr(wizardData.nombrePunto)}" placeholder="Ej: Electrónicas">
        <div id="f-descripcion-nuevo-error" class="error" role="alert" aria-live="polite"></div>
      </div>
      <p class="hint">Se asignará Establecimiento 001 y Punto de emisión 001 automáticamente.</p>
    </div>
  `;

  wireFacturacion(body, wizardData);
}

function wireFacturacion(root, wd) {
  // -------- Modo (radio) --------
  root.querySelectorAll('input[name="f-modo"]').forEach((r) => {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      wd.modoFacturacion = r.value;
      // Alternar bloques visibles
      root.querySelector('#f-est-bloque').hidden = r.value !== 'continuar';
      root.querySelector('#f-nuevo-bloque').hidden = r.value !== 'nuevo';
      // Si vuelve a "nuevo", resetear establecimiento/punto
      if (r.value === 'nuevo') {
        wd.codEstablecimiento = '001';
        wd.codPunto = '001';
      }
    });
  });

  // -------- Solo dígitos en establecimiento y punto (modo continuar) --------
  const estInput = root.querySelector('#f-establecimiento');
  const estError = root.querySelector('#f-establecimiento-error');
  const puntoInput = root.querySelector('#f-punto');
  const puntoError = root.querySelector('#f-punto-error');

  const validarCod = (input, errorEl, key) => {
    let val = input.value.replace(/\D/g, '').slice(0, 3);
    input.value = val;
    wd[key] = val;
    if (val.length !== 3) {
      input.setAttribute('aria-invalid', 'true');
      errorEl.textContent = 'Debe tener 3 dígitos.';
      return false;
    }
    if (val === '000') {
      input.setAttribute('aria-invalid', 'true');
      errorEl.textContent = 'No puede ser 000.';
      return false;
    }
    input.removeAttribute('aria-invalid');
    errorEl.textContent = '';
    return true;
  };
  estInput?.addEventListener('input', () => validarCod(estInput, estError, 'codEstablecimiento'));
  estInput?.addEventListener('blur', () => validarCod(estInput, estError, 'codEstablecimiento'));
  puntoInput?.addEventListener('input', () => validarCod(puntoInput, puntoError, 'codPunto'));
  puntoInput?.addEventListener('blur', () => validarCod(puntoInput, puntoError, 'codPunto'));

  // -------- Descripción (ambos modos) --------
  const validarDesc = (input, errorEl) => {
    const v = input.value;
    wd.nombrePunto = v.trim();
    if (!v.trim()) {
      input.setAttribute('aria-invalid', 'true');
      errorEl.textContent = 'Ingresa una descripción.';
      return false;
    }
    if (!NOMBRE_PUNTO_REGEX.test(v)) {
      input.setAttribute('aria-invalid', 'true');
      errorEl.textContent = 'Solo letras, números y espacios (máx. 50).';
      return false;
    }
    input.removeAttribute('aria-invalid');
    errorEl.textContent = '';
    return true;
  };
  const descCont = root.querySelector('#f-descripcion');
  const descContErr = root.querySelector('#f-descripcion-error');
  descCont?.addEventListener('input', () => validarDesc(descCont, descContErr));
  descCont?.addEventListener('blur', () => validarDesc(descCont, descContErr));

  const descNuevo = root.querySelector('#f-descripcion-nuevo');
  const descNuevoErr = root.querySelector('#f-descripcion-nuevo-error');
  descNuevo?.addEventListener('input', () => validarDesc(descNuevo, descNuevoErr));
  descNuevo?.addEventListener('blur', () => validarDesc(descNuevo, descNuevoErr));

  // -------- Secuencias (9 dígitos) --------
  root.querySelectorAll('[data-tipo]').forEach((input) => {
    const tipo = input.dataset.tipo;
    const errEl = root.querySelector(`#f-seq-${tipo}-error`);
    const validarSec = () => {
      let val = input.value.replace(/\D/g, '').slice(0, 9);
      input.value = val;
      wd.secuencias[tipo] = val;
      if (val.length !== 9) {
        input.setAttribute('aria-invalid', 'true');
        errEl.textContent = 'Debe tener 9 dígitos.';
        return false;
      }
      input.removeAttribute('aria-invalid');
      errEl.textContent = '';
      return true;
    };
    input.addEventListener('input', validarSec);
    input.addEventListener('blur', validarSec);
  });
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/"/g, '&quot;');
}

export function validarPantallaFacturacion(wd) {
  if (wd.modoFacturacion === 'nuevo') {
    if (!wd.nombrePunto?.trim() || !NOMBRE_PUNTO_REGEX.test(wd.nombrePunto)) {
      alert('Ingresa una descripción válida (letras, números y espacios, máx. 50).');
      return false;
    }
    return true;
  }

  // Modo continuar: validar todo
  if (!/^\d{3}$/.test(wd.codEstablecimiento) || wd.codEstablecimiento === '000') {
    alert('El código de establecimiento debe tener 3 dígitos y no puede ser 000.');
    return false;
  }
  if (!/^\d{3}$/.test(wd.codPunto) || wd.codPunto === '000') {
    alert('El código de punto de emisión debe tener 3 dígitos y no puede ser 000.');
    return false;
  }
  if (!wd.nombrePunto?.trim() || !NOMBRE_PUNTO_REGEX.test(wd.nombrePunto)) {
    alert('Ingresa una descripción válida (letras, números y espacios, máx. 50).');
    return false;
  }
  for (const t of TIPOS_DOCUMENTO) {
    const v = wd.secuencias[t.id] || '';
    if (!/^\d{9}$/.test(v)) {
      alert(`La secuencia de ${t.label} debe tener 9 dígitos.`);
      return false;
    }
  }
  return true;
}
