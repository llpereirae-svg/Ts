import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validarIdentidadFiscalFirma } from '../assets/parsers/firma-validator.js';
import { validarRUC } from '../assets/utils/ruc-validation.js';
import { mensajeErrorPosesion } from '../assets/screens/screen-firma.js';

const FORGE_SHA256 = 'dc67fd132427ad96c9666c844b39565413c40ddb1f2d063c53512fbf6d387dfd';

function validRuc() {
  return Array.from({ length: 1000 }, (_, n) => `010${String(n).padStart(7, '0')}001`).find(value => validarRUC(value).valid);
}

test('node-forge 1.3.1 se carga localmente con checksum conocido', async () => {
  const source = await readFile(new URL('../assets/parsers/firma-validator.js', import.meta.url), 'utf8');
  const asset = await readFile(new URL('../assets/node-forge-1.3.1.min.js', import.meta.url));
  // Git puede materializar este asset de texto con CRLF en Windows. La huella
  // publicada corresponde al contenido canónico LF y no cambia por plataforma.
  const canonicalAsset = Buffer.from(asset.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  assert.match(source, /\/assets\/node-forge-1\.3\.1\.min\.js/);
  assert.doesNotMatch(source, /cdn\.jsdelivr\.net\/npm\/node-forge/);
  assert.equal(createHash('sha256').update(canonicalAsset).digest('hex'), FORGE_SHA256);
});

test('firma identificada solo con cédula se bloquea y nunca se convierte a RUC', () => {
  const result = validarIdentidadFiscalFirma(null, { soloCedula: true });
  assert.equal(result.valid, false);
  assert.equal(result.error, 'FIRMA_SOLO_CEDULA');
  assert.match(result.reason, /firma emitida con RUC/);
});

test('la prueba de posesión distingue rate limit, sesión y backend no disponible', () => {
  assert.match(mensajeErrorPosesion({ status: 429, code: 'RATE_LIMITED', retryAfter: 600 }), /10 minutos/);
  assert.match(mensajeErrorPosesion({ status: 403, code: 'CSRF_INVALID' }), /sesión de registro expiró/);
  assert.match(mensajeErrorPosesion({ status: 503, code: 'BACKEND_CONFIG_REQUIRED' }), /servicio de verificación no está disponible/);
  assert.match(mensajeErrorPosesion({ status: 422, code: 'INVALID_SIGNATURE' }), /comprobar la firma digital/);
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

test('Paso 1 prueba posesión y entrega el PKCS#12 al draft antes de limpiar memoria', async () => {
  const source = await readFile(new URL('../assets/screens/screen-firma.js', import.meta.url), 'utf8');
  const create = source.indexOf('await crearDraft');
  const challenge = source.indexOf('await crearChallenge');
  const sign = source.indexOf('await firmarChallengeP12');
  const verify = source.indexOf('await verificarChallenge');
  const upload = source.indexOf('await subirPaqueteCertificado');
  const clear = source.indexOf('pendingFile = null', upload);
  assert.ok(create >= 0 && challenge > create && sign > challenge && verify > sign && upload > verify && clear > upload);
  assert.match(source, /data\.identityStatus = 'IDENTITY_VERIFIED'/);
  assert.doesNotMatch(source, /data\.firma = \{ \.\.\.result/);
});
