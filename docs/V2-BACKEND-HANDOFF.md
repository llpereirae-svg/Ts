# TributaSoft Registro V2 — contrato definitivo para backend

Estado: **READY FOR BACKEND IMPLEMENTATION**. Audiencia: equipo backend. Fecha contractual revisada: 2026-10-05.

Este documento es la fuente normativa del Registro V2. El código frontend y el mock de desarrollo deben coincidir con él. Las rutas legacy permanecen únicamente para consumidores V1 y no son autoridad del flujo V2.

## 1. Flujo y autoridad

1. El navegador valida y abre localmente `.p12`/`.pfx`, obtiene un RUC candidato y bloquea CI-only o RUC inválido.
2. Crea un draft server-side con consentimiento versionado.
3. Prueba posesión de la clave privada firmando un challenge backend.
4. Backend verifica certificado, identidad y RUC; solo entonces produce `IDENTITY_VERIFIED`.
5. El navegador sube PKCS#12 y contraseña para custodia temporal cifrada.
6. Backend verifica cliente existente. Solo para un cliente nuevo, el frontend inicia en paralelo la autorización de emisor y la consulta del catastro SRI; ambas usan el RUC autoritativo del draft.
7. Contacto, OTP, datos tributarios y facturación quedan asociados al draft.
8. `complete` crea la cuenta de forma transaccional e idempotente.
9. El logo se persiste después de crear la cuenta; si no se carga uno, el frontend genera el JPG provisional y lo envía como archivo.

El frontend nunca es autoridad sobre identidad, SRI, OTP, secuencias, consentimiento, elegibilidad ni creación de cuenta.

## 2. Sesión y CSRF

### 2.1 Cookie de sesión

- Nombre productivo: `__Host-ts_registration_session`.
- Valor: identificador opaco aleatorio de al menos 256 bits; nunca `registrationId`.
- Atributos obligatorios: `HttpOnly; Secure; SameSite=Lax; Path=/` y sin `Domain`.
- Se emite al crear el primer draft. En desarrollo HTTP local el mock usa `ts_registration_session_dev`, sin `Secure`; esa excepción no existe en producción.
- Cada draft guarda asociación inmutable `registrationId + sessionId + RUC`.
- `registrationId` por sí solo no autentica ni permite recuperar un draft.

### 2.2 CSRF

- `POST /drafts` acepta una sesión nueva y exige Origin/Fetch Metadata same-origin.
- La respuesta de creación entrega `csrfToken` aleatorio de 256 bits. Backend almacena solo su hash.
- Toda mutación posterior del draft exige cookie válida y `X-CSRF-Token` exacto.
- El token se conserva únicamente en memoria del frontend. No va en URL, logs, analytics ni localStorage.
- El endpoint de logo usa bearer post-creación y no depende de autenticación ambiental por cookie.

### 2.3 Renovación y navegación

- Una petición autenticada y aceptada renueva la inactividad del draft, nunca su límite absoluto.
- No se rota el session ID durante el draft para no romper pestañas concurrentes. Se revoca la asociación específica al completar, cancelar o expirar.
- Varias pestañas del mismo navegador pueden tener drafts distintos y sus respectivos CSRF tokens.
- Un segundo dispositivo, aun con `registrationId`, recibe `SESSION_REQUIRED`/`SESSION_MISMATCH`.
- Si se pierde cookie o token CSRF, el draft no se recupera con datos personales: se descarta y el usuario reinicia el registro.
- TTL de inactividad: 30 minutos. TTL absoluto: 2 horas. Cleanup: cada 5 minutos.

## 3. State machine

Estados:

```text
PENDING
  -> IDENTITY_VERIFIED
  -> SRI_PENDING
  -> CONTACT_VERIFIED
  -> READY_TO_CREATE
  -> CREATING
  -> COMPLETED

Cualquier estado no terminal -> CANCELLED
Cualquier estado no terminal vencido -> EXPIRED
```

Las operaciones pueden completarse en distinto orden después de `IDENTITY_VERIFIED`; `refreshReadiness` conserva `SRI_PENDING` mientras no exista snapshot SRI ni declaración manual admitida. `READY_TO_CREATE` requiere identidad, paquete de certificado, cliente nuevo, autorización de emisor `AUTHORIZED`, datos tributarios, email verificado, facturación y consentimiento.

Checkpoints que debe registrar y revalidar el backend:

| ID | Condición | Petición que aporta evidencia | Regla de cierre |
|---|---|---|---|
| CP0 | identidad verificada y paquete bajo custodia | challenge verify + certificate-package | sin ambos no se ejecuta `client-check` |
| CP1 | RUC no pertenece a un cliente existente | `client-check` | `esCliente=true` termina la promoción; error no equivale a nuevo |
| CP2 | emisor electrónico autorizado | `issuer-authorization/check` | solo `AUTHORIZED` pasa; `NOT_AUTHORIZED` y `UNAVAILABLE` son ramas distintas |
| CP3 | datos tributarios utilizables | `sri/lookup` o `MANUAL_ENTRY` admitido | snapshot debe ser del mismo RUC y `ACTIVO`; manual exige tres fallos transitorios registrados |
| CP4 | contacto verificado | contact + OTP email | la verificación pertenece al correo exacto y al draft |
| CP5 | alta preparada | billing + `complete` | revalidar CP0–CP4, unicidad e idempotencia dentro de la transacción |

Después de CP1, CP2 y CP3 pueden completarse en cualquier orden. La implementación frontend actual inicia ambas peticiones juntas, espera CP2 antes de mostrar Datos y después consume el resultado precargado de CP3.

Estados terminales: `COMPLETED`, `EXPIRED`, `CANCELLED`. No son reutilizables.

`DELETE /api/registro/drafts/{registrationId}` produce `CANCELLED`, invalida challenges/OTP, elimina el paquete temporal y conserva únicamente evidencia técnica mínima sin secretos. Repetir la cancelación es idempotente. No se permite cancelar `COMPLETED` ni `EXPIRED`.

## 4. API pública V2

| Método | Ruta | Request | Success |
|---|---|---|---|
| POST | `/api/registro/drafts` | `contractVersion`, `rucClaim`, `consent` | 201 `registrationId`, `csrfToken`, expiraciones |
| DELETE | `/api/registro/drafts/{id}` | Headers sesión/CSRF | 200 `CANCELLED` |
| POST | `/api/registro/drafts/{id}/signature-challenges` | `algorithm` | 201 challenge canónico |
| POST | `/api/registro/drafts/{id}/signature-challenges/{challengeId}/verify` | firma, certificado DER, algoritmo, RUC | 200 `IDENTITY_VERIFIED` |
| POST | `/api/registro/drafts/{id}/certificate-package` | multipart PKCS#12, password, metadata | 201 custodia temporal |
| POST | `/api/registro/drafts/{id}/client-check` | `{}` | 200 `esCliente` |
| POST | `/api/registro/drafts/{id}/issuer-authorization/check` | `{}` | 200 `AUTHORIZED` o `NOT_AUTHORIZED` |
| POST | `/api/registro/drafts/{id}/sri/lookup` | `{}` | 200 snapshot o 503 tras tres intentos |
| PUT | `/api/registro/drafts/{id}/tax-data` | `MANUAL_ENTRY` o `SRI_CONFIRMATION` | 200 fuente/estado |
| PUT | `/api/registro/drafts/{id}/contact` | email, celular | 200 |
| POST | `/api/registro/drafts/{id}/otp/email/send` | `{}` | 200 expiración/cooldown |
| POST | `/api/registro/drafts/{id}/otp/email/verify` | PIN de 4 dígitos | 200 verificado |
| PUT | `/api/registro/drafts/{id}/billing` | modo y documentos | 200 |
| POST | `/api/registro/drafts/{id}/complete` | `{}` + `Idempotency-Key` | 201 cuenta/token post-creación |
| PUT | `/api/registro/accounts/{accountId}/logo` | bearer + multipart con archivo JPG/PNG | 200 persistido |

Todos los endpoints responden JSON, `Cache-Control: no-store` y correlation ID. Los 429 incluyen `Retry-After` en segundos.

## 5. Consentimiento

Request obligatorio al crear draft:

```json
{
  "accepted": true,
  "legalDocumentVersion": "REGISTRATION_V2_2026-10-05",
  "legalDocumentId": "TRIBUTASOFT_REGISTRATION_TERMS_PRIVACY_V2",
  "documentHashes": {
    "termsSha256": "6c55d698ea7b6eafca80687e13965d4297950dfb3949e2a2dc1e057f70d002b2",
    "privacySha256": "5979589c6f43bd20626ee2600767fe7e96cea2ec8177dba2f655cb8762d24ce5"
  }
}
```

Backend agrega `acceptedAt`, `registrationId`, session/correlation ID y, al completar, `accountId`. IP y User-Agent se conservan como evidencia de seguridad/legal con acceso restringido; no se exponen al frontend. Retención: la evidencia de una cuenta creada sigue la política documental/legal de la cuenta; drafts cancelados o expirados conservan solo evento, versión/hash y timestamps durante 90 días para auditoría antiabuso, sin RUC crudo, PKCS#12, contraseña ni OTP. Acceso: rol de auditoría autorizado, trazabilidad append-only y motivo de consulta.

## 6. Challenge y trust policy

Payload canónico UTF-8:

```text
TRIBUTASOFT-REGISTRATION-V2
registrationId={uuid}
challengeId={uuid}
ruc={13 dígitos}
nonce={base64url 32 bytes}
issuedAt={ISO-8601 UTC}
expiresAt={ISO-8601 UTC}
```

- Algoritmo permitido V2: `RSASSA-PKCS1-v1_5-SHA256`.
- TTL: 2 minutos; nonce CSPRNG; single-use incluso ante firma fallida; ligado a draft, sesión y RUC.
- Trust store: bundle versionado y administrado por Seguridad con certificados/fingerprints de las entidades de certificación de firma electrónica acreditadas y vigentes en Ecuador según el registro oficial de ARCOTEL. No se acepta un emisor solo por nombre.
- El leaf debe construir cadena válida hasta un trust anchor del bundle. CA desconocida, cadena rota o certificado revocado: fail closed.
- RUC: extraer de atributos/identificadores definidos por el perfil del emisor, normalizar a string de 13 dígitos, validar dígito ecuatoriano y sufijo `001`; debe coincidir con draft y cuenta.
- Vigencia: evaluar `notBefore <= now <= notAfter` en UTC.
- Revocación: OCSP del certificado; si no está disponible, CRL vigente del emisor. Respuesta revocada produce `CERTIFICATE_REVOKED`.
- Si OCSP y CRL están temporalmente indisponibles, no se produce `IDENTITY_VERIFIED`; se devuelve `CERTIFICATE_STATUS_UNAVAILABLE` 503, se conserva el draft para reintento y no se crea cuenta restringida. Este es fail-retryable, no bypass.
- Certificado no confiable, revocado, vencido o RUC distinto es fail closed definitivo para esa firma.

La clave privada y la contraseña no salen del navegador durante el challenge.

## 7. Custodia PKCS#12

- Transporte: TLS; multipart; nunca query params.
- Tamaño máximo: 8 MB. Extensiones: `.p12`/`.pfx`; backend valida estructura PKCS#12 y correspondencia con el certificado verificado.
- Cifrado: envelope encryption con `AES-256-GCM`; nonce único CSPRNG y AAD con `registrationId`, RUC hash y versión de contrato.
- DEK: 256 bits aleatorios por credencial. El blob, nonce, tag y DEK envuelta pueden persistirse juntos.
- KEK: externa a DB y filesystem de aplicación, en KMS/Vault/HSM. La versión/key ID sí se guarda; la KEK nunca.
- La contraseña recuperable se cifra con DEK separada o como parte del payload AEAD; no se hashea.
- Temporal: vence con el draft, máximo 2 horas. Cleanup al cancelar, expirar o fallar terminalmente.
- Complete: dentro de la transacción lógica, promover/re-encriptar a storage definitivo antes de marcar `COMPLETED`; si falla, rollback y no crear cuenta parcialmente utilizable.
- Rotación: nueva KEK reenvuelve DEKs sin descifrar el PKCS#12; nueva política/cipher genera job de re-encriptado controlado.
- Prohibido registrar archivo, contraseña, DEK, KEK, contenido ASN.1, nombres originales o metadatos sensibles. Logs solo usan IDs opacos, tamaños y códigos.

## 8. Cliente existente

Solo se consulta después de `IDENTITY_VERIFIED` y custodia temporal. Request vacío: el backend usa el RUC autoritativo del draft. Response mínima: `{ "esCliente": true|false }`. No devuelve razón social ni estado de cuenta. Queries parametrizadas obligatorias. Debe resolverse mediante índice único de RUC; se permite caché positiva de 5 minutos y caché negativa máxima de 30 segundos, pero `complete` vuelve a comprobar unicidad dentro de la transacción. `true` detiene el registro y muestra el estado específico aprobado; no consulta SRI.

### 8.1 Emisor electrónico autorizado

Solo se ejecuta cuando `client-check` confirma cliente nuevo. El request es vacío y el backend usa el RUC autoritativo del draft; el navegador nunca llama al portal del SRI ni envía otro RUC. El backend abre la consulta pública de emisores autorizados, conserva cookie y `javax.faces.ViewState` únicamente durante esa operación y normaliza la respuesta:

```json
{ "status": "AUTHORIZED", "authorized": true, "authorizationDate": "14/04/2014 08:11", "checkedAt": "..." }
```

Un resultado vacío confirmado devuelve 200 `NOT_AUTHORIZED`, `authorized=false` y `code=ISSUER_AUTHORIZATION_REQUIRED`. Bloquea el avance, presenta la guía de autoservicio y permite reintentar después de que el contribuyente gestione su autorización. CAPTCHA, rechazo del cortafuegos, timeout, respuesta ambigua o cambio del formulario devuelven 503 `ISSUER_AUTHORIZATION_UNAVAILABLE`; nunca se convierten en `NOT_AUTHORIZED`. Caché base: autorizado 24 horas; no autorizado 30 minutos. No guardar cookie ni ViewState. Aplicar pocas consultas, timeout, límite por draft/RUC/IP y monitoreo del parser.

`issuer-authorization/check` y `sri/lookup` pueden completarse en cualquier orden después de `client-check=NEW`; esto reduce espera sin debilitar el gate. El snapshot tributario puede quedar precargado en el draft, pero no se muestra ni habilita el registro si la autorización termina en `NOT_AUTHORIZED`. `complete` exige siempre `AUTHORIZED` y vuelve a comprobar las precondiciones. El tutorial se enlaza mediante la clave frontend `tributasoft:sri-authorization-tutorial`; sustituir su URL placeholder al publicar el video definitivo.

## 9. SRI y `/tax-data`

### 9.1 Lookup

Frontend nunca llama directamente al SRI. Backend realiza hasta 3 intentos totales con timeout de 8 s e intervalos base 250 ms y 500 ms más jitter 0–150 ms. Reintenta red, timeout y 5xx. No reintenta RUC inválido, 204 ni 4xx atribuible al request.

Al iniciar: draft `SRI_PENDING`. En éxito: snapshot `source=SRI`, `status=VERIFIED`. Tras tres fallos transitorios: 503 `SRI_UNAVAILABLE`, `attempts=3`, `lastAttemptAt`, error normalizado y draft permanece `SRI_PENDING` hasta `MANUAL_ENTRY` o nuevo lookup exitoso.

Snapshot canónico: RUC, razón social, nombre comercial, estado, régimen, tipo, obligado a llevar contabilidad, actividad económica principal, agente de retención, contribuyente especial, gran contribuyente y representantes legales. Backend guarda respuesta normalizada y hash de evidencia; el frontend no es autoridad.

### 9.2 MANUAL_ENTRY

Admitido solo si el draft registra indisponibilidad persistente después de 3 intentos. Request:

```json
{
  "source": "MANUAL_ENTRY",
  "status": "MANUAL_PENDING",
  "declared": {
    "razonSocial": "...",
    "nombreComercial": "...",
    "regimen": "...",
    "tipoContribuyente": "...",
    "obligadoLlevarContabilidad": "SI|NO",
    "actividadEconomicaPrincipal": "...",
    "agenteRetencion": false,
    "contribuyenteEspecial": false,
    "granContribuyente": false,
    "representantesLegales": []
  },
  "noResolucion": "..."
}
```

Razón social, régimen, tipo, obligado y actividad son obligatorios. Nombre comercial y banderas son opcionales pero tipados. `representantesLegales` es opcional y el wizard actual no lo captura manualmente; su ausencia no bloquea el alta y se completa en reconciliación. `noResolucion` es obligatorio para agente de retención, contribuyente especial o gran contribuyente y usa la validación V2 vigente. Backend normaliza strings, limita longitudes y marca todo como declarado por usuario. No acepta este modo si existe snapshot SRI válido.

### 9.3 SRI_CONFIRMATION

Admitido únicamente después de snapshot `SRI/VERIFIED`. Solo acepta `nombreComercial` y `noResolucion`; no permite alterar RUC, razón social, régimen, tipo, obligado, actividad ni banderas oficiales. Conserva `source=SRI`, `status=VERIFIED`. `noResolucion` se normaliza en mayúsculas y se valida condicionalmente.

### 9.4 Reconciliación MANUAL_PENDING

La cuenta nace `ACTIVE_RESTRICTED`, `PENDING_SRI_RECONCILIATION`; login y funciones no tributarias habilitados, emisión y funciones tributarias dependientes bloqueadas.

Jerarquía de resultados:

1. RUC no activo: `REJECTED_INACTIVE`; mantener restricción, bloquear emisión y escalar a soporte tributario.
2. Snapshot incompleto, RUC distinto o clasificación incoherente: `REQUIRES_MANUAL_REVIEW`; mantener restricción.
3. Cambios en régimen, tipo, obligado a contabilidad, contribuyente especial, agente de retención, gran contribuyente o resolución: `REQUIRES_USER_CONFIRMATION`; mostrar diferencias en portal y mantener restricción hasta confirmación/revisión.
4. Diferencias únicamente en razón social, nombre comercial, actividad o representantes: `AUTO_RECONCILED`; SRI prevalece, se conserva auditoría y no se pide confirmación.
5. Coincidencia: `AUTO_RECONCILED`.

Solo `AUTO_RECONCILED` o una confirmación/revisión resuelta satisfactoriamente cambia a `VERIFIED` y habilita emisión. La reconciliación la ejecuta un worker/backend interno; no es endpoint público del wizard.

## 10. Contacto y OTP

- Email normalizado en minúsculas; celular validado por formato, no por OTP.
- OTP: 4 dígitos, CSPRNG en producción, hash con secreto/pepper server-side, TTL 5 minutos, single-use. El mock tutorial utiliza `1234`; producción nunca devuelve el PIN al frontend.
- Máximo 5 intentos de verificación; cambiar email invalida OTP y estado verificado.
- Cooldown 60 segundos; máximo 3 envíos/hora por draft+email.
- Respuestas no revelan existencia de email. OTP y hash nunca se registran.

## 11. Facturación

El registro V2 envía únicamente la configuración inicial de `factura`: `tipo_documento`, `establecimiento`, `punto_emision`, `secuencia`. Los demás tipos, establecimientos y puntos de emisión se configuran después desde el perfil, fuera del onboarding. Valores sugeridos editables: `001 / 002 / 1`; antes del envío la secuencia se normaliza a nueve dígitos (`000000001`).

- Establecimiento y punto: exactamente 3 dígitos, distintos de `000`.
- Secuencia UX: 1–9 dígitos; contrato persistido: 9 dígitos con ceros a la izquierda.
- Para cliente previo, representa la última secuencia emitida; backend calcula la siguiente de forma atómica.
- Para nuevo, defaults `001-001-000000001` según la configuración aprobada.
- Solo se envían opcionales seleccionados; quitar uno elimina estado residual.

## 12. Complete e idempotencia

`POST /drafts/{id}/complete` exige `Idempotency-Key` opaca, 1–128 caracteres. El body no reenvía identidad/SRI/contacto/facturación como autoridad.

Transacción productiva: bloquear draft/RUC, verificar `READY_TO_CREATE`, prevenir cuenta duplicada, reservar secuencias, crear cuenta/usuario/permisos, promover credencial cifrada, persistir consentimiento y estado tributario, emitir token post-creación y marcar `COMPLETED`. Cualquier error hace rollback. Repetir misma clave devuelve la misma respuesta; otra clave después de completar devuelve `IDEMPOTENCY_CONFLICT`.

## 13. Logo post-creación

- Endpoint definitivo: `PUT /api/registro/accounts/{accountId}/logo`.
- Autenticación: bearer post-creación aleatorio, TTL 10 minutos, scope exclusivo logo y single-account.
- Upload: JPG/JPEG/PNG, máximo 250 KB, magic bytes, MIME real, decode, dimensiones/pixel limit, protección image bomb, re-encode y storage privado con nombre generado.
- Provisional: el frontend genera un JPG real de 2,970 × 300, fondo blanco y razón social en negro con **Roboto Condensed Light**. Debajo incorpora el correo y celular registrados con iconos lineales. Lo envía como archivo multipart por el mismo endpoint de upload.
- Error de logo no revierte una cuenta creada; permite reintentar dentro del TTL o continuar con provisional.

## 14. Rate limits base

| Operación | Límite | Claves mínimas |
|---|---:|---|
| Crear draft | 5/15 min y 3/h por RUC | IP, RUC |
| Client check | 5/10 min | draft, RUC; además control IP global |
| Emisor autorizado | 4/15 min | draft, RUC, IP |
| SRI lookup | 4/15 min | draft, RUC, IP |
| Challenge create | 5/10 min | draft, IP |
| Challenge verify | 5/10 min | draft, IP |
| Certificate upload | 3/30 min | draft, IP |
| OTP send | 3/h + cooldown 60 s | draft, email, IP global |
| OTP verify | 5/15 min | draft, IP |
| Billing | 20/h | draft |
| Complete | 5/30 min | draft, RUC, IP |
| Logo | 10/h | account, IP |

Los contadores se aplican además de límites globales de infraestructura, request size, timeout y concurrencia. Superar límite devuelve 429, `RATE_LIMITED` u `OTP_RATE_LIMITED` y `Retry-After`. Cookie nunca es la única clave. El store debe poder migrar a Redis sin cambiar el contrato.

## 15. Error matrix

| CODE | HTTP | ENDPOINT | CONDITION | FRONTEND ACTION |
|---|---:|---|---|---|
| INVALID_REQUEST | 400 | cualquiera | JSON/esquema inválido | Mantener paso y corregir |
| INVALID_RUC | 400 | drafts | RUC inválido | Volver a firma |
| CI_ONLY_CERTIFICATE | 422 | challenge verify | certificado solo CI | Bloquear registro |
| CERTIFICATE_RUC_MISMATCH | 422 | challenge verify | RUC cert != draft | Bloquear y cambiar firma |
| UNSUPPORTED_SIGNATURE_ALGORITHM | 422 | challenge | algoritmo no permitido | Bloquear; no fallback |
| INVALID_SIGNATURE | 422 | challenge verify | prueba criptográfica inválida | Reintentar con firma/clave |
| CERTIFICATE_EXPIRED | 422 | challenge verify/upload | fuera de vigencia | Cambiar firma |
| CERTIFICATE_NOT_TRUSTED | 422 | challenge verify | cadena/emisor no confiable | Cambiar firma/contactar soporte |
| CERTIFICATE_REVOKED | 422 | challenge verify | OCSP/CRL revocado | Bloquear registro |
| CERTIFICATE_STATUS_UNAVAILABLE | 503 | challenge verify | OCSP y CRL no disponibles | Reintentar; no avanzar |
| CHALLENGE_EXPIRED | 410 | challenge verify | TTL agotado | Crear challenge nuevo |
| CHALLENGE_ALREADY_USED | 409 | challenge verify | replay | Crear challenge nuevo |
| CERTIFICATE_PACKAGE_REQUIRED | 409 | complete | falta custodia | Volver a firma |
| CLIENT_CHECK_REQUIRED | 409 | SRI/complete | gate no ejecutado | Ejecutar client-check |
| ISSUER_AUTHORIZATION_REQUIRED | 409 | complete | no autorizado o gate pendiente | Mostrar guía «Cómo obtener la autorización»; no avanzar |
| ISSUER_AUTHORIZATION_UNAVAILABLE | 503 | issuer authorization | portal caído, CAPTCHA, rechazo o parser inválido | Reintentar; no asumir “no autorizado” |
| SRI_DATA_REQUIRED | 409 | complete | sin snapshot/declaración | Volver a Datos |
| CONTACT_NOT_VERIFIED | 409 | complete | OTP pendiente | Abrir verificación |
| BILLING_REQUIRED | 409 | complete | facturación pendiente | Volver a Facturación |
| CONSENT_REQUIRED | 409 | drafts/complete | evidencia inválida | Volver a Firma |
| DRAFT_NOT_FOUND | 404 | draft endpoints | ID inexistente/limpiado | Reiniciar |
| DRAFT_EXPIRED | 410 | draft endpoints | TTL vencido | Reiniciar |
| DRAFT_CANCELLED | 409 | draft endpoints | draft cancelado | Reiniciar |
| INVALID_DRAFT_STATE | 409 | draft endpoints | transición no permitida | Sincronizar/reiniciar |
| SESSION_REQUIRED | 401 | draft endpoints | falta cookie | Reiniciar |
| SESSION_MISMATCH | 403 | draft endpoints | sesión ajena | Bloquear y reiniciar |
| CSRF_INVALID | 403 | mutaciones draft | token ausente/distinto | Bloquear y reiniciar |
| SRI_UNAVAILABLE | 503 | SRI lookup | 3 fallos transitorios | Habilitar MANUAL_ENTRY |
| SRI_RECONCILIATION_REQUIRED | 409 | funciones tributarias | falta confirmación | Mostrar estado restringido |
| SRI_MANUAL_REVIEW_REQUIRED | 409 | funciones tributarias | revisión humana | Mostrar soporte/revisión |
| RUC_INACTIVE | 422 | SRI/reconciliation | RUC no activo | Bloquear funciones tributarias |
| SERVICE_UNAVAILABLE | 503 | cualquiera | dependencia caída | Reintento controlado |
| OTP_INVALID | 422 | OTP verify | código incorrecto/formato | Mostrar error inline |
| OTP_EXPIRED | 410 | OTP verify | TTL/uso agotado | Reenviar |
| OTP_ATTEMPTS_EXCEEDED | 429 | OTP verify | 5 intentos | Esperar/reiniciar OTP |
| OTP_RATE_LIMITED | 429 | OTP send | cooldown/cuota | Esperar Retry-After |
| RATE_LIMITED | 429 | cualquiera | cuota superada | Esperar Retry-After |
| IDEMPOTENCY_KEY_REQUIRED | 400 | complete | header ausente/inválido | Generar clave y reintentar |
| IDEMPOTENCY_CONFLICT | 409 | complete | clave distinta tras complete | Usar resultado previo |
| ACCOUNT_ALREADY_EXISTS | 409 | complete | carrera/duplicado | Estado cliente existente |
| TAX_DATA_RECONCILIATION_PENDING | 423 | emisión/función tributaria | cuenta restringida | Informar pendiente SRI |
| INVALID_LOGO | 422 | logo | imagen/modo inválido | Corregir o regenerar JPG |
| POST_CREATE_TOKEN_INVALID | 401 | logo | token ausente/vencido | Volver a iniciar sesión |
| BACKEND_CONFIG_REQUIRED | 503 | mocks dev | mock fuera de entorno | No simular éxito |

Errores nunca incluyen stack, SQL, filesystem, secretos, PKCS#12, OTP ni respuesta SRI cruda.

## 16. V1 → V2

| Área | V1 | V2 | Acción backend |
|---|---|---|---|
| Estado | payload navegador | draft server-side | Persistir lifecycle/TTL |
| Firma | metadatos cliente | challenge + PKI backend | Implementar trust/revocación |
| PKCS#12 | payload monolítico | custodia temporal | Envelope encryption/KMS |
| Cliente | endpoint temprano suelto | gate ligado al draft | Consulta parametrizada/antiabuso |
| Emisor autorizado | no existía | gate backend ligado al draft | Consulta pública JSF, caché y monitoreo |
| SRI | consulta puntual | snapshot + fallback/reconciliación | Persistir fuente/estado |
| OTP | mock/flujo separado | OTP ligado al draft | Servicio server-side |
| Facturación | establecimiento compartido | alta inicial de Factura; configuración ampliada posterior en perfil | Persistencia y secuencia atómica |
| Alta | `POST /api/registro` | `/drafts/{id}/complete` | Transacción/idempotencia |
| Logo | payload/preview sin persistencia | endpoint post-creación con archivo real | Validación y storage privado |
| Consentimiento | implícito/final | evidencia al crear draft | Registro versionado/auditable |
| Errores | heterogéneos | catálogo V2 | Respuestas uniformes |

## 17. Matriz frontend, mock y backend

| Área | Frontend | Mock dev | Backend productivo |
|---|---|---|---|
| Sesión/CSRF | cookie same-origin + header | sesión/csrf/rate limit | cookie Secure, store persistente |
| Draft | usa registrationId | memoria + TTL | DB/cache + cleanup |
| Challenge | firma local | verifica public key | PKI/trust/revocación |
| PKCS#12 | upload y limpieza local | solo metadatos | cifrado/KMS/storage |
| Cliente | consume draft endpoint | lista dev | DB parametrizada |
| Emisor autorizado | consume draft endpoint | mock explícito o consulta backend real | parser JSF, caché, rate limit y observabilidad |
| SRI | consume backend | proxy real/dev | proxy/cache/snapshot |
| Tax data | dos modos | valida ambos | autoridad y auditoría |
| OTP | UI ligada a draft | hash/cooldown/cuotas base | proveedor + store/rate limits |
| Billing | contrato por documento | validación | DB/locks/secuencias |
| Complete | Idempotency-Key | resultado en memoria | transacción persistente |
| Logo | upload o JPG generado | persistencia simulada | imagen segura/storage |
| Consentimiento | versión/id/hash | evidencia mock | evidencia durable |
| Errores | consume `code`/Retry-After | catálogo V2 | misma matriz |

## 18. Separación dev/producción y controles obligatorios

Los mocks solo se activan con `NODE_ENV=development`, flags explícitos, conexión loopback y Origin permitido. Producción nunca usa `devCode`, RUC fixture, almacenamiento en memoria, `encryptedAtRest=false` ni cookie sin Secure.

Backend productivo debe añadir prepared statements, transacciones, correlation IDs, métricas sin PII, rate-limit store distribuible, request size, timeouts, CSP/cabeceras, storage privado y jobs de cleanup/reconciliación. No requiere Kafka, Kubernetes ni microservicios para el volumen inicial.

## 19. Criterios de aceptación del handoff

- Todos los endpoints siguen esta tabla y el catálogo de errores.
- Ningún dato del navegador sustituye verificación backend.
- Cuenta manual queda restringida hasta reconciliación satisfactoria.
- Idempotencia y secuencias son atómicas.
- PKCS#12, contraseña, OTP y llaves nunca aparecen en logs.
- El frontend genera el provisional exactamente con razón social, Roboto Condensed Light y 2,970 × 300; el backend comprueba que recibió una imagen válida antes de persistirla.
- Tests de contrato, seguridad, smoke y E2E deben pasar antes de staging.
