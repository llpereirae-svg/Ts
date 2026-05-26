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

import { findCountry } from './countries.js?v=20260520a';

/**
 * Normaliza y valida celular según el país seleccionado.
 *
 * @param {string} input - Lo que tipeó el usuario (sólo el número nacional, sin prefijo).
 * @param {string} paisCode - ISO alpha-2 (por defecto 'EC').
 * @returns {{
 *   valid: boolean,
 *   esEcuador?: boolean,
 *   pais?: string,
 *   normalizado?: string,  // Para EC: 09XXXXXXXX (legacy). Para otros: E.164 (+...)
 *   e164?: string,         // Siempre formato internacional con +
 *   reason?: string,
 * }}
 *
 * Reglas:
 *  - Para EC: el número nacional debe tener 9 dígitos empezando con 9. Se devuelve "09XXXXXXXX".
 *  - Para otros países: longitud según minLen/maxLen del país. Se devuelve E.164.
 *  - SMS sólo está disponible para EC (lo gestiona la UI).
 */
export function validarCelular(input, paisCode = 'EC') {
  if (typeof input !== 'string') return { valid: false, reason: 'Celular inválido.' };
  const pais = findCountry(paisCode);
  let nacional = input.replace(/[\s\-()]/g, '');

  // Si el usuario pegó el número con +<dial> o con dial pegado, lo limpiamos.
  if (nacional.startsWith('+' + pais.dial)) nacional = nacional.substring(1 + pais.dial.length);
  else if (nacional.startsWith('00' + pais.dial)) nacional = nacional.substring(2 + pais.dial.length);
  else if (nacional.startsWith('+')) {
    return { valid: false, reason: 'El número no coincide con el código del país seleccionado.' };
  }

  // Para EC: el formato oficial es 09XXXXXXXX (10 dígitos con el 0 inicial).
  // Si tras quitar +593 quedó "9XXXXXXXXX" (9 dígitos), le anteponemos el 0.
  if (pais.code === 'EC' && nacional.length === 9 && nacional.startsWith('9')) {
    nacional = '0' + nacional;
  }

  if (!/^\d+$/.test(nacional)) {
    return { valid: false, reason: 'El celular sólo debe tener dígitos.' };
  }
  if (nacional.length < pais.minLen || nacional.length > pais.maxLen) {
    const rango = pais.minLen === pais.maxLen ? `${pais.minLen} dígitos` : `${pais.minLen} a ${pais.maxLen} dígitos`;
    return { valid: false, reason: `Para ${pais.name}, el número debe tener ${rango}.` };
  }
  if (pais.leadingPrefix && !nacional.startsWith(pais.leadingPrefix)) {
    return { valid: false, reason: `El celular de ${pais.name} debe empezar con ${pais.leadingPrefix}.` };
  }
  if (!pais.leadingPrefix && pais.leadingDigit && !nacional.startsWith(pais.leadingDigit)) {
    return { valid: false, reason: `El celular de ${pais.name} debe empezar con ${pais.leadingDigit}.` };
  }

  // Para EC, el "nacional" YA incluye el "09". El e164 omite el 0 inicial.
  const e164 = pais.code === 'EC'
    ? '+' + pais.dial + nacional.substring(1)
    : '+' + pais.dial + nacional;
  const normalizado = pais.code === 'EC' ? nacional : e164;

  return {
    valid: true,
    esEcuador: pais.code === 'EC',
    pais: pais.code,
    normalizado,
    e164,
  };
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
 * Clave: única regla dura → mínimo 4 caracteres. Devolvemos un nivel de
 * fuerza informativo (0-2) basado en una estimación de entropía de Shannon
 * — `bits = length × log2(charset_size)` — el mismo enfoque que usan
 * NIST 800-63B y los meters tipo zxcvbn-lite.
 *
 * Niveles de fuerza (umbrales aproximados de bits):
 *   0 Baja     (< 35)   — pocas combinaciones, fuerza bruta posible
 *   1 Media    (35-59)  — soportable para usos no críticos
 *   2 Alta     (≥ 60)   — recomendada
 *
 * Penalizamos patrones obvios (repeticiones, "1234", "qwerty", "password").
 */
export function validarClave(clave) {
  if (typeof clave !== 'string') return { valid: false, fuerza: 0, requisitos: {}, reason: 'Clave inválida.' };

  const longitudOk = clave.length >= 4;
  const requisitos = { longitud: longitudOk };

  // Tamaño del alfabeto efectivo: detectamos qué clases de caracteres usa.
  let charset = 0;
  if (/[a-z]/.test(clave)) charset += 26;
  if (/[A-Z]/.test(clave)) charset += 26;
  if (/\d/.test(clave))    charset += 10;
  if (/[^A-Za-z0-9]/.test(clave)) charset += 32;
  const entropy = clave.length === 0 ? 0 : clave.length * Math.log2(charset || 1);

  let fuerza;
  if (entropy < 35)      fuerza = 0;
  else if (entropy < 60) fuerza = 1;
  else                   fuerza = 2;

  // Patrones obvios: bajamos al mínimo (la clave puede seguir siendo válida
  // si cumple la longitud, pero el bar la pinta como Baja).
  if (/^(.)\1+$/.test(clave) || /1234|abcd|qwerty|password|clave/i.test(clave)) {
    fuerza = 0;
  }

  return {
    valid: longitudOk,
    fuerza,
    requisitos,
    entropy,
    reason: longitudOk ? undefined : 'La clave debe tener al menos 4 caracteres.',
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

/**
 * Número de resolución del SRI:
 *   - Alfanumérico, permite el carácter especial "-".
 *   - Validación interna: longitud (sin guiones) entre 10 y 30 dígitos/letras.
 *     No exponemos los límites concretos en mensajes — sólo decimos si es válido o no.
 */
export function validarNoResolucion(input) {
  if (typeof input !== 'string') return { valid: false, reason: 'Número de resolución inválido.' };
  const trimmed = input.trim();
  if (!trimmed) return { valid: false, reason: 'Ingresa el número de resolución.' };
  // Aceptamos: letras, números, guión, punto, slash, espacios y guion bajo.
  // Esto cubre formatos del SRI como "NAC-DGERCGC23-00000000001" y
  // "No.SRI12345610-191".
  if (!/^[A-Za-z0-9\-\.\/_ ]+$/.test(trimmed)) {
    return { valid: false, reason: 'Solo letras, números y - . / _' };
  }
  // Contamos sólo alfanuméricos (separadores no cuentan).
  const alnum = trimmed.replace(/[^A-Za-z0-9]/g, '');
  if (alnum.length < 8) {
    return { valid: false, reason: 'Debe tener al menos 8 caracteres.' };
  }
  if (alnum.length > 30) {
    return { valid: false, reason: 'Máximo 30 caracteres.' };
  }
  return { valid: true, normalizado: trimmed.toUpperCase() };
}
