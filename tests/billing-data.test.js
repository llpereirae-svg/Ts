import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { iniciarFacturacion, elegirFacturacion, erroresFacturacion, seleccionarDocumentos, construirFacturacion, sincronizarCompatibilidad, normalizarSecuencia, normalizarSecuencias, TIPOS_DOCUMENTO } from '../assets/utils/billing-data.js';
import { buildRegistrationPayload, wizardData } from '../assets/wizard.js';

test('documentos comparten grupo de acordeón exclusivo nativo', async () => {
  const source = await readFile(new URL('../assets/screens/screen-facturacion.js', import.meta.url), 'utf8');
  assert.match(source, /<details name="billing-document" class="form-section datos-section billing-document"/);
  assert.match(source, /class="sequence-info-button"/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /!event\.target\.closest\('\.field-label-row'\)/);
  assert.doesNotMatch(source, /Esta será la numeración inicial/);
  assert.match(source, /continuing \? '<button[^']+billing-add/);
  assert.match(source, /const expanded = continuing[\s\S]*?: new Set\(\);/);
  assert.match(source, /if \(continuing && !root\.children\.length\) expanded\.add\('factura'\);/);
});

test('requiere elección explícita; migración no selecciona documentos antiguos automáticos', () => {
  const data = { modoFacturacion: 'nuevo', secuencias: { factura: '000000027', nc: '000000001' } };
  iniciarFacturacion(data);
  assert.ok(erroresFacturacion(data).modo);
  assert.deepEqual(Object.keys(data.documentosFacturacion), ['factura']);
  assert.equal(data.documentosFacturacion.factura.secuencia, '000000027');
});
test('nuevo muestra Factura pero inicializa los seis documentos del contrato', () => {
  const data = {};
  elegirFacturacion(data, 'nuevo');
  const result = construirFacturacion(data);
  assert.deepEqual(Object.keys(data.documentosFacturacion), ['factura']);
  assert.deepEqual(result.documentos.map(doc => doc.tipo_documento), TIPOS_DOCUMENTO);
  for (const doc of result.documentos) {
    assert.deepEqual(doc, { tipo_documento: doc.tipo_documento, establecimiento: '001', punto_emision: '001', secuencia: '000000001' });
  }
});
for (const tipos of [[], ['nc'], ['retencion'], ['guia', 'nc', 'nd', 'liquidacion', 'retencion']]) {
  test(`continuar: factura obligatoria más ${tipos.join(',') || 'ningún adicional'}`, () => {
    const data = {};
    elegirFacturacion(data, 'continuar');
    seleccionarDocumentos(data, tipos);
    const result = construirFacturacion(data);
    assert.deepEqual(erroresFacturacion(data), {});
    assert.equal(result.documentos.length, tipos.length + 1);
    assert.equal(result.documentos[0].tipo_documento, 'factura');
  });
}
test('códigos independientes, sin punto 002 ni incremento de secuencia', () => {
  const data = { codEstablecimiento: '003', codPunto: '017', secuencias: { factura: '000000027' } };
  elegirFacturacion(data, 'continuar');
  seleccionarDocumentos(data, ['nc']);
  Object.assign(data.documentosFacturacion.nc, { establecimiento: '009', punto_emision: '004', secuencia: '000000013' });
  const payload = construirFacturacion(data);
  assert.deepEqual(payload.documentos, [
    { tipo_documento: 'factura', establecimiento: '003', punto_emision: '017', secuencia: '000000027' },
    { tipo_documento: 'nc', establecimiento: '009', punto_emision: '004', secuencia: '000000013' }
  ]);
});
test('códigos de tres dígitos y secuencia natural de 1 a 9 dígitos', () => {
  for (const modo of ['nuevo', 'continuar']) for (const tipo of TIPOS_DOCUMENTO) {
    const data = {};
    elegirFacturacion(data, modo); seleccionarDocumentos(data, [tipo]);
    const doc = data.documentosFacturacion[tipo];
    for (const key of ['establecimiento', 'punto_emision']) {
      for (const value of ['', '1', '01', '000', '1000', '00A', ' 01']) {
        doc[key] = value;
        assert.ok(erroresFacturacion(data)[`${tipo}-${key}`]);
      }
      doc[key] = '999';
    }
    for (const value of ['', '0000000027', '00000002A', '-00000027', '000000 27']) {
      doc.secuencia = value;
      assert.equal(erroresFacturacion(data)[`${tipo}-secuencia`], 'Ingresa entre 1 y 9 dígitos.');
      assert.equal(doc.secuencia, value);
    }
    for (const value of ['1', '27', '000000000', '000000027', '999999999']) {
      doc.secuencia = value;
      assert.deepEqual(erroresFacturacion(data), {});
    }
  }
});
test('normaliza secuencias al perder foco o preparar el payload', () => {
  assert.equal(normalizarSecuencia('1'), '000000001');
  assert.equal(normalizarSecuencia('27'), '000000027');
  assert.equal(normalizarSecuencia('123456789'), '123456789');
  for (const invalid of ['', '1234567890', '12A', '1-2', '-1', ' 1']) assert.equal(normalizarSecuencia(invalid), invalid);
  const data = {};
  elegirFacturacion(data, 'continuar');
  data.documentosFacturacion.factura.secuencia = '27';
  normalizarSecuencias(data);
  assert.equal(data.documentosFacturacion.factura.secuencia, '000000027');
  data.documentosFacturacion.factura.secuencia = '1';
  assert.equal(construirFacturacion(data).documentos[0].secuencia, '000000001');
});
test('quitar documento limpia estado, proyección antigua, borrador y envío; reañadir usa defaults', () => {
  const data = {};
  elegirFacturacion(data, 'continuar'); seleccionarDocumentos(data, ['nc']);
  data.documentosFacturacion.nc.secuencia = '000000055';
  elegirFacturacion(data, 'nuevo');
  seleccionarDocumentos(data, []);
  elegirFacturacion(data, 'continuar');
  assert.deepEqual(Object.keys(data.documentosFacturacion), ['factura']);
  assert.equal(data.secuencias.nc, undefined);
  assert.equal(construirFacturacion(data).documentos.length, 1);
  seleccionarDocumentos(data, ['nc']);
  assert.equal(data.documentosFacturacion.nc.secuencia, '000000001');
});
test('cambio de ruta recupera códigos del borrador sin compartir objetos', () => {
  const data = {};
  elegirFacturacion(data, 'continuar');
  Object.assign(data.documentosFacturacion.factura, { establecimiento: '007', punto_emision: '015', secuencia: '000000027' });
  elegirFacturacion(data, 'nuevo');
  assert.equal(data.codPunto, '001');
  elegirFacturacion(data, 'continuar');
  assert.equal(data.codEstablecimiento, '007'); assert.equal(data.codPunto, '015');
  assert.equal(data.secuencias.factura, '000000027');
});
test('Factura no puede eliminarse y la selección no duplica documentos', () => {
  const data = {};
  elegirFacturacion(data, 'nuevo');
  seleccionarDocumentos(data, ['nc', 'nc', 'factura']);
  assert.equal(construirFacturacion(data).documentos.length, TIPOS_DOCUMENTO.length);
  seleccionarDocumentos(data, []);
  assert.deepEqual(construirFacturacion(data).documentos.map(doc => doc.tipo_documento), TIPOS_DOCUMENTO);
});
test('campos vacíos se conservan y errores opcionales desaparecen al desmarcar', () => {
  const data = {};
  elegirFacturacion(data, 'continuar'); seleccionarDocumentos(data, ['retencion']);
  data.documentosFacturacion.retencion.secuencia = '';
  iniciarFacturacion(data);
  assert.equal(data.documentosFacturacion.retencion.secuencia, '');
  assert.ok(erroresFacturacion(data)['retencion-secuencia']);
  seleccionarDocumentos(data, []);
  assert.deepEqual(erroresFacturacion(data), {});
});
test('cambiar de ruta limpia adicionales en ambas direcciones y en el envío', () => {
  const data = {};
  elegirFacturacion(data, 'continuar'); elegirFacturacion(data, 'nuevo');
  seleccionarDocumentos(data, ['guia']);
  data.documentosFacturacion.guia.punto_emision = '007';
  assert.deepEqual(construirFacturacion(data).documentos.map(doc => doc.tipo_documento), TIPOS_DOCUMENTO);
  elegirFacturacion(data, 'continuar');
  assert.equal(data.documentosFacturacion.guia, undefined);
  assert.deepEqual(construirFacturacion(data).documentos.map(doc => doc.tipo_documento), ['factura']);
  seleccionarDocumentos(data, ['nc', 'nd', 'guia']);
  elegirFacturacion(data, 'nuevo');
  assert.deepEqual(Object.keys(data.documentosFacturacion), ['factura']);
  assert.deepEqual(Object.keys(data.secuencias), ['factura']);
  assert.deepEqual(Object.keys(data._facturacionBorradorContinuar), ['factura']);
  elegirFacturacion(data, 'continuar');
  assert.deepEqual(construirFacturacion(data).documentos.map(doc => doc.tipo_documento), ['factura']);
});
test('adaptador interno refleja Factura y secuencias seleccionadas, no pierde códigos por documento', () => {
  const data = {};
  elegirFacturacion(data, 'continuar'); seleccionarDocumentos(data, ['liquidacion']);
  data.documentosFacturacion.factura.punto_emision = '013';
  data.documentosFacturacion.liquidacion.punto_emision = '025';
  sincronizarCompatibilidad(data);
  assert.equal(data.codPunto, '013');
  assert.deepEqual(data.secuencias, { factura: '000000001', liquidacion: '000000001' });
  assert.equal(data.documentosFacturacion.liquidacion.punto_emision, '025');
});
test('envío real usa solo contrato por documento y omite claves antiguas/tipos ajenos', () => {
  const saved = structuredClone(wizardData);
  try {
    delete wizardData.documentosFacturacion;
    elegirFacturacion(wizardData, 'continuar'); seleccionarDocumentos(wizardData, ['liquidacion', 'desconocido']);
    const result = buildRegistrationPayload().facturacion;
    assert.deepEqual(Object.keys(result), ['modo', 'documentos']);
    assert.deepEqual(result.documentos.map(doc => doc.tipo_documento), ['factura', 'liquidacion']);
  } finally { for (const key of Object.keys(wizardData)) delete wizardData[key]; Object.assign(wizardData, saved); }
});
