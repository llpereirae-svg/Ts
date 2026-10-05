import { CLIENTE_ESTADO, CLIENTE_ERROR, consultarCliente } from '../services/cliente-service.js?v=20261004a';
import { validarRUC } from './ruc-validation.js?v=20261004a';

// Solo memoria de la sesión: una consulta por firma validada, errores reintentables.
export function crearGateCliente(lookup = consultarCliente) {
  const sessions = new WeakMap();
  const vigente = (data, entry) => Boolean(entry && data.firma === entry.firma && data.firma?.valid && data.rucManual === entry.ruc && data.firma.ruc === entry.ruc);
  return {
    permite(data) { const entry = sessions.get(data); return vigente(data, entry) && entry.result?.status === CLIENTE_ESTADO.NEW_CLIENT; },
    async verificar(data, onState = () => {}) {
      let entry = sessions.get(data);
      if (!data.firma?.valid || !data.terminos || !validarRUC(data.firma.ruc || '').valid || data.rucManual !== data.firma.ruc) {
        data.clienteGate = { status: CLIENTE_ESTADO.IDLE };
        return data.clienteGate;
      }
      if (vigente(data, entry) && entry.pending && !entry.result) return entry.pending;
      if (vigente(data, entry) && [CLIENTE_ESTADO.NEW_CLIENT, CLIENTE_ESTADO.EXISTING_CLIENT].includes(entry.result?.status)) return entry.result;
      entry = { firma: data.firma, ruc: data.firma.ruc };
      sessions.set(data, entry);
      const publish = result => { data.clienteGate = result; onState(result); return result; };
      publish({ status: CLIENTE_ESTADO.CHECKING });
      entry.pending = (async () => {
        let result;
        try { result = await lookup(entry.ruc, { registrationId: data.registrationId }); } catch { result = null; }
        if (!vigente(data, entry) || sessions.get(data) !== entry) return { status: CLIENTE_ESTADO.IDLE };
        if (![CLIENTE_ESTADO.NEW_CLIENT, CLIENTE_ESTADO.EXISTING_CLIENT].includes(result?.status)) result = { status: CLIENTE_ESTADO.ERROR, message: CLIENTE_ERROR };
        entry.result = result;
        entry.pending = null;
        return publish(result);
      })();
      return entry.pending;
    }
  };
}
