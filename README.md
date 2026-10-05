# TributaSoft — Registro de 300 documentos gratis

Landing estática en HTML, CSS y JavaScript ES modules con un flujo responsive de cuatro pasos. No usa React, Vue, Vite, Tailwind ni un proceso de build.

## Flujo de registro

1. **Firma:** lee `.p12` o `.pfx` localmente con `node-forge`, valida el RUC, crea un draft, firma un challenge y entrega el paquete al backend para custodia temporal. La clave privada nunca sale del navegador; archivo y contraseña se eliminan de memoria después del upload confirmado.
2. **Gates previos:** el backend usa el RUC autoritativo del draft. Si ya es cliente, muestra «Ya eres cliente de TributaSoft». Si es nuevo, exige que figure como emisor electrónico autorizado antes de consultar sus datos tributarios.
3. **Datos:** consulta el catastro SRI; muestra snapshot oficial o captura manual identificada tras tres fallos transitorios, contacto y OTP ligados al draft.
4. **Facturación:** configuración inicial de Factura; otros documentos, establecimientos y puntos se administran después desde el perfil. Véase `docs/PASO3-FACTURACION.md`.
5. **Revisión:** resume identidad, datos tributarios, contacto y facturación antes del alta. Son cuatro pasos visibles; el gate no es un quinto paso.

```text
Firma local válida
  ↓
Draft + sesión/CSRF
  ↓
Challenge backend + verificación criptográfica
  ├─ cliente existente → pantalla específica → Portal TributaSoft (clic)
  └─ nuevo cliente
        ↓
      Consultas paralelas sobre el RUC autoritativo del draft
        ├─ POST .../issuer-authorization/check
        │    ├─ autorizado → habilita continuar
        │    ├─ no autorizado → guía de autoservicio y bloqueo
        │    └─ indisponible → reintentar, sin asumir resultado
        └─ POST .../sri/lookup
             ├─ SRI verificado y precargado
             └─ 3 fallos transitorios → MANUAL_ENTRY / cuenta restringida
        ↓
      Datos + OTP → Facturación → Revisión → complete idempotente
```

Ser cliente, figurar como emisor electrónico autorizado y tener RUC ACTIVO son tres controles distintos. El gate de cliente se resuelve primero; para un cliente nuevo, las otras dos consultas son independientes y paralelas. Un cliente existente no las ejecuta dentro de esta promoción.

### Cliente existente

El wizard V2 usa `POST /api/registro/drafts/{id}/client-check` con body vacío; el backend toma el RUC verificado del draft. `assets/services/cliente-service.js` y `POST /api/registro/verificar-cliente` se conservan únicamente para V1.

Respuesta V2 mínima: `{ "esCliente": false }` o `{ "esCliente": true }`. No revela razón social, estado ni otros datos. Un existente no consulta SRI dentro de la promoción.

La asociación `registrationId + sesión + RUC` y el rate limiting están definidos en `docs/V2-BACKEND-HANDOFF.md`. Cambiar la firma obliga a un draft nuevo.

`assets/services/portal-config.js` centraliza `TRIBUTASOFT_LOGIN_URL`, reutilizada del correo histórico: `https://tbc.tributasoft.ec/Erp-web/templates/registro/login.xhtml?faces-redirect=true`. Un cliente existente llega al portal mediante el CTA «Iniciar sesión». Un alta confirmada muestra brevemente la bienvenida y redirige automáticamente al mismo destino. Solo se admite el destino HTTPS fijo del archivo; los parámetros recibidos del backend no lo sustituyen.

### Mock local explícito

`server/cliente-mock.js`: `DEV_CLIENT_LOOKUP_MOCK`. Exclusivamente desarrollo con conexión loopback y origen validado. Acepta acceso directo desde `localhost`, `127.0.0.1` o `[::1]`; para Dev Tunnels reconstruye el origen público solo con un par único `X-Forwarded-Proto`/`X-Forwarded-Host` y exige coincidencia exacta con `DEV_ALLOWED_ORIGIN`. Requiere flag `1` y un RUC existente válido suministrado en variable de entorno de proceso. Ese RUC responde existente; los demás RUC válidos responden nuevos. No se guarda el identificador autorizado en fixtures ni código; pruebas automatizadas usan datos sintéticos generados. Sin configuración devuelve 503 y el gate se cierra. Nunca usar este mock como verificación productiva.

```powershell
$env:DEV_CLIENT_LOOKUP_MOCK='1'
$env:DEV_ISSUER_AUTHORIZATION_MOCK='by_ruc' # 'authorized' y 'not_authorized' siguen disponibles para un estado global
# En by_ruc, solo este caso muestra el estado guiado; los demás quedan autorizados.
$env:DEV_ISSUER_NOT_AUTHORIZED_RUC=Read-Host 'RUC de prueba sin autorización SRI'
$env:DEV_CLIENT_LOOKUP_EXISTING_RUC=Read-Host 'RUC autorizado solo para este proceso'
$env:DEV_ALLOWED_ORIGIN='https://subdominio-8000.use.devtunnels.ms' # solo si se usa un túnel
npm start
```

No hay DB, archivos de respuestas ni logs de RUC. Respuestas con Cache-Control: no-store. Para integrar backend real, implementar/reverse-proxy el endpoint propio y desactivar el mock.

El tutorial local usa el PIN `1234` sin mostrar etiquetas técnicas en la interfaz. Producción genera y verifica el OTP en backend y nunca lo devuelve al frontend. El correo verificado se vincula a la dirección exacta y se invalida al editarla.

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

Esta variable es solo de proceso local. En producción el backend configura el upstream SRI como secreto/configuración operativa y aplica el contrato del handoff. SRI 204 significa RUC no encontrado, sin body: comprobar status ANTES de response.json(). No confundirlo con timeout, 5xx ni JSON malformado.

## Contrato backend V2

| Endpoint | Uso | Estado frontend/mock |
|---|---|---|
| `POST /api/registro/drafts` | Crear draft, sesión, CSRF y consentimiento | Cableado y mock contractual |
| `/api/registro/drafts/{id}/signature-challenges...` | Challenge y prueba de posesión | Cableado; PKI real es backend-required |
| `POST /api/registro/drafts/{id}/certificate-package` | Custodia temporal | Cableado; cifrado/KMS real es backend-required |
| `POST /api/registro/drafts/{id}/client-check` | Gate comercial | Cableado y mock contractual |
| `POST /api/registro/drafts/{id}/issuer-authorization/check` | Gate de emisor electrónico autorizado | Cableado; consulta real exclusivamente backend |
| `POST /api/registro/drafts/{id}/sri/lookup` | Proxy SRI | Cableado con tres intentos/fallback |
| `PUT /api/registro/drafts/{id}/tax-data` | `MANUAL_ENTRY` o `SRI_CONFIRMATION` | Cableado y mock contractual |
| `.../contact`, `.../otp/email/*`, `.../billing` | Contacto, OTP y facturación | Cableado y mock contractual |
| `POST /api/registro/drafts/{id}/complete` | Alta idempotente | Cableado; transacción real pendiente |
| `PUT /api/registro/accounts/{accountId}/logo` | Logo persistente post-creación | Cableado y mock contractual |

Las rutas V1 `POST /api/registro`, `/api/registro/verificar-cliente`, `/api/token/*` y `GET /api/ruc/:ruc` permanecen solo para consumidores legacy. No son autoridad del wizard V2. El contrato ejecutable completo está en `docs/V2-BACKEND-HANDOFF.md`.

El backend es la autoridad final para validar RUC, identidad/firma, sanitizar, limitar solicitudes, manejar sesión y escribir en base de datos.
En localhost y en el Dev Tunnel autorizado, `Crear cuenta` usa el mismo origen y `POST /api/registro/drafts/{id}/complete` con `Idempotency-Key`. El servidor solo responde con el mock no persistente cuando `NODE_ENV=development`, `DEV_REGISTRATION_MOCK=1` y el origen supera la allowlist local/túnel. En producción el mock falla cerrado: solo el backend real puede confirmar el alta.

Política cerrada para indisponibilidad persistente del SRI: después de tres intentos transitorios fallidos, el usuario puede completar el alta con datos declarados. La cuenta permite login y funciones no tributarias, pero nace con `ACCOUNT_TAX_DATA_STATUS=PENDING_SRI_RECONCILIATION`; emisión/autorización electrónica y las funciones tributarias que requieren datos verificados permanecen bloqueadas. El backend reconcilia posteriormente con SRI y solo cambia a `VERIFIED` cuando la comprobación es satisfactoria.

### Personalización post-creación

Después de un alta confirmada, el frontend llama `PUT /api/registro/accounts/{accountId}/logo` con el bearer post-creación de 10 minutos. El upload acepta JPG/JPEG o PNG, máximo 250 KB, y el backend valida/re-encodea antes de persistir en storage privado. Si el usuario no aporta una imagen, el navegador genera un JPG de 2,970 × 300 px con la razón social en Roboto Condensed Light y lo envía por el mismo multipart; el backend siempre recibe un archivo real.

El JPG provisional conserva fondo blanco y presenta la razón social en negro con Roboto Condensed Light. Debajo incluye el correo y celular registrados con iconos lineales; la imagen resultante se envía al backend por multipart.

## Responsabilidades de arquitectura

### Frontend

UX, validación local de firma y formato/dígito de RUC, consumo de endpoints propios y navegación. Validación básica de esquema y fallo cerrado. Sin SQL, credenciales, secretos ni tokens de DB. Los endpoints son visibles en DevTools: ocultarlos no es seguridad. El gate frontend NO es una barrera de seguridad.

### Backend TributaSoft — entrega requerida al equipo backend

1. Implementar el contrato normativo de `docs/V2-BACKEND-HANDOFF.md` sin usar las rutas V1 como autoridad.
2. Persistir draft/sesión/CSRF, aplicar TTL, cancelación, cleanup y rate limits cerrados.
3. Verificar criptográficamente certificado, trust store, revocación y RUC antes de `IDENTITY_VERIFIED`.
4. Custodiar PKCS#12 y contraseña mediante envelope encryption y KMS/Vault.
5. Implementar lookup cliente y SRI con queries parametrizadas, anti-enumeración y reconciliación.
6. Implementar OTP server-side, complete transaccional/idempotente y secuencias atómicas.
7. Validar y persistir el archivo de logo recibido, incluido el JPG provisional generado por el frontend.
8. Mantener mocks y excepciones de Dev Tunnel fuera de producción.

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
