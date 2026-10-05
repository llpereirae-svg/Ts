import test from 'node:test';
import assert from 'node:assert/strict';
import { LABEL_REGIMEN, LABEL_TIPO, activarCapturaSriManual, mapearRegimen, mapearTipo, aplicarDatosSri, estadoSriPermiteContinuar, correoVerificado, invalidarCorreo, valorUtil } from '../assets/utils/registration-data.js';
import { normalizarRespuestaRuc, consultarRuc } from '../assets/services/ruc-service.js';
import { mensajeDestinoCorreo } from '../assets/screens/email-verification.js';
import { validarRUC } from '../assets/utils/ruc-validation.js';
import { verificarToken } from '../assets/services/token-service.js';

test('reutiliza los valores internos de los tres regímenes y cinco tipos', () => {
  assert.deepEqual(Object.keys(LABEL_REGIMEN), ['GENERAL', 'RIMPE - EMPRENDEDOR', 'RIMPE - NEGOCIO POPULAR']);
  assert.equal(Object.keys(LABEL_TIPO).length, 5);
  assert.equal(mapearRegimen('Régimen General'), 'GENERAL');
  assert.equal(mapearRegimen('RIMPE', 'NEGOCIO POPULAR'), 'RIMPE - NEGOCIO POPULAR');
  assert.equal(mapearRegimen('RIMPE - EMPRENDEDOR'), 'RIMPE - EMPRENDEDOR');
  assert.equal(mapearRegimen('DESCONOCIDO'), '');
});
test('clasificación funcional prioriza banderas y no usa PERSONA NATURAL/SOCIEDAD', () => {
  assert.equal(mapearTipo({ tipoContribuyente: 'SOCIEDAD' }), '');
  assert.equal(mapearTipo({ obligadoLlevarContabilidad: 'NO' }), 'NO_OBLIGADO');
  assert.equal(mapearTipo({ obligadoLlevarContabilidad: 'SI' }), 'OBLIGADO');
  assert.equal(mapearTipo({ obligadoLlevarContabilidad: 'SI', agenteRetencion: 'SI' }), 'AGENTE_RETENCION');
  assert.equal(mapearTipo({ agenteRetencion: true, contribuyenteEspecial: true }), 'CONTRIBUYENTE_ESPECIAL');
  assert.equal(mapearTipo({ contribuyenteEspecial: 'SI', granContribuyente: 'SI' }), 'GRAN_CONTRIBUYENTE');
});
test('bloquea todo estado no ACTIVO y toda consulta no confirmada o de otro RUC', () => {
  const base = { rucManual: 'ruc-sintetico', _sriRuc: 'ruc-sintetico', sriStatus: 'OK' };
  for (const state of ['', 'PASIVO', 'SUSPENDIDO', 'CANCELADO', 'INACTIVO']) assert.equal(estadoSriPermiteContinuar({ ...base, estadoContribuyenteRuc: state }), false);
  for (const status of ['PENDING', 'LOADING', 'UNAVAILABLE', 'NOT_FOUND', 'MALFORMED', 'INVALID']) assert.equal(estadoSriPermiteContinuar({ ...base, sriStatus: status, estadoContribuyenteRuc: 'ACTIVO' }), false);
  assert.equal(estadoSriPermiteContinuar({ ...base, estadoContribuyenteRuc: 'ACTIVO' }), true);
  assert.equal(estadoSriPermiteContinuar({ ...base, estadoContribuyenteRuc: 'ACTIVO', _sriRuc: 'otro' }), false);
});
test('fallback manual queda identificado y solo permite continuar con datos mínimos completos', () => {
  const data = { rucManual: 'ruc-sintetico', firma: { esJuridica: true }, razonSocial: '', actividadEconomica: '', regimen: '', tipoContribuyente: '', obligadoLlevarContabilidad: '' };
  activarCapturaSriManual(data, { attempts: 3, errorCode: 'SRI_UNAVAILABLE', attemptedAt: '2026-09-30T00:00:00.000Z' });
  assert.equal(data.sriSource, 'MANUAL_ENTRY');
  assert.equal(data.sriStatus, 'MANUAL_PENDING');
  assert.equal(data.sriTechnicalStatus, 'UNAVAILABLE');
  assert.equal(data.sriAttempts, 3);
  assert.equal(estadoSriPermiteContinuar(data), false);
  Object.assign(data, { razonSocial: 'EMPRESA DECLARADA', actividadEconomica: 'ACTIVIDAD DECLARADA', regimen: 'GENERAL', tipoContribuyente: 'OBLIGADO', obligadoLlevarContabilidad: 'SI', representanteLegalDeclarado: 'PERSONA DECLARADA' });
  assert.equal(estadoSriPermiteContinuar(data), true);
  data._sriRuc = 'otro';
  assert.equal(estadoSriPermiteContinuar(data), false);
});

test('respuesta posterior del SRI reemplaza la fuente manual sin conservar representante declarado', () => {
  const data = { rucManual: 'ruc-sintetico', representanteLegalDeclarado: 'PERSONA DECLARADA', sriSource: 'MANUAL_ENTRY', sriStatus: 'MANUAL_PENDING' };
  aplicarDatosSri(data, { estadoContribuyenteRuc: 'ACTIVO', razonSocial: 'OFICIAL', regimen: 'GENERAL', obligadoLlevarContabilidad: 'SI' }, data.rucManual);
  assert.equal(data.sriSource, 'SRI');
  assert.equal(data.sriTechnicalStatus, 'OK');
  assert.equal(Object.hasOwn(data, 'representanteLegalDeclarado'), false);
});
test('fechas objeto y lista se conservan; fecha de cese no invalida ACTIVO', () => {
  const dates = { fechaCese: '2020-01-01', fechaReinicioActividades: '2021-01-01' };
  for (const value of [dates, [dates]]) {
    const normalized = normalizarRespuestaRuc({ numeroRuc: 'ruc-sintetico', estadoContribuyenteRuc: 'ACTIVO', informacionFechasContribuyente: value });
    assert.deepEqual(normalized.informacionFechasContribuyente, [dates]);
    assert.equal(estadoSriPermiteContinuar({ ...normalized, rucManual: normalized.ruc, _sriRuc: normalized.ruc, sriStatus: 'OK' }), true);
  }
});
test('ausencia de nombre comercial elimina el valor previo y conserva actividad solo interna', () => {
  const data = { nombreComercial: 'Nombre anterior' };
  aplicarDatosSri(data, { nombreComercial: null, regimen: 'GENERAL', obligadoLlevarContabilidad: 'NO', actividadEconomicaPrincipal: 'Actividad de prueba' }, 'ruc-sintetico');
  assert.equal(data._nombreComercialDisponible, false);
  assert.equal(data.nombreComercial, '');
  assert.equal(data.actividadEconomica, 'Actividad de prueba');
  for (const value of [null, '', '   ', 'no aplica', 'N/A', 'null']) assert.equal(valorUtil(value), '');
});
test('representante no se copia al formulario desde firma ni SRI y limpia datos previos', () => {
  const firma = { esJuridica: true, repLegal: { nombreCompleto: 'FIRMANTE DE PRUEBA' } };
  const data = { firma, representanteLegal: { nombre: 'ANTERIOR' }, sriRepresentantesLegales: [{}] };
  aplicarDatosSri(data, { representanteLegal: { nombre: 'OTRA PERSONA' }, representantesLegales: [{ nombre: 'OTRA PERSONA' }] }, 'ruc-sintetico');
  assert.equal(Object.hasOwn(data, 'representanteLegal'), false);
  assert.equal(Object.hasOwn(data, 'sriRepresentantesLegales'), false);
  assert.equal(data.firma.repLegal.nombreCompleto, 'FIRMANTE DE PRUEBA');
});
test('verificación se vincula al correo exacto y se invalida al cambiarlo', () => {
  const data = { email: 'prueba@example.com', _verifiedEmail: 'prueba@example.com', tokenEmailOk: true };
  assert.equal(correoVerificado(data), true);
  data.email = 'otra@example.com';
  assert.equal(correoVerificado(data), false);
  invalidarCorreo(data);
  assert.equal(data.tokenEmailOk, false);
  assert.equal(data._emailCodeSent, false);
  assert.equal(data._emailToken, null);
  assert.equal(mensajeDestinoCorreo('prueba@example.com'), 'Te hemos enviado un código a prueba@example.com. Tendrá una validez de 5 minutos.');
});
test('rechaza respuesta SRI cuyo número no corresponde a la consulta', async () => {
  const ruc = Array.from({ length: 100 }, (_, n) => `010${String(n).padStart(7, '0')}001`).find(value => validarRUC(value).valid);
  assert.ok(ruc);
  const result = await consultarRuc(ruc, { fetchImpl: async () => ({ status: 200, ok: true, json: async () => ({ numeroRuc: 'otro', razonSocial: 'PRUEBA', estadoContribuyenteRuc: 'ACTIVO' }) }) });
  assert.equal(result.status, 'MALFORMED');
});
test('OTP conserva rechazo por formato, vencimiento y código incorrecto', async () => {
  const base = { canal: 'email', destino: 'prueba@example.com', tokenEsperado: '123456', expiraEn: new Date(Date.now() + 60_000) };
  assert.equal((await verificarToken({ ...base, codigo: '12345' })).error, 'FORMATO');
  assert.equal((await verificarToken({ ...base, codigo: '999999' })).error, 'INCORRECTO');
  assert.equal((await verificarToken({ ...base, codigo: '123456', expiraEn: new Date(0) })).error, 'EXPIRADO');
  assert.equal((await verificarToken({ ...base, codigo: '123456' })).valid, true);
});
