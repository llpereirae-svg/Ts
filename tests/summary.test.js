import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSummarySections } from '../assets/wizard.js';

const data = () => ({
  rucManual: '9999999999001', razonSocial: 'EMPRESA EJEMPLO S.A.', nombreComercial: 'EJEMPLO',
  regimen: 'GENERAL', tipoContribuyente: 'AGENTE_RETENCION', noResolucion: '12345',
  email: 'persona@example.com', celular: '0999999999', celularPais: 'EC',
  modoFacturacion: 'continuar', codEstablecimiento: '001', codPunto: '001',
  documentosFacturacion: {
    factura: { establecimiento: '001', punto_emision: '001', secuencia: '000000027' },
    nc: { establecimiento: '001', punto_emision: '002', secuencia: '000000003' },
  },
});

test('overview compacto conserva solo información esencial y configuración inicial', () => {
  const sections = buildSummarySections(data());
  assert.deepEqual(sections.map(section => section.title), ['Contribuyente', 'Información tributaria', 'Contacto', 'Facturación inicial']);
  assert.deepEqual(sections[0].rows, [['RUC', '9999999999001'], ['Razón social', 'EMPRESA EJEMPLO S.A.'], ['Nombre comercial', 'EJEMPLO']]);
  assert.deepEqual(sections[3].rows, [['Factura', '001 - 001 - 000000027']]);
  assert.equal(sections.flatMap(section => section.rows).some(([label]) => label === 'Actividad'), false);
});

test('campos condicionales ausentes no reservan filas', () => {
  const sample = data(); delete sample.nombreComercial; sample.noResolucion = '';
  sample.documentosFacturacion = { factura: sample.documentosFacturacion.factura };
  const rows = buildSummarySections(sample).flatMap(section => section.rows.map(([label]) => label));
  assert.equal(rows.includes('Nombre comercial'), false);
  assert.equal(rows.includes('N.º de resolución'), false);
  assert.equal(rows.includes('Nota de crédito'), false);
});

test('CTA final y alta real conservan contrato y redirigen al portal configurado', async () => {
  const source = await readFile(new URL('../assets/wizard.js', import.meta.url), 'utf8');
  assert.match(source, /\? 'Crear cuenta' : 'Continuar'/);
  assert.match(source, /const registration = await completarDraft\(wizardData\.registrationId, wizardData\.idempotencyKey\)/);
  assert.match(source, /await guardarLogo\(/);
  assert.match(source, /<h2>Bienvenido a TributaSoft<\/h2>/);
  assert.match(source, /PENDING_SRI_RECONCILIATION/);
  assert.match(source, /la emisión electrónica estará bloqueada/);
  assert.match(source, /window\.setTimeout\(\(\) => window\.location\.assign\(TRIBUTASOFT_LOGIN_URL\), 1600\)/);
  assert.match(source, /export async function goBack\(\) \{ if \(currentIdx > 0\) await transitionTo\(currentIdx - 1\); \}/);
});

test('overview no usa puntos medios para separar la numeración', async () => {
  const source = await readFile(new URL('../assets/wizard.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\$\{documento\.establecimiento\} · \$\{documento\.punto_emision\} · \$\{documento\.secuencia\}/);
  assert.match(buildSummarySections(data())[3].rows[0][1], /^001 - 001 - 000000027$/);
});

test('facturación inicial muestra únicamente Factura sin controles adicionales', async () => {
  const source = await readFile(new URL('../assets/wizard.js', import.meta.url), 'utf8');
  assert.match(source, /facturacion\.documentos\.map\(documento => \[DOCUMENTOS\[documento\.tipo_documento\]/);
  assert.doesNotMatch(source, /class="wiz-summary-toggle" aria-expanded="false"/);
  assert.match(source, /Todos los derechos reservados/);
});

test('navegación móvil mantiene acciones equivalentes y el copyright cierra la pantalla', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../assets/wizard.js', import.meta.url), 'utf8'),
    readFile(new URL('../assets/wizard.css', import.meta.url), 'utf8'),
  ]);
  assert.ok(source.indexOf('id="wiz-back"') < source.indexOf('id="wiz-next"'));
  assert.ok(source.indexOf('id="wiz-nav"') < source.indexOf('class="wiz-copyright"'));
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /#wiz-back,\s*body:is\(\[data-wizard-step="datos"\], \[data-wizard-step="facturacion"\]\) #wiz-next\s*\{[^}]*width:\s*100%[^}]*min-height:\s*54px/s);
});
