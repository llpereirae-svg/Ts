import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CERTIFICATE_CUSTODY_POLICY, CERTIFICATE_TRUST_POLICY, DRAFT_STATUS, ERROR_HTTP_STATUS,
  LEGAL_DOCUMENT_HASHES, LOGO_CONTRACT, RATE_LIMIT_POLICY, RECONCILIATION_OUTCOME,
  REGISTRATION_ERROR, SESSION_POLICY, TAX_DATA_SOURCE,
} from '../assets/services/registration-contract.js';
import { validarFirmaArchivo } from '../assets/utils/validators.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('sesión/CSRF y state machine tienen contrato ejecutable', async () => {
  const [service, client, ruc, server, handoff] = await Promise.all([
    read('assets/services/draft-service.js'), read('assets/services/cliente-service.js'),
    read('assets/services/ruc-service.js'), read('server/dev-server.js'), read('docs/V2-BACKEND-HANDOFF.md'),
  ]);
  assert.equal(SESSION_POLICY.cookie, 'HttpOnly; Secure; SameSite=Lax; Path=/');
  assert.match(service, /X-CSRF-Token|csrfHeader/);
  assert.match(client, /draftSecurityHeaders\(registrationId\)/);
  assert.match(ruc, /draftSecurityHeaders\(registrationId\)/);
  assert.match(server, /Set-Cookie/);
  assert.match(server, /cancelDraft/);
  assert.match(handoff, /segundo dispositivo[\s\S]*SESSION_REQUIRED/);
  assert.equal(DRAFT_STATUS.SRI_PENDING, 'SRI_PENDING');
  assert.equal(DRAFT_STATUS.CANCELLED, 'CANCELLED');
});

test('trust policy y custodia fijan decisiones de seguridad', () => {
  assert.deepEqual(CERTIFICATE_TRUST_POLICY.algorithms, ['RSASSA-PKCS1-v1_5-SHA256']);
  assert.equal(CERTIFICATE_TRUST_POLICY.revocation, 'OCSP_THEN_CRL');
  assert.equal(CERTIFICATE_TRUST_POLICY.revokedOrUntrusted, 'FAIL_CLOSED');
  assert.equal(CERTIFICATE_CUSTODY_POLICY.cipher, 'AES-256-GCM');
  assert.equal(CERTIFICATE_CUSTODY_POLICY.envelopeEncryption, true);
  assert.match(CERTIFICATE_CUSTODY_POLICY.kek, /KMS_OR_VAULT/);
});

test('rate limits cubren todos los endpoints requeridos', () => {
  for (const name of ['draftCreate', 'clientCheck', 'sriLookup', 'challengeCreate', 'challengeVerify', 'certificateUpload', 'otpSend', 'otpVerify', 'billing', 'complete', 'logo']) {
    assert.ok(RATE_LIMIT_POLICY[name], name);
    assert.ok(RATE_LIMIT_POLICY[name].max > 0, name);
    assert.ok(RATE_LIMIT_POLICY[name].windowSeconds > 0, name);
  }
});

test('tax-data y reconciliación tienen vocabulario cerrado', () => {
  assert.deepEqual(Object.values(TAX_DATA_SOURCE), ['SRI', 'MANUAL_ENTRY', 'SRI_CONFIRMATION']);
  assert.deepEqual(Object.values(RECONCILIATION_OUTCOME), [
    'AUTO_RECONCILED', 'REQUIRES_USER_CONFIRMATION', 'REQUIRES_MANUAL_REVIEW', 'REJECTED_INACTIVE',
  ]);
});

test('logo contractual incluye contacto sin conservar variantes contradictorias', async () => {
  const [readme, handoff, screen] = await Promise.all([
    read('README.md'), read('docs/V2-BACKEND-HANDOFF.md'), read('assets/screens/post-create-logo.js'),
  ]);
  assert.equal(LOGO_CONTRACT.width, 2970);
  assert.equal(LOGO_CONTRACT.height, 300);
  assert.equal(LOGO_CONTRACT.provisionalFont, 'Roboto Condensed Light');
  assert.equal(LOGO_CONTRACT.provisionalContent, 'RAZON_SOCIAL_EMAIL_CELULAR_WITH_ICONS');
  assert.doesNotMatch(`${readme}\n${handoff}`, /Roboto Condensed Bold|logo.*contrato pendiente/i);
  assert.match(`${readme}\n${handoff}`, /correo y celular(?: registrados)? con iconos/i);
  assert.match(screen, /drawMailIcon/);
  assert.match(screen, /drawPhoneIcon/);
});

test('consentimiento usa IDs y hashes de los documentos actuales', async () => {
  const [terms, privacy] = await Promise.all([read('Terminos-y-Condiciones.txt'), read('Politica-de-Privacidad.txt')]);
  const { createHash } = await import('node:crypto');
  const hash = text => createHash('sha256').update(text).digest('hex');
  assert.equal(hash(terms), LEGAL_DOCUMENT_HASHES.termsSha256);
  assert.equal(hash(privacy), LEGAL_DOCUMENT_HASHES.privacySha256);
});

test('matriz de errores documenta todo el catálogo con HTTP', async () => {
  const handoff = await read('docs/V2-BACKEND-HANDOFF.md');
  for (const code of Object.values(REGISTRATION_ERROR)) {
    assert.ok(ERROR_HTTP_STATUS[code], `HTTP faltante: ${code}`);
    assert.match(handoff, new RegExp(`\\| ${code} \\| ${ERROR_HTTP_STATUS[code]} \\|`), `matriz faltante: ${code}`);
  }
});

test('handoff contiene comparación V1→V2 y matriz frontend/mock/backend', async () => {
  const handoff = await read('docs/V2-BACKEND-HANDOFF.md');
  assert.match(handoff, /## 16\. V1 → V2/);
  assert.match(handoff, /## 17\. Matriz frontend, mock y backend/);
  assert.match(handoff, /POST \/api\/registro/);
  assert.match(handoff, /\/drafts\/\{id\}\/complete/);
});

test('documentación de entrada conserva las ramas y checkpoints V2 del RUC', async () => {
  const [readme, flow, handoff, machineText] = await Promise.all([
    read('README.md'), read('docs/REGISTRATION-FLOW.md'),
    read('docs/V2-BACKEND-HANDOFF.md'), read('flujo-registro.json'),
  ]);
  const currentDocs = `${readme}\n${flow}\n${handoff}`;
  for (const checkpoint of ['CP0', 'CP1', 'CP2', 'CP3', 'CP4', 'CP5']) {
    assert.match(currentDocs, new RegExp(`\\b${checkpoint}\\b`), `checkpoint faltante: ${checkpoint}`);
  }
  for (const suffix of ['client-check', 'issuer-authorization/check', 'sri/lookup']) {
    assert.match(readme, new RegExp(suffix.replace('/', '\\/')));
    assert.match(flow, new RegExp(suffix.replace('/', '\\/')));
  }
  const machine = JSON.parse(machineText);
  assert.equal(machine.version, '2026-10-05');
  assert.match(machine.pasos[1].paralelismo, /empiezan juntas/);
  assert.match(machine.pasos[3].accion, /\/drafts\/\{id\}\/complete/);
  assert.doesNotMatch(machineText, /GET \/api\/ruc\/:ruc|POST \/api\/registro"/);
});

test('contrato de billing conserva los seis documentos y las dependencias SRI', async () => {
  const [machineText, handoff, issuerAdapter] = await Promise.all([
    read('flujo-registro.json'), read('docs/V2-BACKEND-HANDOFF.md'), read('server/emisor-autorizado.js'),
  ]);
  const machine = JSON.parse(machineText);
  const billing = machine.pasos.find(step => step.id === 'facturacion');
  assert.equal(billing.peticion, 'PUT /api/registro/drafts/{id}/billing');
  assert.deepEqual(billing.body.documentos.map(doc => doc.tipo_documento), [
    'factura', 'guia', 'nc', 'nd', 'liquidacion', 'retencion',
  ]);
  assert.deepEqual(billing.body.documentos.slice(1).map(doc => [doc.establecimiento, doc.punto_emision, doc.secuencia]),
    Array(5).fill(['001', '001', '000000001']));
  assert.match(handoff, /validezEmisor\.jsf/);
  assert.match(handoff, /validezComprobantes\.jsf/);
  assert.match(issuerAdapter, /validezEmisor\.jsf/);
});

test('límite PKCS#12 queda alineado en 8 MB', () => {
  assert.equal(validarFirmaArchivo({ name: 'firma.p12', size: 8 * 1024 * 1024 }).valid, true);
  assert.equal(validarFirmaArchivo({ name: 'firma.p12', size: 8 * 1024 * 1024 + 1 }).valid, false);
});
