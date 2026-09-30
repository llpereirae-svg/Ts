# TributaSoft — Registro de 300 documentos gratis

Landing estática en HTML, CSS y JavaScript ES modules con un flujo responsive de cuatro pasos. No usa React, Vue, Vite, Tailwind ni un proceso de build.

## Flujo de registro

1. **Firma:** lee `.p12` o `.pfx` en el navegador con `node-forge`. La clave y el archivo no se guardan ni se incluyen en el payload.
2. **Gate de cliente:** después de validar firma/RUC, POST a `/api/registro/verificar-cliente`. Si ya es cliente, sale del onboarding promocional hacia «Ya eres cliente de TributaSoft», con «Iniciar sesión» y «Volver» en una fila cuando hay espacio. Si es nuevo, se permite renderizar Datos. Ante fallo técnico se bloquea, con Reintentar/Volver; no se confunde con cliente existente.
3. **Datos:** solo para cliente nuevo, consulta el RUC por la API propia, exige estado ACTIVO, muestra datos tributarios y contacto. Al continuar, verifica el correo dentro de un modal/bottom sheet; no existe una pantalla de correo independiente.
4. **Facturación:** configuración por documento, Factura obligatoria y adicionales opcionales. Véase `docs/PASO3-FACTURACION.md`.
5. **Revisión:** resume identidad, datos tributarios, contacto y facturación antes del alta. Son cuatro pasos visibles; el gate no es un quinto paso.

```text
Firma válida
  ↓
RUC válido
  ↓
POST /api/registro/verificar-cliente
  ├─ cliente existente → pantalla específica → Portal TributaSoft (clic)
  ├─ error → Reintentar / Volver (sin SRI ni Paso 2)
  └─ nuevo cliente
        ↓
      GET /api/ruc/:ruc
        ↓
      backend/proxy → SRI
        ↓
      Paso 2: RUC ACTIVO → Facturación → Revisión
```

Ser cliente de TributaSoft y tener RUC ACTIVO en SRI son controles distintos, en ese orden. Un cliente existente nunca necesita consultar el SRI dentro de esta promoción.

### Contrato propuesto de cliente existente

`assets/services/cliente-service.js` encapsula toda la llamada. Endpoint propio del mismo origen: `POST /api/registro/verificar-cliente`, JSON `{ "ruc": "<13 dígitos válidos>" }`. Solo se envía el RUC, nunca archivo/clave de firma. El backend puede cambiar nombres después: modificar el adaptador, no repartir fetch entre pantallas.

Respuesta HTTP 200 JSON mínima: `{ "esCliente": false }` o `{ "esCliente": true, "estado": "ACTIVO", "redirectUrl": "<login oficial>" }`. El booleano es estricto; estado y redirectUrl son opcionales y deben ser strings. Un existente sigue siendo existente aunque el estado no sea ACTIVO: no se confunde con el estado SRI. Errores HTTP, 204, timeout de 8 segundos, JSON inválido o esquema inesperado → ERROR cerrado y mensaje público único, sin detalles técnicos.

Estados: IDLE → CHECKING → NEW_CLIENT / EXISTING_CLIENT / ERROR. Durante CHECKING: «Estamos verificando tu información...». Se deduplican consultas concurrentes; un resultado exitoso se reutiliza por la misma firma durante la sesión. Cambiar de firma invalida el resultado. ERROR permite consulta nueva al Reintentar. No se consulta en cada edición, ni se persiste RUC/resultado en almacenamiento del navegador.

`assets/services/portal-config.js` centraliza `TRIBUTASOFT_LOGIN_URL`, reutilizada del correo histórico: `https://tbc.tributasoft.ec/Erp-web/templates/registro/login.xhtml?faces-redirect=true`. Un cliente existente llega al portal mediante el CTA «Iniciar sesión». Un alta confirmada muestra brevemente la bienvenida y redirige automáticamente al mismo destino. Solo se admite el destino HTTPS fijo del archivo; los parámetros recibidos del backend no lo sustituyen.

### Mock local explícito

`server/cliente-mock.js`: `DEV_CLIENT_LOOKUP_MOCK`. Exclusivamente desarrollo con conexión loopback y origen validado. Acepta acceso directo desde `localhost`, `127.0.0.1` o `[::1]`; para Dev Tunnels reconstruye el origen público solo con un par único `X-Forwarded-Proto`/`X-Forwarded-Host` y exige coincidencia exacta con `DEV_ALLOWED_ORIGIN`. Requiere flag `1` y un RUC existente válido suministrado en variable de entorno de proceso. Ese RUC responde existente; los demás RUC válidos responden nuevos. No se guarda el identificador autorizado en fixtures ni código; pruebas automatizadas usan datos sintéticos generados. Sin configuración devuelve 503 y el gate se cierra. Nunca usar este mock como verificación productiva.

```powershell
$env:DEV_CLIENT_LOOKUP_MOCK='1'
$env:DEV_CLIENT_LOOKUP_EXISTING_RUC=Read-Host 'RUC autorizado solo para este proceso'
$env:DEV_ALLOWED_ORIGIN='https://subdominio-8000.use.devtunnels.ms' # solo si se usa un túnel
npm start
```

No hay DB, archivos de respuestas ni logs de RUC. Respuestas con Cache-Control: no-store. Para integrar backend real, implementar/reverse-proxy el endpoint propio y desactivar el mock.

Demo y localhost muestran expresamente que no envían correos y presentan el código de prueba en el modal. `DEV_EMAIL_TOKEN_MOCK` activa únicamente el correo en desarrollo; no cambia SRI, el gate de cliente, SMS ni el alta. Producción conserva envío/verificación por backend y falla cerrado si no responde. El código de prueba conserva formato, caducidad y coincidencia; el correo verificado se vincula a la dirección exacta y se invalida al editarla.

## Arquitectura RUC

```text
Frontend
  → GET /api/ruc/:ruc
  → backend propio
  → SRI
```

El navegador **no debe consultar directamente al SRI**. Se observaron cabeceras CORS incompatibles/duplicadas para consumo directo. El proxy propio hace la llamada servidor a servidor; no desactivar seguridad del navegador ni cambiar a browser → SRI. Maneja timeout, 204, errores upstream y JSON; el frontend normaliza el contrato tributario.

Endpoint público actualmente configurado para la prueba local:
`https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc?&ruc={ruc}`

Contrato aplicado:

- RUC: exactamente 13 dígitos, termina en `001` y pasa el dígito verificador.
- `204`: RUC no encontrado y sin body; nunca se llama `response.json()` en ese caso.
- `408` o `5xx`: indisponibilidad temporal; permite reintentar y bloquea el avance hasta confirmar ACTIVO.
- Respuesta malformada: error distinto; no se trata como RUC inexistente.
- Estado: manda `estadoContribuyenteRuc`. Solo ACTIVO con consulta exitosa para el mismo RUC permite avanzar. Una fecha de cese histórica no convierte por sí sola un RUC activo en cerrado.
- Advertencias: `contribuyenteFantasma = SI`, `transaccionesInexistente = SI` o estado `PASIVO` se muestran y se registran, sin decisión comercial irreversible desde frontend.
- Representante legal: solo información temporal de la firma en PASO 1; no se copia a Datos, Revisión ni al payload de registro.
- Fechas: se conservan desde `informacionFechasContribuyente`, tanto si llega como objeto como si llega como lista.
- Régimen y tipo: listas del formulario tributario original, centralizadas en `assets/utils/registration-data.js`. El tipo funcional usa banderas, no PERSONA NATURAL/SOCIEDAD.
- Nombre comercial: solo se renderiza si la consulta trae un valor útil. Actividad económica se conserva internamente, pero no se muestra en Datos.

`server/ruc-proxy.js` es un adaptador Node 18+ sin dependencias. La URL real del SRI no se inventa: debe configurarse en `SRI_RUC_URL` usando `{ruc}` como marcador.

## Ejecutar localmente

Requiere Node.js 18 o superior.

```powershell
cd D:\proyectos\tributasoft\registro
npm start
```

Abrir: [http://localhost:8000](http://localhost:8000)

El servidor de desarrollo escucha por defecto únicamente en `127.0.0.1`. Su superficie HTTP es fail-closed: sirve `index.html`, los tres textos legales, ocho archivos raíz de `assets/` y extensiones web permitidas dentro de `fonts`, `manual`, `parsers`, `screens`, `services` y `utils`. README, configuración, `.git`, `node_modules`, `server`, `tests`, `docs`, `scripts`, logs, dumps, certificados y cualquier otra ruta quedan fuera aunque el archivo exista. También se rechazan traversal, codificación repetida, separadores Windows y enlaces simbólicos/junctions. Los endpoints `/api` se procesan aparte y conservan sus controles de origen.

Sin `SRI_RUC_URL`, la consulta responde como servicio no configurado y el frontend bloquea el avance. Para conectar un upstream autorizado solo durante el proceso local:

```powershell
$env:SRI_RUC_URL='https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc?&ruc={ruc}'
npm start
```

Esta configuración es de proceso local; el equipo backend debe confirmar su configuración productiva. SRI 204 significa RUC no encontrado, sin body: comprobar status ANTES de response.json(). No confundirlo con timeout, 5xx ni JSON malformado.

## Endpoints backend pendientes

| Endpoint | Uso | Estado |
|---|---|---|
| `POST /api/registro/verificar-cliente` | Gate comercial | Adaptador listo; mock local explícito, backend real pendiente |
| `GET /api/ruc/:ruc` | Proxy y normalización SRI | Adaptador incluido; upstream pendiente |
| `POST /api/token/email` | Enviar OTP | Contrato cableado; backend real pendiente |
| `POST /api/token/verify` | Verificar OTP | Contrato cableado; backend real pendiente |
| `POST /api/registro` | Crear la cuenta | Contrato cableado; persistencia real pendiente |

El backend es la autoridad final para validar RUC, identidad/firma, sanitizar, limitar solicitudes, manejar sesión y escribir en base de datos.
En localhost y en el Dev Tunnel autorizado, `Crear cuenta` usa el mismo origen y `POST /api/registro`. El servidor solo responde con el mock no persistente cuando `NODE_ENV=development`, `DEV_REGISTRATION_MOCK=1` y el origen supera la allowlist local/túnel. Después de una respuesta exitosa, el frontend muestra brevemente «Bienvenido a TributaSoft» y redirige a `TRIBUTASOFT_LOGIN_URL`. En producción el mock falla cerrado: solo una respuesta exitosa del backend real permite esa bienvenida y redirección. El equipo backend debe implementar la persistencia y devolver éxito únicamente después de completar el alta real; un error HTTP mantiene al usuario en Revisión.

### Personalización post-creación — contrato pendiente

Después de un alta confirmada, el frontend permite previsualizar un logo o un provisional con la razón social. No guarda archivos en almacenamiento local ni inventa una llamada de red. El legacy esperaba un banner PNG de 2,970 × 300 px (9.9:1) dentro del payload inicial; el flujo nuevo ocurre después de crear la cuenta y todavía no tiene endpoint.

El equipo backend debe confirmar la ruta y autenticación del contrato post-creación. Requisitos ya cerrados: archivo JPG/JPEG o PNG, MIME verificado por firma binaria, máximo 500 KB, imagen decodificable y proporción 9.9:1 con tolerancia ±10%. Cuando exista el endpoint, deberá asociar el logo antes de mostrar la bienvenida. Si no hay archivo válido, el backend debe generar un banner 2,970 × 300 con la razón social en Roboto Condensed Bold y, debajo, correo y celular con iconos lineales. Hasta que exista este contrato, la pantalla es preview frontend y no afirma persistencia del logo.

## Responsabilidades de arquitectura

### Frontend

UX, validación local de firma y formato/dígito de RUC, consumo de endpoints propios y navegación. Validación básica de esquema y fallo cerrado. Sin SQL, credenciales, secretos ni tokens de DB. Los endpoints son visibles en DevTools: ocultarlos no es seguridad. El gate frontend NO es una barrera de seguridad.

### Backend TributaSoft — entrega requerida al equipo backend

1. Implementar POST /api/registro/verificar-cliente y confirmar contrato/nombres con el adaptador.
2. Exigir RUC `string` de 13 dígitos, sufijo `001` y dígito verificador; consultar DB con prepared statements/queries parametrizadas. La validación de formato no evita SQL injection. Devolver solo esCliente y, si aplica, estado/URL oficial.
3. Definir/confirmar URL de login/renovación; HTTPS y destino confiable coordinado con TRIBUTASOFT_LOGIN_URL.
4. Rate limiting, protección contra enumeración/abuso, sanitización, autenticación/autorización y CSRF según sesión aplicable. Logs seguros sin RUC crudo/credenciales.
5. Revalidar elegibilidad final de la promoción en POST /api/registro, de forma atómica antes del alta: no confiar en el booleano del navegador ni en el gate previo.
6. Configurar ruta/reverse proxy del mismo origen, TLS, Cache-Control: no-store, timeouts y errores controlados; desactivar/omitir DEV_CLIENT_LOOKUP_MOCK en producción.
7. Integrar el contrato de facturación por documento y los endpoints pendientes de correo/alta; el mock no prueba creación real de cuenta.
8. Verificar criptográficamente que el certificado corresponde al mismo RUC del draft; bloquear CI-only y no aceptar metadatos del navegador como `IDENTITY_VERIFIED`.

### Proxy SRI

Consulta servidor a servidor para evitar el problema CORS del navegador. Validación técnica de RUC/JSON, timeout, distinción de 204 sin body frente a 5xx/JSON malformado, respuesta controlada. No decide si alguien ya es cliente TributaSoft.

## Pruebas

```powershell
npm test
python .github\smoke-test.py
```

Las pruebas cubren formato y dígito verificador, representante presente o ausente, 204, timeout/5xx, respuesta malformada o de otro RUC, bloqueo de estados no activos, fechas objeto/lista, mapeo funcional, condicionales, vínculo del correo verificado, estructura de cuatro pasos y breakpoints responsive.

El gate agrega cobertura de nuevo/existente/error, validación de esquema, timeout/204/JSON malformado, URL de login válida/faltante/no confiable, mock desactivado fuera de local, deduplicación, reintento, cambio de firma y bloqueo de navegación antes de Datos. QA de navegador con firma sintética: existente hizo 1 lookup y 0 llamadas SRI; nuevo hizo 1 lookup y luego 1 SRI; error/reintento mantuvo Datos sin renderizar y 0 llamadas SRI. El RUC autorizado se verificó contra el proceso mock local sin guardarlo en fixtures ni capturas. No se probó DB/alta real.

## Privacidad, cookies y tracking

- `Politica-de-Privacidad.txt`: funcionamiento real y pendientes jurídicos.
- `Politica-de-Cookies.txt`: inventario de almacenamiento y Meta Pixel.
- Meta Pixel solo se carga en producción después de consentimiento explícito.
- La preferencia se guarda en `localStorage` como `tributasoft_analytics_consent`.
- Los puntos no confirmados están marcados `LEGAL_REVIEW_REQUIRED`.

## Documentación del rediseño

- `docs/V2-BACKEND-HANDOFF.md` — contrato consolidado, matriz de validaciones, auditoría y pendientes de integración.
- `CHANGELOG-V2.md` — alcance de la versión candidata `v2.0.0` (sin tag creado).
- `docs/REGISTRATION-FLOW.md` — contrato funcional vigente y verificación de correo integrada.
- `docs/REDESIGN-BASELINE.md`
- `docs/REDESIGN-AUDIT.md`
- `docs/REDESIGN-REPORT.md`

© 2026 TributaSoft S.A.
