/* meta-pixel.js — Snippet del Meta Pixel + puente con el track() interno.
 *
 * Solo se activa si ENABLE_PIXEL === true en config.js (= entorno producción).
 * En demo (GitHub Pages) y dev (localhost) queda apagado para no contaminar
 * métricas ni gastar atribución en pruebas.
 *
 * Cuando está activo:
 *   1. Carga fbevents.js de Meta.
 *   2. Inicializa el pixel con META_DATASET_ID.
 *   3. Dispara PageView automático al cargar.
 *   4. Escucha eventos internos (CustomEvent 'tributasoft:event') y los
 *      mapea a eventos estándar de Meta con event_id compartido para
 *      deduplicación con CAPI server-side.
 *
 * Mapeo de eventos:
 *   'firma_validada'      → Meta Lead                  (paso 1 OK)
 *   'registro_completado' → Meta CompleteRegistration  (paso 8 OK)
 *   'cotizador_abierto'   → Meta ViewContent           (modal Cotizar)
 *
 * IMPORTANTE para el backend (CAPI):
 *   Cuando el backend reciba POST /api/registro, debe disparar CAPI con
 *   el mismo event_id que viene en el body (campo `metaEventId`). Sin esto,
 *   Meta NO deduplica y cuenta cada conversión dos veces.
 */

import { ENABLE_PIXEL, META_DATASET_ID, nuevoEventId } from './config.js?v=20260520e';

if (ENABLE_PIXEL) {
  inicializarPixel();
} else {
  console.log('[meta-pixel] desactivado (ENABLE_PIXEL=false) — no se carga fbevents.js');
}

function inicializarPixel() {
  // Snippet oficial de Meta — carga fbevents.js de connect.facebook.net.
  // Recordar tener 'https://connect.facebook.net' en script-src y
  // 'https://www.facebook.com' en img-src del CSP.
  (function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  window.fbq('init', META_DATASET_ID);
  window.fbq('track', 'PageView');

  console.log(`[meta-pixel] inicializado con dataset ${META_DATASET_ID}`);

  // Puente: cuando se dispara un evento interno, mapear al evento de Meta.
  // Esto se conecta al track() de app.js que ya emite CustomEvent('tributasoft:event').
  window.addEventListener('tributasoft:event', (e) => {
    const { name, ...rest } = e.detail || {};
    const mapeado = MAPA_EVENTOS_META[name];
    if (!mapeado || !window.fbq) return;

    const [nombreMeta, paramsExtra] = mapeado;
    const eventId = rest.metaEventId || nuevoEventId();

    window.fbq('track', nombreMeta, {
      ...paramsExtra,
      ...rest,
    }, { eventID: eventId });

    // Loguear para debugging cruzado con backend CAPI
    console.log(`[meta-pixel] track ${nombreMeta} eventID=${eventId}`);
  });
}

// Mapeo central — fácil de extender si se agregan más eventos.
const MAPA_EVENTOS_META = {
  // Cuando se valida firma + cert en pantalla 1 del wizard
  'firma_validada':       ['Lead',                 { content_name: 'Firma electrónica validada' }],

  // Cuando se completa el registro entero (pantalla 8)
  'registro_completado':  ['CompleteRegistration', { content_name: 'Wizard de registro', currency: 'USD', value: 0 }],

  // Cuando se abre el modal Cotizar
  'cotizador_abierto':    ['ViewContent',          { content_name: 'Cotizador', content_category: 'plan' }],
};
