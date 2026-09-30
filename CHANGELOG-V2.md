# Changelog — Registro V2

Versión candidata propuesta: `v2.0.0`. Este documento no crea tag, release, merge ni despliegue.

## Incorporado

- Wizard mobile-first de cuatro pasos: Firma, Datos, Facturación y Revisión.
- Lectura local de firma `.p12`/`.pfx`, extracción del RUC y gate previo de cliente existente.
- Consulta SRI mediante API propia, RUC ACTIVO como condición de avance y datos de contacto con verificación de correo integrada.
- Facturación inicial por tipo de documento, con Factura obligatoria y cinco tipos adicionales.
- Resumen final editable, alta mediante `POST /api/registro`, personalización de logo posterior y redirección al portal configurado.
- Mocks locales explícitos, sin persistencia, protegidos por entorno y allowlist exacta para Dev Tunnels.
- Cobertura automatizada del flujo, validaciones, mocks, compatibilidad de facturación y componentes auxiliares.

## Correcciones de cierre

- El archivo de firma deja de conservarse en memoria tras extraer los metadatos necesarios.
- El input y la referencia del archivo de firma se limpian tras extraer los metadatos necesarios.
- La CSP permite el dominio de API ya configurado para producción y la vista previa local `blob:` del logo.
- La verificación OTP exige un booleano estricto; el mock de cliente exige `NODE_ENV=development`.
- Una URI malformada devuelve 400 en el servidor local en lugar de finalizar el proceso.
- README alineado con la redirección y la política vigente de Dev Tunnels.
- `node-forge` 1.3.1 se sirve como asset local con checksum verificado; ya no se ejecuta desde CDN.
- Las firmas identificadas únicamente con cédula se bloquean. El RUC se valida estrictamente antes de cualquier request y el mock backend repite validación y coincidencia firma/draft.
- La consulta SRI reintenta tres veces solo fallos transitorios y habilita captura manual explícitamente `MANUAL_PENDING` si persiste la indisponibilidad.
- `noResolucion` se incorporó al payload y se valida también en el mock de alta.
- El OTP de correo pasó a seis dígitos y el generador local exige `crypto.getRandomValues`.

## Pendiente antes de etiqueta productiva

- Revalidación/autenticación de firma en backend; el frontend no es frontera de confianza.
- Implementar los endpoints reales de cliente, SRI, OTP, alta y logo, con controles descritos en `docs/V2-BACKEND-HANDOFF.md`.
- Implementar verificación criptográfica de identidad en backend; solo ella puede producir `IDENTITY_VERIFIED`.
- Usar prepared statements/queries parametrizadas en toda consulta por RUC; la validación de formato no reemplaza esta defensa.
- El servidor de desarrollo usa una allowlist de archivos públicos, bloquea traversal/symlinks y escucha en loopback por defecto antes de exponerse por túnel.
- Configurar cabeceras HTTP reales de seguridad en el servidor de producción.

