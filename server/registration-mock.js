// Alta de desarrollo: confirma el contrato sin persistir, enviar correo ni crear cuentas.
import { validarNoResolucion } from '../assets/utils/validators.js';
import { validarRUC } from '../assets/utils/ruc-validation.js';

const TIPOS_CON_RESOLUCION = new Set(['AGENTE_RETENCION', 'CONTRIBUYENTE_ESPECIAL', 'GRAN_CONTRIBUYENTE']);

export function createRegistrationMock({ enabled = false, nodeEnv = '' } = {}) {
  return (body, { local = false } = {}) => {
    if (!enabled || !local || nodeEnv !== 'development') {
      return { status: 503, body: { error: 'BACKEND_CONFIG_REQUIRED' } };
    }
    if (!body || Array.isArray(body) || typeof body !== 'object'
        || !body.facturacion || !Array.isArray(body.facturacion.documentos)
        || !body.facturacion.documentos.length) {
      return { status: 400, body: { error: 'INVALID_REQUEST' } };
    }
    if (typeof body.ruc !== 'string' || !validarRUC(body.ruc).valid
        || typeof body.firma?.ruc !== 'string' || !validarRUC(body.firma.ruc).valid
        || body.firma.ruc !== body.ruc) {
      return { status: 400, body: { error: 'INVALID_SIGNATURE_IDENTITY' } };
    }
    if (TIPOS_CON_RESOLUCION.has(body.tipoContribuyente) && !validarNoResolucion(body.noResolucion || '').valid) {
      return { status: 400, body: { error: 'INVALID_RESOLUTION' } };
    }
    if (body.sri?.source === 'MANUAL') {
      const declared = body.sri.declared;
      if (body.sri.status !== 'MANUAL_PENDING' || !declared || !declared.razonSocial
          || !declared.regimen || !declared.tipoContribuyente
          || !['SI', 'NO'].includes(declared.obligadoLlevarContabilidad)
          || !declared.actividadEconomicaPrincipal) {
        return { status: 400, body: { error: 'INVALID_MANUAL_SRI_DATA' } };
      }
    }
    return { status: 201, body: { ok: true, demo: true } };
  };
}
