export const DOCUMENTOS = Object.freeze({ factura: 'Factura', guia: 'Guía de remisión', nc: 'Nota de crédito', nd: 'Nota de débito', liquidacion: 'Liquidación de compra', retencion: 'Retención' });
export const TIPOS_DOCUMENTO = Object.keys(DOCUMENTOS);
const inicial = () => ({ establecimiento: '001', punto_emision: '001', secuencia: '000000001' });
const copiar = value => structuredClone(value);

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
  // Migrar solo Factura: las antiguas secuencias automáticas no implican selección.
  data.documentosFacturacion ??= { factura: {
    establecimiento: data.codEstablecimiento ?? '001', punto_emision: data.codPunto ?? '001',
    secuencia: data.secuencias?.factura ?? '000000001'
  } };
  data.documentosFacturacion.factura ??= inicial();
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
  if (!['nuevo', 'continuar'].includes(modo)) return;
  iniciarFacturacion(data);
  if (data._facturacionElegida && data.modoFacturacion === modo) return;
  if (modo === 'nuevo') {
    if (data.modoFacturacion === 'continuar') data._facturacionBorradorContinuar = { factura: copiar(data.documentosFacturacion.factura) };
    data.documentosFacturacion = { factura: inicial() };
  } else if (data._facturacionBorradorContinuar) {
    data.documentosFacturacion = { factura: copiar(data._facturacionBorradorContinuar.factura) };
  }
  // Cada cambio de ruta exige volver a seleccionar los adicionales, sin residuos.
  data.documentosFacturacion = { factura: data.documentosFacturacion.factura };
  if (data._facturacionBorradorContinuar) data._facturacionBorradorContinuar = { factura: data._facturacionBorradorContinuar.factura };
  data.modoFacturacion = modo;
  data._facturacionElegida = true;
  sincronizarCompatibilidad(data);
}
export function seleccionarDocumentos(data, tipos) {
  iniciarFacturacion(data);
  const seleccionados = new Set(['factura', ...tipos]);
  for (const tipo of TIPOS_DOCUMENTO) {
    if (seleccionados.has(tipo)) data.documentosFacturacion[tipo] ??= inicial();
    else {
      delete data.documentosFacturacion[tipo];
      if (data._facturacionBorradorContinuar) delete data._facturacionBorradorContinuar[tipo];
    }
  }
  sincronizarCompatibilidad(data);
}
export function erroresFacturacion(data) {
  const errors = {};
  if (!data._facturacionElegida || !['nuevo', 'continuar'].includes(data.modoFacturacion)) return { modo: 'Selecciona cómo vas a iniciar la facturación.' };
  for (const tipo of TIPOS_DOCUMENTO) {
    const doc = data.documentosFacturacion?.[tipo];
    if (!doc && tipo !== 'factura') continue;
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
  const tipos = data.modoFacturacion === 'nuevo'
    ? TIPOS_DOCUMENTO
    : TIPOS_DOCUMENTO.filter(tipo => data.documentosFacturacion[tipo]);
  return { modo: data.modoFacturacion, documentos: tipos.map(tipo => {
    // En el camino nuevo, los documentos no visibles nacen con los defaults
    // aprobados; nunca reutilizan valores residuales de la ruta "continuar".
    const doc = tipo === 'factura' || data.modoFacturacion !== 'nuevo'
      ? data.documentosFacturacion[tipo]
      : inicial();
    return { tipo_documento: tipo, establecimiento: doc.establecimiento, punto_emision: doc.punto_emision, secuencia: normalizarSecuencia(doc.secuencia) };
  }) };
}
