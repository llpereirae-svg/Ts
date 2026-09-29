import test from 'node:test';
import assert from 'node:assert/strict';
import { validarRUC } from '../assets/utils/ruc-validation.js';
import { consultarRuc, normalizarRespuestaRuc, RUC_RESULT } from '../assets/services/ruc-service.js';
import { createRucProxy } from '../server/ruc-proxy.js';

function findValid(type) {
  const third = type === 'natural' ? '0' : type === 'publica' ? '6' : '9';
  for (let n = 0; n < 10_000_000; n += 1) {
    const firstTen = `01${third}${String(n).padStart(7, '0')}`;
    const candidate = `${firstTen}001`;
    if (validarRUC(candidate).valid) return candidate;
  }
  throw new Error(`No se pudo generar RUC sintético ${type}`);
}

const natural = findValid('natural');
const sociedad = findValid('juridica');

test('rechaza formato, ausencia de 001 y dígito verificador incorrecto', () => {
  assert.equal(validarRUC('abc').valid, false);
  assert.equal(validarRUC(`${natural.slice(0, 10)}002`).valid, false);
  const changed = `${natural.slice(0, 9)}${natural[9] === '9' ? '0' : Number(natural[9]) + 1}001`;
  assert.equal(validarRUC(changed).valid, false);
});

test('acepta fixtures sintéticos de persona natural y sociedad', () => {
  assert.equal(validarRUC(natural).type, 'natural');
  assert.equal(validarRUC(sociedad).type, 'juridica');
});

test('normaliza representante legal presente o null y conserva estado ACTIVO', () => {
  const base = { numeroRuc: sociedad, razonSocial: 'EMPRESA PRUEBA', estadoContribuyenteRuc: 'ACTIVO' };
  const sinRep = normalizarRespuestaRuc({ ...base, representantesLegales: [] });
  const conRep = normalizarRespuestaRuc({ ...base, representantesLegales: [{ nombre: 'REPRESENTANTE PRUEBA' }] });
  assert.equal(sinRep.representanteLegal, null);
  assert.equal(conRep.representanteLegal.nombre, 'REPRESENTANTE PRUEBA');
  assert.equal(sinRep.estadoContribuyenteRuc, 'ACTIVO');
});

test('fecha de cese histórica no cambia un estado ACTIVO', () => {
  const data = normalizarRespuestaRuc({
    numeroRuc: natural,
    razonSocial: 'PERSONA PRUEBA',
    estadoContribuyenteRuc: 'ACTIVO',
    informacionFechasContribuyente: [{ fechaCese: '2020-01-01', fechaReinicioActividades: '2021-01-01' }],
  });
  assert.equal(data.estadoContribuyenteRuc, 'ACTIVO');
  assert.equal(data.advertencias.length, 0);
});

test('estado PASIVO y banderas sensibles generan advertencias sin decisión irreversible', () => {
  const data = normalizarRespuestaRuc({
    numeroRuc: sociedad,
    razonSocial: 'SOCIEDAD PRUEBA',
    estadoContribuyenteRuc: 'PASIVO',
    contribuyenteFantasma: 'SI',
    transaccionesInexistente: 'SI',
  });
  assert.equal(data.estadoContribuyenteRuc, 'PASIVO');
  assert.equal(data.advertencias.length, 3);
});

test('cliente distingue 204, timeout/5xx y JSON malformado', async () => {
  const response = (status, json) => ({ status, ok: status >= 200 && status < 300, json });
  assert.equal((await consultarRuc(natural, { fetchImpl: async () => response(204) })).status, RUC_RESULT.NOT_FOUND);
  assert.equal((await consultarRuc(natural, { fetchImpl: async () => response(503) })).status, RUC_RESULT.UNAVAILABLE);
  assert.equal((await consultarRuc(natural, { fetchImpl: async () => response(200, async () => { throw new Error('bad'); }) })).status, RUC_RESULT.MALFORMED);
});

test('proxy valida RUC y preserva 204 sin body', async () => {
  const proxy = createRucProxy({
    upstreamUrl: 'https://sri.invalid/{ruc}',
    fetchImpl: async () => ({ status: 204, ok: true, text: async () => '' }),
  });
  assert.equal((await proxy('123')).status, 400);
  const result = await proxy(natural);
  assert.equal(result.status, 204);
  assert.equal(result.body, '');
});

test('proxy traduce 5xx y respuesta malformada del SRI', async () => {
  const unavailable = createRucProxy({ upstreamUrl: 'https://sri.invalid/{ruc}', fetchImpl: async () => ({ status: 500, ok: false }) });
  const malformed = createRucProxy({ upstreamUrl: 'https://sri.invalid/{ruc}', fetchImpl: async () => ({ status: 200, ok: true, text: async () => '<html>' }) });
  assert.equal((await unavailable(natural)).status, 503);
  assert.equal((await malformed(natural)).status, 502);
});
