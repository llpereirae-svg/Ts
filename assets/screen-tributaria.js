/* screen-tributaria.js — Pantalla 4 del wizard.
   Régimen + Tipo de Contribuyente: pre-llenados desde el cert PDF.
   - Régimen: siempre bloqueado.
   - Tipo de Contribuyente:
       * Si cert detecta CONTRIBUYENTE_ESPECIAL → dropdown editable
         con [Contribuyente Especial, Gran Contribuyente] (el usuario
         puede upgradearse a Gran Contribuyente manualmente).
       * En cualquier otro caso: bloqueado con el valor detectado.
   - No. Resolución: aparece solo si el tipo requiere uno
     (Agente de Retención, Contribuyente Especial o Gran Contribuyente). */

import { validarNoResolucion } from './validators.js?v=20260515a';

const TIPOS_CON_RESOLUCION = new Set([
  'AGENTE_RETENCION',
  'CONTRIBUYENTE_ESPECIAL',
  'GRAN_CONTRIBUYENTE',
]);

const LABEL_TIPO = {
  NO_OBLIGADO: 'No Obligado a Llevar Contabilidad',
  OBLIGADO: 'Obligado a Llevar Contabilidad',
  AGENTE_RETENCION: 'Agente de Retención',
  CONTRIBUYENTE_ESPECIAL: 'Contribuyente Especial',
  GRAN_CONTRIBUYENTE: 'Gran Contribuyente',
};

const LABEL_REGIMEN = {
  'GENERAL': 'GENERAL',
  'RIMPE - EMPRENDEDOR': 'RIMPE - Emprendedor',
  'RIMPE - NEGOCIO POPULAR': 'RIMPE - Negocio Popular',
};

export function renderPantallaTributaria(body, wizardData) {
  preFillFromCert(wizardData);

  const tipoDetectado = wizardData._tipoDetectado || wizardData.tipoContribuyente;
  const tipo = wizardData.tipoContribuyente;
  const regimen = wizardData.regimen;
  const requiereResolucion = TIPOS_CON_RESOLUCION.has(tipo);
  const puedeElegirGran = tipoDetectado === 'CONTRIBUYENTE_ESPECIAL';

  const regimenLabel = LABEL_REGIMEN[regimen] || regimen || '—';

  body.innerHTML = `
    <p class="datos-intro">
      Pre-llenamos tu régimen y tipo de contribuyente desde el Certificado de RUC.
      ${puedeElegirGran ? 'Como detectamos que eres Contribuyente Especial, puedes confirmarlo o cambiar a Gran Contribuyente si esa es tu condición.' : ''}
      ${requiereResolucion ? ' Tu tipo requiere un <strong>No. de Resolución</strong> que necesitamos abajo.' : ''}
    </p>

    <div class="field field-locked">
      <label for="t-regimen">Régimen</label>
      <input id="t-regimen" type="text" value="${escapeAttr(regimenLabel)}" readonly>
    </div>

    ${puedeElegirGran ? `
      <div class="field">
        <label for="t-tipo-select">Tipo de Contribuyente</label>
        <select id="t-tipo-select">
          <option value="CONTRIBUYENTE_ESPECIAL" ${tipo === 'CONTRIBUYENTE_ESPECIAL' ? 'selected' : ''}>Contribuyente Especial</option>
          <option value="GRAN_CONTRIBUYENTE" ${tipo === 'GRAN_CONTRIBUYENTE' ? 'selected' : ''}>Gran Contribuyente</option>
        </select>
        <p class="hint">El cert te muestra como Contribuyente Especial. Si el SRI también te ha designado como Gran Contribuyente, selecciónalo.</p>
      </div>
    ` : `
      <div class="field field-locked">
        <label for="t-tipo">Tipo de Contribuyente</label>
        <input id="t-tipo" type="text" value="${escapeAttr(LABEL_TIPO[tipo] || tipo || '—')}" readonly>
      </div>
    `}

    ${requiereResolucion ? `
      <div class="field" id="t-resolucion-wrap">
        <label for="t-resolucion">No. de Resolución</label>
        <input id="t-resolucion" type="text" maxlength="30" autocomplete="off" placeholder="Ej: NAC-DGERCGC23-00000000001" value="${escapeAttr(wizardData.noResolucion || '')}">
        <p class="hint">Lo encuentras en la resolución del SRI que te designa como ${LABEL_TIPO[tipo] || tipo}.</p>
        <div id="t-resolucion-error" class="error" role="alert" aria-live="polite"></div>
      </div>
    ` : ''}
  `;

  wireTributaria(body, wizardData);
}

function preFillFromCert(wd) {
  const cert = wd.certificadoRuc || {};
  if (cert.regimen && !wd.regimen) wd.regimen = cert.regimen;
  if (cert.tipoContribuyente && !wd.tipoContribuyente) {
    wd.tipoContribuyente = cert.tipoContribuyente;
    // Guardamos el tipo detectado por el cert para saber si ofrecer el dropdown
    // (el usuario puede cambiar tipoContribuyente pero _tipoDetectado queda)
    wd._tipoDetectado = cert.tipoContribuyente;
  }
}

function wireTributaria(root, wd) {
  // Dropdown de tipo (solo cuando puede elegir Gran Contribuyente)
  const tipoSel = root.querySelector('#t-tipo-select');
  if (tipoSel) {
    tipoSel.addEventListener('change', () => {
      wd.tipoContribuyente = tipoSel.value;
      // Re-renderizar para mostrar/ocultar el campo de Resolución según corresponda
      renderPantallaTributaria(root, wd);
    });
  }

  // Campo de resolución con validación inline (rojo + mensaje breve)
  const resInput = root.querySelector('#t-resolucion');
  const resError = root.querySelector('#t-resolucion-error');
  if (resInput && resError) {
    const validar = () => {
      const valor = resInput.value.trim();
      wd.noResolucion = valor;
      if (!valor) {
        resInput.removeAttribute('aria-invalid');
        resError.textContent = '';
        return;
      }
      const r = validarNoResolucion(valor);
      if (r.valid) {
        resInput.removeAttribute('aria-invalid');
        resError.textContent = '';
      } else {
        resInput.setAttribute('aria-invalid', 'true');
        resError.textContent = r.reason;
      }
    };
    resInput.addEventListener('input', validar);
    resInput.addEventListener('blur', validar);
  }
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/"/g, '&quot;');
}

export function validarPantallaTributaria(wd) {
  if (!wd.regimen) {
    alert('No detectamos tu régimen en el certificado. Revisa que hayas subido el certificado correcto.');
    return false;
  }
  if (!wd.tipoContribuyente) {
    alert('No detectamos tu tipo de contribuyente en el certificado.');
    return false;
  }
  if (TIPOS_CON_RESOLUCION.has(wd.tipoContribuyente)) {
    const v = validarNoResolucion(wd.noResolucion);
    if (!v.valid) {
      alert(`Ingresa el No. de Resolución del SRI que te designa como ${LABEL_TIPO[wd.tipoContribuyente] || wd.tipoContribuyente}.`);
      return false;
    }
  }
  return true;
}
