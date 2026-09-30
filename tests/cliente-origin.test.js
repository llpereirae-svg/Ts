import test from 'node:test';
import assert from 'node:assert/strict';
import { isClientMockRequestAllowed, createClientLookupMock } from '../server/cliente-mock.js';
import { validarRUC } from '../assets/utils/ruc-validation.js';

const allowedOrigin = 'https://sample-8000.use.devtunnels.ms';
const config = { allowedOrigin, nodeEnv: 'development' };
const request = (host, origin, extra = {}, remoteAddress = '127.0.0.1') => ({
  headers: { host, ...(origin === undefined ? {} : { origin }), ...extra }, socket: { remoteAddress }
});
test('local hosts remain allowed', () => {
  for (const host of ['localhost:8000', '127.0.0.1:8000', '[::1]:8000']) {
    assert.equal(isClientMockRequestAllowed(request(host, `http://${host}`), config), true);
    assert.equal(isClientMockRequestAllowed(request(host), {}), false);
  }
});
test('authorized Dev Tunnel passes with rewritten Host and Origin', () => {
  assert.equal(isClientMockRequestAllowed(request('localhost:8000', 'http://localhost:8000', {
    'x-forwarded-proto': 'https', 'x-forwarded-host': 'sample-8000.use.devtunnels.ms'
  }), config), true);
});
test('different tunnel, arbitrary origin, missing origin and scheme/port differences fail', () => {
  for (const origin of ['https://other.devtunnels.ms', 'https://example.com', undefined,
    'http://sample-8000.use.devtunnels.ms', `${allowedOrigin}:8443`, `${allowedOrigin}/`, 'null']) {
    assert.equal(isClientMockRequestAllowed(request('sample-8000.use.devtunnels.ms', origin), config), false);
  }
});
test('production cannot open access even with DEV_ALLOWED_ORIGIN', () => {
  for (const [host, origin] of [['localhost:8000', 'http://localhost:8000'], ['sample-8000.use.devtunnels.ms', allowedOrigin]]) {
    assert.equal(isClientMockRequestAllowed(request(host, origin), { ...config, nodeEnv: 'production' }), false);
  }
});
test('forwarding headers permitted only with authorized origin', () => {
  const extra = { 'x-forwarded-for': '192.0.2.1', 'x-forwarded-host': 'sample-8000.use.devtunnels.ms', 'x-forwarded-proto': 'https' };
  assert.equal(isClientMockRequestAllowed(request('localhost:8000', allowedOrigin, extra), config), false);
  assert.equal(isClientMockRequestAllowed(request('localhost:8000', 'https://evil.example', extra), config), false);
  assert.equal(isClientMockRequestAllowed(request('localhost:8000', 'http://localhost:8000', extra), config), true);
});
test('untrusted peer or unrelated Host cannot borrow the allowed Origin', () => {
  assert.equal(isClientMockRequestAllowed(request('evil.example', allowedOrigin), config), false);
  assert.equal(isClientMockRequestAllowed(request('localhost:8000', allowedOrigin, {}, '192.0.2.1'), config), false);
});
test('missing, malformed or wildcard configuration fails closed', () => {
  for (const origin of ['', '*', 'https://*.devtunnels.ms', `${allowedOrigin}/path`, 'https://example.com', 'https://user@sample-8000.use.devtunnels.ms']) {
    assert.equal(isClientMockRequestAllowed(request('sample-8000.use.devtunnels.ms', allowedOrigin), { ...config, allowedOrigin: origin }), false);
  }
});

test('la política conecta con el mock: autorizado 200, rechazo 503 sin cambiar contrato', () => {
  const ruc = Array.from({ length: 10 }, (_, i) => `010000001${i}001`).find(value => validarRUC(value).valid);
  assert.ok(ruc);
  for (const [origin, nodeEnv, status] of [
    [allowedOrigin, 'development', 200],
    ['https://other.devtunnels.ms', 'development', 503],
    [allowedOrigin, 'production', 503]
  ]) {
    const mock = createClientLookupMock({ enabled: true, existingRuc: ruc, nodeEnv });
    const local = isClientMockRequestAllowed(request('localhost:8000', 'http://localhost:8000', {
      'x-forwarded-proto': 'https', 'x-forwarded-host': new URL(origin).host
    }), { allowedOrigin, nodeEnv });
    const result = mock({ ruc }, { local });
    assert.equal(result.status, status);
    if (status === 503) assert.deepEqual(result.body, { error: 'BACKEND/CONFIG_REQUIRED' });
  }
});

test('forwarding inválido o ambiguo conserva 503; localhost directo conserva 200', () => {
  const ruc = Array.from({ length: 10 }, (_, i) => `010000001${i}001`).find(value => validarRUC(value).valid);
  const extra = { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'sample-8000.use.devtunnels.ms' };
  const status = (req, options = config) => createClientLookupMock({ enabled: true, existingRuc: ruc, nodeEnv: options.nodeEnv })({ ruc }, { local: isClientMockRequestAllowed(req, options) }).status;
  assert.equal(status(request('localhost:8000', 'http://localhost:8000')), 200);
  assert.equal(status(request('localhost:8000', 'http://localhost:8000', extra)), 200);
  for (const key of Object.keys(extra)) {
    for (const value of [undefined, '', `${extra[key]}, ${extra[key]}`, [extra[key]], `${extra[key]} `, 'http', 'other.devtunnels.ms']) {
      assert.equal(status(request('localhost:8000', 'http://localhost:8000', { ...extra, [key]: value })), 503);
    }
    const req = request('localhost:8000', 'http://localhost:8000', extra);
    req.rawHeaders = Object.entries(req.headers).flat(); req.rawHeaders.push(key, extra[key]);
    assert.equal(status(req), 503);
  }
  for (const origin of [undefined, 'null', allowedOrigin, 'http://127.0.0.1:8000', 'http://localhost:8000, http://localhost:8000']) {
    assert.equal(status(request('localhost:8000', origin, extra)), 503);
  }
  for (const options of [{ ...config, nodeEnv: 'production' }, { ...config, nodeEnv: '' }, { ...config, allowedOrigin: '' }, { ...config, allowedOrigin: '*' }]) {
    assert.equal(status(request('localhost:8000', 'http://localhost:8000', extra), options), 503);
  }
  assert.equal(status(request('localhost:8000', 'http://localhost:8000', { ...extra, forwarded: 'proto=https' })), 503);
});
