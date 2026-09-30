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
    <a class="signature-request" role="button" tabindex="0" target="_blank" rel="noopener noreferrer">Solicitar firma por WhatsApp</a>
    <span id="signature-offer-error" class="field-error" role="alert"></span>
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
}
