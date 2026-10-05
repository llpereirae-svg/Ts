import { verificarAutorizacionFacturacion } from './draft-service.js?v=20261004a';

export const ISSUER_AUTHORIZATION_STATE = Object.freeze({
  IDLE: 'IDLE',
  CHECKING: 'CHECKING',
  AUTHORIZED: 'AUTHORIZED',
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  ERROR: 'ERROR',
});

export async function consultarAutorizacionEmisor(registrationId) {
  if (!registrationId) return { status: ISSUER_AUTHORIZATION_STATE.ERROR };
  try {
    const result = await verificarAutorizacionFacturacion(registrationId);
    if (result?.authorized === true && result?.status === 'AUTHORIZED') {
      return {
        status: ISSUER_AUTHORIZATION_STATE.AUTHORIZED,
        authorizationDate: typeof result.authorizationDate === 'string' ? result.authorizationDate : null,
      };
    }
    if (result?.authorized === false && result?.status === 'NOT_AUTHORIZED') {
      return {
        status: ISSUER_AUTHORIZATION_STATE.NOT_AUTHORIZED,
        code: result.code || 'ISSUER_AUTHORIZATION_REQUIRED',
      };
    }
    return { status: ISSUER_AUTHORIZATION_STATE.ERROR };
  } catch {
    return { status: ISSUER_AUTHORIZATION_STATE.ERROR };
  }
}
