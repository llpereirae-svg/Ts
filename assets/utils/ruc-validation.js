// Validación compartida por el navegador y el proxy Node.
// Mantener una sola implementación evita que frontend y backend diverjan.

const PROVINCIAS_VALIDAS = Array.from({ length: 24 }, (_, i) => i + 1);

export function validarRUC(ruc) {
  if (typeof ruc !== 'string') return { valid: false, reason: 'RUC debe ser texto.' };
  const value = ruc;

  if (!/^\d{13}$/.test(value)) {
    return { valid: false, reason: 'El RUC debe tener exactamente 13 dígitos numéricos.' };
  }
  if (!value.endsWith('001')) {
    return { valid: false, reason: 'El RUC debe terminar en 001 (identifica al contribuyente).' };
  }

  const provincia = Number(value.slice(0, 2));
  if (!PROVINCIAS_VALIDAS.includes(provincia)) {
    return { valid: false, reason: 'Los dos primeros dígitos deben corresponder a una provincia válida (01-24).' };
  }

  const tercerDigito = Number(value[2]);
  let type;
  let checkOk;

  if (tercerDigito <= 5) {
    type = 'natural';
    checkOk = verificarNatural(value.slice(0, 10));
  } else if (tercerDigito === 6) {
    type = 'publica';
    checkOk = verificarPublica(value);
  } else if (tercerDigito === 9) {
    type = 'juridica';
    checkOk = verificarJuridica(value);
  } else {
    return { valid: false, reason: 'El tercer dígito (7 u 8) no corresponde a un tipo de RUC válido.' };
  }

  return checkOk
    ? { valid: true, type }
    : { valid: false, type, reason: 'El dígito verificador del RUC no es válido.' };
}

function verificarNatural(diez) {
  const coef = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  for (let i = 0; i < 9; i += 1) {
    let producto = Number(diez[i]) * coef[i];
    if (producto >= 10) producto -= 9;
    suma += producto;
  }
  const verificador = suma % 10 === 0 ? 0 : 10 - (suma % 10);
  return verificador === Number(diez[9]);
}

function verificarPublica(ruc) {
  const coef = [3, 2, 7, 6, 5, 4, 3, 2];
  const suma = coef.reduce((total, factor, i) => total + Number(ruc[i]) * factor, 0);
  const residuo = suma % 11;
  const verificador = residuo === 0 ? 0 : 11 - residuo;
  return verificador !== 10 && verificador === Number(ruc[8]);
}

function verificarJuridica(ruc) {
  const coef = [4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = coef.reduce((total, factor, i) => total + Number(ruc[i]) * factor, 0);
  const residuo = suma % 11;
  const verificador = residuo === 0 ? 0 : 11 - residuo;
  return verificador !== 10 && verificador === Number(ruc[9]);
}
