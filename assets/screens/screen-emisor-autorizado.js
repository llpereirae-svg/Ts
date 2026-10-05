import { ISSUER_AUTHORIZATION_STATE } from '../services/issuer-authorization-service.js?v=20261005p';

export function renderPantallaAutorizacionEmisor(body, result, { onRetry, onBack }) {
  const notAuthorized = result.status === ISSUER_AUTHORIZATION_STATE.NOT_AUTHORIZED;
  body.innerHTML = `<div class="cliente-content issuer-result${notAuthorized ? ' issuer-result--required' : ''}" data-error-code="${notAuthorized ? 'ISSUER_AUTHORIZATION_REQUIRED' : 'ISSUER_AUTHORIZATION_UNAVAILABLE'}">
    <svg class="cliente-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V10l8-6 8 6v11"/><path d="M9 21v-7h6v7M8 10h8"/><path d="M17 3v5M14.5 5.5h5"/></svg>
    <h2 id="cliente-heading" tabindex="-1">${notAuthorized ? 'Falta solicitar la autorización del SRI para facturar' : 'No pudimos verificar tu autorización en el SRI'}</h2>
    <p>${notAuthorized
      ? 'Tu firma es válida y no encontramos una cuenta anterior, pero el SRI todavía no registra la autorización necesaria para emitir comprobantes electrónicos.'
      : 'La consulta de emisores no está disponible en este momento. Intenta nuevamente.'}</p>
    ${notAuthorized ? `<ol class="issuer-next-steps" aria-label="Cómo resolverlo">
      <li><span>1</span><p><strong>Solicita la autorización en el SRI</strong><small>Es el permiso que habilita a tu RUC para facturar electrónicamente.</small></p></li>
      <li><span>2</span><p><strong>Regresa y vuelve a verificar</strong><small>Cuando el SRI confirme la autorización, podrás continuar con el registro.</small></p></li>
    </ol>
    <button type="button" class="issuer-tutorial guided-help-link" id="issuer-tutorial"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/></svg>¿Cómo obtener la autorización?</button>` : ''}
    <div class="cliente-actions issuer-actions">
      <button type="button" class="btn btn--ghost" id="cliente-back">Volver</button>
      <button type="button" class="btn btn--primary" id="cliente-primary">${notAuthorized ? 'Ya la obtuve, verificar' : 'Reintentar'}</button>
    </div>
  </div>`;
  body.querySelector('#cliente-primary').addEventListener('click', onRetry);
  body.querySelector('#cliente-back').addEventListener('click', onBack);
  body.querySelector('h2').focus({ preventScroll: true });
}
