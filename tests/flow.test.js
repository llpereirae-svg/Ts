import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCREENS } from '../assets/wizard.js';
import { validarEmail } from '../assets/utils/validators.js';

test('wizard conserva exactamente cinco pasos y orden de negocio', () => {
  assert.deepEqual(SCREENS.map((screen) => screen.id), ['firma', 'datos', 'token', 'facturacion', 'resumen']);
  assert.equal(new Set(SCREENS.map((screen) => screen.id)).size, 5);
});

test('validación de correo acepta formato normal y rechaza incompleto', () => {
  assert.equal(validarEmail('persona@example.com').valid, true);
  assert.equal(validarEmail('persona@').valid, false);
});

test('la aceptación de términos y privacidad permanece obligatoria', async () => {
  const source = await readFile(new URL('../assets/screens/screen-firma.js', import.meta.url), 'utf8');
  assert.match(source, /data\.terminos/);
  assert.match(source, /Política de Privacidad/);
  assert.match(source, /Debes aceptar los Términos/);
});

test('frontend consulta solo la API propia y contempla fallback seguro', async () => {
  const source = await readFile(new URL('../assets/services/ruc-service.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/ruc\//);
  assert.doesNotMatch(source, /https?:\/\//);
  assert.match(source, /UNAVAILABLE/);
  assert.match(source, /NOT_FOUND/);
});

test('CSS incluye breakpoints de teléfono y tablet, safe-area y reduced motion', async () => {
  const css = await readFile(new URL('../assets/wizard.css', import.meta.url), 'utf8');
  assert.match(css, /max-width:\s*700px/);
  assert.match(css, /max-width:\s*900px/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /prefers-reduced-motion/);
});
