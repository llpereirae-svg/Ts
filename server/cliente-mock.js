import { validarRUC } from '../assets/utils/ruc-validation.js';

// Solo el agente local de desarrollo puede reconstruir el origen del túnel.
export function isClientMockRequestAllowed(req, { allowedOrigin = '', nodeEnv = '' } = {}) {
  if (nodeEnv !== 'development') return false;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
  try {
    const single = name => {
      const value = req.headers[name];
      const count = req.rawHeaders?.filter((_, i) => i % 2 === 0)
        .filter(key => key.toLowerCase() === name).length;
      return typeof value === 'string' && !/[\s,]/.test(value)
        && (count === undefined || count === 1) ? value : null;
    };
    if (!single('host') || (req.headers.origin !== undefined && !single('origin'))) return false;
    const target = new URL(`http://${req.headers.host}`);
    if (target.host !== req.headers.host) return false;
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
    const origin = req.headers.origin;
    const forwarded = Object.keys(req.headers).some(key => key === 'forwarded' || key.startsWith('x-forwarded-'));
    if (localHost && !forwarded && (!origin || origin === target.origin)) return true;

    if (nodeEnv !== 'development' || !localHost || origin !== target.origin) return false;

    const allowed = new URL(allowedOrigin);
    // Un origen HTTPS exacto de Dev Tunnels, sin comodines, ruta ni credenciales.
    if (allowed.protocol !== 'https:' || !allowed.hostname.endsWith('.devtunnels.ms')
        || allowed.hostname.includes('*') || allowed.origin !== allowedOrigin) return false;
    const proto = single('x-forwarded-proto');
    const host = single('x-forwarded-host');
    // No se mezclan fuentes potencialmente contradictorias de forwarding.
    if (req.headers.forwarded !== undefined) return false;
    return proto === 'https' && host !== null && `${proto}://${host}` === allowedOrigin;
  } catch { return false; }
}

// DEV_CLIENT_LOOKUP_MOCK: no DB, no logs, no persistencia, no regla productiva.
// El identificador autorizado se suministra solo al proceso, nunca en este archivo.
export function createClientLookupMock({ enabled = false, existingRuc = '', nodeEnv = '' } = {}) {
  return (body, { local = false } = {}) => {
    if (!enabled || !local || nodeEnv !== 'development' || !validarRUC(existingRuc).valid) return { status: 503, body: { error: 'BACKEND/CONFIG_REQUIRED' } };
    if (!body || Array.isArray(body) || typeof body.ruc !== 'string' || !validarRUC(body.ruc).valid || Object.keys(body).length !== 1) return { status: 400, body: { error: 'INVALID_REQUEST' } };
    return { status: 200, body: body.ruc === existingRuc ? { esCliente: true, estado: 'ACTIVO' } : { esCliente: false } };
  };
}
