# Changelog — Registro V2

Versión candidata propuesta: `v2.0.0`. Este documento no crea tag, release, merge ni despliegue.

## Incorporado

- Wizard mobile-first de cuatro pasos: Firma, Datos, Facturación y Revisión.
- Lectura local de firma `.p12`/`.pfx`, extracción del RUC y gate previo de cliente existente.
- Consulta SRI mediante API propia, RUC ACTIVO como condición de avance y datos de contacto con verificación de correo integrada.
- Facturación inicial simplificada a Factura, con valores sugeridos editables; las configuraciones adicionales quedan para el perfil.
- Resumen final editable, alta mediante `POST /api/registro/drafts/{id}/complete`, personalización de logo persistente y redirección al portal configurado.
- Mocks locales explícitos, sin persistencia, protegidos por entorno y allowlist exacta para Dev Tunnels.
- Cobertura automatizada del flujo, validaciones, mocks, compatibilidad de facturación y componentes auxiliares.

## Correcciones de cierre

- El archivo, input y contraseña de firma se limpian después de challenge verificado y upload temporal confirmado; no se borran antes de completar esas operaciones.
- La CSP permite el dominio de API ya configurado para producción y la vista previa local `blob:` del logo.
- La verificación OTP exige un booleano estricto; el mock de cliente exige `NODE_ENV=development`.
- Una URI malformada devuelve 400 en el servidor local en lugar de finalizar el proceso.
- README alineado con la redirección y la política vigente de Dev Tunnels.
- `node-forge` 1.3.1 se sirve como asset local con checksum verificado; ya no se ejecuta desde CDN.
- Las firmas identificadas únicamente con cédula se bloquean. El RUC se valida estrictamente antes de cualquier request y el mock backend repite validación y coincidencia firma/draft.
- La consulta SRI reintenta tres veces solo fallos transitorios y habilita captura manual explícitamente `MANUAL_PENDING` si persiste la indisponibilidad.
- Se cerró la política `MANUAL_PENDING_POLICY=RESTRICTED_ACCOUNT`: el alta y el login se permiten, la cuenta queda en `PENDING_SRI_RECONCILIATION`, se bloquean emisión y funciones tributarias dependientes, y las funciones no tributarias siguen disponibles hasta reconciliar con SRI.
- El frontend V2 quedó cableado a un draft server-side con challenge criptográfico single-use, custodia temporal del PKCS#12, OTP/SRI/facturación ligados al `registrationId`, alta idempotente y persistencia post-creación del logo.
- `noResolucion` se incorporó al payload y se valida también en el mock de alta.
- El PIN de correo del flujo de registro usa cuatro dígitos; el mock tutorial entrega siempre `1234` sin mensajes técnicos en pantalla.
- El registro muestra un aviso inicial responsive con los requisitos de firma, autorización para facturar en el SRI y logo.
- Los nuevos clientes deben superar un gate backend adicional que confirma que el RUC figura como emisor electrónico autorizado; un resultado negativo o una consulta no verificable bloquean el avance sin confundirse entre sí.
- El logo provisional se genera como JPG real de 2,970 × 300 px, máximo 250 KB, y se envía al backend por multipart.
- Se cerraron sesión HttpOnly/CSRF, state machine, trust policy, custodia PKCS#12, rate limits, reconciliación SRI, matriz de errores y comparación V1→V2.
- El provisional definitivo quedó fijado en 2,970 × 300, Roboto Condensed Light, razón social y una línea inferior con correo y celular registrados e iconos lineales.

## Pendiente antes de etiqueta productiva

- Revalidación/autenticación de firma en backend; el frontend no es frontera de confianza.
- Implementar los endpoints reales de cliente, SRI, OTP, alta y logo, con controles descritos en `docs/V2-BACKEND-HANDOFF.md`.
- Implementar verificación criptográfica de identidad en backend; solo ella puede producir `IDENTITY_VERIFIED`.
- Usar prepared statements/queries parametrizadas en toda consulta por RUC; la validación de formato no reemplaza esta defensa.
- El servidor de desarrollo usa una allowlist de archivos públicos, bloquea traversal/symlinks y escucha en loopback por defecto antes de exponerse por túnel.
- Configurar cabeceras HTTP reales de seguridad en el servidor de producción.

