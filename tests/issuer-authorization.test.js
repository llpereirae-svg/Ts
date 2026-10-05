import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { consultarEmisorAutorizado, IssuerAuthorizationError } from '../server/emisor-autorizado.js';
import { resolveIssuerAuthorizationMock } from '../server/emisor-autorizado-mock.js';
import { crearGateAutorizacionEmisor } from '../assets/utils/issuer-authorization-gate.js';
import { ISSUER_AUTHORIZATION_STATE } from '../assets/services/issuer-authorization-service.js';
import { validarRUC } from '../assets/utils/ruc-validation.js';

const ruc = Array.from({ length: 1000 }, (_, n) => `010${String(n).padStart(7, '0')}001`).find(value => validarRUC(value).valid);
const openHtml = '<input name="javax.faces.ViewState" value="state&amp;1"><input id="frmPrincipal:txtRuc"><button id="frmPrincipal:btnConsultar"></button>';
const xml = panel => `<partial-response><changes><update id="frmPrincipal:pnlDatosEmisor"><![CDATA[<table id="frmPrincipal:tblComprobantesAutorizados">${panel}</table>]]></update><update id="formMessages:messages"><![CDATA[]]></update></changes></partial-response>`;
const response = (body, status = 200, headers = {}) => new Response(body, { status, headers });

test('consulta backend distingue autorizado, no autorizado y conserva la sesión JSF', async () => {
  const calls = [];
  const fetchImpl = async (_url, options = {}) => {
    calls.push(options);
    if (calls.length === 1) return response(openHtml, 200, { 'Set-Cookie': 'JSESSIONID=test; Path=/; HttpOnly' });
    return response(xml(`<tr data-ri="0"><td>1</td><td>${ruc}</td><td>EMPRESA DEMO</td><td>N/A</td><td>01/01/2026</td><td>GUAYAS</td><td>N/A</td></tr>`));
  };
  const authorized = await consultarEmisorAutorizado(ruc, { fetchImpl, now: () => new Date('2026-10-04T12:00:00Z') });
  assert.equal(authorized.authorized, true);
  assert.equal(authorized.ruc, ruc);
  assert.equal(authorized.businessName, 'EMPRESA DEMO');
  assert.equal(authorized.tradeName, null);
  assert.match(calls[1].headers.Cookie, /JSESSIONID=test/);
  assert.match(calls[1].body, new RegExp(`frmPrincipal%3AtxtRuc=${ruc}`));

  let count = 0;
  const empty = await consultarEmisorAutorizado(ruc, { fetchImpl: async () => (++count === 1 ? response(openHtml) : response(xml('<tr class="ui-datatable-empty-message"><td>No se encontraron resultados</td></tr>'))) });
  assert.equal(empty.authorized, false);
});

test('errores del portal nunca se convierten en no autorizado', async () => {
  await assert.rejects(() => consultarEmisorAutorizado('123'), error => error instanceof IssuerAuthorizationError && error.code === 'INVALID_RUC');
  await assert.rejects(() => consultarEmisorAutorizado(ruc, { fetchImpl: async () => response('Request Rejected') }), error => error.code === 'SRI_ISSUER_REJECTED');
  await assert.rejects(() => consultarEmisorAutorizado(ruc, { fetchImpl: async () => response('<script src="recaptcha/api.js"></script>') }), error => error.code === 'SRI_ISSUER_CAPTCHA');
  await assert.rejects(() => consultarEmisorAutorizado(ruc, { fetchImpl: async () => { throw new Error('offline'); } }), error => error.code === 'SRI_ISSUER_UNAVAILABLE');
});

test('gate permite avanzar solo con autorización positiva y deduplica el resultado', async () => {
  let calls = 0;
  const gate = crearGateAutorizacionEmisor(async () => { calls += 1; return { status: ISSUER_AUTHORIZATION_STATE.AUTHORIZED }; });
  const data = { registrationId: 'draft-demo', firma: { valid: true } };
  assert.equal((await gate.verificar(data)).status, ISSUER_AUTHORIZATION_STATE.AUTHORIZED);
  assert.equal((await gate.verificar(data)).status, ISSUER_AUTHORIZATION_STATE.AUTHORIZED);
  assert.equal(calls, 1);
  assert.equal(gate.permite(data), true);

  let deniedCalls = 0;
  const denied = crearGateAutorizacionEmisor(async () => { deniedCalls += 1; return { status: ISSUER_AUTHORIZATION_STATE.NOT_AUTHORIZED }; });
  const deniedData = { registrationId: 'draft-2', firma: { valid: true } };
  assert.equal((await denied.verificar(deniedData)).status, ISSUER_AUTHORIZATION_STATE.NOT_AUTHORIZED);
  assert.equal((await denied.verificar(deniedData)).status, ISSUER_AUTHORIZATION_STATE.NOT_AUTHORIZED);
  assert.equal(deniedCalls, 2);
});

test('estado no autorizado ofrece recuperación guiada y código contractual', async () => {
  const source = await readFile(new URL('../assets/screens/screen-emisor-autorizado.js', import.meta.url), 'utf8');
  assert.match(source, /ISSUER_AUTHORIZATION_REQUIRED/);
  assert.match(source, /Falta solicitar la autorización del SRI para facturar/);
  assert.match(source, /¿Cómo obtener la autorización\?/);
  assert.match(source, /Ya la obtuve, verificar/);
  assert.doesNotMatch(source, /SRI_AUTHORIZATION_TUTORIAL_URL|href=|target="_blank"/);
  assert.match(source, /<button type="button" class="issuer-tutorial guided-help-link"/);
  assert.ok(source.indexOf('cliente-back') < source.indexOf('cliente-primary'));
});

test('mock por RUC rechaza solo el caso configurado y autoriza las demás firmas', () => {
  const otherRuc = Array.from({ length: 1000 }, (_, n) => `020${String(n).padStart(7, '0')}001`).find(value => validarRUC(value).valid);
  const options = { mode: 'by_ruc', notAuthorizedRuc: ruc, now: () => new Date('2026-10-05T12:00:00Z') };
  assert.equal(resolveIssuerAuthorizationMock(ruc, options).authorized, false);
  assert.equal(resolveIssuerAuthorizationMock(otherRuc, options).authorized, true);
  assert.equal(resolveIssuerAuthorizationMock(otherRuc, { ...options, notAuthorizedRuc: '' }), null);
});
