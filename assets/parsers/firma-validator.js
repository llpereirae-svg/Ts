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

// Prefijo de los OIDs propietarios de Security Data (ecuatoriano).
// Cada certificado guarda los datos personales en extensiones bajo:
//   1.3.6.1.4.1.37746.3.<N>
// donde N indica qué campo:
//   .1  = cédula del firmante               .8  = celular
//   .2  = nombres del firmante              .9  = ciudad (cantón)
//   .3  = primer apellido                   .10 = razón social (SOLO jurídicas)
//   .4  = segundo apellido                  .11 = RUC del titular
//   .5  = cargo (SOLO jurídicas)            .12 = país
//   .7  = dirección                         .30 = profesión (natural)
const SD_OID_PREFIX = '1.3.6.1.4.1.37746.3.';

// Convierte un "binary string" de node-forge (cada char = un byte 0-255)
// a una cadena UTF-8 correctamente decodificada. Necesario para tildes/ñ.
function bytesToUtf8(binStr) {
  if (typeof binStr !== 'string') return '';
  const arr = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) arr[i] = binStr.charCodeAt(i) & 0xff;
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(arr);
  } catch {
    return binStr;
  }
}

/**
 * Lee las extensiones propietarias de Security Data del certificado.
 * Retorna un objeto { '1': cedula, '2': nombres, ..., '11': ruc, '10': razonSocial?, ... }
 */
function readSecurityDataExtensions(forge, cert) {
  const data = {};
  if (!cert.extensions) return data;
  for (const e of cert.extensions) {
    if (!e || !e.id || !e.id.startsWith(SD_OID_PREFIX)) continue;
    const suffix = e.id.substring(SD_OID_PREFIX.length);
    // El valor de la extensión es DER (UTF8String / PrintableString).
    // Intentar parsearlo con node-forge.
    try {
      const asn1 = forge.asn1.fromDer(e.value);
      if (asn1 && typeof asn1.value === 'string') {
        data[suffix] = bytesToUtf8(asn1.value);
        continue;
      }
    } catch { /* fallthrough al fallback */ }
    // Fallback: saltar manualmente tag (1 byte) + length (1 byte si < 128).
    if (typeof e.value === 'string' && e.value.length > 2) {
      data[suffix] = bytesToUtf8(e.value.substring(2));
    }
  }
  return data;
}

/**
 * Extrae el RUC y datos del certificado.
 *
 * Estrategia (probada con certs reales de Security Data — natural y jurídica):
 *   1) Leer extensión OID 1.3.6.1.4.1.37746.3.11 → ese es el RUC del titular,
 *      sea persona natural o empresa. Fuente única de verdad para Security Data.
 *   2) Si existe OID .10 (razón social) → es persona jurídica.
 *      Reportar titular = razón social, y los datos del rep legal por separado.
 *   3) Si no hay OID .11 (otros emisores: BCE, Anf, Uanataca): barrer todas las
 *      extensiones buscando un valor de 13 dígitos.
 *   4) Último recurso: subject del certificado (comportamiento legacy con CI+001).
 *      Marcado como heurística para que la UI muestre advertencia.
 */
function extraerDatosDelCert(forge, cert) {
  const subject = {};
  cert.subject.attributes.forEach((a) => {
    if (a.shortName) subject[a.shortName] = a.value;
    if (a.name) subject[a.name] = a.value;
  });

  const sd = readSecurityDataExtensions(forge, cert);

  let ruc = sd['11'] || null;
  const razonSocial = sd['10'] || null;
  const esJuridica = !!razonSocial;
  let esHeuristica = false;

  // Paso 3: si no es Security Data, barrer todas las extensiones buscando 13 dígitos
  if (!ruc) {
    for (const k in sd) {
      const v = sd[k];
      if (typeof v === 'string' && /^\d{13}$/.test(v)) { ruc = v; break; }
    }
  }

  // Paso 4: fallback al subject (legacy)
  if (!ruc) {
    const candidatos = [
      subject.serialNumber, subject.SN, subject.serialnumber,
      subject.CN, subject.commonName,
      subject.OU, subject.organizationalUnitName,
    ].filter(Boolean);
    for (const c of candidatos) {
      const m = String(c).match(/(\d{13})/);
      if (m) { ruc = m[1]; break; }
    }
    if (!ruc) {
      for (const c of candidatos) {
        const m = String(c).match(/(?<!\d)(\d{10})(?!\d)/);
        if (m) {
          ruc = m[1] + '001';
          esHeuristica = true;
          break;
        }
      }
    }
  }

  // Titular a mostrar: razón social si es jurídica, CN si es natural
  const titularNombre = esJuridica
    ? razonSocial
    : (subject.CN || subject.commonName || '');

  // Datos del representante legal (sólo aplica a jurídicas)
  const repLegal = (esJuridica && (sd['1'] || sd['2'])) ? {
    cedula: sd['1'] || null,
    nombres: sd['2'] || null,
    apellido1: sd['3'] || null,
    apellido2: sd['4'] || null,
    nombreCompleto: [sd['2'], sd['3'], sd['4']].filter(Boolean).join(' '),
    cargo: sd['5'] || null,
  } : null;

  return {
    ruc,
    titular: titularNombre,
    esJuridica,
    razonSocial,
    repLegal,
    esHeuristica,
    // Datos extra que pueden servir para autollenar el formulario más adelante.
    datosExtra: {
      ciudad: sd['9'] || null,
      direccion: sd['7'] || null,
      celular: sd['8'] || null,
      pais: sd['12'] || null,
      profesion: sd['30'] || null,
    },
  };
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

  const datos = extraerDatosDelCert(forge, cert);
  const { ruc: rucCert, titular, esJuridica, razonSocial, repLegal, esHeuristica, datosExtra } = datos;
  const fechaCaducidad = cert.validity.notAfter;

  if (fechaCaducidad < new Date()) {
    return {
      valid: false,
      error: 'CADUCADA',
      reason: `La firma caducó el ${fechaCaducidad.toLocaleDateString('es-EC')}. No podemos continuar; debe renovarla con su proveedor.`,
      fechaCaducidad, titular, ruc: rucCert, esJuridica, razonSocial, repLegal,
    };
  }

  if (!rucCert) {
    return {
      valid: false,
      error: 'SIN_RUC',
      reason: 'No pudimos identificar el RUC en el certificado. No podemos continuar.',
      titular, fechaCaducidad, esJuridica, razonSocial, repLegal,
    };
  }

  if (rucEsperado && rucCert !== rucEsperado) {
    return {
      valid: false,
      error: 'RUC_NO_COINCIDE',
      reason: `El RUC del certificado (${rucCert}) no coincide con el RUC del registro (${rucEsperado}). No podemos continuar.`,
      ruc: rucCert, titular, fechaCaducidad, esJuridica, razonSocial, repLegal,
    };
  }

  return {
    valid: true,
    ruc: rucCert,
    titular,
    fechaCaducidad,
    esJuridica,
    razonSocial,
    repLegal,
    esHeuristica,
    datosExtra,
  };
}
