# TributaSoft Registro V2 — handoff backend y cierre técnico

Estado del documento: auditoría del frontend real en la rama de trabajo. No representa despliegue, tag ni aprobación productiva.

## 1. Baseline auditado

- Rama: `redesign/registro-300-v2`.
- HEAD inicial de esta auditoría: `1f9bda34843c058e6eb7847334fd9cc7c9434199`.
- Stack: HTML, CSS y módulos ES nativos; servidor Node 18+ sin dependencias NPM.
- Flujo visible: cuatro pasos (`firma`, `datos`, `facturacion`, `resumen`).
- Suite inicial: 89 pruebas aprobadas; smoke test con 0 errores y 0 advertencias.
- Árbol inicial: cambios V2 locales sin commit, incluidos archivos modificados y nuevos. Esta auditoría no los descartó ni sobrescribió.
- No se ejecutaron push, merge, tag, release ni deploy.

## 2. Arquitectura vigente

```text
Navegador
  ├─ Paso 1: procesa PKCS#12 localmente
  │    └─ POST /api/registro/verificar-cliente
  ├─ Paso 2: GET /api/ruc/:ruc
  │    └─ backend/proxy → SRI
  ├─ Paso 2: POST /api/token/email y /api/token/verify (producción)
  ├─ Paso 3: construye facturación por documento
  └─ Paso 4: POST /api/registro
        ├─ personalización de logo solo en memoria (contrato backend pendiente)
        └─ bienvenida → portal de login configurado
```

El navegador es una capa de experiencia y prevalidación. El backend debe ser autoridad de identidad, elegibilidad, OTP, reglas tributarias, secuencias, persistencia y auditoría.

## 3. Entornos y separación de mocks

### Desarrollo directo

- Host frontend: `localhost`, `127.0.0.1` o `0.0.0.0`.
- `POST /api/registro/verificar-cliente` y `POST /api/registro` usan mismo origen en el servidor del puerto 8000.
- El mock de cliente exige `NODE_ENV=development`, `DEV_CLIENT_LOOKUP_MOCK=1`, conexión loopback y configuración válida.
- El mock de alta exige `NODE_ENV=development`, `DEV_REGISTRATION_MOCK=1`, conexión loopback y origen autorizado.
- El correo usa código de prueba visible; no envía un correo real.
- El proxy SRI exige `SRI_RUC_URL` y nunca debe llamar al SRI desde el navegador.

### Dev Tunnel

- Se publica únicamente el puerto 8000.
- `DEV_ALLOWED_ORIGIN` debe contener un único origin HTTPS exacto, sin ruta, credenciales ni wildcard.
- El servidor acepta el túnel solo en desarrollo, desde loopback, con Host/Origin locales coherentes y un único `X-Forwarded-Proto=https` y `X-Forwarded-Host` que reconstruyan exactamente el origin autorizado.
- Producción ignora esta excepción y falla cerrado.

### Demo estática

- Un host no reconocido se clasifica como `demo`.
- No existe backend real; token y alta se simulan en navegador.
- El gate de cliente y la consulta SRI no tienen fallback estático; por ello el wizard completo no termina en un hosting estático sin API/reverse proxy.
- Sirve para componentes aislados, no para comprobar el flujo completo, persistencia, envío de correo ni creación de cuenta.

### Producción

- Hosts reconocidos: `www.tributasoft.com.ec`, `tributasoft.com.ec`, `app.tributasoft.ec`.
- API configurada: `https://api.tributasoft.ec`.
- OTP y alta apuntan a esa API. Gate de cliente y SRI conservan rutas relativas, por lo que cada host frontend productivo necesita reverse proxy para `/api/registro/verificar-cliente` y `/api/ruc/:ruc`, o una decisión explícita de adaptador.
- No se habilitan mocks de servidor ni correo.
- Solo un 2xx del backend real permite pasar a personalización, bienvenida y redirección.

## 4. Flujo real de punta a punta

1. El usuario selecciona `.p12`/`.pfx`, ingresa la clave y acepta términos.
2. El navegador comprueba extensión, tamaño, estructura PKCS#12, clave, certificado, fecha de caducidad y RUC extraído. El RUC debe ser un `string` de 13 dígitos, terminar en `001` y superar el dígito verificador ecuatoriano; una firma identificada únicamente con CI se bloquea y no dispara llamadas. No comprueba `notBefore`, cadena de confianza, revocación ni posesión de la clave privada. La clave se limpia y el control de archivo se resetea tras la lectura; solo quedan metadatos.
3. Se envía únicamente el RUC a `POST /api/registro/verificar-cliente`.
4. Si el RUC ya existe, se muestra el estado específico y el CTA de login. Si el gate falla, el flujo se bloquea. Solo un cliente nuevo continúa.
5. `GET /api/ruc/:ruc` consulta el proxy propio. El proxy realiza hasta tres intentos totales solo ante timeout, red o HTTP 5xx, con backoff y jitter; 204 y 4xx no se reintentan. Si persiste la indisponibilidad, el formulario habilita ingreso manual identificado como `MANUAL_PENDING`, nunca como verificación oficial.
6. Se muestran razón social/RUC como lectura, los datos tributarios mapeados y los campos editables de contacto. `N.º de resolución` aparece solo para tipos configurados.
7. El correo se verifica en modal/bottom sheet. El avance queda vinculado al email exacto verificado.
8. Facturación pide elegir `continuar` o `nuevo` y construye el objeto por documento.
9. Revisión muestra los datos esenciales y permite volver a Datos o Facturación.
10. `Crear cuenta` ejecuta anti-bot local y `POST /api/registro`. La excepción es el host `demo`: el adaptador devuelve un éxito simulado sin petición; ese modo no prueba un alta.
11. Tras un 2xx, el usuario puede previsualizar un logo o provisional. Hoy ese resultado no se envía ni persiste.
12. Se muestra la bienvenida y, tras 1,600 ms, se redirige a `TRIBUTASOFT_LOGIN_URL`.

## 5. Contratos de endpoints

### 5.1 `POST /api/registro/verificar-cliente`

Request actual:

```json
{ "ruc": "<13 dígitos>" }
```

Respuesta 200 aceptada:

```json
{ "esCliente": false }
```

o:

```json
{ "esCliente": true, "estado": "ACTIVO", "redirectUrl": "https://destino-confiable.example/login" }
```

- `esCliente` debe ser booleano estricto.
- `estado` y `redirectUrl` son opcionales y deben ser strings si existen.
- El frontend no usa un redirect arbitrario: lo valida contra el destino fijo confiable.
- Timeout frontend: 8 segundos.
- HTTP no exitoso, 204, JSON inválido o esquema inesperado: gate cerrado.
- Backend: validar RUC, consulta parametrizada/prepared statement, mínimo dato de respuesta, `Cache-Control: no-store`, rate limiting y protección contra enumeración. La validación del RUC no sustituye la parametrización SQL.

### 5.2 `GET /api/ruc/:ruc`

- Parámetro: RUC de 13 dígitos que supera validación ecuatoriana y termina en `001`.
- 200: JSON SRI; el frontend normaliza y comprueba que la respuesta pertenezca al RUC consultado.
- 204: no encontrado, sin body.
- 400: RUC inválido.
- 408: timeout del upstream.
- 502: respuesta SRI malformada.
- 503: upstream no configurado o no disponible. Una indisponibilidad persistente confirmada tras tres intentos devuelve `SRI_UNAVAILABLE` y el número de intentos.
- Backend productivo recomendado: devolver solo los campos requeridos por el registro, no retransmitir el documento SRI completo.
- No reintentar 204, RUC inválido ni 4xx de datos/request. Registrar en el draft intentos, timestamp del último intento, estado, fuente y error técnico normalizado, sin datos personales.

### 5.3 `POST /api/token/email`

Request actual:

```json
{ "destino": "usuario@example.com" }
```

- Producción no debe devolver el código.
- El frontend solo requiere HTTP 2xx para continuar con el ingreso del OTP.
- Backend: código de seis dígitos, TTL de 5 minutos, hash en reposo, máximo de intentos, cooldown, rate limit por IP/destino y respuesta no enumerable.

### 5.4 `POST /api/token/verify`

Request actual:

```json
{ "canal": "email", "destino": "usuario@example.com", "codigo": "123456" }
```

Respuesta consumida:

```json
{ "valid": true }
```

- El backend debe vincular el desafío a destino, sesión, propósito y TTL; consumirlo al validar y limitar intentos.
- El frontend no debe recibir el token esperado ni ser autoridad de verificación.

### 5.5 `POST /api/registro`

El frontend envía hoy:

```json
{
  "ruc": "<ruc>",
  "razonSocial": "Empresa de ejemplo",
  "nombreComercial": "Nombre opcional",
  "estadoContribuyenteRuc": "ACTIVO",
  "actividadEconomica": "Actividad normalizada",
  "regimen": "GENERAL",
  "tipoContribuyente": "AGENTE_RETENCION",
  "noResolucion": "NAC-EJEMPLO-00000001",
  "email": "usuario@example.com",
  "celular": "0990000000",
  "facturacion": {
    "modo": "continuar",
    "documentos": [
      { "tipo_documento": "factura", "establecimiento": "001", "punto_emision": "001", "secuencia": "000000027" }
    ]
  },
  "firma": {
    "titular": "Titular de ejemplo",
    "ruc": "<ruc>",
    "caducidad": "<fecha>",
    "esJuridica": true
  },
  "sri": {
    "source": "SRI",
    "status": "OK",
    "attempts": 1,
    "lastAttemptAt": "<timestamp>",
    "errorCode": null,
    "declared": null
  },
  "terminosAceptados": true,
  "validacionSriPendiente": false
}
```

Contrato de respuesta actual: cualquier HTTP 2xx se considera alta confirmada; JSON es opcional. Cualquier no-2xx o error de red mantiene al usuario en Revisión y no redirige.

`noResolucion` ya forma parte del contrato de alta y es obligatorio para agente de retención, contribuyente especial y gran contribuyente. El backend debe repetir formato, longitud, obligatoriedad condicional y nulabilidad para los demás tipos.

Obligaciones backend:

- Revalidar esquema, longitudes, enumeraciones y coherencia entre campos.
- No confiar en `estadoContribuyenteRuc`, `tipoContribuyente`, `firma`, `tokenEmailOk` ni elegibilidad calculados por cliente.
- Reconsultar/validar SRI y cliente existente según política, dentro de la operación de alta.
- Verificar criptográficamente el certificado y exigir un RUC válido de 13 dígitos terminado en `001`; bloquear CI-only y comprobar que el RUC certificado coincide con el RUC del draft. Solo entonces marcar `IDENTITY_VERIFIED`. Los metadatos del navegador no son prueba.
- Cuando `sri.source=MANUAL`, validar de nuevo todos los campos declarados, conservar `MANUAL_PENDING` y programar reconciliación sin presentarlos como datos oficiales.
- Crear cuenta, configuración de documentos y secuencias en una transacción idempotente.
- Resolver concurrencia de secuencias y promoción sin condiciones de carrera.
- Responder éxito solo después de persistencia completa.
- No registrar firma, clave, OTP ni payload completo con datos personales.

### 5.6 Logo post-creación

No existe endpoint ni payload aprobado. El frontend valida/previsualiza y luego descarta el resultado. Backend debe acordar antes de integrar:

- ruta, método, autenticación y asociación con la cuenta recién creada;
- `multipart/form-data`, carga firmada u otro transporte;
- respuesta de confirmación y comportamiento de reintento;
- si la redirección espera la persistencia del logo;
- generación del provisional en backend.

No se debe inventar este endpoint desde frontend.

## 6. Matriz de validaciones y autoridad

| Dato | Frontend vigente | Backend obligatorio |
|---|---|---|
| Archivo firma | `.p12`/`.pfx`, máximo 8 MB | Límite de body, tipo real y estrategia de verificación de identidad |
| Clave firma | requerida; se limpia tras lectura | No recibirla ni registrarla salvo arquitectura aprobada distinta |
| Certificado | parseable, descifrable, con certificado, no caducado; CI-only bloqueada | Verificar criptografía/cadena/revocación según política y que el certificado corresponda al mismo RUC del draft |
| RUC | `string` exacto de 13 dígitos, provincia 01–24, tipo permitido, dígito verificador y sufijo `001` | Repetir exactamente; usar prepared statements. La validación no es una defensa SQLi |
| Cliente existente | gate por RUC | Autoridad DB, rate limit, respuesta mínima y control de enumeración |
| Estado SRI | mismo RUC y `ACTIVO`; tras tres fallos transitorios permite datos manuales marcados | Revalidar con fuente confiable; mantener `MANUAL_PENDING`, auditoría de intentos y reconciliación |
| Razón social | obligatoria, solo lectura tras SRI | Normalizar y tomar la fuente autorizada |
| Nombre comercial | opcional, solo si existe | Longitud/sanitización y nulabilidad |
| Régimen | enum `GENERAL`, `RIMPE - EMPRENDEDOR`, `RIMPE - NEGOCIO POPULAR` | Enum y coherencia con SRI |
| Tipo | enum funcional de cinco valores | Enum y coherencia con SRI |
| N.º resolución | condicional; caracteres `A-Z`, `0-9`, `- . / _` y espacios; 8–30 alfanuméricos | Condicional, normalización y decisión contractual pendiente |
| Email | regex básica, minúsculas y OTP vinculado al valor exacto | Normalización robusta, OTP de servidor, unicidad/política comercial |
| Celular | regla por país; Ecuador se normaliza a `09XXXXXXXX` | Validación y formato canónico de persistencia |
| Modo facturación | `nuevo` o `continuar` | Enum y reglas de negocio |
| Establecimiento/punto | exactamente 3 dígitos y distinto de `000` | Repetir y validar autorización/coherencia tributaria |
| Secuencia | 1–9 dígitos al editar; payload normalizado a 9 | Repetir; incremento atómico según semántica vigente |
| Términos | checkbox requerido | Registrar versión, fecha, evidencia y sesión; no confiar solo en booleano |
| Logo | JPG/PNG por magic bytes, ≤500 KB, decodificable, proporción 9.9:1 ±10% | Repetir validación, limitar píxeles, redecodificar/reencodar y almacenar fuera del webroot |

## 7. PASO 3 — contrato exacto

Tipos: `factura`, `guia`, `nc`, `nd`, `liquidacion`, `retencion`.

- Factura siempre existe y no puede eliminarse.
- En `continuar`, se envía Factura más los documentos adicionales seleccionados.
- Al desmarcar un adicional se borra su estado y deja de enviarse.
- Al cambiar de ruta se eliminan adicionales residuales.
- El usuario introduce la última secuencia utilizada; el frontend acepta 1–9 dígitos y la normaliza a nueve con ceros a la izquierda. El backend debe emitir la siguiente secuencia de forma atómica.
- En `nuevo`, Factura aparece como acordeón colapsado y puede abrirse/editarse. Sus valores actuales llegan al payload; los otros cinco tipos, no visibles, se incluyen con defaults `001`/`001`/`000000001`.
- Se mantiene una proyección legacy interna de Factura (`codEstablecimiento`, `codPunto`, `secuencias`) para consumidores antiguos; el contrato nuevo es `facturacion.documentos[]`.
- No hay multipunto dentro de un mismo tipo de documento.

## 8. Creación, idempotencia y redirección

- El frontend no genera idempotency key. El backend debe definir una estrategia estable por intento/sesión para impedir altas duplicadas por doble clic, timeout o reintento.
- La verificación de cliente previa no reemplaza la comprobación atómica durante el alta.
- El backend debe reservar/configurar secuencias dentro de la misma transacción o con control equivalente.
- El frontend redirige únicamente tras HTTP 2xx de `POST /api/registro` y cierre del paso de logo.
- Destino actual: constante fija en `assets/services/portal-config.js`.
- Si el alta falla, no hay bienvenida ni redirección.

## 9. Contrato requerido para logo provisional

Requisitos cerrados de frontend:

- JPG/JPEG o PNG; magic bytes coherentes con MIME.
- Máximo 500 KB.
- Imagen decodificable.
- Recomendado 2,970 × 300 px; proporción 9.9:1, tolerancia ±10%.
- Provisional: razón social en negro y negrita; debajo, correo y celular con iconos lineales.

Requisitos backend mínimos:

- Repetir MIME/magic bytes/tamaño/dimensiones y añadir límite de píxeles para evitar bombas de descompresión.
- Reencodar la imagen con una biblioteca segura y eliminar metadatos.
- Nombre de almacenamiento generado por servidor; nunca usar el nombre del usuario como ruta.
- Acceso autenticado y autorización sobre la cuenta creada.
- Generar el provisional del lado servidor cuando no haya logo.
- Definir retención, reemplazo, CDN/cache y eliminación.

## 10. Auditoría de seguridad propia

### Alta — S-01: autoridad criptográfica pendiente en backend

- Lugar: `assets/parsers/firma-validator.js`, `assets/screens/screen-firma.js`, `assets/wizard.js`.
- Causa: la firma se procesa solo en el navegador y el alta envía metadatos modificables, no prueba criptográfica ni certificado autenticado.
- Mitigación frontend aplicada: CI-only bloqueada y RUC `string` estricto, 13 dígitos, sufijo `001` y dígito verificador antes de toda llamada.
- Riesgo residual: un cliente manipulado puede fabricar metadatos. La solución obligatoria es desafío firmado o validación segura de certificado/posesión en backend, con coincidencia exacta contra el RUC del draft, cadena de confianza, vigencia y política de revocación aprobadas.

### Cerrada — S-02: dependencia ejecutable de firma desde CDN

- Lugar: `assets/parsers/firma-validator.js:18-35`.
- Corrección: `node-forge@1.3.1` se sirve desde `/assets/node-forge-1.3.1.min.js`; prueba automatizada fija SHA-256 `dc67fd132427ad96c9666c844b39565413c40ddb1f2d063c53512fbf6d387dfd`. No hay request remoto de forge.

### Cerrada — S-03: resolución en el payload

- Lugar: `assets/wizard.js:219-228`.
- Corrección: `noResolucion` se incluye y el mock repite obligatoriedad y formato condicional. El backend productivo debe implementar la misma regla.

### Media — S-04: enumeración del estado de cliente

- Lugar: `POST /api/registro/verificar-cliente`.
- Impacto: automatización sobre RUC válidos puede inferir relación comercial.
- Solución backend: rate limit, detección de abuso, respuesta mínima, auditoría segura y, si el negocio lo admite, vincular la consulta a una prueba de firma/sesión.

### Media — S-05: proxy SRI devuelve respuesta cruda

- Lugar: `server/ruc-proxy.js`.
- Impacto: el navegador recibe más campos de los necesarios y el túnel de desarrollo puede convertirse en proxy de consulta si se publica sin controles adicionales.
- Solución backend: normalizar/filtrar en servidor, aplicar rate limit y autenticar/proteger el entorno de desarrollo.

### Media — S-06: controles anti-clickjacking solo en meta

- Lugar: `index.html`.
- Impacto: `frame-ancestors` no se aplica de forma fiable desde meta y `X-Frame-Options` requiere cabecera HTTP.
- Solución: configurar CSP, X-Frame-Options/ancestors, HSTS, nosniff, Referrer-Policy y Permissions-Policy como cabeceras del servidor/CDN productivo.

### Media — S-07: logo sin límite de píxeles

- Lugar: `assets/screens/post-create-logo.js`.
- Impacto: una imagen comprimida pequeña con dimensiones enormes puede consumir memoria al decodificar.
- Corrección local: tamaño, extensión, MIME y magic bytes se validan antes de decodificar. Sigue pendiente un límite de ancho/alto/píxeles y su repetición estricta en backend.

### Media — S-08: OTP productivo pendiente

- Lugar: `assets/services/token-service.js`.
- Impacto: sin backend no hay prueba de posesión del correo; el mock es manipulable por definición.
- Solución: endpoints productivos con TTL, hash, intentos, cooldown, rate limit, sesión y consumo único.

Corrección local incorporada: la respuesta de verificación solo se acepta si `valid` existe y es booleano estricto; `"false"`, objetos incompletos, listas y `null` fallan cerrado.

### Baja — S-09: retención del archivo de firma

- Lugar: `assets/screens/screen-firma.js`.
- Corrección local: la referencia al `File` y el valor del input se limpian después de extraer metadatos válidos; la clave ya se limpiaba.

### Baja — S-10: CSP no permitía la API configurada

- Lugar: `index.html` y `assets/services/config.js`.
- Corrección local: se añadió `https://api.tributasoft.ec` a `connect-src`; el origen ya era la configuración productiva existente.

No se encontraron credenciales, claves privadas ni tokens secretos versionados. El identificador de Meta es público. El wizard no persiste RUC, firma, clave, OTP ni datos del formulario en `localStorage`/`sessionStorage`; solo se guarda consentimiento analítico y progreso del manual separado.

### Alta — S-11: servidor de desarrollo expone el repositorio

- Lugar: `server/dev-server.js`.
- Evidencia independiente: `GET /.git/HEAD` respondió 200 con el servidor publicado.
- Impacto: un visitante del host/túnel puede descargar archivos internos del repositorio y cualquier material local que aparezca bajo la raíz.
- Corrección aprobada por el owner: allowlist explícita de archivos raíz y extensiones dentro de `assets/`, rechazo de traversal/codificación repetida/separadores alternativos, comprobación de ruta real, bloqueo de symlinks/junctions y bind loopback por defecto. Verificado por localhost y Dev Tunnel real: `/.git/HEAD`, archivos internos y rutas fuera de la superficie ya no son accesibles.

### Media — S-12: URI malformada derribaba el servidor de desarrollo

- Lugar: `server/dev-server.js`.
- Corrección local: parseo/decodificación protegidos; una URI inválida devuelve 400 sin finalizar el proceso.

### Revisión independiente Astra

Una revisión independiente contrastó este documento contra el código y ejecutó reproducciones focalizadas. Los hallazgos corregibles en frontend quedaron cubiertos con pruebas. La autoridad criptográfica de identidad y la persistencia del logo siguen siendo contratos de backend.

## 11. Controles backend obligatorios

- TLS, CORS exacto por entorno y CSRF cuando se usen cookies/credenciales.
- Límites de tamaño antes de parsear JSON/archivos; timeouts y cancelación de upstreams.
- Validación de esquema allowlist; rechazar campos inesperados cuando corresponda.
- Queries parametrizadas y cuenta DB de privilegio mínimo.
- Secretos solo en gestor/variables del entorno, nunca en frontend o repositorio.
- Logs estructurados con correlation ID, sin RUC completo, email completo, celular, firma, clave, OTP ni payload integral.
- Rate limiting por IP/sesión/identificador, protección contra enumeración y alertas.
- Idempotencia y transacciones para alta, promoción y secuencias.
- Respuestas públicas estables sin stack traces ni detalles de infraestructura.
- Dependencias fijadas, escaneo de vulnerabilidades y parches documentados.

## 12. Observabilidad mínima

Registrar: endpoint, timestamp, correlation ID, latencia, status, clase de error, upstream y resultado agregado. Enmascarar identificadores. No registrar cuerpos sensibles. Métricas mínimas: tasa de 2xx/4xx/5xx, latencias p50/p95/p99, timeouts SRI, envíos/verificaciones OTP, conflictos/idempotencia de alta y fallos de logo. Alertas sobre aumento de 5xx, abuso, errores SRI sostenidos y duplicados.

## 13. Checklist para el equipo backend

1. Versionar el contrato de `POST /api/registro`, incluido `noResolucion` y el sobre `sri`.
2. Implementar gate de cliente con consulta parametrizada y control de enumeración.
3. Implementar proxy SRI filtrado y resiliente.
4. Implementar OTP de correo del lado servidor.
5. Definir y construir la verificación backend de firma/identidad.
6. Persistir alta y facturación por documento de forma transaccional e idempotente.
7. Definir contrato de logo post-creación y provisional.
8. Configurar CORS/CSRF/cookies, cabeceras HTTP, rate limits, secretos y observabilidad.
9. Probar contratos contra este frontend antes de desactivar mocks.
10. Ejecutar prueba de extremo a extremo en staging sin datos personales reales.

## 14. Criterio de salida

El paquete queda listo para que backend empiece integración y el Dev Tunnel de desarrollo ya no expone el repositorio. No está listo para etiqueta productiva mientras falten la autoridad criptográfica de identidad, los endpoints productivos/drafts, la reconciliación SRI manual y el contrato/persistencia del logo. La versión propuesta cuando se cierren esos puntos es `v2.0.0`.

## 15. Referencias

- `README.md`
- `DEV-LOCAL.md`
- `docs/REGISTRATION-FLOW.md`
- `docs/PASO3-FACTURACION.md`
- `SECURITY-AUDIT.md` (histórico; este documento refleja el flujo V2 actual)
- `assets/wizard.js`
- `assets/services/*.js`
- `assets/screens/*.js`
- `server/*.js`
- `tests/*.test.js`
