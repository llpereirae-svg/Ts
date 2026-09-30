import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { consultarCliente, normalizarCliente, resolverLoginUrl, CLIENTE_ERROR } from '../assets/services/cliente-service.js';
import { TRIBUTASOFT_LOGIN_URL } from '../assets/services/portal-config.js';
import { crearGateCliente } from '../assets/utils/cliente-gate.js';
import { createClientLookupMock } from '../server/cliente-mock.js';
import { validarRUC } from '../assets/utils/ruc-validation.js';

// Generados para pruebas: no provienen de respuestas SRI ni de clientes.
const rucs = Array.from({ length: 1000 }, (_, n) => `010${String(n).padStart(7, '0')}001`).filter(ruc => validarRUC(ruc).valid);
const data = () => ({ firma: { valid: true, ruc: rucs[0] }, rucManual: rucs[0], terminos: true });
test('adapter POST envía solo RUC, sin persistir ni datos de firma', async () => {
  let request;
  const result = await consultarCliente(rucs[0], { fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, status: 200, json: async () => ({ esCliente: false }) }; } });
  assert.equal(result.status, 'NEW_CLIENT');
  assert.equal(request.url, '/api/registro/verificar-cliente');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.cache, 'no-store');
  assert.deepEqual(JSON.parse(request.options.body), { ruc: rucs[0] });
});
test('RUC inválido no realiza petición', async () => {
  for (const invalid of ['123', ` ${rucs[0]}`, `${rucs[0]} `, "' OR 1=1 --", `${rucs[0].slice(0, 12)}X`]) {
    let calls = 0;
    const result = await consultarCliente(invalid, { fetchImpl: () => { calls++; throw new Error('no llamar'); } });
    assert.equal(result.status, 'ERROR');
    assert.equal(calls, 0);
  }
});
test('API caída, HTTP, 204, JSON malformado y timeout fallan cerrado sin detalles', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('SQL credential endpoint private'); },
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: true, status: 204, json: () => { assert.fail('204 no tiene JSON'); } }),
    async () => ({ ok: true, status: 200, json: async () => { throw new Error('stack'); } }),
    (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout'))))
  ]) assert.deepEqual(await consultarCliente(rucs[0], { fetchImpl, timeoutMs: 5 }), { status: 'ERROR', message: CLIENTE_ERROR });
});
test('esquema boolean estricto; respuestas inesperadas no pasan', () => {
  for (const raw of [null, [], {}, { esCliente: 'false' }, { esCliente: 0 }, { esCliente: true, estado: {} }, { esCliente: true, redirectUrl: 5 }]) assert.equal(normalizarCliente(raw).status, 'ERROR');
});
test('login existente reutilizado; faltante usa configuración y sin configuración no inventa URL', () => {
  assert.equal(normalizarCliente({ esCliente: true, redirectUrl: TRIBUTASOFT_LOGIN_URL }).loginUrl, TRIBUTASOFT_LOGIN_URL);
  assert.equal(normalizarCliente({ esCliente: true }).loginUrl, TRIBUTASOFT_LOGIN_URL);
  assert.deepEqual(normalizarCliente({ esCliente: true }, ''), { status: 'EXISTING_CLIENT', loginUrl: '', configRequired: true });
  for (const url of ['javascript:alert(1)', 'https://evil.example/login', 'https://tbc.tributasoft.ec/redirect']) assert.equal(resolverLoginUrl(url), '');
});
test('mock exclusivo local requiere flag y RUC configurado; producción no lo activa', () => {
  const mock = createClientLookupMock({ enabled: true, existingRuc: rucs[0], nodeEnv: 'development' });
  assert.equal(mock({ ruc: rucs[0] }, { local: true }).body.esCliente, true);
  assert.equal(mock({ ruc: rucs[1] }, { local: true }).body.esCliente, false);
  assert.equal(mock({ ruc: rucs[0] }).status, 503);
  assert.equal(createClientLookupMock({ enabled: true, existingRuc: rucs[0] })({ ruc: rucs[0] }, { local: true }).status, 503);
  assert.equal(createClientLookupMock({ enabled: true, existingRuc: rucs[0], nodeEnv: 'production' })({ ruc: rucs[0] }, { local: true }).status, 503);
  assert.equal(createClientLookupMock()({ ruc: rucs[0] }, { local: true }).status, 503);
});
test('cliente nuevo permite Datos; cliente existente/error impide Datos y SRI', async () => {
  for (const status of ['NEW_CLIENT', 'EXISTING_CLIENT', 'ERROR']) {
    const gate = crearGateCliente(async () => ({ status })); const d = data(); const states = [];
    await gate.verificar(d, result => states.push(result.status));
    assert.deepEqual(states, ['CHECKING', status]);
    assert.equal(gate.permite(d), status === 'NEW_CLIENT');
  }
});
test('una consulta por firma, llamadas simultáneas deduplicadas y error reintentable', async () => {
  let calls = 0;
  const gate = crearGateCliente(async () => { calls++; return { status: calls === 1 ? 'ERROR' : 'NEW_CLIENT' }; });
  const d = data();
  await Promise.all([gate.verificar(d), gate.verificar(d)]);
  assert.equal(calls, 1);
  await gate.verificar(d); await gate.verificar(d);
  assert.equal(calls, 2);
  d.firma = { ...d.firma };
  await gate.verificar(d); assert.equal(calls, 3);
});
test('cambio de firma invalida respuestas tardías', async () => {
  let resolve;
  const gate = crearGateCliente(() => new Promise(done => { resolve = done; }));
  const d = data(); const pending = gate.verificar(d);
  d.firma = { valid: true, ruc: rucs[1] }; d.rucManual = rucs[1];
  resolve({ status: 'NEW_CLIENT' });
  assert.equal((await pending).status, 'IDLE'); assert.equal(gate.permite(d), false);
});
test('excepción síncrona del adaptador permite reintentar sin quedar bloqueado', async () => {
  let calls = 0;
  const gate = crearGateCliente(() => { calls++; if (calls === 1) throw new Error('interno'); return { status: 'NEW_CLIENT' }; });
  const d = data();
  assert.equal((await gate.verificar(d)).status, 'ERROR');
  assert.equal((await gate.verificar(d)).status, 'NEW_CLIENT');
  assert.equal(calls, 2);
});
test('firma inválida o sin términos no llama al endpoint', async () => {
  for (const override of [{ firma: null }, { terminos: false }, { rucManual: rucs[1] }]) {
    const gate = crearGateCliente(() => assert.fail('no consultar'));
    assert.equal((await gate.verificar({ ...data(), ...override })).status, 'IDLE');
  }
});
test('navegación comprueba gate antes de renderizar y no prepara Datos al registrar renderer', async () => {
  const source = await readFile(new URL('../assets/wizard.js', import.meta.url), 'utf8');
  assert.match(source, /body && SCREENS\[currentIdx\]\.id === id/);
  assert.match(source, /if \(index > 0 && !clienteGate\.permite\(wizardData\)\)/);
  assert.ok(source.indexOf('clienteGate.verificar') < source.indexOf('await transitionTo(currentIdx + 1)'));
});
