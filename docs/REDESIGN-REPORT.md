# Reporte del rediseño

> Reporte histórico del rediseño inicial. El flujo vigente de cuatro pasos, bloqueo ACTIVO y verificación de correo integrada está documentado en `REGISTRATION-FLOW.md` y `../README.md`; reemplaza las referencias de este baseline a cinco pasos y fallback manual.

## Identificación

- Baseline: `461c05e7a775c074294905bb624383a52173e8bd`
- Rama: `redesign/registro-300-v2`
- Stack: HTML, CSS y JavaScript ES modules; proxy Node 18+ sin dependencias.
- Push, merge y deploy: no realizados.

## Arquitectura antes y después

Antes: firma `.p12` + certificado RUC PDF, ambos procesados localmente; sin consulta SRI; OTP y correo mock; alta final pendiente.

Después:

```text
Firma local en navegador
  → RUC extraído
  → GET /api/ruc/:ruc
  → proxy Node propio
  → SRI configurado por entorno
  → datos normalizados y revisables
```

El frontend trata 204, timeout/5xx y respuesta malformada como estados distintos. Una caída temporal habilita captura manual con `validacionSriPendiente`; un 204 no se disfraza de indisponibilidad.

## Cambios UX y visuales

- Ocho pantallas reducidas a cinco.
- Progreso compacto en móvil y detallado en escritorio.
- Primera pantalla centrada en firma y privacidad.
- Datos tributarios y contacto reunidos.
- Representante legal visible solo cuando existe.
- Verificación centrada únicamente en correo.
- Pregunta de facturación binaria con campos condicionales.
- Resumen final por identidad, tributación, contacto y facturación, con edición.
- Tokens CSS pequeños, espacios consistentes, bordes discretos y animaciones de 180–240 ms.
- `prefers-reduced-motion`, focus visible, labels, errores asociados y safe-area móvil.

## Seguridad y privacidad

- Validación RUC compartida entre frontend y proxy.
- El navegador nunca hace fetch directo al SRI.
- La clave de firma se limpia después de usarla; archivo y clave no entran en el payload.
- OTP real y alta real delegados al backend en producción.
- Meta Pixel requiere consentimiento; rechazo no bloquea el registro.
- Políticas separadas y puntos jurídicos no confirmados marcados `LEGAL_REVIEW_REQUIRED`.

## Performance

- Sin framework ni dependencia nueva de frontend.
- Consulta SRI una vez al entrar al paso de datos, con reintento explícito; no consulta por tecla.
- Firma y librería criptográfica continúan bajo carga diferida.
- Animaciones limitadas a opacity/transform y transiciones cortas.

## Pruebas y QA

- `npm test`: formato RUC, `001`, dígito verificador, persona natural, sociedad, representante null/presente, 204, 5xx, JSON malformado, activo/pasivo, fecha de cese + reinicio, correo, pasos, términos y responsive.
- `.github/smoke-test.py`: CSP, imports, assets y cache buster.
- QA visual: 390 × 844, 768 × 1,024, 1,366 × 768 y 1,920 × 1,080.
- Se corrigió durante QA la compresión del selector de firma en tablet y el ancho del formulario en escritorio.

## Archivos principales modificados o creados

- `assets/wizard.js`, `assets/wizard.css`
- `assets/screens/screen-firma.js`, `screen-datos.js`, `email-verification.js`, `screen-facturacion.js` (correo integrado en Datos; flujo vigente en README.md)
- `assets/services/ruc-service.js`, `registration-service.js`, `token-service.js`, `meta-pixel.js`
- `assets/utils/ruc-validation.js`, `validators.js`
- `server/dev-server.js`, `server/ruc-proxy.js`
- `tests/ruc.test.js`, `tests/flow.test.js`
- `README.md`, políticas y documentación `docs/REDESIGN-*`

## Pendientes backend

- Configurar y validar la URL oficial `SRI_RUC_URL`.
- Definir normalización final contra muestras reales de respuesta SRI.
- Implementar `POST /api/token/email`, `POST /api/token/verify` y `POST /api/registro`.
- Verificar firma/identidad nuevamente en backend según el nivel de riesgo aprobado.
- Rate limiting, sesión, auditoría y persistencia.
- Envío real de correo y reglas de alta.

## LEGAL_REVIEW_REQUIRED

- Responsable y base jurídica del tratamiento.
- Finalidades, destinatarios, transferencias y conservación.
- Duración/alcance de cookies Meta y mecanismo de retiro del consentimiento.
- Revisión final de Términos, Privacidad y Cookies.

## Pasos para el desarrollador

1. Ejecutar `npm test` y `python .github\smoke-test.py`.
2. Configurar `SRI_RUC_URL` en un entorno de prueba, nunca en frontend.
3. Validar fixtures contra respuestas reales autorizadas del SRI.
4. Implementar los tres endpoints POST pendientes.
5. Probar alta completa en staging antes de considerar producción.
