import { consultarRuc, RUC_RESULT } from '../services/ruc-service.js?v=20260929a';
import { validarEmail, validarCelular } from '../utils/validators.js?v=20260929a';

export function renderPantallaDatos(body, data) {
  prefillFromSignature(data);
  body.innerHTML = `
    <div id="ruc-status" class="status-callout" role="status" aria-live="polite"><span class="status-spinner" aria-hidden="true"></span><div><strong>Consultando el SRI</strong><span>Esto puede tardar unos segundos.</span></div></div>
    <div id="ruc-warnings"></div>
    <div class="form-section">
      <div class="section-heading"><div><p class="section-kicker">Información tributaria</p><h3>Datos del contribuyente</h3></div><span class="source-badge">Fuente: SRI</span></div>
      <div class="form-grid form-grid--2">
        ${field('ruc', 'RUC', data.rucManual, { readonly: true, inputmode: 'numeric' })}
        ${field('estado', 'Estado del contribuyente', data.estadoContribuyenteRuc, { readonly: true })}
        ${field('razon', 'Razón social', data.razonSocial, { required: true, span: true })}
        ${field('nombre', 'Nombre comercial', data.nombreComercial)}
        ${field('regimen', 'Régimen', data.regimen)}
        ${field('actividad', 'Actividad económica principal', data.actividadEconomica, { span: true })}
      </div>
      <div id="representante-block" class="representative-block" ${data.representanteLegal ? '' : 'hidden'}></div>
    </div>
    <div class="form-section">
      <div class="section-heading"><div><p class="section-kicker">Contacto</p><h3>¿Dónde te contactamos?</h3></div></div>
      <div class="form-grid form-grid--2">
        ${field('email', 'Correo electrónico', data.email, { required: true, type: 'email', autocomplete: 'email' })}
        ${field('celular', 'Celular', data.celular, { required: true, type: 'tel', inputmode: 'tel', autocomplete: 'tel' })}
      </div>
    </div>`;

  const bindings = {
    razon: 'razonSocial', nombre: 'nombreComercial', regimen: 'regimen', actividad: 'actividadEconomica', email: 'email', celular: 'celular',
  };
  Object.entries(bindings).forEach(([id, key]) => {
    body.querySelector(`#${id}`).addEventListener('input', (event) => { data[key] = key === 'email' ? event.target.value.trim().toLowerCase() : event.target.value; });
  });
  paintRepresentative(body, data.representanteLegal);
  paintStatus(body, data);
  if (data.sriStatus === 'PENDING') runLookup(body, data);
}

async function runLookup(body, data) {
  data.sriStatus = 'LOADING';
  paintStatus(body, data);
  const result = await consultarRuc(data.rucManual);
  data.sriStatus = result.status;
  if (result.status === RUC_RESULT.OK) {
    const sri = result.data;
    data.sriValidacionPendiente = false;
    data.razonSocial = sri.razonSocial || data.razonSocial;
    data.nombreComercial = sri.nombreComercial || data.nombreComercial;
    data.actividadEconomica = sri.actividadEconomicaPrincipal || data.actividadEconomica;
    data.estadoContribuyenteRuc = sri.estadoContribuyenteRuc;
    data.regimen = sri.regimen || data.regimen;
    data.tipoContribuyente = sri.tipoContribuyente || data.tipoContribuyente;
    data.representanteLegal = sri.representanteLegal;
    data.sriAdvertencias = sri.advertencias;
    syncFields(body, data);
  } else if (result.status === RUC_RESULT.UNAVAILABLE) {
    data.sriValidacionPendiente = true;
    data.sriAdvertencias = [];
  } else {
    data.sriValidacionPendiente = false;
  }
  data.sriReason = result.reason || '';
  paintStatus(body, data);
  paintWarnings(body, data.sriAdvertencias);
}

function paintStatus(body, data) {
  const target = body.querySelector('#ruc-status');
  if (!target) return;
  const states = {
    PENDING: ['Consultando el SRI', 'Preparando la consulta segura…', ''],
    LOADING: ['Consultando el SRI', 'Esto puede tardar unos segundos.', ''],
    OK: ['Datos tributarios confirmados', 'Revisa la información antes de continuar.', 'status-callout--success'],
    NOT_FOUND: ['RUC no encontrado', 'El SRI respondió 204. Verifica el RUC contenido en la firma.', 'status-callout--error'],
    UNAVAILABLE: ['SRI temporalmente no disponible', 'Puedes completar los datos manualmente. Quedarán marcados para validación posterior.', 'status-callout--warning'],
    MALFORMED: ['Respuesta no válida', 'No pudimos interpretar la respuesta. Intenta nuevamente.', 'status-callout--error'],
    INVALID: ['RUC inválido', data.sriReason || 'Revisa el RUC de la firma.', 'status-callout--error'],
  };
  const [title, message, className] = states[data.sriStatus] || states.PENDING;
  target.className = `status-callout ${className}`;
  target.innerHTML = `${data.sriStatus === 'LOADING' || data.sriStatus === 'PENDING' ? '<span class="status-spinner" aria-hidden="true"></span>' : '<span class="status-dot" aria-hidden="true"></span>'}<div><strong>${title}</strong><span>${message}</span></div>${['UNAVAILABLE', 'MALFORMED'].includes(data.sriStatus) ? '<button type="button" class="btn btn--text" id="retry-ruc">Reintentar</button>' : ''}`;
  target.querySelector('#retry-ruc')?.addEventListener('click', () => runLookup(body, data));
}

function paintWarnings(body, warnings = []) {
  body.querySelector('#ruc-warnings').innerHTML = warnings.map((warning) => `<div class="status-callout status-callout--warning"><strong>Revisión requerida</strong><span>${escapeHtml(warning)}</span></div>`).join('');
}

function paintRepresentative(body, representative) {
  const target = body.querySelector('#representante-block');
  if (!target) return;
  if (!representative) { target.hidden = true; target.textContent = ''; return; }
  const name = representative.nombre || representative.nombreCompleto || representative.razonSocial || 'No informado';
  target.hidden = false;
  target.innerHTML = `<span>Representante legal</span><strong>${escapeHtml(name)}</strong>`;
}

function syncFields(body, data) {
  const values = { estado: data.estadoContribuyenteRuc, razon: data.razonSocial, nombre: data.nombreComercial, regimen: data.regimen, actividad: data.actividadEconomica };
  Object.entries(values).forEach(([id, value]) => { const input = body.querySelector(`#${id}`); if (input) input.value = value || ''; });
  paintRepresentative(body, data.representanteLegal);
}

function prefillFromSignature(data) {
  const signature = data.firma;
  if (!signature) return;
  data.rucManual ||= signature.ruc || '';
  data.razonSocial ||= signature.razonSocial || signature.titular || '';
  data.representanteLegal ||= signature.repLegal || null;
  data.direccion ||= signature.datosExtra?.direccion || '';
  data.ciudad ||= signature.datosExtra?.ciudad || '';
  data.celular ||= signature.datosExtra?.celular || '';
}

export function validarPantallaDatos(data) {
  const body = document.querySelector('[data-body="datos"]');
  if ([RUC_RESULT.NOT_FOUND, RUC_RESULT.MALFORMED, RUC_RESULT.INVALID].includes(data.sriStatus)) {
    focusStatus(body); return false;
  }
  if (!data.razonSocial.trim()) return invalidate(body, 'razon', 'Completa la razón social.');
  const email = validarEmail(data.email);
  if (!email.valid) return invalidate(body, 'email', email.reason);
  data.email = email.normalizado;
  const phone = validarCelular(data.celular, data.celularPais);
  if (!phone.valid) return invalidate(body, 'celular', phone.reason);
  data.celular = phone.normalizado;
  return true;
}

function invalidate(body, id, message) {
  const input = body?.querySelector(`#${id}`);
  input?.setAttribute('aria-invalid', 'true'); input?.focus();
  let error = body?.querySelector(`#${id}-error`);
  if (error) error.textContent = message;
  return false;
}
function focusStatus(body) { body?.querySelector('#ruc-status')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

function field(id, label, value, options = {}) {
  const attrs = [options.readonly ? 'readonly' : '', options.required ? 'required' : '', options.type ? `type="${options.type}"` : 'type="text"', options.inputmode ? `inputmode="${options.inputmode}"` : '', options.autocomplete ? `autocomplete="${options.autocomplete}"` : ''].filter(Boolean).join(' ');
  return `<div class="field-group ${options.span ? 'field-group--span' : ''}"><label for="${id}">${label}${options.required ? '<span aria-hidden="true"> *</span>' : ''}</label><input id="${id}" ${attrs} value="${escapeAttr(value)}"><span class="field-error" id="${id}-error" role="alert"></span></div>`;
}
function escapeAttr(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
