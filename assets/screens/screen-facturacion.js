import { iniciarFacturacion, erroresFacturacion, DOCUMENTOS, sincronizarCompatibilidad, normalizarSecuencia, normalizarSecuencias, construirFacturacion } from '../utils/billing-data.js?v=20261005f';
import { guardarFacturacion } from '../services/draft-service.js?v=20261004a';
import { lockModalScroll } from '../utils/modal-scroll-lock.js?v=20261004a';

export function renderPantallaFacturacion(body, data) {
  iniciarFacturacion(data);
  const doc = data.documentosFacturacion.factura;
  body.innerHTML = `
    <div class="billing-guidance"><strong>Valores sugeridos por TributaSoft</strong><span>Puedes editarlos según la configuración de tu negocio.</span></div>
    <section class="billing-details billing-invoice" aria-labelledby="billing-invoice-title">
      <h3 id="billing-invoice-title">${billingIcon('factura')}${DOCUMENTOS.factura}</h3>
      <div class="form-grid form-grid--2">
        ${field('factura', 'establecimiento', 'Establecimiento', doc.establecimiento, 3)}
        ${field('factura', 'punto_emision', 'Punto de emisión', doc.punto_emision, 3)}
        ${field('factura', 'secuencia', 'Secuencia', doc.secuencia, 9)}
      </div>
    </section>
    <p class="billing-later">Más adelante podrás configurar desde tu perfil otros establecimientos, puntos de emisión y secuencias por tipo de documento.</p>
    <span class="field-error" id="f-modo-error" role="alert"></span>`;
    body.querySelector('[data-sequence-help]')?.addEventListener('click', showSequenceHelp);
    body.querySelectorAll('input').forEach(input => {
      const id = input.id.slice(2);
      const sync = ({ normalize = false } = {}) => {
        const limit = input.dataset.campo === 'secuencia' ? 9 : 3;
        input.value = input.value.replace(/\D/g, '').slice(0, limit);
        if (normalize && input.dataset.campo === 'secuencia') input.value = normalizarSecuencia(input.value);
        data.documentosFacturacion[input.dataset.tipo][input.dataset.campo] = input.value;
        sincronizarCompatibilidad(data);
        paintError(body, id, erroresFacturacion(data)[id] || '');
        updateNext(data);
      };
      input.addEventListener('input', () => sync());
      input.addEventListener('blur', () => sync({ normalize: true }));
    });
  for (const [id, message] of Object.entries(erroresFacturacion(data))) paintError(body, id, message);
  updateNext(data);
}

function updateNext(data) {
  // registerScreen también renderiza fuera del paso activo.
  if (document.body.dataset.wizardStep !== 'facturacion') return;
  document.getElementById('wiz-next').disabled = Object.keys(erroresFacturacion(data)).length > 0;
}
export async function validarPantallaFacturacion(data) {
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
    const input = body?.querySelector(`#f-${first}`);
    input?.focus();
  }
  updateNext(data);
  if (first) return false;
  if (!data.registrationId) return false;
  try { await guardarFacturacion(data.registrationId, construirFacturacion(data)); return true; }
  catch {
    const target = body?.querySelector('#f-modo-error');
    if (target) target.textContent = 'No pudimos guardar la configuración. Intenta nuevamente.';
    return false;
  }
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
  const help = campo === 'secuencia' ? '<button type="button" class="billing-help-link" data-sequence-help>Saber más</button>' : '';
  const labelMarkup = `<span class="billing-field-heading"><label for="f-${id}">${billingIcon(campo)}${label}</label>${help}</span>`;
  return `<div class="field-group">${labelMarkup}<input id="f-${id}" data-tipo="${tipo}" data-campo="${campo}" type="text" value="${escapeAttr(value)}" maxlength="${max}" inputmode="numeric" pattern="\\d{${campo === 'secuencia' ? '1,9' : '3'}}" required autocomplete="off" aria-describedby="f-${id}-error"><span id="f-${id}-error" class="field-error" role="alert"></span></div>`;
}
function showSequenceHelp() {
  const dialog = document.createElement('dialog');
  dialog.className = 'billing-help-dialog';
  dialog.setAttribute('aria-labelledby', 'billing-help-title');
  dialog.innerHTML = `
    <h2 id="billing-help-title">¿Qué es la secuencia?</h2>
    <p>Es el número consecutivo que identifica cada factura.</p>
    <p>Con los valores sugeridos, tu primera factura se mostrará como:</p>
    <strong class="billing-help-example">001-002-000000001</strong>
    <p>La secuencia siempre utiliza nueve dígitos y se completa con ceros a la izquierda.</p>
    <button type="button" class="btn btn--primary billing-help-close">Entendido</button>`;
  document.body.append(dialog);
  const unlock = lockModalScroll(dialog);
  const close = () => { dialog.close(); dialog.remove(); unlock(); };
  dialog.querySelector('.billing-help-close').addEventListener('click', close, { once: true });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }, { once: true });
  try { dialog.showModal(); } catch { close(); }
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
