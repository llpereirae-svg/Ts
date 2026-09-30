// Valores internos y etiquetas del formulario tributario original.
export const LABEL_REGIMEN = Object.freeze({
  GENERAL: 'GENERAL',
  'RIMPE - EMPRENDEDOR': 'RIMPE - Emprendedor',
  'RIMPE - NEGOCIO POPULAR': 'RIMPE - Negocio Popular',
});
export const LABEL_TIPO = Object.freeze({
  NO_OBLIGADO: 'No Obligado a Llevar Contabilidad',
  OBLIGADO: 'Obligado a Llevar Contabilidad',
  AGENTE_RETENCION: 'Agente de Retención',
  CONTRIBUYENTE_ESPECIAL: 'Contribuyente Especial',
  GRAN_CONTRIBUYENTE: 'Gran Contribuyente',
});
export const LABEL_OBLIGADO = Object.freeze({ SI: 'Sí', NO: 'No' });
export const TIPOS_CON_RESOLUCION = new Set(['AGENTE_RETENCION', 'CONTRIBUYENTE_ESPECIAL', 'GRAN_CONTRIBUYENTE']);
export function sincronizarResolucion(data) {
  const required = TIPOS_CON_RESOLUCION.has(data.tipoContribuyente);
  if (!required) data.noResolucion = '';
  return required;
}
const normalize = (value) => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const yes = (value) => value === true || ['SI', 'S', 'TRUE', '1'].includes(normalize(value));
const no = (value) => value === false || ['NO', 'N', 'FALSE', '0'].includes(normalize(value));

export function valorUtil(value) {
  const text = String(value ?? '').trim();
  return /^(?:null|undefined|n\/?a|no aplica|no tiene|sin nombre comercial|-|—)$/i.test(text) ? '' : text;
}

export function mapearRegimen(value, categoria = '') {
  const complete = normalize(value) === 'RIMPE' ? `RIMPE ${categoria}` : value;
  const normalized = normalize(complete).replace(/\s*[-–—]\s*/g, ' ').replace(/\s+/g, ' ');
  return ({ GENERAL: 'GENERAL', 'REGIMEN GENERAL': 'GENERAL', 'RIMPE EMPRENDEDOR': 'RIMPE - EMPRENDEDOR', 'RIMPE NEGOCIO POPULAR': 'RIMPE - NEGOCIO POPULAR' })[normalized] || '';
}

export function mapearTipo(sri) {
  // Misma precedencia del parser del certificado; Gran requiere una bandera explícita.
  if (yes(sri.granContribuyente)) return 'GRAN_CONTRIBUYENTE';
  if (yes(sri.contribuyenteEspecial)) return 'CONTRIBUYENTE_ESPECIAL';
  if (yes(sri.agenteRetencion)) return 'AGENTE_RETENCION';
  if (yes(sri.obligadoLlevarContabilidad)) return 'OBLIGADO';
  if (no(sri.obligadoLlevarContabilidad)) return 'NO_OBLIGADO';
  return ''; // SOCIEDADES / PERSONAS NATURALES no equivalen al tipo funcional.
}

export function aplicarDatosSri(data, sri, rucConsultado) {
  data._sriRuc = rucConsultado;
  data.sriSource = 'SRI';
  data.sriTechnicalStatus = 'OK';
  data.estadoContribuyenteRuc = sri.estadoContribuyenteRuc;
  data.razonSocial = sri.razonSocial || data.razonSocial;
  data.nombreComercial = valorUtil(sri.nombreComercial);
  data._nombreComercialDisponible = Boolean(data.nombreComercial);
  data.actividadEconomica = sri.actividadEconomicaPrincipal || '';
  data.obligadoLlevarContabilidad = yes(sri.obligadoLlevarContabilidad) ? 'SI' : no(sri.obligadoLlevarContabilidad) ? 'NO' : '';
  data.regimen = mapearRegimen(sri.regimen, sri.categoria);
  data._regimenDetectado = data.regimen;
  data.tipoContribuyente = mapearTipo(sri);
  data._tipoDetectado = data.tipoContribuyente;
  sincronizarResolucion(data);
  delete data.representanteLegal;
  delete data.sriRepresentantesLegales;
  delete data.representanteLegalDeclarado;
  data.sriAdvertencias = sri.advertencias || [];
  data.sriValidacionPendiente = false;
}

export function estadoSriPermiteContinuar(data) {
  if (data.sriStatus === 'MANUAL_PENDING' && data.sriSource === 'MANUAL_ENTRY') return datosSriManualesCompletos(data);
  return data.sriStatus === 'OK' && data._sriRuc === data.rucManual && normalize(data.estadoContribuyenteRuc) === 'ACTIVO';
}

export function esModoManualSri(data) {
  return data?.sriStatus === 'MANUAL_PENDING' && data?.sriSource === 'MANUAL_ENTRY';
}

export function datosSriManualesCompletos(data) {
  if (!esModoManualSri(data) || data._sriRuc !== data.rucManual) return false;
  if (!String(data.razonSocial || '').trim() || !String(data.actividadEconomica || '').trim()) return false;
  if (!Object.hasOwn(LABEL_REGIMEN, data.regimen) || !Object.hasOwn(LABEL_TIPO, data.tipoContribuyente)) return false;
  if (!Object.hasOwn(LABEL_OBLIGADO, data.obligadoLlevarContabilidad)) return false;
  if (data.firma?.esJuridica && !String(data.representanteLegalDeclarado || '').trim()) return false;
  return true;
}

export function activarCapturaSriManual(data, { attempts = 3, errorCode = 'SRI_UNAVAILABLE', attemptedAt = new Date().toISOString() } = {}) {
  Object.assign(data, {
    sriStatus: 'MANUAL_PENDING',
    sriSource: 'MANUAL_ENTRY',
    sriTechnicalStatus: 'UNAVAILABLE',
    sriAttempts: attempts,
    sriLastAttemptAt: attemptedAt,
    sriErrorCode: errorCode,
    sriValidacionPendiente: true,
    _sriRuc: data.rucManual,
    estadoContribuyenteRuc: 'DECLARADO',
    _regimenDetectado: '',
    _tipoDetectado: '',
    _nombreComercialDisponible: true,
  });
}
export function correoVerificado(data) {
  return Boolean(data.tokenEmailOk && data._verifiedEmail === String(data.email || '').trim().toLowerCase());
}
export function invalidarCorreo(data) {
  data.tokenEmailOk = false;
  data._verifiedEmail = '';
  data._emailCodeSent = false;
  data._emailToken = null;
  data._emailTokenFor = '';
  data._emailTokenExpires = null;
  data._emailResendAfter = 0;
}
