import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validarIdentidadFiscalFirma } from '../assets/parsers/firma-validator.js';
import { validarRUC } from '../assets/utils/ruc-validation.js';

const FORGE_SHA256 = 'dc67fd132427ad96c9666c844b39565413c40ddb1f2d063c53512fbf6d387dfd';

function validRuc() {
  return Array.from({ length: 1000 }, (_, n) => `010${String(n).padStart(7, '0')}001`).find(value => validarRUC(value).valid);
}

test('node-forge 1.3.1 se carga localmente con checksum conocido', async () => {
  const source = await readFile(new URL('../assets/parsers/firma-validator.js', import.meta.url), 'utf8');
  const asset = await readFile(new URL('../assets/node-forge-1.3.1.min.js', import.meta.url));
  assert.match(source, /\/assets\/node-forge-1\.3\.1\.min\.js/);
  assert.doesNotMatch(source, /cdn\.jsdelivr\.net\/npm\/node-forge/);
  assert.equal(createHash('sha256').update(asset).digest('hex'), FORGE_SHA256);
});

test('firma identificada solo con cédula se bloquea y nunca se convierte a RUC', () => {
  const result = validarIdentidadFiscalFirma(null, { soloCedula: true });
  assert.equal(result.valid, false);
  assert.equal(result.error, 'FIRMA_SOLO_CEDULA');
  assert.match(result.reason, /firma emitida con RUC/);
});

test('identidad de firma exige RUC string estricto y dígito verificador válido', () => {
  const ruc = validRuc();
  assert.equal(validarIdentidadFiscalFirma(ruc).valid, true);
  for (const invalid of [null, 123, '1234567890', ` ${ruc}`, `${ruc} `, "' OR 1=1 --"]) {
    assert.equal(validarIdentidadFiscalFirma(invalid).valid, false);
  }
});

test('servicios RUC rechazan antes de fetch cualquier valor no-string o inválido', async () => {
  const { consultarRuc } = await import('../assets/services/ruc-service.js');
  const { createRucProxy } = await import('../server/ruc-proxy.js');
  for (const invalid of [123, null, undefined, '1234567890001', "' OR 1=1 --"]) {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; throw new Error('no debe llamarse'); };
    assert.equal((await consultarRuc(invalid, { fetchImpl })).status, 'INVALID');
    assert.equal((await createRucProxy({ upstreamUrl: 'https://sri.example/{ruc}', fetchImpl })(invalid)).status, 400);
    assert.equal(calls, 0);
  }
});
