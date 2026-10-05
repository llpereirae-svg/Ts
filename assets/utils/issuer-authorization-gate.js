import {
  consultarAutorizacionEmisor,
  ISSUER_AUTHORIZATION_STATE,
} from '../services/issuer-authorization-service.js?v=20261005p';

export function crearGateAutorizacionEmisor(lookup = consultarAutorizacionEmisor) {
  const sessions = new WeakMap();
  const vigente = (data, entry) => Boolean(entry
    && data.registrationId === entry.registrationId
    && data.firma === entry.firma
    && data.firma?.valid);
  return {
    permite(data) {
      const entry = sessions.get(data);
      return vigente(data, entry) && entry.result?.status === ISSUER_AUTHORIZATION_STATE.AUTHORIZED;
    },
    async verificar(data, onState = () => {}) {
      let entry = sessions.get(data);
      if (!data.registrationId || !data.firma?.valid) {
        data.issuerAuthorization = { status: ISSUER_AUTHORIZATION_STATE.IDLE };
        return data.issuerAuthorization;
      }
      if (vigente(data, entry) && entry.pending && !entry.result) return entry.pending;
      // Solo la autorización positiva habilita y se reutiliza en la sesión.
      // NOT_AUTHORIZED debe poder consultarse otra vez desde la acción guiada.
      if (vigente(data, entry) && entry.result?.status === ISSUER_AUTHORIZATION_STATE.AUTHORIZED) return entry.result;
      entry = { registrationId: data.registrationId, firma: data.firma };
      sessions.set(data, entry);
      const publish = result => { data.issuerAuthorization = result; onState(result); return result; };
      publish({ status: ISSUER_AUTHORIZATION_STATE.CHECKING });
      entry.pending = (async () => {
        let result;
        try { result = await lookup(entry.registrationId); } catch { result = null; }
        if (!vigente(data, entry) || sessions.get(data) !== entry) return { status: ISSUER_AUTHORIZATION_STATE.IDLE };
        if (![ISSUER_AUTHORIZATION_STATE.AUTHORIZED, ISSUER_AUTHORIZATION_STATE.NOT_AUTHORIZED].includes(result?.status)) {
          result = { status: ISSUER_AUTHORIZATION_STATE.ERROR };
        }
        entry.result = result;
        entry.pending = null;
        return publish(result);
      })();
      return entry.pending;
    },
  };
}
