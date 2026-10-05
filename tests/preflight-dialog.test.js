import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('aviso inicial enumera los tres requisitos y usa el contrato visual del registro', async () => {
  const source = await readFile(new URL('../assets/screens/preflight-dialog.js', import.meta.url), 'utf8');
  for (const text of ['Firma electrónica vigente', 'Autorización para facturar en el SRI', 'Logo de tu negocio', '2,970 × 300 px', 'Máximo 250 KB']) {
    assert.match(source, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /Comenzar registro/);
  assert.match(source, /lockModalScroll/);
});

test('wizard precarga el primer paso detrás del aviso y lo muestra sin flash al comenzar', async () => {
  const source = await readFile(new URL('../assets/wizard.js', import.meta.url), 'utf8');
  const preload = source.indexOf('const screensReady = Promise.all');
  const preflight = source.indexOf('await mostrarRequisitosRegistro(screensReady)');
  const session = source.indexOf('startSession()', preflight);
  const screen = source.indexOf('showScreen(0', preflight);
  assert.ok(preload >= 0 && preflight > preload && session > preflight && screen > session);
  const dialog = await readFile(new URL('../assets/screens/preflight-dialog.js', import.meta.url), 'utf8');
  assert.match(dialog, /await ready/);
});
