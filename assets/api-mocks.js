// api-mocks.js — Mocks de los endpoints del backend Java.
// TODO BACKEND: reemplazar TODAS estas funciones por llamadas reales con `fetch()`.
// Cada mock simula latencia + escenarios variados para que el flujo se pueda
// navegar end-to-end sin servidor real.

const NETWORK_DELAY_MS = 700; // simula 4G

function delay(ms = NETWORK_DELAY_MS) {
  return new Promise((res) => setTimeout(res, ms));
}

// Pequeña base de datos en memoria para simular "este RUC ya existe".
// Modifica este set para probar la rama REDIRECT_COTIZADOR.
// Usa este RUC ficticio para probar "cliente ya registrado → redirige a cotizador":
const RUCS_EXISTENTES = new Set([
  '1710034065001', // RUC ficticio de demo — marcado como ya registrado
]);

// Estado en memoria para verificación de tokens (mock).
const tokensActivos = new Map(); // registroId -> { codigo, intentos, expiresAt }

function generarCodigoMock() {
  // En el mock siempre usamos 123456 para que se pueda probar fácilmente.
  // El backend real generará uno aleatorio de 6 dígitos.
  return '123456';
}

/**
 * GET /api/clientes/existe?ruc=X
 * TODO BACKEND: replace with real endpoint
 */
export async function clienteExiste(ruc) {
  await delay();
  const existe = RUCS_EXISTENTES.has(ruc);
  return {
    existe,
    url_redirect: existe ? '/cotizador?ruc=' + encodeURIComponent(ruc) : null,
  };
}

/**
 * POST /api/registro/iniciar
 * TODO BACKEND: replace with real endpoint
 */
export async function iniciarRegistro({ ruc, razonSocial, email, celular, canal, datosSRI }) {
  await delay();
  const registroId = 'mock-' + Math.random().toString(36).slice(2, 10);
  const codigo = generarCodigoMock();
  tokensActivos.set(registroId, {
    codigo,
    intentos: 0,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
  });

  const tokenSentTo =
    canal === 'email' ? email :
    canal === 'sms' ? celular :
    canal === 'whatsapp' ? celular :
    email;

  // Dev helper: mostrar el código en consola para no tener que hacer guess.
  console.info(`[MOCK] Código enviado por ${canal} a ${tokenSentTo}: ${codigo}`);

  return {
    registroId,
    tokenSentTo,
    expiresIn: 300,
    _mockHint: 'En el mock el código siempre es 123456 (también visible en la consola).',
  };
}

/**
 * POST /api/registro/verificar-token
 * TODO BACKEND: replace with real endpoint
 */
export async function verificarToken({ registroId, codigo }) {
  await delay(400);
  const reg = tokensActivos.get(registroId);
  if (!reg) return { verificado: false, attemptsLeft: 0, reason: 'Registro no encontrado.' };
  if (Date.now() > reg.expiresAt) return { verificado: false, attemptsLeft: 0, reason: 'Código expirado.' };

  reg.intentos++;
  if (codigo === reg.codigo) {
    tokensActivos.delete(registroId);
    return { verificado: true, attemptsLeft: 5 - reg.intentos };
  }
  return { verificado: false, attemptsLeft: Math.max(0, 5 - reg.intentos) };
}

/**
 * POST /api/registro/establecer-clave
 * TODO BACKEND: replace with real endpoint
 * Importante: nunca loguear la clave. Aquí solo simulamos un ack.
 */
export async function establecerClave({ registroId, clave }) {
  await delay(400);
  if (!registroId || !clave || clave.length < 8) return { ok: false };
  return { ok: true };
}

/**
 * POST /api/registro/firma (multipart)
 * TODO BACKEND: replace with real endpoint
 * El backend real usa el módulo existente del ERP para validar el .p12/.pfx.
 */
export async function validarFirma({ file, clave }) {
  await delay(1200); // la validación de firma suele tardar más
  if (!file) return { valida: false, error: 'No se recibió el archivo.' };
  if (!clave) return { valida: false, error: 'Falta la clave de la firma.' };

  // Mock: si la clave es "firma123" decimos válida; cualquier otra inválida.
  // El backend real verifica clave + RUC coincide + vigencia.
  if (clave === 'firma123') {
    return {
      valida: true,
      vigente: true,
      rucCoincide: true,
      fechaCaducidad: '2027-12-31',
    };
  }
  return {
    valida: false,
    vigente: false,
    rucCoincide: false,
    error: 'Clave de firma incorrecta.',
    _mockHint: 'En el mock usa la clave "firma123" para que la firma se valide.',
  };
}

/**
 * POST /api/registro/finalizar
 * TODO BACKEND: replace with real endpoint
 */
export async function finalizarRegistro({ registroId }) {
  await delay(400);
  if (!registroId) return { ok: false };
  return {
    ok: true,
    redirectUrl: 'https://app.tributasoft.ec/login',
  };
}

/**
 * Helper para simular timeout/error de red en cualquier endpoint.
 * Llama a este con ?simulate=fail en la URL para forzar fallo.
 */
export function shouldSimulateFailure() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('simulate') === 'fail';
}
