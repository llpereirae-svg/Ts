import { lockModalScroll } from '../utils/modal-scroll-lock.js?v=20261004a';

const DOCUMENTS = Object.freeze([
  { title: 'Términos y Condiciones', url: './Terminos-y-Condiciones.txt' },
  { title: 'Política de Privacidad', url: './Politica-de-Privacidad.txt' },
]);

export async function mostrarConsentimientoLegal() {
  const dialog = document.createElement('dialog');
  dialog.className = 'legal-consent-dialog';
  dialog.setAttribute('aria-labelledby', 'legal-consent-title');
  dialog.innerHTML = `
    <header class="legal-consent-header">
      <p class="legal-consent-kicker">Registro TributaSoft</p>
      <h2 id="legal-consent-title">Términos y privacidad</h2>
      <p>Lee ambos documentos y desliza hasta el final para aceptar.</p>
    </header>
    <div class="legal-consent-scroll" tabindex="0" aria-label="Términos y Política de Privacidad">
      <p class="legal-consent-loading">Cargando documentos…</p>
    </div>
    <p class="legal-consent-hint" aria-live="polite">Desliza hasta el final para habilitar la aceptación.</p>
    <div class="legal-consent-actions">
      <button type="button" class="btn btn--ghost legal-consent-cancel" autofocus>Volver</button>
      <button type="button" class="btn btn--primary legal-consent-accept" disabled>Aceptar</button>
    </div>`;
  document.body.append(dialog);

  const scroll = dialog.querySelector('.legal-consent-scroll');
  const hint = dialog.querySelector('.legal-consent-hint');
  const accept = dialog.querySelector('.legal-consent-accept');
  const cancel = dialog.querySelector('.legal-consent-cancel');
  const unlock = lockModalScroll(dialog, { scrollTarget: scroll });
  let settled = false;

  const close = result => {
    if (settled) return result;
    settled = true;
    dialog.close();
    dialog.remove();
    unlock();
    return result;
  };

  try { dialog.showModal(); }
  catch { return close(false); }

  try {
    const contents = await Promise.all(DOCUMENTS.map(async document => {
      const response = await fetch(document.url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('LEGAL_DOCUMENT_UNAVAILABLE');
      return { ...document, text: await response.text() };
    }));
    scroll.innerHTML = contents.map(document => `
      <section class="legal-document">
        <h3>${document.title}</h3>
        <div class="legal-document-text">${renderText(document.text)}</div>
      </section>`).join('');
  } catch {
    scroll.innerHTML = '<p class="field-error">No pudimos cargar los documentos. Cierra esta ventana e intenta nuevamente.</p>';
    hint.textContent = '';
  }

  const update = () => {
    const reachedEnd = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 8;
    accept.disabled = !reachedEnd;
    if (reachedEnd) hint.textContent = 'Ya puedes aceptar los Términos y la Política de Privacidad.';
  };
  scroll.addEventListener('scroll', update, { passive: true });
  requestAnimationFrame(update);

  return new Promise(resolve => {
    accept.addEventListener('click', () => resolve(close(true)), { once: true });
    cancel.addEventListener('click', () => resolve(close(false)), { once: true });
    dialog.addEventListener('cancel', event => { event.preventDefault(); resolve(close(false)); }, { once: true });
  });
}

function renderText(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  lines.shift();
  return lines.join('\n').trim().split(/\n{2,}/).map((block, index) => {
    const raw = block.trim();
    const safe = escapeHtml(raw).replace(/\n/g, '<br>');
    if (!safe) return '';
    if (index === 0) return `<p class="legal-document-version">${safe}</p>`;
    if (/^\d+\.\s+[A-ZÁÉÍÓÚÑÜ]/.test(raw)) return `<h4>${safe}</h4>`;
    return `<p>${safe}</p>`;
  }).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
