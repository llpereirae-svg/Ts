import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRegistrationMock } from '../server/registration-mock.js';
import { validarRUC } from '../assets/utils/ruc-validation.js';

const ruc = Array.from({ length: 1000 }, (_, n) => `010${String(n).padStart(7, '0')}001`).find(value => validarRUC(value).valid);
const payload = { ruc, firma: { ruc }, facturacion: { modo: 'nuevo', documentos: [{ tipo_documento: 'factura', establecimiento: '001', punto_emision: '001', secuencia: '000000001' }] } };

test('mock de alta requiere desarrollo, flag y origen local autorizado', () => {
  for (const [options, local, expected] of [
    [{ enabled: true, nodeEnv: 'development' }, true, 201],
    [{ enabled: false, nodeEnv: 'development' }, true, 503],
    [{ enabled: true, nodeEnv: 'development' }, false, 503],
    [{ enabled: true, nodeEnv: 'production' }, true, 503],
    [{ enabled: true, nodeEnv: '' }, true, 503],
  ]) assert.equal(createRegistrationMock(options)(payload, { local }).status, expected);
});

test('mock de alta valida contrato mínimo y no persiste datos', () => {
  const mock = createRegistrationMock({ enabled: true, nodeEnv: 'development' });
  assert.deepEqual(mock(payload, { local: true }), { status: 201, body: { ok: true, demo: true } });
  for (const body of [null, [], {}, { facturacion: {} }, { facturacion: { documentos: [] } }]) {
    assert.equal(mock(body, { local: true }).status, 400);
  }
});

test('mock de alta repite validación de RUC y exige coincidencia con la firma', () => {
  const mock = createRegistrationMock({ enabled: true, nodeEnv: 'development' });
  for (const body of [
    { ...payload, ruc: 123 },
    { ...payload, ruc: `${ruc} ` },
    { ...payload, ruc: "' OR 1=1 --" },
    { ...payload, firma: { ruc: `${ruc.slice(0, 12)}2` } },
  ]) assert.deepEqual(mock(body, { local: true }), { status: 400, body: { error: 'INVALID_SIGNATURE_IDENTITY' } });
});

test('frontend usa POST relativo en localhost/túnel y conserva producción real', async () => {
  const config = await readFile(new URL('../assets/services/config.js', import.meta.url), 'utf8');
  const service = await readFile(new URL('../assets/services/registration-service.js', import.meta.url), 'utf8');
  assert.match(config, /IS_DEV_TUNNEL/);
  assert.match(config, /'\/api\/registro'/);
  assert.match(config, /ENV === 'production'/);
  assert.match(service, /method: 'POST'/);
  assert.match(service, /No pudimos crear tu cuenta en este momento/);
  assert.doesNotMatch(service, /throw technicalError/);
});
