import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { detectImageMime, drawProvisionalLogo, validateLogoFile, validateLogoMetadata, LOGO_SPEC } from '../assets/screens/post-create-logo.js';

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
test('logo provisional dibuja razón social, correo y celular con iconos vectoriales', () => {
  const painted = [];
  const context = {
    clearRect() {}, fillRect() {}, beginPath() {}, rect() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, stroke() {}, measureText: text => ({ width: text.length * 45 }),
    fillText(text) { painted.push({ text, fillStyle: this.fillStyle, font: this.font }); },
  };
  const canvas = { getContext: () => context };
  drawProvisionalLogo(canvas, 'EMPRESA & ASOCIADOS', { email: 'contacto@example.com', celular: '099 000 0000' });
  assert.equal(painted[0].text, 'EMPRESA & ASOCIADOS');
  assert.equal(painted[0].fillStyle, '#111827');
  assert.match(painted[0].font, /Roboto Condensed/);
  assert.equal(painted[1].text, 'contacto@example.com');
  assert.equal(painted[2].text, '099 000 0000');
  assert.equal(context.strokeStyle, '#0b2d6b');
  assert.equal(LOGO_SPEC.maxBytes, 250 * 1024);
});
test('logo generado se envía como archivo multipart y no como instrucción provisional', async () => {
  const source = await readFile(new URL('../assets/services/draft-service.js', import.meta.url), 'utf8');
  assert.match(source, /form\.append\('logo', selection\.file/);
  assert.match(source, /form\.append\('mode', 'upload'\)/);
  assert.match(source, /selection\.generated \? 'generated' : 'user'/);
  assert.doesNotMatch(source, /JSON\.stringify\(\{ mode: 'provisional' \}\)/);
});
test('personalización ocurre después del alta y antes de la redirección', async () => {
  const source = await readFile(new URL('../assets/wizard.js', import.meta.url), 'utf8');
  const create = source.indexOf('completarDraft(wizardData.registrationId, wizardData.idempotencyKey)');
  const personalize = source.indexOf('await mostrarPersonalizacionLogo({');
  const redirect = source.indexOf('window.setTimeout(() => window.location.assign(TRIBUTASOFT_LOGIN_URL), 1600)');
  assert.ok(create >= 0 && personalize > create && redirect > personalize);
});
test('personalización evita metadatos redundantes y conserva acciones horizontales equivalentes', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../assets/screens/post-create-logo.js', import.meta.url), 'utf8'),
    readFile(new URL('../assets/wizard.css', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /Este es un logo pregenerado/);
  assert.doesNotMatch(source, /Logo provisional · JPG/);
  assert.ok(source.indexOf('Cargar mi logo') < source.indexOf('Continuar con este logo'));
  assert.match(css, /\.post-logo-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.post-logo-actions \.btn\s*\{[^}]*box-sizing:\s*border-box[^}]*height:\s*54px[^}]*min-height:\s*54px[^}]*margin:\s*0/s);
  assert.match(css, /\.post-logo-actions \.post-logo-continue\s*\{[^}]*box-shadow:\s*none/s);
});
