// firma-validator.js — Validación REAL de archivos PKCS#12 (.p12/.pfx) en el navegador.
//
// Usa node-forge cargado bajo demanda desde un CDN. Forge se carga sólo cuando
// el usuario realmente sube una firma; no penaliza el bundle inicial.
//
// Lo que valida:
//   1. Que el archivo sea un PKCS#12 parseable.
//   2. Que la clave que ingresa el usuario descifre el almacén.
//   3. Que el certificado contenga un RUC ecuatoriano.
//   4. Que ese RUC coincida con el RUC del registro.
//   5. Que el certificado no esté caducado.
//
// IMPORTANTE: toda la validación es CLIENT-SIDE. La clave del usuario NUNCA
// abandona su navegador — sólo enviamos al backend un hash + los metadatos
// extraídos del certificado (titular, RUC, fecha de caducidad) cuando esto
// se integre con el endpoint real.

const FORGE_CDN = 'https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js';

let _forgePromise = null;

function loadForge() {
  if (typeof window !== 'undefined' && window.forge) return Promise.resolve(window.forge);
  if (_forgePromise) return _forgePromise;
  _forgePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = FORGE_CDN;
    script.async = true;
    script.onload = () => {
      if (window.forge) resolve(window.forge);
      else reject(new Error('forge no quedó disponible en window tras cargar el script'));
    };
    script.onerror = () => reject(new Error('No se pudo cargar la librería de validación de firma'));
    document.head.appendChild(script);
  });
  return _forgePromise;
}

/**
 * Lee el archivo como string binario (latin1), que es lo que forge espera para DER.
 */
function fileToBinaryString(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result;
      const bytes = new Uint8Array(buf);
      let bin = '';
      // Construir en bloques para no reventar el stack con archivos grandes
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      resolve(bin);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Extrae el RUC del subject del certificado.
 * En certificados ecuatorianos (Security Data, BCE, Anf, Uanataca) el RUC suele estar en:
 *   - subject.serialNumber (lo más común, con formato "0992703601001" o "C=EC...0992703601001")
 *   - subject.CN (si es nombre + RUC entre paréntesis)
 *   - extensión OID 2.5.4.5 (que mapea a serialNumber)
 *
 * También probamos con la cédula (10 dígitos): para persona natural, RUC = cédula + "001".
 */
function extraerRucDelCert(cert) {
  const attrs = {};
  cert.subject.attributes.forEach((a) => {
    if (a.shortName) attrs[a.shortName] = a.value;
    if (a.name) attrs[a.name] = a.value;
  });

  // Recolectar candidatos en orden de prioridad
  const candidatos = [
    attrs.serialNumber, attrs.SN, attrs.serialnumber,
    attrs.CN, attrs.commonName,
    attrs.OU, attrs.organizationalUnitName,
  ].filter(Boolean);

  for (const c of candidatos) {
    // Busca un RUC (13 dígitos terminando en 001) primero
    const ruc = String(c).match(/(\d{13})/);
    if (ruc) return { ruc: ruc[1], titular: attrs.CN || attrs.commonName || '' };
  }
  // Si no encontró RUC pero sí cédula (10 dígitos), construye RUC natural
  for (const c of candidatos) {
    const ced = String(c).match(/(?<!\d)(\d{10})(?!\d)/);
    if (ced) {
      return { ruc: ced[1] + '001', titular: attrs.CN || attrs.commonName || '' };
    }
  }
  return { ruc: null, titular: attrs.CN || attrs.commonName || '' };
}

/**
 * Devuelve el certificado "principal" (el del titular, no los intermedios de la cadena).
 * Heurística: tomamos el cert que NO sea CA y, si no hay marca, el último encontrado.
 */
function pickTitularCert(forge, p12) {
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  if (!certBags.length) return null;
  // Buscar el primer cert que NO sea CA
  for (const bag of certBags) {
    const c = bag.cert;
    const bcExt = c.getExtension('basicConstraints');
    if (!bcExt || !bcExt.cA) return c;
  }
  return certBags[0].cert;
}

/**
 * Valida un archivo PKCS#12 contra una clave y un RUC esperado.
 *
 * @param {File} file - Archivo .p12 o .pfx
 * @param {string} clave - Clave del archivo (no se envía a ningún lado)
 * @param {string} rucEsperado - RUC ingresado en el registro
 * @returns {Promise<{ valid: boolean, error?: string, reason?: string, ruc?: string,
 *                     titular?: string, fechaCaducidad?: Date }>}
 */
export async function validarFirmaP12(file, clave, rucEsperado) {
  if (!file) return { valid: false, error: 'NO_FILE', reason: 'Selecciona el archivo de la firma.' };
  if (!clave) return { valid: false, error: 'NO_PASSWORD', reason: 'Ingresa la clave de la firma.' };

  let forge;
  try {
    forge = await loadForge();
  } catch (err) {
    return { valid: false, error: 'FORGE_LOAD', reason: 'No pudimos cargar el módulo de validación. Revisa tu conexión.' };
  }

  let binary;
  try {
    binary = await fileToBinaryString(file);
  } catch {
    return { valid: false, error: 'READ_FAIL', reason: 'No se pudo leer el archivo de firma.' };
  }

  let p12Asn1;
  try {
    p12Asn1 = forge.asn1.fromDer(binary);
  } catch {
    return { valid: false, error: 'FORMATO_INVALIDO', reason: 'El archivo no parece ser un .p12 o .pfx válido. No podemos continuar.' };
  }

  // El raíz de un PKCS#12 es siempre un SEQUENCE (clase 0, tipo 16/SEQUENCE).
  // Si no lo es, no es un .p12 — evitamos confundirlo con "clave incorrecta".
  if (!p12Asn1 || p12Asn1.tagClass !== forge.asn1.Class.UNIVERSAL || p12Asn1.type !== forge.asn1.Type.SEQUENCE) {
    return { valid: false, error: 'FORMATO_INVALIDO', reason: 'El archivo no parece ser un .p12 o .pfx válido. No podemos continuar.' };
  }

  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, clave);
  } catch (e) {
    // El error real puede ser clave incorrecta o estructura inesperada.
    // Forge lanza distintos mensajes; si el mensaje habla de MAC/integridad → clave incorrecta.
    const msg = String(e?.message || e || '').toLowerCase();
    if (msg.includes('mac') || msg.includes('password') || msg.includes('integrity') || msg.includes('hmac')) {
      return { valid: false, error: 'CLAVE_INCORRECTA', reason: 'La clave de la firma es incorrecta. No podemos continuar.' };
    }
    // Si no es un error claro de clave, asumimos formato/estructura inválida.
    return { valid: false, error: 'FORMATO_INVALIDO', reason: 'No pudimos leer el archivo de firma. Verifica que sea un .p12/.pfx válido.' };
  }

  const cert = pickTitularCert(forge, p12);
  if (!cert) {
    return { valid: false, error: 'SIN_CERTIFICADO', reason: 'El archivo no contiene un certificado de titular. No podemos continuar.' };
  }

  const { ruc: rucCert, titular } = extraerRucDelCert(cert);
  const fechaCaducidad = cert.validity.notAfter;

  if (fechaCaducidad < new Date()) {
    return {
      valid: false,
      error: 'CADUCADA',
      reason: `La firma caducó el ${fechaCaducidad.toLocaleDateString('es-EC')}. No podemos continuar; debes renovarla con tu proveedor.`,
      fechaCaducidad, titular, ruc: rucCert,
    };
  }

  if (!rucCert) {
    return {
      valid: false,
      error: 'SIN_RUC',
      reason: 'No pudimos identificar el RUC en el certificado. No podemos continuar.',
      titular, fechaCaducidad,
    };
  }

  if (rucEsperado && rucCert !== rucEsperado) {
    return {
      valid: false,
      error: 'RUC_NO_COINCIDE',
      reason: `El RUC del certificado (${rucCert}) no coincide con el RUC del registro (${rucEsperado}). No podemos continuar.`,
      ruc: rucCert, titular, fechaCaducidad,
    };
  }

  return {
    valid: true,
    ruc: rucCert,
    titular,
    fechaCaducidad,
  };
}
