/* screen-datos.js — Pantalla 2 del wizard.
   Datos personales auto-llenados desde firma + Certificado RUC.
   Cada campo auto-llenado muestra un badge "✓ Auto-llenado". */

import { COUNTRIES, findCountry } from './countries.js?v=20260515a';
import { citiesFor, CITIES_BY_PROVINCE } from './cities.js?v=20260515a';
import { validarEmail, validarCelular } from './validators.js?v=20260515a';

const PROVINCIAS = [
  'AZUAY','BOLIVAR','CANAR','CARCHI','CHIMBORAZO','COTOPAXI','EL ORO','ESMERALDAS','GALAPAGOS',
  'GUAYAS','IMBABURA','LOJA','LOS RIOS','MANABI','MORONA SANTIAGO','NAPO','ORELLANA','PASTAZA',
  'PICHINCHA','SANTA ELENA','SANTO DOMINGO','SUCUMBIOS','TUNGURAHUA','ZAMORA CHINCHIPE'
];

// Mapa de variantes con/sin tildes a forma normalizada (sin tildes, mayúsculas)
const PROVINCIAS_LOOKUP = (() => {
  const m = {};
  PROVINCIAS.forEach((p) => {
    m[p] = p;
    m[stripAccents(p)] = p;
  });
  // Algunas variantes comunes con tildes que vienen del PDF
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
  // Pre-poblamos wizardData con lo extraído de firma + cert (solo si está vacío)
  preFillFromSources(wizardData);

  const isAutoRazon = !!wizardData._auto?.razonSocial;
  const isAutoComercial = !!wizardData._auto?.nombreComercial;
  const isAutoDireccion = !!wizardData._auto?.direccion;
  const isAutoProvincia = !!wizardData._auto?.provincia;
  const isAutoCiudad = !!wizardData._auto?.ciudad;
  const isAutoCelular = !!wizardData._auto?.celular;

  const provinciaOptions = ['', ...PROVINCIAS].map((p) =>
    `<option value="${p}" ${wizardData.provincia === p ? 'selected' : ''}>${p ? titleCase(p) : 'Selecciona…'}</option>`
  ).join('');

  const ciudadesActuales = wizardData.provincia ? citiesFor(wizardData.provincia) : [];
  const ciudadOptions = ['', ...ciudadesActuales].map((c) =>
    `<option value="${c}" ${wizardData.ciudad === c ? 'selected' : ''}>${c || 'Selecciona…'}</option>`
  ).join('');

  const paisOptions = COUNTRIES.map((c) =>
    `<option value="${c.code}" data-dial="${c.dial}" ${wizardData.celularPais === c.code ? 'selected' : ''}>${c.code} +${c.dial}</option>`
  ).join('');

  body.innerHTML = `
    <p class="datos-intro">
      Lo que pudimos leer de tu firma y tu Certificado de RUC ya está pre-llenado.
      Revisa y corrige lo que necesites.
    </p>

    <div class="field">
      <label for="d-razon">
        Razón social
        ${isAutoRazon ? '<span class="auto-badge">✓ Auto-llenado</span>' : ''}
      </label>
      <input id="d-razon" type="text" autocomplete="organization" value="${escapeAttr(wizardData.razonSocial)}">
      <div id="d-razon-error" class="error" role="alert" aria-live="polite"></div>
    </div>

    <div class="field field-with-na">
      <label for="d-comercial">
        Nombre comercial
        ${isAutoComercial ? '<span class="auto-badge">✓ Auto-llenado</span>' : ''}
      </label>
      <input id="d-comercial" type="text" autocomplete="organization" value="${escapeAttr(wizardData.nombreComercial)}" ${wizardData.nombreComercialNA ? 'disabled' : ''}>
      <label class="na-toggle">
        <input type="checkbox" id="d-comercial-na" ${wizardData.nombreComercialNA ? 'checked' : ''}>
        No aplica
      </label>
    </div>

    <div class="field">
      <label for="d-direccion">
        Dirección
        ${isAutoDireccion ? '<span class="auto-badge">✓ Auto-llenado</span>' : ''}
      </label>
      <input id="d-direccion" type="text" autocomplete="street-address" placeholder="Av., calles, número, referencia" value="${escapeAttr(wizardData.direccion)}">
      <div id="d-direccion-error" class="error" role="alert" aria-live="polite"></div>
    </div>

    <div class="field-row">
      <div class="field">
        <label for="d-provincia">
          Provincia
          ${isAutoProvincia ? '<span class="auto-badge">✓ Auto-llenado</span>' : ''}
        </label>
        <select id="d-provincia">${provinciaOptions}</select>
        <div id="d-provincia-error" class="error" role="alert" aria-live="polite"></div>
      </div>
      <div class="field">
        <label for="d-ciudad">
          Ciudad
          ${isAutoCiudad ? '<span class="auto-badge">✓ Auto-llenado</span>' : ''}
        </label>
        <select id="d-ciudad" ${wizardData.provincia ? '' : 'disabled'}>${ciudadOptions}</select>
        <div id="d-ciudad-error" class="error" role="alert" aria-live="polite"></div>
      </div>
    </div>

    <div class="field">
      <label for="d-email">Correo electrónico</label>
      <input id="d-email" type="email" autocomplete="email" inputmode="email" placeholder="tu@empresa.com" value="${escapeAttr(wizardData.email)}">
      <div id="d-email-error" class="error" role="alert" aria-live="polite"></div>
    </div>

    <div class="field">
      <label for="d-celular">
        Celular
        ${isAutoCelular ? '<span class="auto-badge">✓ Auto-llenado</span>' : ''}
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
  // Inicializar el tracker de "qué se auto-llenó" para los badges
  if (!wd._auto) wd._auto = {};

  const firma = wd.firma || {};
  const cert = wd.certificadoRuc || {};
  const extra = firma.datosExtra || {};

  if (!wd.razonSocial) {
    if (firma.razonSocial) { wd.razonSocial = firma.razonSocial; wd._auto.razonSocial = 'firma'; }
    else if (cert.razonSocial) { wd.razonSocial = cert.razonSocial; wd._auto.razonSocial = 'cert'; }
  }
  if (!wd.nombreComercial) {
    if (cert.nombreComercial) { wd.nombreComercial = cert.nombreComercial; wd._auto.nombreComercial = 'cert'; }
  }
  if (!wd.direccion) {
    if (extra.direccion) { wd.direccion = extra.direccion; wd._auto.direccion = 'firma'; }
    else if (cert.direccion) { wd.direccion = cert.direccion; wd._auto.direccion = 'cert'; }
  }
  if (!wd.provincia) {
    const prov = normalizeProvincia(cert.provincia || extra.ciudad || '');
    if (prov) { wd.provincia = prov; wd._auto.provincia = cert.provincia ? 'cert' : 'firma'; }
  }
  if (!wd.ciudad && wd.provincia) {
    const ciudad = normalizeCiudad(wd.provincia, cert.canton || extra.ciudad || '');
    if (ciudad) { wd.ciudad = ciudad; wd._auto.ciudad = cert.canton ? 'cert' : 'firma'; }
  }
  if (!wd.celular && extra.celular) {
    // Solo dígitos
    const limpio = String(extra.celular).replace(/\D/g, '');
    if (limpio) { wd.celular = limpio; wd._auto.celular = 'firma'; }
  }
  if (!wd.celularPais) wd.celularPais = 'EC';
  if (!wd.canal) wd.canal = 'email';
}

function wireDatosScreen(root, wd) {
  root.querySelector('#d-razon').addEventListener('input', (e) => {
    wd.razonSocial = e.target.value;
    wd._auto.razonSocial = null; // si lo edita manualmente, ya no es auto
  });

  const comInput = root.querySelector('#d-comercial');
  const comNa = root.querySelector('#d-comercial-na');
  comInput.addEventListener('input', (e) => {
    wd.nombreComercial = e.target.value;
    wd._auto.nombreComercial = null;
  });
  comNa.addEventListener('change', () => {
    wd.nombreComercialNA = comNa.checked;
    if (comNa.checked) {
      wd.nombreComercial = '';
      comInput.value = '';
      comInput.disabled = true;
    } else {
      comInput.disabled = false;
    }
  });

  root.querySelector('#d-direccion').addEventListener('input', (e) => {
    wd.direccion = e.target.value;
    wd._auto.direccion = null;
  });

  const provSel = root.querySelector('#d-provincia');
  const ciudadSel = root.querySelector('#d-ciudad');
  provSel.addEventListener('change', () => {
    wd.provincia = provSel.value;
    wd._auto.provincia = null;
    // Re-poblar ciudades
    const ciudades = citiesFor(wd.provincia);
    ciudadSel.innerHTML = ['', ...ciudades].map((c) =>
      `<option value="${c}">${c || 'Selecciona…'}</option>`
    ).join('');
    ciudadSel.disabled = !wd.provincia;
    wd.ciudad = '';
  });

  ciudadSel.addEventListener('change', () => {
    wd.ciudad = ciudadSel.value;
    wd._auto.ciudad = null;
  });

  root.querySelector('#d-email').addEventListener('input', (e) => {
    wd.email = e.target.value.trim();
  });

  const celSel = root.querySelector('#d-celular-pais');
  const celInput = root.querySelector('#d-celular');
  celSel.addEventListener('change', () => {
    wd.celularPais = celSel.value;
  });
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

// Helpers
function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/"/g, '&quot;');
}

function titleCase(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

// Validador del wizard: campos requeridos para avanzar
export function validarPantallaDatos(wd) {
  const errors = [];
  if (!wd.razonSocial?.trim()) errors.push('Razón social');
  if (!wd.nombreComercialNA && !wd.nombreComercial?.trim()) errors.push('Nombre comercial (o marca "No aplica")');
  if (!wd.direccion?.trim()) errors.push('Dirección');
  if (!wd.provincia) errors.push('Provincia');
  if (!wd.ciudad) errors.push('Ciudad');
  if (!wd.email?.trim() || !validarEmail(wd.email).valid) errors.push('Correo electrónico válido');

  const celValid = validarCelular(wd.celular, wd.celularPais);
  if (!wd.celular?.trim() || !celValid.valid) errors.push('Celular válido');

  if (errors.length > 0) {
    alert('Completa estos campos antes de continuar:\n• ' + errors.join('\n• '));
    return false;
  }
  return true;
}
