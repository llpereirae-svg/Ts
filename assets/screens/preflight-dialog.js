import { lockModalScroll } from '../utils/modal-scroll-lock.js?v=20261005p';

const ICONS = Object.freeze({
  signature: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5M9.5 14.5c1.2-2 2.3-3 3.2-3 .8 0 .5 2.4 1.3 2.4.5 0 1-.5 1.6-1.3M9 17h6"/></svg>',
  sri: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 9h12M8 9V20M12 9V20M16 9V20M5 9l7-5 7 5"/><path d="m10.2 14 1.2 1.2 2.6-2.8"/></svg>',
  logo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m5.5 17 4.2-4.1 3 2.8 2.2-2 3.6 3.3"/></svg>',
});

export function mostrarRequisitosRegistro(ready = Promise.resolve()) {
  const dialog = document.createElement('dialog');
  dialog.className = 'registration-preflight';
  dialog.setAttribute('aria-labelledby', 'preflight-title');
  dialog.setAttribute('aria-describedby', 'preflight-copy');
  dialog.innerHTML = `
    <p class="preflight-kicker">Registro TributaSoft</p>
    <h2 id="preflight-title">Antes de comenzar</h2>
    <p id="preflight-copy" class="preflight-copy">Ten a mano estos tres elementos. El proceso tomará solo unos minutos.</p>
    <ol class="preflight-list">
      <li><span class="preflight-icon">${ICONS.signature}</span><span><strong>Firma electrónica vigente</strong><small>Archivo .p12 o .pfx y su clave.</small></span></li>
      <li><span class="preflight-icon">${ICONS.sri}</span><span><strong>Autorización para facturar en el SRI</strong><small>Debes contar con la autorización vigente que emite el SRI para facturar.</small></span></li>
      <li><span class="preflight-icon">${ICONS.logo}</span><span><strong>Logo de tu negocio</strong><small>JPG o PNG · 2,970 × 300 px · Máximo 250 KB.</small></span></li>
    </ol>
    <p class="preflight-note">Si no tienes logo, generaremos uno provisional con tu razón social.</p>
    <button type="button" class="btn btn--primary preflight-start">Comenzar registro</button>`;
  document.body.append(dialog);
  const unlock = lockModalScroll(dialog);
  return new Promise(resolve => {
    const finish = async () => {
      const button = dialog.querySelector('.preflight-start');
      button.disabled = true;
      await ready;
      dialog.close();
      dialog.remove();
      unlock();
      resolve();
    };
    dialog.querySelector('.preflight-start').addEventListener('click', finish, { once: true });
    dialog.addEventListener('cancel', event => event.preventDefault());
    try { dialog.showModal(); } catch { finish(); }
  });
}
