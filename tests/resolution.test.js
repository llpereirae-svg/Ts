import test from 'node:test';
import assert from 'node:assert/strict';
import { sincronizarResolucion, aplicarDatosSri } from '../assets/utils/registration-data.js';
import { validarNoResolucion } from '../assets/utils/validators.js';
import { buildRegistrationPayload, wizardData } from '../assets/wizard.js';
import { createRegistrationMock } from '../server/registration-mock.js';
import { validarRUC } from '../assets/utils/ruc-validation.js';

const syntheticRuc = Array.from({ length: 1000 }, (_, n) => `010${String(n).padStart(7, '0')}001`).find(value => validarRUC(value).valid);

test('resolución aparece solo para agente, especial y gran; ocultar limpia el valor', () => {
  const data = {};
  for (const tipo of ['AGENTE_RETENCION', 'CONTRIBUYENTE_ESPECIAL', 'GRAN_CONTRIBUYENTE']) {
    Object.assign(data, { tipoContribuyente: tipo, noResolucion: 'NAC-12345678' });
    assert.equal(sincronizarResolucion(data), true);
    assert.equal(data.noResolucion, 'NAC-12345678');
    for (const other of ['NO_OBLIGADO', 'OBLIGADO', '']) {
      Object.assign(data, { tipoContribuyente: other, noResolucion: 'NAC-12345678' });
      assert.equal(sincronizarResolucion(data), false);
      assert.equal(data.noResolucion, '');
    }
  }
});

test('mapeo SRI agente activa resolución y nuevo mapeo no obligado limpia residuo', () => {
  const data = {};
  aplicarDatosSri(data, { agenteRetencion: 'SI', obligadoLlevarContabilidad: 'SI' }, 'sintetico');
  assert.equal(sincronizarResolucion(data), true);
  data.noResolucion = 'NAC-12345678';
  aplicarDatosSri(data, { agenteRetencion: 'NO', obligadoLlevarContabilidad: 'NO' }, 'sintetico');
  assert.equal(sincronizarResolucion(data), false);
  assert.equal(data.noResolucion, '');
});

test('conserva formato, longitudes y mensajes del validador legado', () => {
  assert.equal(validarNoResolucion('').reason, 'Ingresa el número de resolución.');
  assert.equal(validarNoResolucion('123-4567').reason, 'Debe tener al menos 8 caracteres.');
  assert.equal(validarNoResolucion('A'.repeat(31)).reason, 'Máximo 30 caracteres.');
  assert.equal(validarNoResolucion('NAC@12345678').reason, 'Solo letras, números y - . / _');
  for (const value of ['NAC-DGERCGC23-00000000001', 'No.SRI12345610-191', 'ABCD /_ 1234', 'A'.repeat(30)]) {
    assert.equal(validarNoResolucion(value).valid, true);
  }
});

test('noResolucion entra al payload y el mock repite obligatoriedad condicional', () => {
  const snapshot = structuredClone(wizardData);
  try {
    Object.assign(wizardData, {
      tipoContribuyente: 'AGENTE_RETENCION', noResolucion: 'NAC-12345678',
      rucManual: syntheticRuc, firma: { ruc: syntheticRuc },
      modoFacturacion: 'nuevo', documentosFacturacion: { factura: { establecimiento: '001', punto_emision: '001', secuencia: '000000001' } },
    });
    const payload = buildRegistrationPayload();
    assert.equal(payload.noResolucion, 'NAC-12345678');
    const mock = createRegistrationMock({ enabled: true, nodeEnv: 'development' });
    assert.equal(mock(payload, { local: true }).status, 201);
    assert.equal(mock({ ...payload, noResolucion: '' }, { local: true }).body.error, 'INVALID_RESOLUTION');
  } finally {
    for (const key of Object.keys(wizardData)) delete wizardData[key];
    Object.assign(wizardData, snapshot);
  }
});
