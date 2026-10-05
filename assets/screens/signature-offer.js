export const SIGNATURE_OPTIONS = Object.freeze({
  '1': { label: '1 año', price: '$40.25', message: 'Hola, deseo solicitar una firma electrónica por 1 año para el registro en TributaSoft.' },
  '2': { label: '2 años', price: '$51.75', message: 'Hola, deseo solicitar una firma electrónica por 2 años para el registro en TributaSoft.' },
});

export function signatureWhatsAppUrl(term) {
  const option = Object.hasOwn(SIGNATURE_OPTIONS, term) && SIGNATURE_OPTIONS[term];
  return option ? `https://wa.me/593969173466?text=${encodeURIComponent(option.message)}` : null;
}

export function signatureHelpMarkup(hasSignature = false) {
  return `<div class="signature-help"${hasSignature ? ' hidden' : ''}>
    <p>¿Aún no tienes firma electrónica? <span>Podemos gestionarla por ti.</span></p>
    <fieldset><legend class="sr-only">Selecciona la vigencia de tu firma</legend>
      ${Object.entries(SIGNATURE_OPTIONS).map(([value, option]) => `<label class="signature-term"><input type="radio" name="signature-term" value="${value}" aria-describedby="signature-offer-error"><span>${option.label}<strong>${option.price} <small>IVA incluido</small></strong></span></label>`).join('')}
    </fieldset>
    <a class="signature-request" role="button" tabindex="0" target="_blank" rel="noopener noreferrer"><svg class="signature-whatsapp-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.3 9.3 0 0 1-3.8-.9L3 21l1.8-5a8.7 8.7 0 1 1 16.2-4.5Z"/><path d="M8.7 8.4c.2 3.3 3 6 6.2 6.2"/><path d="m8.7 8.4 1.5-.7 1.1 2.1-.9.8"/><path d="m14.9 14.6.7-1 2.1 1.1-.6 1.5"/></svg><span>Solicitar firma</span></a>
    <span id="signature-offer-error" class="field-error" role="alert"></span>
    <button type="button" class="signature-tutorial guided-help-link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/></svg>¿Cómo obtener tu firma electrónica?</button>
  </div>`;
}

export function wireSignatureHelp(body) {
  const root = body.querySelector('.signature-help');
  const action = root.querySelector('.signature-request');
  const error = root.querySelector('#signature-offer-error');
  root.querySelectorAll('input').forEach((radio) => radio.addEventListener('change', () => {
    action.href = signatureWhatsAppUrl(radio.value);
    error.textContent = '';
    root.querySelectorAll('input').forEach((input) => input.removeAttribute('aria-invalid'));
  }));
  action.addEventListener('click', (event) => {
    const term = root.querySelector('input:checked')?.value;
    const url = signatureWhatsAppUrl(term);
    if (!url) {
      event.preventDefault();
      action.removeAttribute('href');
      error.textContent = 'Selecciona la vigencia de la firma para continuar.';
      root.querySelectorAll('input').forEach((input) => input.setAttribute('aria-invalid', 'true'));
      root.querySelector('input').focus();
    } else action.href = url;
  });
  action.addEventListener('keydown', (event) => {
    if (event.key === ' ' || (event.key === 'Enter' && !action.hasAttribute('href'))) {
      event.preventDefault(); action.click();
    }
  });
  root.querySelector('.signature-tutorial').addEventListener('click', () => {});
}
