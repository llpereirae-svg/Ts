/* screen-tributaria.js — Pantalla 4 del wizard.
   Régimen + Tipo de Contribuyente: pre-llenados (bloqueados) desde el cert PDF.
   No. Resolución: aparece solo si el tipo de contribuyente lo requiere
   (Agente de Retención, Contribuyente Especial o Gran Contribuyente). */

import { validarNoResolucion } from './validators.js?v=20260515a';

// Tipos que requieren ingresar No. Resolución
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

  const tipo = wizardData.tipoContribuyente;
  const regimen = wizardData.regimen;
  const requiereResolucion = TIPOS_CON_RESOLUCION.has(tipo);

  const tipoLabel = LABEL_TIPO[tipo] || tipo || '—';
  const regimenLabel = LABEL_REGIMEN[regimen] || regimen || '—';

  body.innerHTML = `
    <p class="datos-intro">
      Pre-llenamos tu régimen y tipo de contribuyente desde el Certificado de RUC.
      ${requiereResolucion ? 'Tu tipo de contribuyente requiere un <strong>No. de Resolución</strong> que necesitamos que ingreses abajo.' : 'No tienes campos adicionales para completar aquí.'}
    </p>

    <div class="field field-locked">
      <label for="t-regimen">
        <span class="lock-ico" aria-hidden="true">🔒</span>
        Régimen
      </label>
      <input id="t-regimen" type="text" value="${escapeAttr(regimenLabel)}" readonly>
    </div>

    <div class="field field-locked">
      <label for="t-tipo">
        <span class="lock-ico" aria-hidden="true">🔒</span>
        Tipo de Contribuyente
      </label>
      <input id="t-tipo" type="text" value="${escapeAttr(tipoLabel)}" readonly>
    </div>

    ${requiereResolucion ? `
      <div class="field" id="t-resolucion-wrap">
        <label for="t-resolucion">No. de Resolución</label>
        <input id="t-resolucion" type="text" maxlength="30" autocomplete="off" placeholder="Ej: NAC-DGERCGC23-00000000001" value="${escapeAttr(wizardData.noResolucion || '')}">
        <p class="hint">Lo encuentras en la resolución del SRI que te designa como ${tipoLabel}.</p>
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
  }
}

function wireTributaria(root, wd) {
  const resInput = root.querySelector('#t-resolucion');
  if (resInput) {
    resInput.addEventListener('input', (e) => {
      wd.noResolucion = e.target.value.trim();
      // Limpiar error si lo había
      root.querySelector('#t-resolucion-error').textContent = '';
    });
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
    alert('No detectamos tu tipo de contribuyente en el certificado. Revisa que hayas subido el certificado correcto.');
    return false;
  }
  if (TIPOS_CON_RESOLUCION.has(wd.tipoContribuyente)) {
    const v = validarNoResolucion(wd.noResolucion);
    if (!v.valid) {
      alert('Ingresa el No. de Resolución del SRI que te designa como ' + (LABEL_TIPO[wd.tipoContribuyente] || wd.tipoContribuyente) + '.');
      return false;
    }
  }
  return true;
}
