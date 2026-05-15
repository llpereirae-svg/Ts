/* screen-datos.js — Pantalla 2 del wizard.
   Datos personales pre-llenados desde firma + Certificado RUC.

   Campos BLOQUEADOS (auto-fill, readonly): razón social, nombre comercial,
   provincia, ciudad. Vienen de la firma y/o del cert PDF.

   Campos EDITABLES (con auto-fill cuando hay dato): email, celular, dirección.
   Canal preferido siempre manual. */

import { COUNTRIES } from './countries.js?v=20260515a';
import { citiesFor } from './cities.js?v=20260515a';
import { validarEmail, validarCelular } from './validators.js?v=20260515a';

const PROVINCIAS = [
  'AZUAY','BOLIVAR','CANAR','CARCHI','CHIMBORAZO','COTOPAXI','EL ORO','ESMERALDAS','GALAPAGOS',
  'GUAYAS','IMBABURA','LOJA','LOS RIOS','MANABI','MORONA SANTIAGO','NAPO','ORELLANA','PASTAZA',
  'PICHINCHA','SANTA ELENA','SANTO DOMINGO','SUCUMBIOS','TUNGURAHUA','ZAMORA CHINCHIPE'
];

const PROVINCIAS_LOOKUP = (() => {
  const m = {};
  PROVINCIAS.forEach((p) => {
    m[p] = p;
    m[stripAccents(p)] = p;
  });
  m['CAÑAR'] = 'CANAR';
  m['LOS RÍOS'] = 'LOS RIOS';
  m['MANABÍ'] = 'MANABI';
  m['SUCUMBÍOS'] = 'SUCUMBIOS';
  m['GALÁPAGOS'] = 'GALAPAGOS';
  return m;
})();

function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

function normalizeProvincia(p) {
  if (!p) return '';
  const up = stripAccents(p);
  return PROVINCIAS_LOOKUP[up] || PROVINCIAS_LOOKUP[p.toUpperCase()] || '';
}

function normalizeCiudad(provincia, ciudadRaw) {
  if (!provincia || !ciudadRaw) return '';
  const list = citiesFor(provincia);
  const target = stripAccents(ciudadRaw);
  return list.find((c) => stripAccents(c) === target) || '';
}

export function renderPantallaDatos(body, wizardData) {
  preFillFromSources(wizardData);

  const paisOptions = COUNTRIES.map((c) =>
    `<option value="${c.code}" data-dial="${c.dial}" ${wizardData.celularPais === c.code ? 'selected' : ''}>${c.code} +${c.dial}</option>`
  ).join('');

  body.innerHTML = `
    <p class="datos-intro">
      Lo que extrajimos de tu firma y tu Certificado de RUC ya está pre-llenado.
      Los campos marcados con candado vienen de tus documentos. Revisa tu correo y celular y corrige si hace falta.
    </p>

    <div class="field field-locked">
      <label for="d-razon">
        Razón social / Nombre
      </label>
      <input id="d-razon" type="text" value="${escapeAttr(wizardData.razonSocial)}" readonly>
    </div>

    <div class="field field-locked">
      <label for="d-comercial">
        Nombre comercial
      </label>
      <input id="d-comercial" type="text" value="${escapeAttr(wizardData.nombreComercial || 'No aplica')}" readonly>
    </div>

    <div class="field-row">
      <div class="field field-locked">
        <label for="d-provincia">
            Provincia
        </label>
        <input id="d-provincia" type="text" value="${escapeAttr(titleCase(wizardData.provincia))}" readonly>
      </div>
      <div class="field field-locked">
        <label for="d-ciudad">
            Ciudad
        </label>
        <input id="d-ciudad" type="text" value="${escapeAttr(wizardData.ciudad)}" readonly>
      </div>
    </div>

    <div class="field">
      <label for="d-direccion">Dirección</label>
      <input id="d-direccion" type="text" autocomplete="street-address" placeholder="Av., calles, número, referencia" value="${escapeAttr(wizardData.direccion)}">
      <div id="d-direccion-error" class="error" role="alert" aria-live="polite"></div>
    </div>

    <div class="field">
      <label for="d-email">
        Correo electrónico
        ${wizardData._auto?.email ? '<span class="auto-badge">✓ Pre-llenado</span>' : ''}
      </label>
      <input id="d-email" type="email" autocomplete="email" inputmode="email" placeholder="tu@empresa.com" value="${escapeAttr(wizardData.email)}">
      <div id="d-email-error" class="error" role="alert" aria-live="polite"></div>
    </div>

    <div class="field">
      <label for="d-celular">
        Celular
        ${wizardData._auto?.celular ? '<span class="auto-badge">✓ Pre-llenado</span>' : ''}
      </label>
      <div class="field-phone">
        <select id="d-celular-pais" class="celular-pais" aria-label="País del celular">${paisOptions}</select>
        <input id="d-celular" type="tel" autocomplete="tel" inputmode="tel" placeholder="09XXXXXXXX" maxlength="20" value="${escapeAttr(wizardData.celular)}">
      </div>
      <p class="hint">Formato Ecuador: 09XXXXXXXX (10 dígitos).</p>
      <div id="d-celular-error" class="error" role="alert" aria-live="polite"></div>
    </div>

    <div class="field">
      <span class="field-label" style="font-weight:600;display:block;margin-bottom:.35rem;font-size:.92rem">¿Por dónde quieres recibir tus códigos de verificación?</span>
      <div class="canal-options canal-options--two" role="radiogroup" aria-label="Canal preferido">
        <label data-canal="email">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>
          </svg>
          <input type="radio" name="d-canal" value="email" ${wizardData.canal === 'email' ? 'checked' : ''}>
          <span>Email</span>
        </label>
        <label data-canal="whatsapp">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.5 12a8.5 8.5 0 1 1-3.6-6.93L20.5 3.5l-1.6 3.6A8.46 8.46 0 0 1 20.5 12z"/>
            <path d="M9 10.5c.5 2 2.5 4 4.5 4.5l1.5-1.5 2 1c-.4 1.3-1.7 2-3 2-3 0-6-3-6-6 0-1.3.7-2.6 2-3l1 2L9 10.5z"/>
          </svg>
          <input type="radio" name="d-canal" value="whatsapp" ${wizardData.canal === 'whatsapp' ? 'checked' : ''}>
          <span>WhatsApp</span>
        </label>
      </div>
    </div>
  `;

  wireDatosScreen(body, wizardData);
}

function preFillFromSources(wd) {
  if (!wd._auto) wd._auto = {};

  const firma = wd.firma || {};
  const cert = wd.certificadoRuc || {};
  const extra = firma.datosExtra || {};

  // Razón social / nombre: del cert (jurídica o natural) o de la firma
  if (cert.razonSocial) wd.razonSocial = cert.razonSocial;
  else if (firma.razonSocial) wd.razonSocial = firma.razonSocial;
  else if (firma.titular) wd.razonSocial = firma.titular;

  // Nombre comercial: solo del cert (si no viene, dejamos vacío → UI muestra "No aplica")
  wd.nombreComercial = cert.nombreComercial || '';
  wd.nombreComercialNA = !wd.nombreComercial;

  // Provincia y ciudad: normalizadas
  const prov = normalizeProvincia(cert.provincia || extra.ciudad || '');
  if (prov) wd.provincia = prov;
  const ciudad = normalizeCiudad(wd.provincia, cert.canton || extra.ciudad || '');
  if (ciudad) wd.ciudad = ciudad;

  // Email: del cert (editable)
  if (!wd.email && cert.email) {
    wd.email = cert.email;
    wd._auto.email = 'cert';
  }

  // Celular: de firma o cert (editable)
  if (!wd.celular) {
    if (extra.celular) {
      const limpio = String(extra.celular).replace(/\D/g, '');
      if (limpio) { wd.celular = limpio; wd._auto.celular = 'firma'; }
    } else if (cert.celular) {
      const limpio = String(cert.celular).replace(/\D/g, '');
      if (limpio) { wd.celular = limpio; wd._auto.celular = 'cert'; }
    }
  }

  if (!wd.celularPais) wd.celularPais = 'EC';
  if (!wd.canal) wd.canal = 'email';
}

function wireDatosScreen(root, wd) {
  // Razón social, nombre comercial, provincia, ciudad → readonly, no se wire-an
  // Solo wire-amos los campos editables:

  root.querySelector('#d-direccion').addEventListener('input', (e) => {
    wd.direccion = e.target.value;
  });

  root.querySelector('#d-email').addEventListener('input', (e) => {
    wd.email = e.target.value.trim();
    wd._auto.email = null;
  });

  const celSel = root.querySelector('#d-celular-pais');
  const celInput = root.querySelector('#d-celular');
  celSel.addEventListener('change', () => { wd.celularPais = celSel.value; });
  celInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^\d ]/g, '');
    wd.celular = e.target.value.replace(/\s/g, '');
    wd._auto.celular = null;
  });

  root.querySelectorAll('input[name="d-canal"]').forEach((r) => {
    r.addEventListener('change', () => {
      if (r.checked) wd.canal = r.value;
    });
  });
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/"/g, '&quot;');
}

function titleCase(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function validarPantallaDatos(wd) {
  const errors = [];
  // Los campos bloqueados ya vienen validados (de firma/cert), solo verificamos los editables
  if (!wd.direccion?.trim()) errors.push('Dirección');
  if (!wd.email?.trim() || !validarEmail(wd.email).valid) errors.push('Correo electrónico válido');
  const celValid = validarCelular(wd.celular, wd.celularPais);
  if (!wd.celular?.trim() || !celValid.valid) errors.push('Celular válido');

  // Y que los bloqueados sí estén llenos (si por algún caso raro no se llenaron)
  if (!wd.razonSocial?.trim()) errors.push('Razón social (no detectada en firma ni cert)');
  if (!wd.provincia) errors.push('Provincia (no detectada en cert)');
  if (!wd.ciudad) errors.push('Ciudad (no detectada en cert)');

  if (errors.length > 0) {
    alert('Antes de continuar, revisa:\n• ' + errors.join('\n• '));
    return false;
  }
  return true;
}
