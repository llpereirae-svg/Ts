/* pdf-parser.js — Extractor del Certificado de RUC (PDF emitido por el SRI).
   Usa pdf.js de Mozilla (lazy-load desde CDN). Toda la operación es client-side.

   El layout del certificado del SRI tiene labels en una línea y valores en la
   SIGUIENTE (no en formato "Label: valor"). Ejemplo real:

     Razón Social      Número RUC
     TRIBUTASOFT S.A.  0992703601001

     Representante legal
     PEREIRA ROBLES DANIEL FRANCISCO

     Provincia: GUAYAS  Cantón: DAULE  Parroquia: LA AURORA (SATÉLITE)

   Por eso parseamos por LÍNEAS y usamos la línea siguiente al label cuando
   hace falta. Las líneas tipo "Label: valor   Label: valor" sí se parsean
   inline con regex. */

const PDFJS_VERSION = '4.0.379';
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

let pdfjsPromise = null;
async function loadPdfJs() {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const mod = await import(PDFJS_CDN);
    mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return mod;
  })();
  return pdfjsPromise;
}

/**
 * Extrae texto del PDF reconstruyendo líneas por coordenada Y.
 * pdf.js no garantiza que content.items venga en orden de lectura
 * (puede venir en orden del stream del PDF). Por eso agrupamos por
 * coordenada Y con tolerancia, ordenamos los grupos de arriba a abajo,
 * y dentro de cada grupo ordenamos por X (izquierda a derecha).
 */
async function extractText(file) {
  const pdfjs = await loadPdfJs();
  const ab = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: ab }).promise;
  const partes = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Agrupar por Y con tolerancia ±2 px. Map: Yclave → array de items.
    const yGroups = new Map();
    for (const item of content.items) {
      if (!item || typeof item.str !== 'string') continue;
      const y = Math.round(item.transform[5]);
      // Buscar Y existente cercano
      let key = null;
      for (const existingY of yGroups.keys()) {
        if (Math.abs(existingY - y) <= 2) { key = existingY; break; }
      }
      if (key === null) key = y;
      if (!yGroups.has(key)) yGroups.set(key, []);
      yGroups.get(key).push(item);
    }

    // Ordenar grupos por Y descendente (en PDF, Y crece hacia arriba)
    const sortedYs = Array.from(yGroups.keys()).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const items = yGroups.get(y);
      // Dentro del grupo, ordenar por X ascendente
      items.sort((a, b) => (a.transform[4] || 0) - (b.transform[4] || 0));
      const linea = items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
      if (linea) partes.push(linea);
    }
  }
  return partes.join('\n');
}

function clean(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').trim();
}

/**
 * Devuelve la línea inmediatamente siguiente a la primera línea que matchea.
 * Útil cuando un label vive solo en su línea y el valor está en la línea siguiente.
 */
function lineAfter(lines, labelRegex) {
  const idx = lines.findIndex((l) => labelRegex.test(l));
  if (idx < 0 || idx + 1 >= lines.length) return '';
  return clean(lines[idx + 1]);
}

export async function parseCertificadoRUC(file) {
  if (!file) {
    return { valid: false, error: 'NO_FILE', reason: 'Selecciona el archivo del certificado.' };
  }
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
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
    return { valid: false, error: 'PDF_VACIO', reason: 'El PDF no contiene texto legible. Sube el certificado original (no foto ni escaneo).' };
  }

  const text = raw.replace(/[ \t]+/g, ' ');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // --- RUC: 13 dígitos terminados en 001 ---
  const rucMatch = text.match(/\b(\d{10}001)\b/);
  const ruc = rucMatch ? rucMatch[1] : '';

  // --- Detección del tipo (natural vs jurídica) ---
  // El cert del SRI siempre incluye una sección "Tipo" con el valor:
  //   - "PERSONAS NATURALES" → persona natural
  //   - "SOCIEDADES" → persona jurídica
  // Es el indicador más confiable porque no depende del layout del header.
  // Como respaldo, también miramos los labels "Razón Social" / "Apellidos y nombres".
  let esJuridica = false;
  if (/\bPERSONAS?\s*NATURALES?\b/i.test(text)) {
    esJuridica = false;
  } else if (/\bSOCIEDADES?\b/i.test(text)) {
    esJuridica = true;
  } else if (/raz[oó]n\s*social/i.test(text) && !/apellidos\s*y\s*nombres/i.test(text)) {
    esJuridica = true;
  } else if (/apellidos\s*y\s*nombres/i.test(text)) {
    esJuridica = false;
  }

  // --- Razón Social / Apellidos y nombres ---
  // Usamos el RUC como ANCLA. La línea que contiene el RUC tiene también el
  // nombre. Sacamos labels y RUC → lo que sobra es el nombre.
  let razonSocial = '';
  {
    const rucIdx = lines.findIndex((l) => /\b\d{10}001\b/.test(l));
    if (rucIdx >= 0) {
      const rucLine = lines[rucIdx];
      let valor = rucLine
        .replace(/raz[oó]n\s*social/gi, '')
        .replace(/apellidos\s*y\s*nombres/gi, '')
        .replace(/n[uú]mero\s*ruc/gi, '')
        .replace(/\b\d{10}001\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      razonSocial = valor;
    }
  }

  // --- Representante legal (solo si es jurídica) ---
  // Mismo problema potencial: label y valor pueden compartir línea.
  let repLegal = '';
  if (esJuridica) {
    // Buscar la línea que contiene "Representante legal"
    const idx = lines.findIndex((l) => /representante\s*legal/i.test(l));
    if (idx >= 0) {
      const line = lines[idx];
      // Si la línea tiene solo el label, valor = línea siguiente
      // Si tiene label + valor, sacar label
      const sinLabel = line.replace(/representante\s*legal/gi, '').trim();
      if (sinLabel.length > 2) {
        // Caso B: label+valor en misma línea
        repLegal = sinLabel;
      } else if (idx + 1 < lines.length) {
        // Caso A: valor en línea siguiente
        repLegal = clean(lines[idx + 1]);
      }
    }
  }

  // --- Nombre comercial ---
  // Algunos certs SRI lo traen, otros NO. Intentamos varias formas.
  let nombreComercial = '';
  {
    const inline = text.match(/nombre\s*comercial[\s\/]*:?\s*([^\n]+)/i);
    if (inline) nombreComercial = clean(inline[1]);
    if (!nombreComercial) nombreComercial = lineAfter(lines, /^nombre\s*comercial\s*$/i);
    // Si el "nombre comercial" salió igual a la razón social, lo descartamos
    if (nombreComercial && nombreComercial === razonSocial) nombreComercial = '';
  }

  // --- Ubicación geográfica: una sola línea con tres campos ---
  let provincia = '', canton = '', parroquia = '';
  {
    const m = text.match(/Provincia:\s*([A-ZÁÉÍÓÚÜÑ \-]+?)\s+Cant[oó]n:\s*([A-ZÁÉÍÓÚÜÑ \-]+?)\s+Parroquia:\s*([A-ZÁÉÍÓÚÜÑ \-\(\)\.,]+)/i);
    if (m) {
      provincia = clean(m[1]).toUpperCase();
      canton = clean(m[2]);
      parroquia = clean(m[3]);
    }
  }

  // --- Dirección: combinamos Calle + Número + Intersección ---
  let direccion = '';
  {
    const calle = (text.match(/Calle:\s*([^\n]+?)(?=\s+N[uú]mero:|\s+Intersecci[oó]n:|\s+Manzana:|\s+Referencia:|\n)/i) || [])[1];
    const numero = (text.match(/N[uú]mero:\s*([^\n]+?)(?=\s+Intersecci[oó]n:|\s+Manzana:|\s+Referencia:|\n)/i) || [])[1];
    const inter = (text.match(/Intersecci[oó]n:\s*([^\n]+?)(?=\s+Manzana:|\s+Referencia:|\n)/i) || [])[1];
    const ref = (text.match(/Referencia:\s*([^\n]+)/i) || [])[1];
    const parts = [];
    if (calle) parts.push(clean(calle));
    if (numero) parts.push(clean(numero));
    if (inter) parts.push(`y ${clean(inter)}`);
    direccion = parts.join(' ').trim();
    if (!direccion && ref) direccion = clean(ref);
  }

  // --- Régimen: aparece como valor solo en la grilla "Estado / Régimen / Artesano" ---
  let regimen = '';
  if (/\bR[Ií]MPE\s*[-–]?\s*EMPRENDEDOR\b/i.test(text)) regimen = 'RIMPE - EMPRENDEDOR';
  else if (/\bR[Ií]MPE\s*[-–]?\s*NEGOCIO\s*POPULAR\b/i.test(text)) regimen = 'RIMPE - NEGOCIO POPULAR';
  else if (/R[eé]gimen/i.test(text) && /\bGENERAL\b/.test(text)) regimen = 'GENERAL';

  // --- Tipo contribuyente: leemos los SI/NO POSICIONALMENTE ---
  // Layout del cert:
  //   Tipo                Agente de retención   Contribuyente especial
  //   SOCIEDADES          SI                    NO
  // Las celdas de la línea de valores corresponden a: (Tipo, AgenteRet, Especial).
  // Tomamos los dos últimos SI/NO de la línea de valores (agente, especial).
  // Obligado vive en otra sección.
  // Prioridad: Especial > Agente > Obligado > No Obligado.
  let tipoContribuyente = '';
  let flagsCert = { obligado: false, agente: false, especial: false };
  {
    const labelIdx = lines.findIndex((l) =>
      /agente\s*de\s*retenci[oó]n[\s\S]+contribuyente\s*especial/i.test(l)
    );
    if (labelIdx >= 0 && labelIdx + 1 < lines.length) {
      const valLine = lines[labelIdx + 1];
      const sino = valLine.match(/\b(SI|NO)\b/g) || [];
      if (sino.length >= 2) {
        flagsCert.agente = sino[sino.length - 2] === 'SI';
        flagsCert.especial = sino[sino.length - 1] === 'SI';
      }
    }
    // Obligado: puede estar inline en su línea o en la siguiente
    const oblIdx = lines.findIndex((l) =>
      /obligado\s*a\s*llevar\s*contabilidad/i.test(l)
    );
    if (oblIdx >= 0) {
      const labelLine = lines[oblIdx];
      const sinLabel = labelLine.replace(/obligado\s*a\s*llevar\s*contabilidad/gi, '').trim();
      if (/\bSI\b/i.test(sinLabel)) flagsCert.obligado = true;
      else if (oblIdx + 1 < lines.length && /^\s*SI\s*$/i.test(lines[oblIdx + 1])) {
        flagsCert.obligado = true;
      }
    }

    // Aplicar prioridad
    if (flagsCert.especial) tipoContribuyente = 'CONTRIBUYENTE_ESPECIAL';
    else if (flagsCert.agente) tipoContribuyente = 'AGENTE_RETENCION';
    else if (flagsCert.obligado) tipoContribuyente = 'OBLIGADO';
    else tipoContribuyente = 'NO_OBLIGADO';
  }

  // --- Estado del contribuyente ---
  let estado = '';
  {
    const m = text.match(/\bEstado\b[\s\S]{0,40}?\b(ACTIVO|INACTIVO|SUSPENDIDO|PASIVO)\b/i);
    if (m) estado = m[1].toUpperCase();
  }

  // --- Actividad económica principal: primera línea bajo "Actividades económicas" ---
  let actividad = '';
  {
    const idx = lines.findIndex((l) => /actividades\s*econ[oó]micas/i.test(l));
    if (idx >= 0 && idx + 1 < lines.length) {
      const linea = clean(lines[idx + 1]);
      // Las actividades suelen empezar con un guion-listado o código tipo G46... J62...
      actividad = linea.replace(/^[•·\-\s]+/, '').trim();
    }
  }

  // --- Email y celular (medios de contacto) ---
  let email = '', celular = '';
  {
    const e = text.match(/Email:\s*([^\s\n]+@[^\s\n]+)/i);
    if (e) email = clean(e[1]);
    const c = text.match(/Celular:\s*(\d[\d ]+\d)/i);
    if (c) celular = c[1].replace(/\s/g, '');
  }

  // --- Fecha y hora de emisión ---
  // Formato típico: "Fecha y hora de emisión: 15 de mayo de 2026 12:37"
  let fechaEmision = null;
  {
    const m = text.match(/Fecha\s*y\s*hora\s*de\s*emisi[oó]n:\s*(\d{1,2})\s*de\s*([a-záéíóú]+)\s*de\s*(\d{4})\s+(\d{1,2}):(\d{2})/i);
    if (m) {
      const dia = parseInt(m[1], 10);
      const mesNombre = m[2].toLowerCase();
      const anio = parseInt(m[3], 10);
      const hora = parseInt(m[4], 10);
      const min = parseInt(m[5], 10);
      const MESES = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
                      julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };
      const mesIdx = MESES[mesNombre];
      if (mesIdx != null) {
        fechaEmision = new Date(anio, mesIdx, dia, hora, min);
      }
    }
  }

  return {
    valid: !!ruc,
    error: ruc ? undefined : 'SIN_RUC',
    reason: ruc ? undefined : 'No encontramos el RUC en el PDF. ¿Es el Certificado de RUC del SRI?',
    ruc,
    razonSocial,
    nombreComercial,
    representanteLegal: repLegal,
    esJuridica,
    direccion,
    provincia,
    canton,
    parroquia,
    actividad,
    regimen,
    tipoContribuyente,
    flagsCert, // { obligado, agente, especial } — útil para decidir si se permite upgrade a GRAN_CONTRIBUYENTE
    estado,
    email,
    celular,
    fechaEmision,
    rawText: raw,
  };
}

/**
 * Verifica que la fecha de emisión del certificado sea reciente:
 * no más de 1 mes de antigüedad y no en el futuro.
 * @param {Date} fecha
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validarFechaEmisionCert(fecha) {
  if (!fecha || !(fecha instanceof Date) || isNaN(fecha.getTime())) {
    return { valid: false, reason: 'Estimado cliente, cargue su RUC actualizado.' };
  }
  const ahora = new Date();
  // No puede ser futura (con tolerancia de 1 día por timezone)
  if (fecha.getTime() > ahora.getTime() + 24 * 60 * 60 * 1000) {
    return { valid: false, reason: 'Estimado cliente, cargue su RUC actualizado.' };
  }
  // No mayor a 1 mes (30 días) de antigüedad
  const limiteAntiguedad = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (fecha < limiteAntiguedad) {
    return { valid: false, reason: 'Estimado cliente, cargue su RUC actualizado.' };
  }
  return { valid: true };
}
