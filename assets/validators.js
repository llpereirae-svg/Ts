// validators.js — Validaciones para el registro de TributaSoft
// Todas las funciones son puras: reciben un valor y devuelven { valid, ...detalles }.
// No tocan el DOM. La UI consume estos resultados.

const PROVINCIAS_VALIDAS = Array.from({ length: 24 }, (_, i) => i + 1);

/**
 * Validación de RUC ecuatoriano:
 *   - 13 dígitos numéricos.
 *   - Provincia (dígitos 1-2) entre 01 y 24.
 *   - Tipo (dígito 3): 0-5 persona natural, 6 pública, 9 jurídica.
 *   - Dígito verificador según algoritmo oficial del SRI (3 variantes).
 *   - Últimos 3 dígitos siempre "001" (matriz del contribuyente).
 *     Establecimiento y punto de emisión son parámetros separados que viven
 *     en la configuración de facturación, NO en la estructura del RUC.
 *
 * @param {string} ruc - 13 dígitos numéricos
 * @returns {{ valid: boolean, type?: 'natural'|'publica'|'juridica', reason?: string }}
 */
export function validarRUC(ruc) {
  if (typeof ruc !== 'string') return { valid: false, reason: 'RUC debe ser texto.' };
  const trimmed = ruc.trim();

  if (!/^\d{13}$/.test(trimmed)) {
    return { valid: false, reason: 'El RUC debe tener exactamente 13 dígitos numéricos.' };
  }

  const provincia = parseInt(trimmed.substring(0, 2), 10);
  if (!PROVINCIAS_VALIDAS.includes(provincia)) {
    return { valid: false, reason: 'Los dos primeros dígitos deben corresponder a una provincia válida (01-24).' };
  }

  const tercerDigito = parseInt(trimmed.charAt(2), 10);
  // Regla TributaSoft: el RUC del contribuyente termina siempre en 001 (matriz).
  // Establecimiento y punto de emisión son parámetros separados que NO viven en el RUC.
  if (trimmed.substring(10, 13) !== '001') {
    return { valid: false, reason: 'El RUC debe terminar en 001 (identifica al contribuyente).' };
  }

  let type, checkOk;
  if (tercerDigito >= 0 && tercerDigito <= 5) {
    type = 'natural';
    checkOk = verificarCedulaONatural(trimmed.substring(0, 10));
  } else if (tercerDigito === 6) {
    type = 'publica';
    checkOk = verificarPublica(trimmed);
  } else if (tercerDigito === 9) {
    type = 'juridica';
    checkOk = verificarJuridica(trimmed);
  } else {
    return { valid: false, reason: 'El tercer dígito (7 u 8) no corresponde a un tipo de RUC válido.' };
  }

  if (!checkOk) {
    return { valid: false, type, reason: 'El dígito verificador del RUC no es válido.' };
  }

  return { valid: true, type };
}

// Persona natural: usa el mismo algoritmo de la cédula sobre los primeros 10 dígitos.
function verificarCedulaONatural(diez) {
  const coef = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let producto = parseInt(diez.charAt(i), 10) * coef[i];
    if (producto >= 10) producto -= 9;
    suma += producto;
  }
  const verificador = (suma % 10 === 0) ? 0 : 10 - (suma % 10);
  return verificador === parseInt(diez.charAt(9), 10);
}

// Sociedad pública: coeficientes [3,2,7,6,5,4,3,2] sobre los primeros 8 dígitos,
// módulo 11. Dígito verificador es el 9º.
function verificarPublica(ruc) {
  const coef = [3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 8; i++) {
    suma += parseInt(ruc.charAt(i), 10) * coef[i];
  }
  const residuo = suma % 11;
  const verificador = residuo === 0 ? 0 : 11 - residuo;
  if (verificador === 10) return false;
  return verificador === parseInt(ruc.charAt(8), 10);
}

// Sociedad jurídica / extranjero: coeficientes [4,3,2,7,6,5,4,3,2] sobre los primeros 9,
// módulo 11. Dígito verificador es el 10º.
function verificarJuridica(ruc) {
  const coef = [4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    suma += parseInt(ruc.charAt(i), 10) * coef[i];
  }
  const residuo = suma % 11;
  const verificador = residuo === 0 ? 0 : 11 - residuo;
  if (verificador === 10) return false;
  return verificador === parseInt(ruc.charAt(9), 10);
}

/**
 * Normaliza y valida celular Ecuador.
 * Acepta: 09XXXXXXXX, +5939XXXXXXXX, 5939XXXXXXXX, 09 XXXX-XXXX, etc.
 * Devuelve el número normalizado a 10 dígitos: 09XXXXXXXX.
 */
export function validarCelular(input) {
  if (typeof input !== 'string') return { valid: false, reason: 'Celular inválido.' };
  let limpio = input.replace(/[\s\-()]/g, '');
  if (limpio.startsWith('+593')) limpio = '0' + limpio.substring(4);
  else if (limpio.startsWith('593')) limpio = '0' + limpio.substring(3);

  if (!/^09\d{8}$/.test(limpio)) {
    return { valid: false, reason: 'Debe ser un celular ecuatoriano de 10 dígitos que empiece con 09.' };
  }
  return { valid: true, normalizado: limpio };
}

/**
 * Email: regex razonable (RFC-lite). Normaliza a minúsculas.
 */
export function validarEmail(email) {
  if (typeof email !== 'string') return { valid: false, reason: 'Email inválido.' };
  const trimmed = email.trim().toLowerCase();
  const regex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  if (!regex.test(trimmed)) {
    return { valid: false, reason: 'Formato de email inválido.' };
  }
  return { valid: true, normalizado: trimmed };
}

/**
 * Clave: ≥8 chars, mayúscula, minúscula, número, símbolo. Devuelve también nivel de fuerza.
 * Niveles: 0 débil, 1 regular, 2 buena, 3 fuerte.
 */
export function validarClave(clave) {
  if (typeof clave !== 'string') return { valid: false, fuerza: 0, requisitos: {}, reason: 'Clave inválida.' };

  const requisitos = {
    longitud: clave.length >= 8,
    mayuscula: /[A-Z]/.test(clave),
    minuscula: /[a-z]/.test(clave),
    numero: /\d/.test(clave),
    simbolo: /[^A-Za-z0-9]/.test(clave),
  };
  const todasOk = Object.values(requisitos).every(Boolean);

  // Heurística de fuerza simple
  let fuerza = 0;
  if (clave.length >= 8) fuerza++;
  if (clave.length >= 12) fuerza++;
  const variedad = [requisitos.mayuscula, requisitos.minuscula, requisitos.numero, requisitos.simbolo].filter(Boolean).length;
  if (variedad >= 3) fuerza++;
  if (variedad === 4 && clave.length >= 14) fuerza++;
  // Penaliza patrones comunes obvios
  if (/^(.)\1+$/.test(clave) || /1234|abcd|qwerty|password|clave/i.test(clave)) fuerza = Math.max(0, fuerza - 2);
  fuerza = Math.min(3, Math.max(0, fuerza));

  return {
    valid: todasOk,
    fuerza,
    requisitos,
    reason: todasOk ? undefined : 'La clave no cumple todos los requisitos.',
  };
}

/**
 * Validación de archivo de firma electrónica: extensión y tamaño.
 * La validación real (clave correcta, RUC coincide, vigencia) la hace el backend.
 */
export function validarFirmaArchivo(file) {
  if (!file) return { valid: false, reason: 'No se seleccionó ningún archivo.' };
  const MAX = 5 * 1024 * 1024; // 5MB
  const nombre = file.name?.toLowerCase() || '';
  const extOk = nombre.endsWith('.p12') || nombre.endsWith('.pfx');

  if (!extOk) return { valid: false, reason: 'El archivo debe ser .p12 o .pfx (no se aceptan .cer ni tokens).' };
  if (file.size > MAX) return { valid: false, reason: 'El archivo supera los 5MB permitidos.' };
  return { valid: true };
}

/**
 * Código de token: 6 dígitos numéricos.
 */
export function validarCodigoToken(codigo) {
  if (typeof codigo !== 'string') return { valid: false };
  return { valid: /^\d{6}$/.test(codigo) };
}
