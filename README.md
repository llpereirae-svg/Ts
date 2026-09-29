# TributaSoft — Registro de 300 documentos gratis

Landing estática en HTML, CSS y JavaScript ES modules con un flujo responsive de cinco pasos. No usa React, Vue, Vite, Tailwind ni un proceso de build.

## Flujo actual

1. **Firma:** lee `.p12` o `.pfx` en el navegador con `node-forge`. La clave y el archivo no se guardan ni se incluyen en el payload.
2. **Datos:** consulta el RUC por la API propia y permite revisar datos tributarios y contacto.
3. **Correo:** envía y verifica un código. En demo usa un mock visible; en producción delega al backend.
4. **Facturación:** diferencia entre contribuyente nuevo y quien ya emitía comprobantes.
5. **Revisión:** resume identidad, datos tributarios, contacto y facturación antes del alta.

La versión demo/local prepara el registro, pero no crea una cuenta real ni envía correos reales.

## Arquitectura RUC

```text
Frontend
  → GET /api/ruc/:ruc
  → backend propio
  → SRI
```

El navegador **no debe consultar directamente al SRI**. El endpoint público presenta problemas CORS; el proxy propio además concentra validación, timeout y normalización.

Contrato aplicado:

- RUC: exactamente 13 dígitos, termina en `001` y pasa el dígito verificador.
- `204`: RUC no encontrado y sin body; nunca se llama `response.json()` en ese caso.
- `408` o `5xx`: indisponibilidad temporal; el formulario admite captura manual y marca `validacionSriPendiente`.
- Respuesta malformada: error distinto; no se trata como RUC inexistente.
- Estado: manda `estadoContribuyenteRuc`. Una fecha de cese histórica no convierte por sí sola un RUC activo en cerrado.
- Advertencias: `contribuyenteFantasma = SI`, `transaccionesInexistente = SI` o estado `PASIVO` se muestran y se registran, sin decisión comercial irreversible desde frontend.
- Sociedad: `representantesLegales` determina si se muestra representante; puede ser vacío o `null`.
- Fechas: se conservan desde `informacionFechasContribuyente`.

`server/ruc-proxy.js` es un adaptador Node 18+ sin dependencias. La URL real del SRI no se inventa: debe configurarse en `SRI_RUC_URL` usando `{ruc}` como marcador.

## Ejecutar localmente

Requiere Node.js 18 o superior.

```powershell
cd D:\proyectos\tributasoft\registro
npm start
```

Abrir: [http://localhost:8000](http://localhost:8000)

Sin `SRI_RUC_URL`, la consulta responde como servicio no configurado y el frontend activa el fallback manual seguro. Para conectar un upstream autorizado:

```powershell
$env:SRI_RUC_URL='https://URL-OFICIAL/{ruc}'
npm start
```

No se incluye una URL productiva porque debe validarla el equipo técnico contra la fuente oficial vigente.

## Endpoints backend pendientes

| Endpoint | Uso | Estado |
|---|---|---|
| `GET /api/ruc/:ruc` | Proxy y normalización SRI | Adaptador incluido; upstream pendiente |
| `POST /api/token/email` | Enviar OTP | Contrato cableado; backend real pendiente |
| `POST /api/token/verify` | Verificar OTP | Contrato cableado; backend real pendiente |
| `POST /api/registro` | Crear la cuenta | Contrato cableado; persistencia real pendiente |

El backend es la autoridad final para validar RUC, identidad/firma, sanitizar, limitar solicitudes, manejar sesión y escribir en base de datos.

## Pruebas

```powershell
npm test
python .github\smoke-test.py
```

Las pruebas cubren formato y dígito verificador, persona natural/sociedad, representante presente o ausente, 204, timeout/5xx, respuesta malformada, estado activo/pasivo, fecha de cese con reinicio, estructura de cinco pasos, aceptación de términos, correo y breakpoints responsive.

## Privacidad, cookies y tracking

- `Politica-de-Privacidad.txt`: funcionamiento real y pendientes jurídicos.
- `Politica-de-Cookies.txt`: inventario de almacenamiento y Meta Pixel.
- Meta Pixel solo se carga en producción después de consentimiento explícito.
- La preferencia se guarda en `localStorage` como `tributasoft_analytics_consent`.
- Los puntos no confirmados están marcados `LEGAL_REVIEW_REQUIRED`.

## Documentación del rediseño

- `docs/REDESIGN-BASELINE.md`
- `docs/REDESIGN-AUDIT.md`
- `docs/REDESIGN-REPORT.md`

© 2026 TributaSoft S.A.
