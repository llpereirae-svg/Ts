import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildProvisionalLogoMarkup, detectImageMime, validateLogoFile, validateLogoMetadata, LOGO_SPEC } from '../assets/screens/post-create-logo.js';

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const jpeg = Uint8Array.from([255, 216, 255, 224, 0, 16]);
const valid = (overrides = {}) => validateLogoMetadata({ name: 'logo.png', type: 'image/png', size: 100_000, bytes: png, width: 2970, height: 300, ...overrides });

test('detecta MIME por firma binaria', () => {
  assert.equal(detectImageMime(png), 'image/png');
  assert.equal(detectImageMime(jpeg), 'image/jpeg');
  assert.equal(detectImageMime(Uint8Array.from([1, 2, 3])), '');
});
test('acepta formato exacto y tolerancia proporcional ±10%', () => {
  assert.deepEqual(valid(), { ok: true, width: 2970, height: 300, ratio: 9.9, exact: true });
  assert.equal(valid({ width: 900, height: 100 }).ok, true);
  assert.equal(valid({ width: 1080, height: 100 }).ok, true);
  assert.equal(valid({ width: 890, height: 100 }).ok, false);
  assert.equal(valid({ width: 1090, height: 100 }).ok, false);
});
test('rechaza cuadrados, tamaño, extensión, MIME declarado y firma incompatibles', () => {
  assert.equal(valid({ width: 500, height: 500 }).incompatible, true);
  assert.equal(valid({ size: LOGO_SPEC.maxBytes + 1 }).ok, false);
  assert.equal(valid({ name: 'logo.webp' }).ok, false);
  assert.equal(valid({ type: 'image/jpeg' }).ok, false);
  assert.equal(valid({ bytes: jpeg }).ok, false);
  assert.equal(valid({ width: 0 }).ok, false);
});
test('archivo JPEG/JPG válido conserva el mismo contrato', () => {
  assert.equal(valid({ name: 'logo.jpeg', type: 'image/jpeg', bytes: jpeg }).ok, true);
  assert.equal(valid({ name: 'logo.jpg', type: 'image/jpeg', bytes: jpeg }).ok, true);
});
test('rechaza el sobre antes de intentar decodificar una imagen grande', async () => {
  const previous = globalThis.createImageBitmap;
  let decodes = 0;
  globalThis.createImageBitmap = async () => { decodes += 1; return { width: 1, height: 1, close() {} }; };
  try {
    const file = {
      name: 'logo.png', type: 'image/png', size: LOGO_SPEC.maxBytes + 1,
      slice: () => ({ arrayBuffer: async () => png.buffer }),
    };
    assert.equal((await validateLogoFile(file)).ok, false);
    assert.equal(decodes, 0);
  } finally {
    if (previous === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = previous;
  }
});
test('logo provisional muestra únicamente la razón social con contenido seguro', () => {
  const markup = buildProvisionalLogoMarkup({
    razonSocial: 'Empresa & Asociados',
    email: 'contacto@ejemplo.com',
    celular: '099-999-9999',
  });
  assert.match(markup, /post-logo-provisional-name/);
  assert.match(markup, /Empresa &amp; Asociados/);
  assert.doesNotMatch(markup, /contacto@ejemplo\.com/);
  assert.doesNotMatch(markup, /099-999-9999/);
  assert.equal((markup.match(/<svg/g) || []).length, 0);
});
test('personalización ocurre después del alta y antes de la redirección', async () => {
  const source = await readFile(new URL('../assets/wizard.js', import.meta.url), 'utf8');
  const create = source.indexOf('completarDraft(wizardData.registrationId, wizardData.idempotencyKey)');
  const personalize = source.indexOf('await mostrarPersonalizacionLogo({');
  const redirect = source.indexOf('window.setTimeout(() => window.location.assign(TRIBUTASOFT_LOGIN_URL), 1600)');
  assert.ok(create >= 0 && personalize > create && redirect > personalize);
});
