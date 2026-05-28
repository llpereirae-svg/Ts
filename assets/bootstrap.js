/* bootstrap.js — Entry point del sitio.
 *
 * Carga en paralelo:
 *   - wizard.js (nuevo flujo de registro)
 *   - app.js   (modales auxiliares: Cotizar, Pago, Términos, Manual)
 *
 * Vive como archivo separado (NO inline en index.html) por dos razones:
 *
 *   1. CSP estricto: nuestra Content-Security-Policy NO incluye
 *      'unsafe-inline' en script-src para máxima protección anti-XSS.
 *      Por eso cualquier <script> con código adentro queda bloqueado
 *      por el navegador. La única forma de cargar JS bajo este CSP es
 *      via <script src="...">.
 *
 *   2. Tests/lint: tener el bootstrap como archivo independiente lo
 *      hace verificable por el smoke test del workflow de CI.
 *
 * Cuando se actualice el cache buster en index.html, también hay que
 * bumpearlo aquí en APP_VER.
 */

const APP_VER = '20260520e';

// Wizard nuevo: monta el flujo TurboTax-style sobre #wizard-root.
import(`./wizard.js?v=${APP_VER}`)
  .then((mod) => {
    const start = () => mod.startWizard();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  })
  .catch((err) => console.error('Error cargando wizard.js', err));

// app.js: maneja Cotizar, Pago, Bank, Términos, Tooltips y Manual.
import(`./app.js?v=${APP_VER}`).catch((err) => {
  console.error('Error cargando app.js', err);
});

// Meta Pixel: solo se activa en producción real (ENABLE_PIXEL en config.js).
// En GitHub Pages y localhost queda apagado — no contamina métricas.
import(`./services/meta-pixel.js?v=${APP_VER}`).catch((err) => {
  console.error('Error cargando meta-pixel.js', err);
});
