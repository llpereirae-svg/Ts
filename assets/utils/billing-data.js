export const DOCUMENTOS = Object.freeze({ factura: 'Factura', guia: 'Guía de remisión', nc: 'Nota de crédito', nd: 'Nota de débito', liquidacion: 'Liquidación de compra', retencion: 'Retención' });
export const TIPOS_DOCUMENTO = Object.keys(DOCUMENTOS);
const inicial = () => ({ establecimiento: '001', punto_emision: '002', secuencia: '000000001' });
const inicialAdicional = () => ({ establecimiento: '001', punto_emision: '001', secuencia: '000000001' });
export function normalizarSecuencia(value) {
  const raw = String(value ?? '');
  return /^\d{1,9}$/.test(raw) ? raw.padStart(9, '0') : raw;
}

export function normalizarSecuencias(data) {
  for (const tipo of TIPOS_DOCUMENTO) {
    const doc = data.documentosFacturacion?.[tipo];
    if (doc) doc.secuencia = normalizarSecuencia(doc.secuencia);
  }
  sincronizarCompatibilidad(data);
}

export function iniciarFacturacion(data) {
  // Registro V2 simplificado: el alta configura únicamente Factura. Los demás
  // documentos y puntos se administran posteriormente desde el perfil.
  data.documentosFacturacion ??= { factura: {
    establecimiento: data.codEstablecimiento ?? '001', punto_emision: data.codPunto ?? '002',
    secuencia: normalizarSecuencia(data.secuencias?.factura ?? '000000001')
  } };
  data.documentosFacturacion.factura ??= inicial();
  data.documentosFacturacion = { factura: data.documentosFacturacion.factura };
  data.modoFacturacion = 'nuevo';
  data._facturacionElegida = true;
  sincronizarCompatibilidad(data);
}
export function sincronizarCompatibilidad(data) {
  const factura = data.documentosFacturacion.factura;
  data.codEstablecimiento = factura.establecimiento;
  data.codPunto = factura.punto_emision;
  data.nombrePunto ??= 'Electrónicas';
  data.secuencias = Object.fromEntries(TIPOS_DOCUMENTO.filter(tipo => data.documentosFacturacion[tipo]).map(tipo => [tipo, data.documentosFacturacion[tipo].secuencia]));
}
export function elegirFacturacion(data, modo) {
  iniciarFacturacion(data);
}
export function seleccionarDocumentos(data, tipos) {
  iniciarFacturacion(data);
  data.documentosFacturacion = { factura: data.documentosFacturacion.factura };
  sincronizarCompatibilidad(data);
}
export function erroresFacturacion(data) {
  const errors = {};
  for (const tipo of ['factura']) {
    const doc = data.documentosFacturacion?.[tipo];
    for (const key of ['establecimiento', 'punto_emision']) {
      if (!/^\d{3}$/.test(doc?.[key] ?? '')) errors[`${tipo}-${key}`] = 'Debe tener 3 dígitos.';
      else if (doc[key] === '000') errors[`${tipo}-${key}`] = 'No puede ser 000.';
    }
    if (!/^\d{1,9}$/.test(doc?.secuencia ?? '')) errors[`${tipo}-secuencia`] = 'Ingresa entre 1 y 9 dígitos.';
  }
  return errors;
}
export function construirFacturacion(data) {
  iniciarFacturacion(data);
  return { modo: 'nuevo', documentos: TIPOS_DOCUMENTO.map(tipo => {
    // La pantalla configura solo Factura. El contrato histórico del API exige
    // inicializar también los otros cinco documentos con 001-001-000000001.
    const doc = tipo === 'factura' ? data.documentosFacturacion.factura : inicialAdicional();
    return { tipo_documento: tipo, establecimiento: doc.establecimiento, punto_emision: doc.punto_emision, secuencia: normalizarSecuencia(doc.secuencia) };
  }) };
}
