import { iniciarFacturacion, elegirFacturacion, erroresFacturacion, DOCUMENTOS, TIPOS_DOCUMENTO, seleccionarDocumentos, sincronizarCompatibilidad, normalizarSecuencia, normalizarSecuencias } from '../utils/billing-data.js?v=20260929a';
import { lockModalScroll } from '../utils/modal-scroll-lock.js?v=20260929a';

export function renderPantallaFacturacion(body, data) {
  iniciarFacturacion(data);
  body.innerHTML = `
    <fieldset class="billing-choice"><legend class="sr-only">¿Ya has emitido comprobantes electrónicos anteriormente?</legend>
      <label><input type="radio" name="f-modo" value="continuar" ${data._facturacionElegida && data.modoFacturacion === 'continuar' ? 'checked' : ''}>${billingIcon('continuar')}<span>Sí, ya he facturado</span></label>
      <label><input type="radio" name="f-modo" value="nuevo" ${data._facturacionElegida && data.modoFacturacion === 'nuevo' ? 'checked' : ''}>${billingIcon('nuevo')}<span>No, voy a empezar</span></label>
    </fieldset>
    <span class="field-error" id="f-modo-error" role="alert"></span>
    <div id="billing-fields"></div>`;
  const renderFields = () => {
    const root = body.querySelector('#billing-fields');
    if (!data._facturacionElegida) { root.innerHTML = ''; updateNext(data); return; }
    const continuing = data.modoFacturacion === 'continuar';
    // Un cliente nuevo no tiene numeración previa que revisar: conserva todos
    // los valores iniciales aprobados, pero no abre campos innecesarios.
    const expanded = continuing
      ? new Set([...root.querySelectorAll('details[open]')].map(section => section.dataset.documento))
      : new Set();
    if (continuing && !root.children.length) expanded.add('factura');
    const visibleTypes = continuing
      ? TIPOS_DOCUMENTO.filter(tipo => data.documentosFacturacion[tipo])
      : ['factura'];
    root.innerHTML = `<div class="billing-details">
      ${visibleTypes.map(tipo => {
        const doc = data.documentosFacturacion[tipo];
        return `<details name="billing-document" class="form-section datos-section billing-document" data-documento="${tipo}" ${expanded.has(tipo) ? 'open' : ''}>
          <summary><h3>${billingIcon(tipo)}${DOCUMENTOS[tipo]}</h3><span class="datos-section-summary">${escapeAttr(summary(doc))}</span></summary>
          <div class="datos-section-content"><div class="form-grid form-grid--2">
            ${field(tipo, 'establecimiento', 'Establecimiento', doc.establecimiento, 3)}
            ${field(tipo, 'punto_emision', 'Punto de emisión', doc.punto_emision, 3)}
            ${field(tipo, 'secuencia', 'Secuencia', doc.secuencia, 9)}
          </div></div>
        </details>`;
      }).join('')}
      ${continuing ? '<button type="button" class="billing-add" id="billing-add" aria-haspopup="dialog">También he emitido otros tipos de documentos</button>' : ''}
    </div>`;
    root.querySelector('#billing-add')?.addEventListener('click', () => abrirDocumentos(data, renderFields, body));
    setupSequenceTooltips(root, body);
    root.querySelectorAll('input').forEach(input => {
      const id = input.id.slice(2);
      const sync = ({ normalize = false } = {}) => {
        const limit = input.dataset.campo === 'secuencia' ? 9 : 3;
        input.value = input.value.replace(/\D/g, '').slice(0, limit);
        if (normalize && input.dataset.campo === 'secuencia') input.value = normalizarSecuencia(input.value);
        data.documentosFacturacion[input.dataset.tipo][input.dataset.campo] = input.value;
        sincronizarCompatibilidad(data);
        input.closest('details').querySelector('.datos-section-summary').textContent = summary(data.documentosFacturacion[input.dataset.tipo]);
        paintError(body, id, erroresFacturacion(data)[id] || '');
        updateNext(data);
      };
      input.addEventListener('input', () => sync());
      input.addEventListener('blur', () => sync({ normalize: true }));
    });
    for (const [id, message] of Object.entries(erroresFacturacion(data))) paintError(body, id, message);
    updateNext(data);
  };
  body.querySelectorAll('[name="f-modo"]').forEach(radio => radio.addEventListener('change', () => {
    if (!radio.checked) return;
    elegirFacturacion(data, radio.value);
    body.querySelector('#f-modo-error').textContent = '';
    renderFields();
  }));
  renderFields();
}

function updateNext(data) {
  // registerScreen también renderiza fuera del paso activo.
  if (document.body.dataset.wizardStep !== 'facturacion') return;
  document.getElementById('wiz-next').disabled = Object.keys(erroresFacturacion(data)).length > 0;
}
export function validarPantallaFacturacion(data) {
  normalizarSecuencias(data);
  document.querySelectorAll('[data-body="facturacion"] input[data-campo="secuencia"]').forEach(input => {
    const doc = data.documentosFacturacion?.[input.dataset.tipo];
    if (doc) input.value = doc.secuencia;
  });
  const errors = erroresFacturacion(data);
  const body = document.querySelector('[data-body="facturacion"]');
  for (const [id, message] of Object.entries(errors)) paintError(body, id, message);
  const first = Object.keys(errors)[0];
  if (first) {
    const input = body?.querySelector(first === 'modo' ? '[name="f-modo"]' : `#f-${first}`);
    const section = input?.closest('details');
    if (section) section.open = true;
    input?.focus();
  }
  updateNext(data);
  return !first;
}
function paintError(body, id, message) {
  const input = body?.querySelector(`#f-${id}`);
  if (message) input?.setAttribute('aria-invalid', 'true');
  else input?.removeAttribute('aria-invalid');
  const error = body?.querySelector(`#f-${id}-error`);
  if (error) error.textContent = message;
  const section = input?.closest('details');
  if (section) {
    const invalid = Boolean(section.querySelector('[aria-invalid="true"]'));
    section.querySelector('summary').setAttribute('aria-label', `${DOCUMENTOS[section.dataset.documento]}${invalid ? ': revisa los campos' : ''}`);
  }
}
function field(tipo, campo, label, value, max) {
  const id = `${tipo}-${campo}`;
  const labelMarkup = campo === 'secuencia'
    ? `<div class="field-label-row"><label for="f-${id}">${billingIcon(campo)}${label}</label><button type="button" class="sequence-info-button" aria-label="Información sobre la secuencia" aria-expanded="false" aria-controls="f-${id}-info">i</button><span id="f-${id}-info" class="sequence-info-popover" role="tooltip" hidden>Ingresa la última secuencia utilizada para este tipo de comprobante. TributaSoft continuará desde el número siguiente.<strong>Si tu última factura fue la 27, ingresa 27. Se guardará como 000000027 y TributaSoft emitirá la siguiente con la secuencia 000000028.</strong></span></div>`
    : `<label for="f-${id}">${billingIcon(campo)}${label}</label>`;
  return `<div class="field-group">${labelMarkup}<input id="f-${id}" data-tipo="${tipo}" data-campo="${campo}" type="text" value="${escapeAttr(value)}" maxlength="${max}" inputmode="numeric" pattern="\\d{${campo === 'secuencia' ? '1,9' : '3'}}" required autocomplete="off" aria-describedby="f-${id}-error"><span id="f-${id}-error" class="field-error" role="alert"></span></div>`;
}
function summary(doc) { return `${doc.establecimiento || '—'} · ${doc.punto_emision || '—'} · ${doc.secuencia || '—'}`; }
function abrirDocumentos(data, renderFields, body) {
  const dialog = document.createElement('dialog');
  dialog.className = 'email-verification billing-picker';
  dialog.setAttribute('aria-labelledby', 'billing-picker-title');
  dialog.innerHTML = `<button type="button" class="email-verification-close" aria-label="Cerrar selección">×</button>
    <h2 id="billing-picker-title">Otros documentos</h2>
    <form method="dialog"><fieldset><legend class="sr-only">Selecciona los documentos que vas a emitir</legend>
    ${TIPOS_DOCUMENTO.filter(tipo => tipo !== 'factura').map(tipo => `<label class="billing-pick"><input type="checkbox" name="documento" value="${tipo}" ${data.documentosFacturacion[tipo] ? 'checked' : ''}><span>${billingIcon(tipo)}${DOCUMENTOS[tipo]}</span></label>`).join('')}
    </fieldset><button type="submit" class="btn btn--primary email-code-verify">Aceptar</button></form>`;
  document.body.append(dialog);
  const release = lockModalScroll(dialog);
  dialog.addEventListener('close', () => { release(); dialog.remove(); body.querySelector('#billing-add')?.focus({ preventScroll: true }); }, { once: true });
  dialog.querySelector('.email-verification-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    seleccionarDocumentos(data, [...dialog.querySelectorAll('input:checked')].map(input => input.value));
    renderFields();
    dialog.close();
  });
  dialog.showModal();
}

function setupSequenceTooltips(root, body) {
  body._billingTooltipAbort?.abort();
  const controller = new AbortController();
  body._billingTooltipAbort = controller;
  const closeAll = except => root.querySelectorAll('.sequence-info-button').forEach(button => {
    if (button === except) return;
    button.setAttribute('aria-expanded', 'false');
    const tooltip = root.querySelector(`#${button.getAttribute('aria-controls')}`);
    if (tooltip) { tooltip.hidden = true; tooltip.removeAttribute('style'); }
  });
  root.querySelectorAll('.sequence-info-button').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    const tooltip = root.querySelector(`#${button.getAttribute('aria-controls')}`);
    const opening = button.getAttribute('aria-expanded') !== 'true';
    closeAll(button);
    button.setAttribute('aria-expanded', String(opening));
    if (tooltip) {
      tooltip.hidden = !opening;
      if (opening) placeTooltip(button, tooltip);
      else tooltip.removeAttribute('style');
    }
  }, { signal: controller.signal }));
  document.addEventListener('click', event => {
    if (!event.target.closest('.field-label-row')) closeAll();
  }, { signal: controller.signal });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeAll();
  }, { signal: controller.signal });
  window.addEventListener('resize', () => closeAll(), { signal: controller.signal });
  window.addEventListener('scroll', () => closeAll(), { signal: controller.signal, capture: true });
}

function placeTooltip(button, tooltip) {
  const margin = 12;
  const gap = 8;
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportWidth = viewport?.width || window.innerWidth;
  const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
  const anchor = button.getBoundingClientRect();
  const box = tooltip.getBoundingClientRect();
  const left = Math.min(Math.max(anchor.left, margin), Math.max(margin, viewportWidth - box.width - margin));
  const below = anchor.bottom + gap;
  const top = below + box.height <= viewportBottom - margin
    ? below
    : Math.max(viewportTop + margin, anchor.top - box.height - gap);
  // .wiz-screen conserva transform durante su transición y se convierte en
  // bloque contenedor de elementos fixed. Restamos su origen para mantener
  // las coordenadas finales dentro del viewport real.
  const container = tooltip.closest('.wiz-screen');
  const transformed = container && getComputedStyle(container).transform !== 'none';
  const containerRect = transformed ? container.getBoundingClientRect() : { left: 0, top: 0 };
  tooltip.style.left = `${Math.round(left - containerRect.left)}px`;
  tooltip.style.top = `${Math.round(top - containerRect.top)}px`;
}
function billingIcon(name) {
  const document = 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Zm0 0v5h5';
  const paths = {
    factura: `${document} M9 12h6m-6 4h6`,
    guia: 'M3 5h11v12H3zM14 9h4l3 4v4h-7M6 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
    nc: `${document} M12 11l-3 3 3 3m-3-3h7`,
    nd: `${document} M12 11l3 3-3 3m3-3H8`,
    liquidacion: 'M5 7h14l1 14H4L5 7Zm3 0V6a4 4 0 0 1 8 0v1M9 13h6m-6 4h6',
    retencion: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-3 12 6-6M9 9h.01M15 15h.01',
    continuar: `${document} M9 14l2 2 4-4`,
    nuevo: `${document} M9 14h6m-3-3v6`,
    establecimiento: 'M4 21V5h12v16M2 21h20M16 11h4v10M8 9h1m3 0h1m-5 4h1m3 0h1m-5 8v-4h4v4',
    punto_emision: 'M4 4h16v12H4zM8 20h8m-4-4v4M8 8h8m-8 4h4',
    secuencia: `${document} M9 12h6m-6 4h6`
  };
  return `<svg class="billing-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${paths[name]}"></path></svg>`;
}
function escapeAttr(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
