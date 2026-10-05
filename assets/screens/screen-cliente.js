import { CLIENTE_ESTADO, CLIENTE_ERROR, resolverLoginUrl } from '../services/cliente-service.js?v=20261004a';

export function renderPantallaCliente(body, result, { onRetry, onBack }) {
  const existing = result.status === CLIENTE_ESTADO.EXISTING_CLIENT;
  body.innerHTML = `<div class="cliente-content${existing ? ' cliente-existing' : ''}">
    <svg class="cliente-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 10l2 2 4-4"/></svg>
    <h2 id="cliente-heading" tabindex="-1">${existing ? 'Ya eres cliente de TributaSoft' : CLIENTE_ERROR}</h2>
    ${existing ? '<p>Tu RUC ya se encuentra registrado. Inicia sesión en tu cuenta para recargar documentos o renovar tu servicio.</p>' : ''}
    <div class="cliente-actions"><button type="button" class="btn btn--primary" id="cliente-primary">${existing ? 'Iniciar sesión' : 'Reintentar'}</button>
    <button type="button" class="btn btn--ghost" id="cliente-back">Volver</button></div>
    <p class="cliente-config" id="cliente-config" hidden>El acceso al portal estará disponible cuando se complete su configuración.</p>
  </div>`;
  const primary = body.querySelector('#cliente-primary');
  if (existing) {
    const url = result.loginUrl ? resolverLoginUrl(result.loginUrl) : '';
    primary.disabled = !url;
    body.querySelector('#cliente-config').hidden = Boolean(url);
    if (url) primary.addEventListener('click', () => window.location.assign(url));
  } else primary.addEventListener('click', onRetry);
  body.querySelector('#cliente-back').addEventListener('click', onBack);
  body.querySelector('h2').focus({ preventScroll: true });
}
