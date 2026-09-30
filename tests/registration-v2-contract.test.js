import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistrationV2Mock } from '../server/registration-v2-mock.js';
import { validarRUC } from '../assets/utils/ruc-validation.js';
import {
  ACCOUNT_STATUS, LEGAL_DOCUMENT_HASHES, LEGAL_DOCUMENT_ID, LEGAL_DOCUMENT_VERSION,
  LOGO_CONTRACT, RATE_LIMIT_POLICY, RECONCILIATION_OUTCOME, SIGNATURE_ALGORITHM,
  TAX_DATA_SOURCE, TAX_DATA_STATUS,
} from '../assets/services/registration-contract.js';

const ruc = Array.from({ length: 1000 }, (_, n) => `010${String(n).padStart(7, '0')}001`).find(value => validarRUC(value).valid);
const billing = { modo: 'continuar', documentos: [{ tipo_documento: 'factura', establecimiento: '001', punto_emision: '001', secuencia: '000000027' }] };
const manualDeclared = {
  razonSocial: 'EMPRESA DECLARADA', regimen: 'GENERAL', tipoContribuyente: 'OBLIGADO',
  obligadoLlevarContabilidad: 'SI', actividadEconomicaPrincipal: 'ACTIVIDAD DECLARADA',
  agenteRetencion: false, contribuyenteEspecial: false, granContribuyente: false,
};
const createBody = {
  contractVersion: 'v2', rucClaim: ruc,
  consent: {
    accepted: true, legalDocumentVersion: LEGAL_DOCUMENT_VERSION,
    legalDocumentId: LEGAL_DOCUMENT_ID, documentHashes: LEGAL_DOCUMENT_HASHES,
  },
};

function setup(options = {}) {
  return createRegistrationV2Mock({ enabled: true, nodeEnv: 'development', proofVerifier: () => true, ...options });
}
function create(api, sessionId = 'session-a') {
  const base = { local: true, sessionId, ip: '127.0.0.1', userAgent: 'test-agent' };
  const created = api.createDraft(createBody, base);
  assert.equal(created.status, 201);
  return { id: created.body.registrationId, context: { ...base, csrfToken: created.body.csrfToken }, created };
}
function identify(api) {
  const created = create(api); const { id, context } = created;
  const challenge = api.createChallenge(id, { algorithm: SIGNATURE_ALGORITHM }, context);
  const proof = { algorithm: SIGNATURE_ALGORITHM, ruc, signatureBase64Url: 'c2ln', certificateDerBase64: 'Y2VydA==' };
  assert.equal(api.verifyChallenge(id, challenge.body.challengeId, proof, context).status, 200);
  assert.equal(api.uploadCertificate(id, { file: { name: 'firma.p12', size: 128, type: 'application/x-pkcs12' }, password: 'secreto' }, context).status, 201);
  assert.equal(api.clientCheck(id, context).body.esCliente, false);
  return { ...created, challenge, proof };
}
function markSriUnavailable(api, id, context) {
  assert.equal(api.beginSriLookup(id, context).body.status, 'SRI_PENDING');
  assert.equal(api.markSriUnavailable(id, { attempts: 3 }, context).body.error, 'SRI_UNAVAILABLE');
}
function completeManual(api) {
  const { id, context } = identify(api);
  markSriUnavailable(api, id, context);
  assert.equal(api.storeSri(id, { source: TAX_DATA_SOURCE.MANUAL_ENTRY, status: 'MANUAL_PENDING', declared: manualDeclared }, context).status, 200);
  assert.equal(api.storeContact(id, { email: 'persona@example.com', celular: '0991234567' }, context).status, 200);
  const sent = api.sendOtp(id, context);
  assert.equal(api.verifyOtp(id, { codigo: sent.body.devCode }, context).status, 200);
  assert.equal(api.storeBilling(id, billing, context).status, 200);
  const completed = api.complete(id, 'idempotency-test-1', context);
  assert.equal(completed.status, 201);
  return { id, context, completed };
}

test('draft exige sesión, CSRF y evidencia legal versionada', () => {
  const api = setup();
  assert.equal(api.createDraft(createBody, { local: true }).body.error, 'SESSION_REQUIRED');
  const { id, context, created } = create(api);
  const draft = api._drafts.get(id);
  assert.equal(draft.consent.legalDocumentId, LEGAL_DOCUMENT_ID);
  assert.deepEqual(draft.consent.documentHashes, LEGAL_DOCUMENT_HASHES);
  assert.equal(draft.consent.userAgent, 'test-agent');
  assert.equal(created.body.csrfToken.length > 32, true);
  assert.equal(api.createChallenge(id, { algorithm: SIGNATURE_ALGORITHM }, { ...context, csrfToken: 'incorrecto' }).body.error, 'CSRF_INVALID');
  assert.equal(api.createChallenge(id, { algorithm: SIGNATURE_ALGORITHM }, { ...context, sessionId: 'otro' }).body.error, 'SESSION_MISMATCH');
  assert.equal(createRegistrationV2Mock({ enabled: true, nodeEnv: 'production' }).createDraft(createBody, context).status, 503);
});

test('challenge es de dos minutos, single-use y ligado al RUC/draft', () => {
  let time = 1_000; const api = setup({ now: () => time }); const { id, context } = create(api);
  const challenge = api.createChallenge(id, { algorithm: SIGNATURE_ALGORITHM }, context);
  const proof = { algorithm: SIGNATURE_ALGORITHM, ruc, signatureBase64Url: 'c2ln', certificateDerBase64: 'Y2VydA==' };
  assert.equal(api.verifyChallenge(id, challenge.body.challengeId, proof, context).status, 200);
  assert.equal(api.verifyChallenge(id, challenge.body.challengeId, proof, context).body.error, 'CHALLENGE_ALREADY_USED');
  const another = api.createChallenge(id, { algorithm: SIGNATURE_ALGORITHM }, context); time += 120_001;
  assert.equal(api.verifyChallenge(id, another.body.challengeId, proof, context).body.error, 'CHALLENGE_EXPIRED');
});

test('SRI_PENDING entra por lookup, sale por MANUAL_ENTRY y CANCELLED destruye estado sensible', () => {
  const api = setup(); const { id, context } = identify(api);
  markSriUnavailable(api, id, context);
  assert.equal(api._drafts.get(id).status, 'SRI_PENDING');
  assert.equal(api.storeSri(id, { source: TAX_DATA_SOURCE.MANUAL_ENTRY, status: 'MANUAL_PENDING', declared: manualDeclared }, context).status, 200);
  assert.equal(api._drafts.get(id).sri.source, TAX_DATA_SOURCE.MANUAL_ENTRY);
  assert.equal(api.cancelDraft(id, context).body.status, 'CANCELLED');
  assert.equal(api._drafts.get(id).certificatePackage, null);
  assert.equal(api.createChallenge(id, { algorithm: SIGNATURE_ALGORITHM }, context).body.error, 'DRAFT_CANCELLED');
});

test('/tax-data separa SRI_CONFIRMATION de MANUAL_ENTRY', () => {
  const api = setup(); const { id, context } = identify(api);
  api.beginSriLookup(id, context);
  const official = {
    source: TAX_DATA_SOURCE.SRI, ruc, estadoContribuyenteRuc: 'ACTIVO', razonSocial: 'EMPRESA OFICIAL',
    regimen: 'GENERAL', tipoContribuyente: 'AGENTE_RETENCION', obligadoLlevarContabilidad: 'SI',
    actividadEconomicaPrincipal: 'ACTIVIDAD', agenteRetencion: true,
  };
  assert.equal(api.storeSri(id, official, context).status, 200);
  assert.equal(api.storeSri(id, { source: TAX_DATA_SOURCE.SRI_CONFIRMATION, nombreComercial: 'Marca', noResolucion: 'NAC-DGERCGC23-00000000001' }, context).status, 200);
  assert.equal(api._drafts.get(id).sri.nombreComercial, 'Marca');
  assert.equal(api.storeSri(id, { source: TAX_DATA_SOURCE.MANUAL_ENTRY, status: 'MANUAL_PENDING', declared: manualDeclared }, context).status, 400);
});

test('OTP, billing, complete e idempotencia quedan ligados al draft', () => {
  const api = setup(); const { id, context, completed } = completeManual(api);
  assert.equal(completed.body.accountStatus, ACCOUNT_STATUS.ACTIVE_RESTRICTED);
  assert.equal(completed.body.accountTaxDataStatus, TAX_DATA_STATUS.PENDING_SRI_RECONCILIATION);
  assert.equal(completed.body.capabilities.login, true);
  assert.equal(completed.body.capabilities.electronicIssuance, false);
  assert.deepEqual(api.complete(id, 'idempotency-test-1', context), completed);
  assert.equal(api.complete(id, 'otra-clave', context).body.error, 'IDEMPOTENCY_CONFLICT');
});

test('reconciliación produce los cuatro outcomes y mantiene restricción cuando corresponde', () => {
  const official = {
    ruc, estadoContribuyenteRuc: 'ACTIVO', razonSocial: 'EMPRESA OFICIAL', regimen: 'GENERAL',
    tipoContribuyente: 'OBLIGADO', obligadoLlevarContabilidad: 'SI', contribuyenteEspecial: false,
  };
  const run = snapshot => {
    const api = setup(); const { completed } = completeManual(api);
    return api.reconcileAccount(completed.body.accountId, snapshot, { internal: true });
  };
  const auto = run(official);
  assert.equal(auto.body.outcome, RECONCILIATION_OUTCOME.AUTO_RECONCILED);
  assert.equal(auto.body.accountTaxDataStatus, TAX_DATA_STATUS.VERIFIED);
  const confirmation = run({ ...official, regimen: 'RIMPE' });
  assert.equal(confirmation.body.outcome, RECONCILIATION_OUTCOME.REQUIRES_USER_CONFIRMATION);
  assert.equal(confirmation.body.capabilities.electronicIssuance, false);
  assert.equal(run({ ruc, estadoContribuyenteRuc: 'ACTIVO' }).body.outcome, RECONCILIATION_OUTCOME.REQUIRES_MANUAL_REVIEW);
  assert.equal(run({ ...official, estadoContribuyenteRuc: 'SUSPENDIDO' }).body.outcome, RECONCILIATION_OUTCOME.REJECTED_INACTIVE);
});

test('rate limits contractuales devuelven 429 y Retry-After', () => {
  const api = setup(); const { id, context } = create(api);
  for (let i = 0; i < RATE_LIMIT_POLICY.challengeCreate.max; i += 1) assert.equal(api.createChallenge(id, { algorithm: SIGNATURE_ALGORITHM }, context).status, 201);
  const limited = api.createChallenge(id, { algorithm: SIGNATURE_ALGORITHM }, context);
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error, 'RATE_LIMITED');
  assert.ok(limited.retryAfter > 0);
});

test('logo provisional cumple dimensiones, tipografía y contenido cerrados', () => {
  const api = setup(); const { completed } = completeManual(api);
  const stored = api.storeLogo(completed.body.accountId, completed.body.postCreateToken, { mode: 'provisional' }, { local: true, ip: '127.0.0.1' });
  assert.equal(stored.status, 200);
  const logo = api._accounts.get(completed.body.accountId).logo;
  assert.equal(logo.width, LOGO_CONTRACT.width);
  assert.equal(logo.height, LOGO_CONTRACT.height);
  assert.equal(logo.font, 'Roboto Condensed Light');
  assert.equal(logo.content, 'RAZON_SOCIAL_ONLY');
});

test('complete rechaza drafts incompletos y facturación inválida', () => {
  const api = setup(); const created = create(api);
  assert.equal(api.complete(created.id, 'key', created.context).body.error, 'INVALID_DRAFT_STATE');
  const api2 = setup(); const identified = identify(api2);
  assert.equal(api2.storeBilling(identified.id, { modo: 'continuar', documentos: [{ ...billing.documentos[0], establecimiento: '000' }] }, identified.context).status, 400);
});
