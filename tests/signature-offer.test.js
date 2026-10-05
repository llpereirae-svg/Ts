import test from 'node:test';
import assert from 'node:assert/strict';
import { signatureWhatsAppUrl, signatureHelpMarkup } from '../assets/screens/signature-offer.js';
import { buildRegistrationPayload, wizardData } from '../assets/wizard.js';

test('WhatsApp no genera enlace sin una vigencia válida', () => {
  for (const value of [undefined, null, '', '3', 'toString', '__proto__']) assert.equal(signatureWhatsAppUrl(value), null);
});
test('ayuda comercial se oculta al tener archivo y no ocupa espacio ni controles accesibles', () => {
  assert.match(signatureHelpMarkup(true), /class="signature-help" hidden/);
  assert.doesNotMatch(signatureHelpMarkup(false), /class="signature-help" hidden/);
});
test('WhatsApp conserva destinatario y mensajes comerciales exactos codificados', () => {
  const expected = {
    1: 'Hola, deseo solicitar una firma electrónica por 1 año para el registro en TributaSoft.',
    2: 'Hola, deseo solicitar una firma electrónica por 2 años para el registro en TributaSoft.',
  };
  for (const [term, message] of Object.entries(expected)) {
    const url = new URL(signatureWhatsAppUrl(term));
    assert.equal(url.origin + url.pathname, 'https://wa.me/593969173466');
    assert.equal(url.searchParams.get('text'), message);
    assert.ok(url.href.includes('%C3%B1'));
  }
});
test('ayuda inline tiene dos vigencias y un único CTA, sin modal ni segundo botón', () => {
  const html = signatureHelpMarkup();
  assert.equal((html.match(/role="button"/g) || []).length, 1);
  assert.equal((html.match(/type="radio"/g) || []).length, 2);
  assert.ok(html.includes('$40.25') && html.includes('$51.75'));
  assert.ok(html.includes('Solicitar firma'));
  assert.ok(html.includes('signature-whatsapp-icon'));
  assert.ok(html.includes('¿Cómo obtener tu firma electrónica?'));
  assert.ok(!html.includes('El tutorial estará disponible próximamente.'));
  assert.ok(!html.includes('Ver precios') && !html.includes('<dialog'));
});
test('el payload no persiste representante aun si queda en estado transitorio de firma', () => {
  const previous = { ...wizardData };
  try {
    wizardData.representanteLegal = { nombre: 'NO ENVIAR' };
    wizardData.firma = { repLegal: { nombreCompleto: 'NO ENVIAR' }, titular: 'EMPRESA SINTETICA' };
    const payload = buildRegistrationPayload();
    assert.equal(Object.hasOwn(payload, 'representanteLegal'), false);
    assert.equal(Object.hasOwn(payload.firma, 'repLegal'), false);
    assert.ok(!JSON.stringify(payload).includes('NO ENVIAR'));
  } finally {
    delete wizardData.representanteLegal;
    Object.assign(wizardData, previous);
  }
});
