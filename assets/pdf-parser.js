/* pdf-parser.js — Extractor del Certificado de RUC (PDF emitido por el SRI).
   Usa pdf.js de Mozilla (lazy-load desde CDN). Toda la operación es client-side:
   el PDF nunca sale del navegador del usuario.

   El layout típico del certificado de RUC del SRI Ecuador tiene secciones:
   - Razón Social / Nombres y Apellidos
   - Nombre Comercial
   - RUC (13 dígitos)
   - Domicilio Tributario (dirección)
   - Provincia / Cantón / Parroquia
   - Actividad Económica Principal
   - Régimen / Tipo Contribuyente
   - Estado del contribuyente

   Como cada versión del PDF cambia espacios/saltos de línea, usamos regex
   tolerantes a whitespace y normalizamos el texto antes de extraer. */

const PDFJS_VERSION = '4.0.379';
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

let pdfjsPromise = null;

async function loadPdfJs() {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const mod = await import(PDFJS_CDN);
    // mod.GlobalWorkerOptions vive en el namespace exportado
    mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return mod;
  })();
  return pdfjsPromise;
}

/**
 * Extrae texto plano de todas las páginas del PDF.
 * @param {File|Blob} file
 * @returns {Promise<string>}
 */
async function extractText(file) {
  const pdfjs = await loadPdfJs();
  const ab = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: ab }).promise;
  const partes = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // pdf.js devuelve items individuales con su posición; reconstruimos por línea
    // usando salto de línea cuando cambia significativamente la coordenada y.
    let lastY = null;
    let linea = '';
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 4) {
        partes.push(linea.trim());
        linea = '';
      }
      linea += item.str + ' ';
      lastY = y;
    }
    if (linea.trim()) partes.push(linea.trim());
  }
  return partes.filter(Boolean).join('\n');
}

/**
 * Normaliza un valor extraído: trim, colapsa whitespace, quita prefijos comunes.
 */
function clean(s) {
  if (!s) return '';
  return String(s)
    .replace(/\s+/g, ' ')
    .replace(/[“”"]/g, '')
    .trim();
}

/**
 * Busca el primer match de un patrón en el texto y devuelve el primer grupo.
 * Devuelve '' si no match.
 */
function match(text, regex) {
  const m = text.match(regex);
  return m ? clean(m[1]) : '';
}

/**
 * Parsea el certificado de RUC del SRI y devuelve los campos disponibles.
 * @param {File} file - PDF del Certificado de RUC
 * @returns {Promise<{
 *   valid: boolean,
 *   error?: string,
 *   reason?: string,
 *   ruc?: string,
 *   razonSocial?: string,
 *   nombreComercial?: string,
 *   direccion?: string,
 *   provincia?: string,
 *   canton?: string,
 *   parroquia?: string,
 *   actividad?: string,
 *   regimen?: string,
 *   tipoContribuyente?: string,
 *   estado?: string,
 *   rawText?: string
 * }>}
 */
export async function parseCertificadoRUC(file) {
  if (!file) {
    return { valid: false, error: 'NO_FILE', reason: 'Selecciona el archivo del certificado.' };
  }
  // Validar tipo y tamaño
  const tipoOk = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  if (!tipoOk) {
    return { valid: false, error: 'NO_PDF', reason: 'El archivo debe ser un PDF.' };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { valid: false, error: 'TAMANO', reason: 'El PDF es muy grande (máx. 5 MB).' };
  }

  let raw;
  try {
    raw = await extractText(file);
  } catch (err) {
    console.error('[pdf-parser] error al extraer texto', err);
    return { valid: false, error: 'PARSE_FAIL', reason: 'No pudimos leer el PDF. Asegúrate que sea el Certificado de RUC original del SRI.' };
  }

  if (!raw || raw.length < 100) {
    return { valid: false, error: 'PDF_VACIO', reason: 'El PDF no contiene texto legible. Sube el certificado original (no una foto escaneada).' };
  }

  // Normalizamos: pasamos a una sola línea separada por \n y quitamos exceso de spaces.
  const text = raw.replace(/[ \t]+/g, ' ');

  // RUC (13 dígitos terminados en 001 dentro del PDF)
  const rucMatch = text.match(/\b(\d{10}001)\b/);
  const ruc = rucMatch ? rucMatch[1] : '';

  // Razón Social / Nombres y Apellidos
  const razonSocial = match(text, /(?:raz[oó]n\s*social|nombres?\s*y\s*apellidos)[\s\/]*:?\s*([A-ZÁÉÍÓÚÜÑ0-9 \.\,\-&]+?)(?=\n|nombre\s*comercial|estado|clase|fecha|$)/i);

  // Nombre Comercial
  const nombreComercial = match(text, /nombre\s*comercial[\s\/]*:?\s*([A-ZÁÉÍÓÚÜÑ0-9 \.\,\-&]+?)(?=\n|raz[oó]n|estado|clase|domicilio|$)/i);

  // Dirección / Domicilio
  const direccion = match(text, /(?:domicilio\s*tributario|direcci[oó]n)[\s\/]*:?\s*([^\n]+?)(?=\n|provincia|cant[oó]n|parroquia|tel[eé]fono|$)/i);

  // Provincia
  const provincia = match(text, /provincia[\s\/]*:?\s*([A-ZÁÉÍÓÚÜÑ ]+?)(?=\n|cant[oó]n|parroquia|$)/i);

  // Cantón
  const canton = match(text, /cant[oó]n[\s\/]*:?\s*([A-ZÁÉÍÓÚÜÑ \-]+?)(?=\n|parroquia|provincia|$)/i);

  // Parroquia
  const parroquia = match(text, /parroquia[\s\/]*:?\s*([A-ZÁÉÍÓÚÜÑ \-]+?)(?=\n|cant[oó]n|$)/i);

  // Actividad económica
  const actividad = match(text, /actividad\s*econ[oó]mica\s*principal[\s\/]*:?\s*([^\n]+?)(?=\n|obligaciones|$)/i);

  // Régimen
  let regimen = '';
  if (/r[ií]mpe\s*-?\s*emprendedor/i.test(text)) regimen = 'RIMPE - EMPRENDEDOR';
  else if (/r[ií]mpe\s*-?\s*negocio\s*popular/i.test(text)) regimen = 'RIMPE - NEGOCIO POPULAR';
  else if (/r[eé]gimen\s*general|r[eé]gimen[\s\/]*:?\s*general/i.test(text)) regimen = 'GENERAL';

  // Tipo contribuyente — heurística
  let tipoContribuyente = '';
  if (/obligad[oa]\s*a\s*llevar\s*contabilidad/i.test(text)) tipoContribuyente = 'OBLIGADO';
  else if (/no\s*obligad[oa]\s*a\s*llevar\s*contabilidad/i.test(text)) tipoContribuyente = 'NO_OBLIGADO';
  else if (/agente\s*de\s*retenci[oó]n/i.test(text)) tipoContribuyente = 'AGENTE_RETENCION';
  else if (/contribuyente\s*especial/i.test(text)) tipoContribuyente = 'CONTRIBUYENTE_ESPECIAL';
  else if (/gran\s*contribuyente/i.test(text)) tipoContribuyente = 'GRAN_CONTRIBUYENTE';

  // Estado
  const estado = match(text, /estado[\s\/]*:?\s*([A-ZÁÉÍÓÚÜÑ ]+?)(?=\n|clase|fecha|$)/i);

  return {
    valid: !!ruc, // si no encontramos el RUC, es muy probable que no sea el PDF correcto
    error: ruc ? undefined : 'SIN_RUC',
    reason: ruc ? undefined : 'No encontramos un RUC en el PDF. ¿Es el Certificado de RUC del SRI?',
    ruc,
    razonSocial,
    nombreComercial,
    direccion,
    provincia: provincia ? provincia.toUpperCase().trim() : '',
    canton,
    parroquia,
    actividad,
    regimen,
    tipoContribuyente,
    estado,
    rawText: raw, // para debug
  };
}
