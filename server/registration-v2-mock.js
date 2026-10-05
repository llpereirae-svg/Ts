import { createHash, randomBytes, randomUUID, verify as verifySignature, X509Certificate } from 'node:crypto';
import { validarRUC } from '../assets/utils/ruc-validation.js';
import { validarNoResolucion } from '../assets/utils/validators.js';
import {
  ACCOUNT_STATUS, CHALLENGE_NONCE_BYTES, CONTRACT_TTL, DRAFT_STATUS,
  LEGAL_DOCUMENT_HASHES, LEGAL_DOCUMENT_ID, LEGAL_DOCUMENT_VERSION, RATE_LIMIT_POLICY,
  OTP_LENGTH,
  RECONCILIATION_OUTCOME, REGISTRATION_ERROR, SESSION_POLICY, SIGNATURE_ALGORITHM,
  TAX_DATA_SOURCE, TAX_DATA_STATUS,
} from '../assets/services/registration-contract.js';

const DOCUMENT_TYPES = new Set(['factura', 'guia', 'nc', 'nd', 'liquidacion', 'retencion']);
const RESOLUTION_TYPES = new Set(['AGENTE_RETENCION', 'CONTRIBUYENTE_ESPECIAL', 'GRAN_CONTRIBUYENTE']);
const ok = (status, body, retryAfter = 0) => ({ status, body, ...(retryAfter ? { retryAfter } : {}) });
const fail = (status, error, retryAfter = 0) => ok(status, { error }, retryAfter);
const b64url = value => Buffer.from(value).toString('base64url');
const sha256 = value => createHash('sha256').update(value).digest('hex');

export function createRegistrationV2Mock({
  enabled = false, nodeEnv = '', existingRuc = '', now = () => Date.now(),
  proofVerifier = verifyCertificateProof,
} = {}) {
  const drafts = new Map();
  const accounts = new Map();
  const counters = new Map();

  const authorize = local => enabled && nodeEnv === 'development' && local;
  const limited = (policy, key, error = REGISTRATION_ERROR.RATE_LIMITED) => {
    const time = now();
    const windowMs = policy.windowSeconds * 1000;
    const values = (counters.get(key) || []).filter(value => time - value < windowMs);
    if (values.length >= policy.max) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (time - values[0])) / 1000));
      return fail(429, error, retryAfter);
    }
    values.push(time); counters.set(key, values); return null;
  };
  const requireSession = (draft, context) => {
    if (!context?.sessionId) return fail(401, REGISTRATION_ERROR.SESSION_REQUIRED);
    if (context.sessionId !== draft.sessionId) return fail(403, REGISTRATION_ERROR.SESSION_MISMATCH);
    if (!context.csrfToken || sha256(context.csrfToken) !== draft.csrfTokenHash) return fail(403, REGISTRATION_ERROR.CSRF_INVALID);
    return null;
  };
  const getDraft = (id, context, { allowCompleted = false } = {}) => {
    const draft = drafts.get(id);
    if (!draft) return { error: fail(404, REGISTRATION_ERROR.DRAFT_NOT_FOUND) };
    const time = now();
    if (draft.status === DRAFT_STATUS.EXPIRED || time - draft.lastActivityAt > CONTRACT_TTL.inactivityMs || time - draft.createdAt > CONTRACT_TTL.absoluteMs) {
      draft.status = DRAFT_STATUS.EXPIRED; destroySensitiveDraftData(draft);
      return { error: fail(410, REGISTRATION_ERROR.DRAFT_EXPIRED) };
    }
    if (draft.status === DRAFT_STATUS.CANCELLED) return { error: fail(409, REGISTRATION_ERROR.DRAFT_CANCELLED) };
    if (draft.status === DRAFT_STATUS.COMPLETED && !allowCompleted) return { error: fail(409, REGISTRATION_ERROR.INVALID_DRAFT_STATE) };
    const sessionError = requireSession(draft, context); if (sessionError) return { error: sessionError };
    draft.lastActivityAt = time;
    return { draft };
  };

  function createDraft(body, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    if (!context.sessionId) return fail(401, REGISTRATION_ERROR.SESSION_REQUIRED);
    const consent = body?.consent;
    if (body?.contractVersion !== 'v2' || !validarRUC(body?.rucClaim || '').valid
        || consent?.accepted !== true || consent?.legalDocumentVersion !== LEGAL_DOCUMENT_VERSION
        || consent?.legalDocumentId !== LEGAL_DOCUMENT_ID
        || consent?.documentHashes?.termsSha256 !== LEGAL_DOCUMENT_HASHES.termsSha256
        || consent?.documentHashes?.privacySha256 !== LEGAL_DOCUMENT_HASHES.privacySha256) {
      return fail(400, REGISTRATION_ERROR.INVALID_REQUEST);
    }
    const ipLimit = limited(RATE_LIMIT_POLICY.draftCreate, `draft:ip:${context.ip || 'local'}`); if (ipLimit) return ipLimit;
    const rucLimit = limited(RATE_LIMIT_POLICY.draftCreateByRuc, `draft:ruc:${body.rucClaim}`); if (rucLimit) return rucLimit;
    const registrationId = randomUUID(); const time = now();
    const csrfToken = randomBytes(SESSION_POLICY.csrfTokenBytes).toString('base64url');
    drafts.set(registrationId, {
      registrationId, ruc: body.rucClaim, sessionId: context.sessionId, csrfTokenHash: sha256(csrfToken),
      status: DRAFT_STATUS.PENDING, createdAt: time, lastActivityAt: time,
      consent: {
        accepted: true, legalDocumentVersion: LEGAL_DOCUMENT_VERSION, legalDocumentId: LEGAL_DOCUMENT_ID,
        documentHashes: LEGAL_DOCUMENT_HASHES, acceptedAt: new Date(time).toISOString(),
        registrationId, ip: context.ip || null, userAgent: context.userAgent || null,
      },
      challenges: new Map(), idempotency: new Map(), clientCheck: null, issuerAuthorization: null,
      identityVerified: false, certificatePackage: null, sri: null, sriAvailability: null,
      contact: null, otp: null, billing: null,
    });
    return ok(201, {
      registrationId, status: DRAFT_STATUS.PENDING, csrfToken,
      inactivityExpiresAt: new Date(time + CONTRACT_TTL.inactivityMs).toISOString(),
      absoluteExpiresAt: new Date(time + CONTRACT_TTL.absoluteMs).toISOString(),
    });
  }

  function createChallenge(registrationId, body, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context); if (found.error) return found.error;
    const rate = limited(RATE_LIMIT_POLICY.challengeCreate, `challenge:create:${registrationId}:${context.ip || 'local'}`); if (rate) return rate;
    if (body?.algorithm !== SIGNATURE_ALGORITHM) return fail(422, REGISTRATION_ERROR.UNSUPPORTED_SIGNATURE_ALGORITHM);
    const challengeId = randomUUID(); const issuedAt = now(); const expiresAt = issuedAt + CONTRACT_TTL.challengeMs;
    const nonce = randomBytes(CHALLENGE_NONCE_BYTES).toString('base64url');
    const payload = `TRIBUTASOFT-REGISTRATION-V2\nregistrationId=${registrationId}\nchallengeId=${challengeId}\nruc=${found.draft.ruc}\nnonce=${nonce}\nissuedAt=${new Date(issuedAt).toISOString()}\nexpiresAt=${new Date(expiresAt).toISOString()}`;
    found.draft.challenges.set(challengeId, { payload, issuedAt, expiresAt, usedAt: null });
    return ok(201, { challengeId, algorithm: SIGNATURE_ALGORITHM, payloadBase64Url: b64url(payload), expiresAt: new Date(expiresAt).toISOString() });
  }

  function verifyChallenge(registrationId, challengeId, body, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context); if (found.error) return found.error;
    const rate = limited(RATE_LIMIT_POLICY.challengeVerify, `challenge:verify:${registrationId}:${context.ip || 'local'}`); if (rate) return rate;
    const challenge = found.draft.challenges.get(challengeId);
    if (!challenge) return fail(404, REGISTRATION_ERROR.INVALID_REQUEST);
    if (challenge.usedAt) return fail(409, REGISTRATION_ERROR.CHALLENGE_ALREADY_USED);
    if (now() > challenge.expiresAt) return fail(410, REGISTRATION_ERROR.CHALLENGE_EXPIRED);
    challenge.usedAt = now();
    if (body?.algorithm !== SIGNATURE_ALGORITHM || body?.ruc !== found.draft.ruc) return fail(422, REGISTRATION_ERROR.CERTIFICATE_RUC_MISMATCH);
    if (!proofVerifier({ payload: challenge.payload, signatureBase64Url: body?.signatureBase64Url, certificateDerBase64: body?.certificateDerBase64 })) return fail(422, REGISTRATION_ERROR.INVALID_SIGNATURE);
    found.draft.identityVerified = true; found.draft.status = DRAFT_STATUS.IDENTITY_VERIFIED;
    found.draft.certificateFingerprint = sha256(Buffer.from(body.certificateDerBase64, 'base64'));
    return ok(200, { verified: true, status: DRAFT_STATUS.IDENTITY_VERIFIED, ruc: found.draft.ruc });
  }

  function uploadCertificate(registrationId, upload, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context); if (found.error) return found.error;
    const rate = limited(RATE_LIMIT_POLICY.certificateUpload, `certificate:${registrationId}:${context.ip || 'local'}`); if (rate) return rate;
    if (!found.draft.identityVerified) return fail(409, REGISTRATION_ERROR.INVALID_DRAFT_STATE);
    const file = upload?.file;
    if (!file || !upload?.password || !/\.(p12|pfx)$/i.test(file.name || '') || file.size <= 0 || file.size > 8 * 1024 * 1024) return fail(422, REGISTRATION_ERROR.INVALID_REQUEST);
    found.draft.certificatePackage = { received: true, size: file.size, uploadedAt: new Date(now()).toISOString(), encryptedAtRest: false, mockOnly: true };
    return ok(201, { stored: true, temporary: true, expiresAt: new Date(found.draft.createdAt + CONTRACT_TTL.absoluteMs).toISOString() });
  }

  function clientCheck(registrationId, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context); if (found.error) return found.error;
    const rate = limited(RATE_LIMIT_POLICY.clientCheck, `client:${registrationId}:${found.draft.ruc}:${context.ip || 'local'}`); if (rate) return rate;
    if (!found.draft.identityVerified || !found.draft.certificatePackage) return fail(409, REGISTRATION_ERROR.INVALID_DRAFT_STATE);
    found.draft.clientCheck = found.draft.ruc === existingRuc ? 'EXISTING' : 'NEW'; refreshReadiness(found.draft);
    return ok(200, { esCliente: found.draft.clientCheck === 'EXISTING' });
  }

  function beginIssuerAuthorizationCheck(registrationId, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context); if (found.error) return found.error;
    const rate = limited(RATE_LIMIT_POLICY.issuerAuthorizationCheck, `issuer:${registrationId}:${found.draft.ruc}:${context.ip || 'local'}`); if (rate) return rate;
    if (found.draft.clientCheck !== 'NEW') return fail(409, REGISTRATION_ERROR.CLIENT_CHECK_REQUIRED);
    found.draft.issuerAuthorization = { status: 'PENDING', checkedAt: null };
    return ok(200, { status: 'PENDING' });
  }

  function storeIssuerAuthorization(registrationId, result, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context); if (found.error) return found.error;
    if (found.draft.clientCheck !== 'NEW' || found.draft.issuerAuthorization?.status !== 'PENDING'
        || result?.ruc !== found.draft.ruc || typeof result?.authorized !== 'boolean') {
      return fail(409, REGISTRATION_ERROR.INVALID_DRAFT_STATE);
    }
    found.draft.issuerAuthorization = {
      status: result.authorized ? 'AUTHORIZED' : 'NOT_AUTHORIZED',
      authorized: result.authorized,
      code: result.authorized ? null : REGISTRATION_ERROR.ISSUER_AUTHORIZATION_REQUIRED,
      authorizationDate: result.authorizationDate || null,
      checkedAt: result.checkedAt || new Date(now()).toISOString(),
    };
    refreshReadiness(found.draft);
    return ok(200, structuredClone(found.draft.issuerAuthorization));
  }

  function markIssuerAuthorizationUnavailable(registrationId, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context); if (found.error) return found.error;
    if (found.draft.clientCheck !== 'NEW' || found.draft.issuerAuthorization?.status !== 'PENDING') {
      return fail(409, REGISTRATION_ERROR.INVALID_DRAFT_STATE);
    }
    found.draft.issuerAuthorization = { status: 'UNAVAILABLE', authorized: null, checkedAt: new Date(now()).toISOString() };
    return fail(503, REGISTRATION_ERROR.ISSUER_AUTHORIZATION_UNAVAILABLE);
  }

  function beginSriLookup(registrationId, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context); if (found.error) return found.error;
    const rate = limited(RATE_LIMIT_POLICY.sriLookup, `sri:${registrationId}:${found.draft.ruc}:${context.ip || 'local'}`); if (rate) return rate;
    if (found.draft.clientCheck !== 'NEW') return fail(409, REGISTRATION_ERROR.CLIENT_CHECK_REQUIRED);
    // La consulta tributaria puede precargarse en paralelo con la autorización.
    // El gate sigue siendo obligatorio para completar el registro.
    found.draft.status = DRAFT_STATUS.SRI_PENDING;
    found.draft.sriAvailability = { status: 'PENDING', attempts: 0, lastAttemptAt: new Date(now()).toISOString() };
    return ok(200, { status: DRAFT_STATUS.SRI_PENDING, ruc: found.draft.ruc });
  }

  function markSriUnavailable(registrationId, { attempts = 0, errorCode = 'SRI_UNAVAILABLE' } = {}, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context); if (found.error) return found.error;
    if (found.draft.status !== DRAFT_STATUS.SRI_PENDING || attempts < 3) return fail(409, REGISTRATION_ERROR.INVALID_DRAFT_STATE);
    found.draft.sriAvailability = { status: 'UNAVAILABLE', attempts, lastAttemptAt: new Date(now()).toISOString(), errorCode };
    return fail(503, REGISTRATION_ERROR.SRI_UNAVAILABLE);
  }

  function storeSri(registrationId, sri, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context); if (found.error) return found.error;
    const draft = found.draft;
    if (sri?.source === TAX_DATA_SOURCE.SRI) {
      if (sri.ruc !== draft.ruc || sri.estadoContribuyenteRuc !== 'ACTIVO') return fail(422, REGISTRATION_ERROR.INVALID_REQUEST);
      draft.sri = { source: TAX_DATA_SOURCE.SRI, status: 'VERIFIED', snapshot: sri, attempts: sri.attempts || 1, lastAttemptAt: sri.lastAttemptAt || new Date(now()).toISOString() };
    } else if (sri?.source === TAX_DATA_SOURCE.MANUAL_ENTRY && sri?.status === 'MANUAL_PENDING'
        && draft.sriAvailability?.status === 'UNAVAILABLE' && validManualTaxData(sri.declared)
        && validResolutionForType(sri.declared.tipoContribuyente, sri.noResolucion)) {
      draft.sri = { source: TAX_DATA_SOURCE.MANUAL_ENTRY, status: 'MANUAL_PENDING', declared: normalizeManualTaxData(sri.declared), noResolucion: normalizeResolution(sri.noResolucion), attempts: draft.sriAvailability.attempts, lastAttemptAt: draft.sriAvailability.lastAttemptAt, errorCode: draft.sriAvailability.errorCode };
    } else if (sri?.source === TAX_DATA_SOURCE.SRI_CONFIRMATION && draft.sri?.source === TAX_DATA_SOURCE.SRI
        && validOfficialResolution(draft.sri.snapshot, sri.noResolucion)) {
      draft.sri.noResolucion = normalizeResolution(sri.noResolucion);
      draft.sri.nombreComercial = String(sri.nombreComercial || '').trim().slice(0, 200);
    } else return fail(400, REGISTRATION_ERROR.INVALID_REQUEST);
    refreshReadiness(draft);
    return ok(200, { source: draft.sri.source, status: draft.sri.status, draftStatus: draft.status });
  }

  function storeContact(registrationId, contact, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context); if (found.error) return found.error;
    if (!/^\S+@\S+\.\S+$/.test(contact?.email || '') || !/^\d{7,15}$/.test(contact?.celular || '')) return fail(400, REGISTRATION_ERROR.INVALID_REQUEST);
    const email = contact.email.trim().toLowerCase(); const sameEmail = found.draft.contact?.email === email;
    if (!sameEmail) found.draft.otp = null;
    found.draft.contact = { email, celular: contact.celular, emailVerified: sameEmail && found.draft.contact.emailVerified === true };
    refreshReadiness(found.draft); return ok(200, { saved: true });
  }

  function sendOtp(registrationId, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context); if (found.error) return found.error;
    if (!found.draft.contact) return fail(409, REGISTRATION_ERROR.INVALID_DRAFT_STATE);
    if (found.draft.otp && now() - found.draft.otp.sentAt < RATE_LIMIT_POLICY.otpSendCooldownSeconds * 1000) return fail(429, REGISTRATION_ERROR.OTP_RATE_LIMITED, RATE_LIMIT_POLICY.otpSendCooldownSeconds);
    const rate = limited(RATE_LIMIT_POLICY.otpSend, `otp:send:${registrationId}:${found.draft.contact.email}:${context.ip || 'local'}`, REGISTRATION_ERROR.OTP_RATE_LIMITED); if (rate) return rate;
    const code = '1234';
    found.draft.otp = { hash: sha256(`${registrationId}:${code}`), sentAt: now(), expiresAt: now() + CONTRACT_TTL.otpMs, attempts: 0, usedAt: null };
    return ok(200, { sent: true, expiresAt: new Date(found.draft.otp.expiresAt).toISOString(), cooldownSeconds: RATE_LIMIT_POLICY.otpSendCooldownSeconds, ...(nodeEnv === 'development' ? { devCode: code } : {}) });
  }

  function verifyOtp(registrationId, body, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context); if (found.error) return found.error;
    const rate = limited(RATE_LIMIT_POLICY.otpVerify, `otp:verify:${registrationId}:${context.ip || 'local'}`); if (rate) return rate;
    const otp = found.draft.otp;
    if (!otp || otp.usedAt || now() > otp.expiresAt) return fail(410, REGISTRATION_ERROR.OTP_EXPIRED);
    if (otp.attempts >= 5) return fail(429, REGISTRATION_ERROR.OTP_ATTEMPTS_EXCEEDED);
    otp.attempts += 1;
    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(body?.codigo || '') || sha256(`${registrationId}:${body.codigo}`) !== otp.hash) return fail(422, REGISTRATION_ERROR.OTP_INVALID);
    otp.usedAt = now(); found.draft.contact.emailVerified = true; refreshReadiness(found.draft);
    return ok(200, { valid: true, status: found.draft.status });
  }

  function storeBilling(registrationId, billing, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context); if (found.error) return found.error;
    const rate = limited(RATE_LIMIT_POLICY.billing, `billing:${registrationId}`); if (rate) return rate;
    if (!validBilling(billing)) return fail(400, REGISTRATION_ERROR.INVALID_REQUEST);
    found.draft.billing = structuredClone(billing); refreshReadiness(found.draft);
    return ok(200, { saved: true, status: found.draft.status });
  }

  function cancelDraft(registrationId, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const draft = drafts.get(registrationId); if (!draft) return fail(404, REGISTRATION_ERROR.DRAFT_NOT_FOUND);
    const sessionError = requireSession(draft, context); if (sessionError) return sessionError;
    if (draft.status === DRAFT_STATUS.CANCELLED) return ok(200, { status: DRAFT_STATUS.CANCELLED });
    if ([DRAFT_STATUS.COMPLETED, DRAFT_STATUS.EXPIRED].includes(draft.status)) return fail(409, REGISTRATION_ERROR.INVALID_DRAFT_STATE);
    draft.status = DRAFT_STATUS.CANCELLED; draft.cancelledAt = now(); destroySensitiveDraftData(draft);
    return ok(200, { status: DRAFT_STATUS.CANCELLED });
  }

  function complete(registrationId, idempotencyKey, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const found = getDraft(registrationId, context, { allowCompleted: true }); if (found.error) return found.error;
    const draft = found.draft;
    if (!idempotencyKey || idempotencyKey.length > 128) return fail(400, REGISTRATION_ERROR.IDEMPOTENCY_KEY_REQUIRED);
    if (draft.idempotency.has(idempotencyKey)) return draft.idempotency.get(idempotencyKey);
    const rate = limited(RATE_LIMIT_POLICY.complete, `complete:${registrationId}:${draft.ruc}:${context.ip || 'local'}`); if (rate) return rate;
    if (draft.status === DRAFT_STATUS.COMPLETED) return fail(409, REGISTRATION_ERROR.IDEMPOTENCY_CONFLICT);
    if (draft.status !== DRAFT_STATUS.READY_TO_CREATE) return fail(409, REGISTRATION_ERROR.INVALID_DRAFT_STATE);
    if (!draft.identityVerified) return fail(409, REGISTRATION_ERROR.INVALID_DRAFT_STATE);
    if (!draft.certificatePackage) return fail(409, REGISTRATION_ERROR.CERTIFICATE_PACKAGE_REQUIRED);
    if (draft.clientCheck !== 'NEW') return fail(409, REGISTRATION_ERROR.CLIENT_CHECK_REQUIRED);
    if (draft.issuerAuthorization?.status !== 'AUTHORIZED') return fail(409, REGISTRATION_ERROR.ISSUER_AUTHORIZATION_REQUIRED);
    if (!draft.sri) return fail(409, REGISTRATION_ERROR.SRI_DATA_REQUIRED);
    if (!draft.contact?.emailVerified) return fail(409, REGISTRATION_ERROR.CONTACT_NOT_VERIFIED);
    if (!draft.billing) return fail(409, REGISTRATION_ERROR.BILLING_REQUIRED);
    if (draft.consent?.accepted !== true) return fail(409, REGISTRATION_ERROR.CONSENT_REQUIRED);
    draft.status = DRAFT_STATUS.CREATING;
    const pending = draft.sri.source === TAX_DATA_SOURCE.MANUAL_ENTRY;
    const accountId = randomUUID(); const postCreateToken = randomBytes(24).toString('base64url');
    const response = ok(201, {
      ok: true, accountId, accountStatus: pending ? ACCOUNT_STATUS.ACTIVE_RESTRICTED : ACCOUNT_STATUS.ACTIVE,
      accountTaxDataStatus: pending ? TAX_DATA_STATUS.PENDING_SRI_RECONCILIATION : TAX_DATA_STATUS.VERIFIED,
      capabilities: capabilities(!pending), reconciliationRequired: pending, postCreateToken,
    });
    draft.status = DRAFT_STATUS.COMPLETED; draft.completedAt = now(); draft.consent.accountId = accountId; draft.certificatePackage = null;
    accounts.set(accountId, {
      accountId, ruc: draft.ruc, status: response.body.accountStatus, taxDataStatus: response.body.accountTaxDataStatus,
      capabilities: response.body.capabilities, taxData: structuredClone(draft.sri), consent: structuredClone(draft.consent),
      postCreateTokenHash: sha256(postCreateToken), tokenExpiresAt: now() + CONTRACT_TTL.postCreateTokenMs, logo: null,
    });
    draft.idempotency.set(idempotencyKey, response); return response;
  }

  function reconcileAccount(accountId, officialSnapshot, context = {}) {
    if (!context.internal) return fail(403, REGISTRATION_ERROR.SESSION_MISMATCH);
    const account = accounts.get(accountId); if (!account) return fail(404, REGISTRATION_ERROR.DRAFT_NOT_FOUND);
    const outcome = determineReconciliation(account, officialSnapshot);
    if (outcome === RECONCILIATION_OUTCOME.AUTO_RECONCILED) {
      account.status = ACCOUNT_STATUS.ACTIVE; account.taxDataStatus = TAX_DATA_STATUS.VERIFIED;
      account.capabilities = capabilities(true); account.taxData = { source: TAX_DATA_SOURCE.SRI, status: 'VERIFIED', snapshot: structuredClone(officialSnapshot) };
    } else {
      account.status = ACCOUNT_STATUS.ACTIVE_RESTRICTED; account.taxDataStatus = TAX_DATA_STATUS.PENDING_SRI_RECONCILIATION;
      account.capabilities = capabilities(false);
    }
    account.reconciliation = { outcome, checkedAt: new Date(now()).toISOString() };
    return ok(200, { outcome, accountStatus: account.status, accountTaxDataStatus: account.taxDataStatus, capabilities: account.capabilities });
  }

  function storeLogo(accountId, token, selection, context = {}) {
    if (!authorize(context.local)) return fail(503, REGISTRATION_ERROR.BACKEND_CONFIG_REQUIRED);
    const account = accounts.get(accountId);
    if (!account || now() > account.tokenExpiresAt || sha256(token || '') !== account.postCreateTokenHash) return fail(401, REGISTRATION_ERROR.POST_CREATE_TOKEN_INVALID);
    const rate = limited(RATE_LIMIT_POLICY.logo, `logo:${accountId}:${context.ip || 'local'}`); if (rate) return rate;
    if (selection?.mode !== 'upload') return fail(422, REGISTRATION_ERROR.INVALID_LOGO);
    account.logo = { mode: 'upload', storedAt: now() };
    return ok(200, { stored: true, mode: selection.mode });
  }

  function cleanup() {
    const time = now();
    for (const [id, draft] of drafts) {
      if (time - draft.lastActivityAt > CONTRACT_TTL.inactivityMs || time - draft.createdAt > CONTRACT_TTL.absoluteMs) {
        destroySensitiveDraftData(draft); drafts.delete(id);
      }
    }
    for (const account of accounts.values()) if (time > account.tokenExpiresAt) { account.postCreateTokenHash = null; account.tokenExpiresAt = 0; }
  }

  return {
    createDraft, createChallenge, verifyChallenge, uploadCertificate, clientCheck,
    beginIssuerAuthorizationCheck, storeIssuerAuthorization, markIssuerAuthorizationUnavailable,
    beginSriLookup, markSriUnavailable, storeSri, storeContact, sendOtp, verifyOtp,
    storeBilling, cancelDraft, complete, reconcileAccount, storeLogo, cleanup,
    _drafts: drafts, _accounts: accounts,
  };
}

function verifyCertificateProof({ payload, signatureBase64Url, certificateDerBase64 }) {
  try {
    const cert = new X509Certificate(Buffer.from(certificateDerBase64, 'base64'));
    return verifySignature('sha256', Buffer.from(payload), cert.publicKey, Buffer.from(signatureBase64Url, 'base64url'));
  } catch { return false; }
}
function destroySensitiveDraftData(draft) { draft.certificatePackage = null; draft.otp = null; draft.challenges?.clear(); }
function capabilities(verified) { return { login: true, nonTaxFeatures: true, electronicIssuance: verified, taxFeaturesRequiringVerifiedData: verified }; }
function normalizeResolution(value) { return value ? validarNoResolucion(value).normalizado || String(value).trim().toUpperCase() : ''; }
function normalizeManualTaxData(value) {
  return {
    razonSocial: value.razonSocial.trim(), nombreComercial: String(value.nombreComercial || '').trim(),
    regimen: value.regimen.trim(), tipoContribuyente: value.tipoContribuyente.trim(),
    obligadoLlevarContabilidad: value.obligadoLlevarContabilidad,
    actividadEconomicaPrincipal: value.actividadEconomicaPrincipal.trim(),
    agenteRetencion: toBoolean(value.agenteRetencion), contribuyenteEspecial: toBoolean(value.contribuyenteEspecial),
    granContribuyente: toBoolean(value.granContribuyente),
    representantesLegales: Array.isArray(value.representantesLegales) ? value.representantesLegales.slice(0, 10) : [],
  };
}
function validManualTaxData(value) {
  return Boolean(value && typeof value.razonSocial === 'string' && value.razonSocial.trim().length <= 300
    && typeof value.regimen === 'string' && value.regimen.trim().length <= 100
    && typeof value.tipoContribuyente === 'string' && value.tipoContribuyente.trim().length <= 100
    && ['SI', 'NO'].includes(value.obligadoLlevarContabilidad)
    && typeof value.actividadEconomicaPrincipal === 'string' && value.actividadEconomicaPrincipal.trim().length <= 500
    && ['agenteRetencion', 'contribuyenteEspecial', 'granContribuyente'].every(key => value[key] === undefined || typeof value[key] === 'boolean')
    && (value.representantesLegales === undefined || Array.isArray(value.representantesLegales)));
}
function validResolutionForType(type, value) { return RESOLUTION_TYPES.has(type) ? validarNoResolucion(value || '').valid : !value || validarNoResolucion(value).valid; }
function validOfficialResolution(snapshot, value) {
  const yes = input => input === true || String(input || '').toUpperCase() === 'SI';
  const required = yes(snapshot?.agenteRetencion) || yes(snapshot?.contribuyenteEspecial) || yes(snapshot?.granContribuyente);
  return required ? validarNoResolucion(value || '').valid : !value || validarNoResolucion(value).valid;
}
function validBilling(value) {
  if (!value || !['nuevo', 'continuar'].includes(value.modo) || !Array.isArray(value.documentos) || !value.documentos.length) return false;
  const seen = new Set();
  for (const doc of value.documentos) {
    if (!DOCUMENT_TYPES.has(doc?.tipo_documento) || seen.has(doc.tipo_documento)
        || !/^\d{3}$/.test(doc.establecimiento) || doc.establecimiento === '000'
        || !/^\d{3}$/.test(doc.punto_emision) || doc.punto_emision === '000'
        || !/^\d{9}$/.test(doc.secuencia)) return false;
    seen.add(doc.tipo_documento);
  }
  return seen.has('factura');
}
function refreshReadiness(draft) {
  if (draft.identityVerified && draft.certificatePackage && draft.clientCheck === 'NEW' && draft.issuerAuthorization?.status === 'AUTHORIZED' && draft.sri && draft.contact?.emailVerified && draft.billing && draft.consent?.accepted) draft.status = DRAFT_STATUS.READY_TO_CREATE;
  else if (draft.status === DRAFT_STATUS.SRI_PENDING && !draft.sri) return;
  else if (draft.contact?.emailVerified) draft.status = DRAFT_STATUS.CONTACT_VERIFIED;
  else if (draft.identityVerified) draft.status = DRAFT_STATUS.IDENTITY_VERIFIED;
}
function normalized(value) { return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase(); }
function toBoolean(value) { return value === true || ['SI', 'SÍ', 'TRUE', '1'].includes(normalized(value)); }
function determineReconciliation(account, official) {
  if (!official || official.ruc !== account.ruc || !official.razonSocial || !official.regimen || !official.tipoContribuyente) return RECONCILIATION_OUTCOME.REQUIRES_MANUAL_REVIEW;
  if (normalized(official.estadoContribuyenteRuc) !== 'ACTIVO') return RECONCILIATION_OUTCOME.REJECTED_INACTIVE;
  const declared = account.taxData?.declared || {};
  const material = [
    ['regimen', official.regimen], ['tipoContribuyente', official.tipoContribuyente],
    ['obligadoLlevarContabilidad', official.obligadoLlevarContabilidad],
    ['agenteRetencion', toBoolean(official.agenteRetencion)],
    ['contribuyenteEspecial', toBoolean(official.contribuyenteEspecial)],
    ['granContribuyente', toBoolean(official.granContribuyente)],
  ];
  if (official.noResolucion !== undefined && normalized(account.taxData?.noResolucion) !== normalized(official.noResolucion)) return RECONCILIATION_OUTCOME.REQUIRES_USER_CONFIRMATION;
  if (material.some(([key, value]) => normalized(declared[key]) !== normalized(value))) return RECONCILIATION_OUTCOME.REQUIRES_USER_CONFIRMATION;
  return RECONCILIATION_OUTCOME.AUTO_RECONCILED;
}
