# Auditoría breve del registro anterior

## Baseline y alcance

Se auditó el commit `461c05e7a775c074294905bb624383a52173e8bd`. El código real fue el criterio principal; README y documentos se contrastaron contra la implementación.

## Flujo anterior

El wizard tenía ocho pantallas: firma, datos, verificación por correo y SMS, información tributaria, facturación, clave, logo y resumen. El orden separaba datos relacionados, pedía decisiones secundarias antes del alta y generaba fricción móvil.

La firma se procesaba localmente con `node-forge`. El flujo exigía además un certificado de RUC en PDF procesado con `pdf.js`. El RUC no se consultaba al SRI; la documentación incluso indicaba que no hacía falta una API. El rediseño requerido contradice ese supuesto y ordena una API propia intermedia.

## Hallazgos funcionales

- La validación frontend de RUC ya exigía 13 dígitos, terminación `001` y dígito verificador.
- No existía `GET /api/ruc/:ruc` en el repositorio.
- El alta final no ejecutaba `POST /api/registro`; solo simulaba correo y mostraba éxito.
- La verificación OTP se resolvía en navegador y exponía el código en consola en modo mock.
- La firma y su clave sí se procesaban en navegador. El estado del wizard retenía metadatos, no la contraseña; el archivo no se enviaba al backend.
- Persona natural y sociedad dependían principalmente de datos extraídos de firma/PDF; no existía manejo de `representantesLegales` del SRI.
- No se distinguían 204, timeout, 5xx o respuesta SRI malformada porque no había consulta.

## Seguridad y privacidad

- CSP, protección anti-frame, política de referrer y permisos ya estaban configurados.
- Meta Pixel se activaba automáticamente en producción, sin consentimiento previo.
- Existía `sessionStorage` para borradores con exclusión declarada de clave/token.
- No se usa `document.cookie` directamente; Meta puede crear `_fbp`/`_fbc` si se carga.
- No existía Política de Privacidad ni Política de Cookies separada.
- Frontend no puede sustituir la validación, rate limiting, sesión, persistencia ni sanitización del backend.

## Hallazgos UX y accesibilidad

- Ocho pasos y una barra extensa para móvil.
- Componentes funcionales, pero estilos acumulados y varias decisiones visuales heredadas.
- Había labels y estados de error, aunque varias validaciones dependían de `alert()`.
- El modal de términos exigía scroll y tenía acciones identificables.
- Las animaciones eran cortas, pero faltaba una base visual compacta y consistente para el nuevo flujo.

## Decisiones derivadas

1. Reducir a cinco pasos y agrupar información tributaria/contacto.
2. Mantener firma local y eliminar el PDF de RUC como requisito del alta.
3. Crear validación RUC compartida entre frontend y proxy Node.
4. Cablear `/api/ruc/:ruc` sin inventar la URL upstream productiva.
5. Permitir captura manual solo ante indisponibilidad temporal, marcada para validación posterior.
6. No interpretar fecha de cese como cierre; usar `estadoContribuyenteRuc`.
7. Pedir consentimiento antes de cargar Meta Pixel.
8. Mantener pendientes de alta/correo como contratos explícitos, no como servicios simulados de producción.
