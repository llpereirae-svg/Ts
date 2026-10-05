import { consultarRuc, RUC_RESULT } from '../services/ruc-service.js?v=20261005p';
import { validarEmail, validarCelular, validarNoResolucion } from '../utils/validators.js?v=20261005p';
import { LABEL_REGIMEN, LABEL_TIPO, LABEL_OBLIGADO, sincronizarResolucion, aplicarDatosSri, activarCapturaSriManual, esModoManualSri, estadoSriPermiteContinuar, correoVerificado, invalidarCorreo } from '../utils/registration-data.js?v=20261005p';
import { solicitarVerificacionCorreo } from './email-verification.js?v=20261005p';
import { confirmarDatosTributariosSri, guardarContacto, guardarDatosTributariosManuales } from '../services/draft-service.js?v=20261005p';

let sectionListeners;

export function renderPantallaDatos(body, data) {
  prefillFromSignature(data);
  body.innerHTML = `
    <div id="ruc-status" class="status-callout" role="status" aria-live="polite"><span class="status-spinner" aria-hidden="true"></span><div><strong>Consultando el SRI</strong><span>Esto puede tardar unos segundos.</span></div></div>
    <div id="ruc-warnings"></div>
    <details class="form-section datos-section" id="datos-contribuyente" open>
      <summary><h3>Datos del contribuyente</h3><span class="datos-section-summary" id="contribuyente-summary"></span></summary>
      <div class="datos-section-content">
      <div id="taxpayer-fields" class="form-grid form-grid--2">${taxpayerFields(data)}</div>
      </div>
    </details>
    <details class="form-section datos-section" id="datos-contacto">
      <summary><h3>Datos de contacto</h3><span class="datos-section-summary" id="contacto-summary"></span></summary>
      <div class="datos-section-content">
      <div class="form-grid form-grid--2">
        ${field('email', 'Correo electrónico', data.email, { required: true, type: 'email', autocomplete: 'email' })}
        ${field('celular', 'Celular', data.celular, { required: true, type: 'tel', inputmode: 'tel', autocomplete: 'tel' })}
      </div>
      </div>
    </details>`;

  wireFields(body, data, body);
  setupSections(body);
  paintSectionSummaries(body, data);
  paintStatus(body, data);
  paintWarnings(body, data.sriAdvertencias);
  if (data.sriStatus === 'PENDING' || data.sriStatus === 'LOADING') runLookup(body, data);
}

function wireFields(root, data, body) {
  const bindings = {
    razon: 'razonSocial', nombre: 'nombreComercial', regimen: 'regimen', tipo: 'tipoContribuyente',
    obligado: 'obligadoLlevarContabilidad', actividad: 'actividadEconomica', representante: 'representanteLegalDeclarado',
    email: 'email', celular: 'celular',
  };
  Object.entries(bindings).forEach(([id, key]) => {
    root.querySelector(`#${id}`)?.addEventListener(['tipo', 'regimen', 'obligado'].includes(id) ? 'change' : 'input', (event) => {
      const previous = data[key];
      data[key] = key === 'email' ? event.target.value.trim().toLowerCase() : event.target.value;
      if (key === 'email' && previous !== data.email) invalidarCorreo(data);
      event.target.removeAttribute('aria-invalid');
      body.querySelector(`#${id}-error`).textContent = '';
      if (key === 'tipoContribuyente') {
        body.querySelector('#resolucion-slot').innerHTML = resolutionField(data);
        wireResolution(body, data);
      }
      paintSectionSummaries(body, data);
    });
  });
  wireResolution(root, data);
}

function resolutionField(data) {
  if (!sincronizarResolucion(data)) return '';
  return `<div class="field-group datos-resolution"><label for="resolucion">N.º de resolución<span aria-hidden="true"> *</span></label><input id="resolucion" type="text" required maxlength="30" autocomplete="off" aria-describedby="resolucion-error" value="${escapeAttr(data.noResolucion || '')}"><span class="field-error" id="resolucion-error" role="alert"></span></div>`;
}

function wireResolution(root, data) {
  const input = root.querySelector('#resolucion');
  if (!input) return;
  const validate = () => {
    // Un blur tardío del input retirado no debe restaurar un valor ya limpiado.
    if (!input.isConnected || !sincronizarResolucion(data)) return;
    data.noResolucion = input.value.trim();
    const result = data.noResolucion ? validarNoResolucion(data.noResolucion) : { valid: true };
    if (result.valid) {
      if (result.normalizado) { data.noResolucion = result.normalizado; if (document.activeElement !== input) input.value = result.normalizado; }
      input.removeAttribute('aria-invalid');
    }
    else input.setAttribute('aria-invalid', 'true');
    root.querySelector('#resolucion-error').textContent = result.reason || '';
  };
  input.addEventListener('input', validate);
  input.addEventListener('blur', validate);
}

function taxpayerFields(data) {
  const manual = esModoManualSri(data);
  const tipoOptions = data._tipoDetectado === 'CONTRIBUYENTE_ESPECIAL'
    ? Object.fromEntries(Object.entries(LABEL_TIPO).filter(([key]) => ['CONTRIBUYENTE_ESPECIAL', 'GRAN_CONTRIBUYENTE'].includes(key))) : LABEL_TIPO;
  return `${field('ruc', 'RUC', data.rucManual, { readonly: true })}
    ${field('razon', 'Razón social', data.razonSocial, { readonly: !manual, required: manual })}
    ${(manual || data._nombreComercialDisponible) ? field('nombre', 'Nombre comercial', data.nombreComercial, { span: true }) : ''}
    ${selectField('regimen', 'Régimen tributario', data.regimen, LABEL_REGIMEN, Boolean(data._regimenDetectado))}
    ${selectField('tipo', 'Tipo de contribuyente', data.tipoContribuyente, tipoOptions, Boolean(data._tipoDetectado && data._tipoDetectado !== 'CONTRIBUYENTE_ESPECIAL'))}
    ${manual ? selectField('obligado', 'Obligado a llevar contabilidad', data.obligadoLlevarContabilidad, LABEL_OBLIGADO, false) : ''}
    ${manual ? field('actividad', 'Actividad económica principal', data.actividadEconomica, { required: true, span: true }) : ''}
    ${manual && data.firma?.esJuridica ? field('representante', 'Representante legal', data.representanteLegalDeclarado, { required: true, span: true }) : ''}
    <div id="resolucion-slot">${resolutionField(data)}</div>
    `;
}

function selectField(id, label, value, options, disabled) {
  return `<div class="field-group"><label for="${id}">${label}<span aria-hidden="true"> *</span></label><select id="${id}" required aria-describedby="${id}-error" ${disabled ? 'disabled' : ''}><option value="">Selecciona una opción</option>${Object.entries(options).map(([key, text]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${text}</option>`).join('')}</select><span class="field-error" id="${id}-error" role="alert"></span></div>`;
}

function paintSectionSummaries(body, data) {
  body.querySelector('#contribuyente-summary').textContent = [data.rucManual && `RUC ${data.rucManual}`, data.estadoContribuyenteRuc, data.regimen].filter(Boolean).join(' · ') || 'Por completar';
  body.querySelector('#contacto-summary').textContent = [data.email, data.celular].filter(Boolean).join(' · ') || 'Correo y celular por completar';
}

function setupSections(body) {
  sectionListeners?.abort();
  sectionListeners = new AbortController();
  const { signal } = sectionListeners;
  const mobile = window.matchMedia('(max-width: 820px)');
  const sections = [...body.querySelectorAll('.datos-section')];
  const mobileOpen = new Map(sections.map((section, index) => [section, index === 0]));
  const sync = () => sections.forEach((section) => {
    const fixed = section.id === 'datos-contribuyente';
    section.open = fixed || !mobile.matches || mobileOpen.get(section);
    const summary = section.querySelector('summary');
    summary.tabIndex = mobile.matches && !fixed ? 0 : -1;
    summary.setAttribute('aria-disabled', String(fixed || !mobile.matches));
  });
  sections.forEach((section) => {
    section.querySelector('summary').addEventListener('click', (event) => {
      if (!mobile.matches || section.id === 'datos-contribuyente') event.preventDefault();
    }, { signal });
    section.addEventListener('toggle', () => {
      if (mobile.matches) mobileOpen.set(section, section.open);
    }, { signal });
  });
  mobile.addEventListener('change', sync, { signal });
  sync();
}

export function precargarDatosSri(data) {
  prefillFromSignature(data);
  const requestedRuc = data.rucManual;
  if (data._sriLookupPromise && data._sriLookupRuc === requestedRuc) return data._sriLookupPromise;
  if (data._sriRuc === requestedRuc && data.sriStatus !== 'PENDING' && data.sriStatus !== 'LOADING') {
    return Promise.resolve(data.sriStatus);
  }
  data.sriStatus = 'LOADING';
  data._sriLookupRuc = requestedRuc;
  const requestId = data._rucRequestId = (data._rucRequestId || 0) + 1;
  data._sriLookupPromise = (async () => {
    const result = await consultarRuc(requestedRuc, { registrationId: data.registrationId });
    if (data.rucManual !== requestedRuc || data._rucRequestId !== requestId) return data.sriStatus;
    data.sriAttempts = result.attempts || (result.status === RUC_RESULT.OK || result.status === RUC_RESULT.NOT_FOUND ? 1 : 0);
    data.sriLastAttemptAt = new Date().toISOString();
    data.sriErrorCode = result.errorCode || '';
    data.sriStatus = result.status;
    if (result.status === RUC_RESULT.OK) {
      aplicarDatosSri(data, result.data, requestedRuc);
    } else if (result.status === RUC_RESULT.UNAVAILABLE && result.attempts >= 3 && result.errorCode === 'SRI_UNAVAILABLE') {
      activarCapturaSriManual(data, { attempts: result.attempts, errorCode: result.errorCode, attemptedAt: data.sriLastAttemptAt });
      data.sriAdvertencias = [];
    } else if (result.status === RUC_RESULT.UNAVAILABLE) {
      data.sriValidacionPendiente = true;
      data.sriAdvertencias = [];
    } else {
      data.sriValidacionPendiente = false;
    }
    data.sriReason = result.reason || '';
    return data.sriStatus;
  })().finally(() => {
    if (data._rucRequestId === requestId) data._sriLookupPromise = null;
  });
  return data._sriLookupPromise;
}

async function runLookup(body, data) {
  paintStatus(body, data);
  await precargarDatosSri(data);
  if (!body.isConnected) return;
  if ([RUC_RESULT.OK, 'MANUAL_PENDING'].includes(data.sriStatus)) syncFields(body, data);
  paintStatus(body, data);
  paintWarnings(body, data.sriAdvertencias);
}

function paintStatus(body, data) {
  const target = body.querySelector('#ruc-status');
  if (!target) return;
  target.hidden = data.sriStatus === 'OK' && estadoSriPermiteContinuar(data);
  if (target.hidden) { target.replaceChildren(); return; }
  const states = {
    PENDING: ['Consultando el SRI', 'Preparando la consulta segura…', ''],
    LOADING: ['Consultando el SRI', 'Esto puede tardar unos segundos.', ''],
    OK: ['El RUC no se encuentra activo en el SRI. No es posible continuar con el registro.', '', 'status-callout--error'],
    NOT_FOUND: ['RUC no encontrado', 'El SRI respondió 204. Verifica el RUC contenido en la firma.', 'status-callout--error'],
    UNAVAILABLE: ['No pudimos validar el estado del RUC en este momento.', '', 'status-callout--warning'],
    MANUAL_PENDING: ['SRI temporalmente no disponible', 'Completa los datos tributarios. Se guardarán como declarados por el usuario y pendientes de validación oficial.', 'status-callout--warning'],
    MALFORMED: ['No pudimos validar el estado del RUC en este momento.', '', 'status-callout--error'],
    INVALID: ['RUC inválido', data.sriReason || 'Revisa el RUC de la firma.', 'status-callout--error'],
  };
  const [title, message, className] = states[data.sriStatus] || states.PENDING;
  target.className = `status-callout ${className}`;
  target.tabIndex = -1;
  target.innerHTML = `${data.sriStatus === 'LOADING' || data.sriStatus === 'PENDING' ? '<span class="status-spinner" aria-hidden="true"></span>' : '<span class="status-dot" aria-hidden="true"></span>'}<div><strong>${escapeHtml(title)}</strong>${message ? `<span>${escapeHtml(message)}</span>` : ''}</div>${['UNAVAILABLE', 'MALFORMED', 'MANUAL_PENDING'].includes(data.sriStatus) ? '<button type="button" class="btn btn--text" id="retry-ruc">Reintentar consulta</button>' : ''}`;
  target.querySelector('#retry-ruc')?.addEventListener('click', () => runLookup(body, data));
}

function paintWarnings(body, warnings = []) {
  body.querySelector('#ruc-warnings').innerHTML = warnings.map((warning) => `<div class="status-callout status-callout--warning"><strong>Revisión requerida</strong><span>${escapeHtml(warning)}</span></div>`).join('');
}

function syncFields(body, data) {
  const fields = body.querySelector('#taxpayer-fields');
  fields.innerHTML = taxpayerFields(data);
  wireFields(fields, data, body);
  paintSectionSummaries(body, data);
}

function prefillFromSignature(data) {
  delete data.representanteLegal;
  delete data.sriRepresentantesLegales;
  const signature = data.firma;
  if (!signature) return;
  data.rucManual ||= signature.ruc || '';
  if (data.sriStatus === 'PENDING' || data._sriRuc !== data.rucManual) {
    Object.assign(data, {
      sriStatus: 'PENDING', sriSource: '', sriTechnicalStatus: '', sriAttempts: 0, sriLastAttemptAt: '', sriErrorCode: '',
      sriValidacionPendiente: false, _sriRuc: '', razonSocial: '', regimen: '', tipoContribuyente: '', obligadoLlevarContabilidad: '',
      actividadEconomica: '', representanteLegalDeclarado: '', _tipoDetectado: '', _regimenDetectado: '', nombreComercial: '',
      _nombreComercialDisponible: false, estadoContribuyenteRuc: '', sriAdvertencias: [],
    });
  }
  data.razonSocial ||= signature.razonSocial || signature.titular || '';
  data.direccion ||= signature.datosExtra?.direccion || '';
  data.ciudad ||= signature.datosExtra?.ciudad || '';
  data.celular ||= signature.datosExtra?.celular || '';
}

export async function validarPantallaDatos(data) {
  const body = document.querySelector('[data-body="datos"]');
  if (esModoManualSri(data)) {
    if (!String(data.razonSocial || '').trim()) return invalidate(body, 'razon', 'Ingresa la razón social declarada.');
    if (!Object.hasOwn(LABEL_OBLIGADO, data.obligadoLlevarContabilidad)) return invalidate(body, 'obligado', 'Selecciona una opción.');
    if (!String(data.actividadEconomica || '').trim()) return invalidate(body, 'actividad', 'Ingresa la actividad económica principal.');
    if (data.firma?.esJuridica && !String(data.representanteLegalDeclarado || '').trim()) return invalidate(body, 'representante', 'Ingresa el representante legal declarado.');
  } else if (!estadoSriPermiteContinuar(data)) {
    focusStatus(body); return false;
  }
  if (!String(data.razonSocial || '').trim()) return invalidate(body, 'razon', 'No pudimos obtener la razón social. Reintenta la consulta del RUC.');
  if (!Object.hasOwn(LABEL_REGIMEN, data.regimen)) return invalidate(body, 'regimen', 'Selecciona el régimen tributario.');
  if (!Object.hasOwn(LABEL_TIPO, data.tipoContribuyente)) return invalidate(body, 'tipo', 'Selecciona el tipo de contribuyente.');
  if (sincronizarResolucion(data)) {
    const resolution = validarNoResolucion(data.noResolucion || '');
    if (!resolution.valid) return invalidate(body, 'resolucion', resolution.reason);
    data.noResolucion = resolution.normalizado;
  }
  const email = validarEmail(data.email);
  if (!email.valid) return invalidate(body, 'email', email.reason);
  data.email = email.normalizado;
  const phone = validarCelular(data.celular, data.celularPais);
  if (!phone.valid) return invalidate(body, 'celular', phone.reason);
  data.celular = phone.normalizado;
  if (!data.registrationId) return invalidate(body, 'email', 'La sesión de registro expiró. Vuelve a validar la firma.');
  try {
    if (esModoManualSri(data)) {
      await guardarDatosTributariosManuales(data.registrationId, {
        razonSocial: data.razonSocial, nombreComercial: data.nombreComercial || null,
        regimen: data.regimen, tipoContribuyente: data.tipoContribuyente,
        obligadoLlevarContabilidad: data.obligadoLlevarContabilidad,
        actividadEconomicaPrincipal: data.actividadEconomica,
        agenteRetencion: data.tipoContribuyente === 'AGENTE_RETENCION',
        contribuyenteEspecial: data.tipoContribuyente === 'CONTRIBUYENTE_ESPECIAL',
        granContribuyente: data.tipoContribuyente === 'GRAN_CONTRIBUYENTE',
      }, data.noResolucion || '');
    } else {
      await confirmarDatosTributariosSri(data.registrationId, { noResolucion: data.noResolucion || '', nombreComercial: data.nombreComercial || '' });
    }
    await guardarContacto(data.registrationId, { email: data.email, celular: data.celular });
  } catch {
    return invalidate(body, 'email', 'No pudimos guardar los datos del registro. Intenta nuevamente.');
  }
  if (correoVerificado(data)) return true;
  const verified = await solicitarVerificacionCorreo(data, { onChangeEmail: () => {
    body.querySelector('#datos-contacto').open = true;
    body.querySelector('#email').focus({ preventScroll: true });
  } });
  return verified && estadoSriPermiteContinuar(data) && correoVerificado(data);
}

function invalidate(body, id, message) {
  const input = body?.querySelector(`#${id}`);
  const section = input?.closest('.datos-section');
  if (section) section.open = true;
  input?.setAttribute('aria-invalid', 'true'); input?.focus();
  let error = body?.querySelector(`#${id}-error`);
  if (error) error.textContent = message;
  return false;
}
function focusStatus(body) { body?.querySelector('#ruc-status')?.focus(); }

function field(id, label, value, options = {}) {
  const attrs = [options.readonly ? 'readonly' : '', options.required ? 'required' : '', options.type ? `type="${options.type}"` : 'type="text"', options.inputmode ? `inputmode="${options.inputmode}"` : '', options.autocomplete ? `autocomplete="${options.autocomplete}"` : ''].filter(Boolean).join(' ');
  return `<div class="field-group ${options.span ? 'field-group--span' : ''}"><label for="${id}">${label}${options.required ? '<span aria-hidden="true"> *</span>' : ''}</label><input id="${id}" ${attrs} aria-describedby="${id}-error" value="${escapeAttr(value)}"><span class="field-error" id="${id}-error" role="alert"></span></div>`;
}
function escapeAttr(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
