import test from 'node:test';
import assert from 'node:assert/strict';
import { lockModalScroll } from '../assets/utils/modal-scroll-lock.js';

function style() {
  const values = new Map();
  return {
    getPropertyValue: key => values.get(key)?.[0] || '',
    getPropertyPriority: key => values.get(key)?.[1] || '',
    setProperty: (key, value, priority = '') => values.set(key, [value, priority]),
    removeProperty: key => values.delete(key),
  };
}
function environment() {
  const events = new Map();
  const body = { style: style() };
  const html = { style: style(), clientWidth: 375 };
  body.style.setProperty('padding-right', '4px');
  html.style.setProperty('scroll-behavior', 'smooth');
  const doc = { body, documentElement: html, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  const win = { scrollX: 0, scrollY: 237, innerWidth: 390, innerHeight: 844, getComputedStyle: () => ({ paddingRight: '4px' }), scrollTo: (x, y) => { win.scrollX = x; win.scrollY = y; } };
  const dialog = { style: style(), contains: target => target === 'inside', scrollTop: 20, clientHeight: 300, scrollHeight: 500 };
  return { doc, win, dialog, events };
}
test('fija cuerpo, compensa scrollbar y restaura estilos/posición sin smooth scroll', () => {
  const env = environment();
  const release = lockModalScroll(env.dialog, env);
  assert.equal(env.doc.body.style.getPropertyValue('position'), 'fixed');
  assert.equal(env.doc.body.style.getPropertyValue('top'), '-237px');
  assert.equal(env.doc.body.style.getPropertyValue('padding-right'), '19px');
  assert.equal(env.doc.documentElement.style.getPropertyValue('scroll-behavior'), 'auto');
  env.win.scrollY = 0;
  release(); release();
  assert.equal(env.win.scrollY, 237);
  assert.equal(env.doc.body.style.getPropertyValue('position'), '');
  assert.equal(env.doc.body.style.getPropertyValue('padding-right'), '4px');
  assert.equal(env.doc.documentElement.style.getPropertyValue('scroll-behavior'), 'smooth');
  assert.equal(env.events.size, 0);
});
test('bloquea gestos de fondo y rebote, permite scroll interno y zoom', () => {
  const env = environment();
  const release = lockModalScroll(env.dialog, env);
  function move(target, y, count = 1) {
    let prevented = false;
    env.events.get('touchstart')({ touches: [{ clientY: 100 }] });
    env.events.get('touchmove')({ target, touches: Array.from({length: count}, () => ({ clientY: y })), preventDefault: () => { prevented = true; } });
    return prevented;
  }
  assert.equal(move('outside', 80), true);
  assert.equal(move('inside', 80), false);
  env.dialog.scrollTop = 200;
  assert.equal(move('inside', 80), true);
  env.dialog.scrollTop = 0;
  assert.equal(move('inside', 120), true);
  assert.equal(move('outside', 80, 2), false);
  release();
});
test('sigue el viewport visual móvil y limpia resize/scroll al cerrar', () => {
  const env = environment();
  const visualEvents = new Map();
  env.win.visualViewport = {
    height: 500, offsetTop: 24,
    addEventListener: (name, fn) => visualEvents.set(name, fn),
    removeEventListener: name => visualEvents.delete(name),
  };
  const release = lockModalScroll(env.dialog, env);
  assert.equal(env.dialog.style.getPropertyValue('--email-viewport-height'), '500px');
  assert.equal(env.dialog.style.getPropertyValue('--email-viewport-top'), '24px');
  assert.equal(env.dialog.style.getPropertyValue('--email-viewport-bottom'), '320px');
  env.win.visualViewport.height = 460;
  env.win.visualViewport.offsetTop = 10;
  visualEvents.get('resize')();
  assert.equal(env.dialog.style.getPropertyValue('--email-viewport-height'), '460px');
  assert.equal(env.dialog.style.getPropertyValue('--email-viewport-bottom'), '374px');
  assert.equal(visualEvents.has('scroll'), true);
  release();
  assert.equal(visualEvents.size, 0);
});
