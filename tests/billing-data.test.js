import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { iniciarFacturacion, erroresFacturacion, seleccionarDocumentos, construirFacturacion, normalizarSecuencia, normalizarSecuencias } from '../assets/utils/billing-data.js';

test('Paso 3 muestra únicamente Factura sin pregunta previa ni selector de documentos', async () => {
  const source = await readFile(new URL('../assets/screens/screen-facturacion.js', import.meta.url), 'utf8');
  assert.match(source, /Valores sugeridos por TributaSoft/);
  assert.match(source, /configurar desde tu perfil otros establecimientos/);
  assert.doesNotMatch(source, /Ya has emitido comprobantes/);
  assert.doesNotMatch(source, /billing-choice/);
  assert.doesNotMatch(source, /billing-add/);
  assert.doesNotMatch(source, /Otros documentos/);
});

test('inicializa Factura con los valores sugeridos editables', () => {
  const data = {};
  iniciarFacturacion(data);
  assert.equal(data.modoFacturacion, 'nuevo');
  assert.equal(data._facturacionElegida, true);
  assert.deepEqual(data.documentosFacturacion, {
    factura: { establecimiento: '001', punto_emision: '002', secuencia: '000000001' },
  });
});

test('elimina configuraciones adicionales residuales del onboarding', () => {
  const data = { documentosFacturacion: {
    factura: { establecimiento: '007', punto_emision: '003', secuencia: '27' },
    nc: { establecimiento: '001', punto_emision: '004', secuencia: '9' },
  } };
  iniciarFacturacion(data);
  seleccionarDocumentos(data, ['nc', 'retencion']);
  assert.deepEqual(Object.keys(data.documentosFacturacion), ['factura']);
  assert.deepEqual(data.documentosFacturacion.factura, { establecimiento: '007', punto_emision: '003', secuencia: '27' });
});

test('valida los tres campos de Factura', () => {
  const data = {};
  iniciarFacturacion(data);
  assert.deepEqual(erroresFacturacion(data), {});
  data.documentosFacturacion.factura.establecimiento = '000';
  data.documentosFacturacion.factura.punto_emision = '12';
  data.documentosFacturacion.factura.secuencia = '1234567890';
  assert.deepEqual(erroresFacturacion(data), {
    'factura-establecimiento': 'No puede ser 000.',
    'factura-punto_emision': 'Debe tener 3 dígitos.',
    'factura-secuencia': 'Ingresa entre 1 y 9 dígitos.',
  });
});

test('normaliza la secuencia a nueve dígitos', () => {
  assert.equal(normalizarSecuencia('1'), '000000001');
  assert.equal(normalizarSecuencia('27'), '000000027');
  const data = {};
  iniciarFacturacion(data);
  normalizarSecuencias(data);
  assert.equal(data.documentosFacturacion.factura.secuencia, '000000001');
});

test('payload conserva Factura y crea los cinco documentos adicionales con defaults', () => {
  const data = {};
  iniciarFacturacion(data);
  data.documentosFacturacion.factura.secuencia = '1';
  assert.deepEqual(construirFacturacion(data), {
    modo: 'nuevo',
    documentos: [
      { tipo_documento: 'factura', establecimiento: '001', punto_emision: '002', secuencia: '000000001' },
      { tipo_documento: 'guia', establecimiento: '001', punto_emision: '001', secuencia: '000000001' },
      { tipo_documento: 'nc', establecimiento: '001', punto_emision: '001', secuencia: '000000001' },
      { tipo_documento: 'nd', establecimiento: '001', punto_emision: '001', secuencia: '000000001' },
      { tipo_documento: 'liquidacion', establecimiento: '001', punto_emision: '001', secuencia: '000000001' },
      { tipo_documento: 'retencion', establecimiento: '001', punto_emision: '001', secuencia: '000000001' },
    ],
  });
});

test('proyección de compatibilidad refleja solo Factura', () => {
  const data = {};
  iniciarFacturacion(data);
  assert.equal(data.codEstablecimiento, '001');
  assert.equal(data.codPunto, '002');
  assert.deepEqual(data.secuencias, { factura: '000000001' });
});

test('Paso 3 explica la secuencia con la numeración completa sugerida', async () => {
  const source = await readFile(new URL('../assets/screens/screen-facturacion.js', import.meta.url), 'utf8');
  assert.match(source, /Saber más/);
  assert.match(source, /001-002-000000001/);
  assert.match(source, /nueve dígitos/);
});
