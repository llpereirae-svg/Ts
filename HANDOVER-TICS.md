# HANDOVER · Equipo TICS — TributaSoft Landing

Documento técnico para integrar la landing del wizard de registro con el backend de TributaSoft.

---

## 1. Resumen ejecutivo

La landing es una **SPA estática** (HTML + CSS + ES modules vanilla) que corre 100% en el navegador. El wizard de 8 pantallas valida los archivos del usuario **sin consultar ningún servicio externo**: parsea localmente la firma electrónica (.p12) y el certificado de RUC (PDF).

**Lo único que falta integrar** son 4 puntos donde el navegador necesita hablar con su backend:

| # | Servicio | Donde está | Estado |
|---|---|---|---|
| 1 | Enviar SMS con código | `assets/token-service.js` → `sendSms()` | Mock |
| 2 | Enviar correo con código | `assets/token-service.js` → `sendEmail()` | Mock |
| 3 | Enviar correo de bienvenida | `assets/email-service.js` → `sendEmailHtml()` | Mock |
| 4 | Persistir el registro final | `assets/wizard.js` → `finishWizard()` | TODO |

> **NO se requieren APIs al SRI**. Toda la validación de RUC y datos del contribuyente se hace leyendo localmente la firma .p12 y el PDF del certificado de RUC que el propio usuario sube.

---

## 2. Arquitectura

```
Usuario
  │
  ▼
Landing estática (GitHub Pages → producción: tu hosting)
  │
  ├── Parsea firma .p12 en el navegador (node-forge desde CDN)
  ├── Parsea PDF del certificado RUC en el navegador (pdf.js desde CDN)
  │
  ▼
Backend (lo que ustedes implementan)
  │
  ├── POST /api/token/sms       → Twilio/equivalente
  ├── POST /api/token/email     → SendGrid/SES/equivalente
  ├── POST /api/email/registro  → SendGrid/SES (welcome email)
  └── POST /api/registro        → Crea registro en BD + responde con redirect
```

---

## 3. Endpoints a implementar

### 3.1 POST `/api/token/sms`

**Para qué:** enviar un código numérico de 4 dígitos por SMS al celular del usuario en la pantalla 3 del registro.

**Request:**
```json
{
  "destino": "0998429901",
  "token": "7559"
}
```

> El frontend genera el token con `crypto.getRandomValues()` y lo envía junto al destino. En una versión más segura, el backend puede generar y guardar el token, y el frontend solo envía el destino — ver "Nota de seguridad" abajo.

**Response esperado:**
```json
{ "ok": true }
```

**Provider sugerido:** Twilio, MessageBird, o cualquier gateway local de SMS (Movistar/Claro Ecuador).

---

### 3.2 POST `/api/token/email`

**Para qué:** enviar el segundo código de 4 dígitos al correo del usuario (se envía después que valida el SMS).

**Request:**
```json
{
  "destino": "tributasoft@gmail.com",
  "token": "3273"
}
```

**Response esperado:**
```json
{ "ok": true }
```

**Provider sugerido:** SendGrid, AWS SES, Mailgun.

---

### 3.3 POST `/api/email/registro`

**Para qué:** enviar el correo de bienvenida con el resumen del registro y las credenciales (Usuario + Clave).

**Request:**
```json
{
  "destino": "tributasoft@gmail.com",
  "asunto": "Bienvenido a TributaSoft — Tus credenciales",
  "html": "<!DOCTYPE html>... (template HTML completo) ..."
}
```

> El frontend ya genera el HTML completo del correo con marca TributaSoft, tabla de datos, credenciales en monospace y botón al portal. **Solo envíenlo tal cual.**

**Response esperado:**
```json
{ "ok": true }
```

---

### 3.4 POST `/api/registro`

**Para qué:** persistir el registro en la base de datos.

**Request:** todos los datos del wizard sanitizados (UPPERCASE, sin tildes, ñ → NI).

```json
{
  "ruc": "0992703601001",
  "razonSocial": "TRIBUTASOFT S.A.",
  "nombreComercial": "TRIBUTASOFT",
  "direccion": "AV FRANCISCO DE ORELLANA 100",
  "provincia": "GUAYAS",
  "ciudad": "GUAYAQUIL",
  "email": "TRIBUTASOFT@GMAIL.COM",
  "celular": "0998429901",
  "celularPais": "EC",
  "regimen": "GENERAL",
  "tipoContribuyente": "AGENTE_RETENCION",
  "noResolucion": "NAC-DGERCGC23-00012345",
  "modoFacturacion": "continuar",
  "codEstablecimiento": "001",
  "codPunto": "002",
  "nombrePunto": "ELECTRONICAS",
  "secuencias": {
    "factura": "000000027",
    "nc": "000000001",
    "nd": "000000001",
    "retencion": "000000001",
    "guia": "000000001"
  },
  "clave": "Pa$$w0rd",
  "logoDataUrl": "data:image/png;base64,..."
}
```

> **Importante:** la **clave NO se sanitiza** (mantiene mayúsculas, símbolos, tildes como el usuario la escribió). El resto sí.

**Response esperado:**
```json
{
  "ok": true,
  "usuario": "0992703601"
}
```

---

## 4. Esquema de BD sugerido

Estas son las tablas mínimas. Los nombres son orientativos — usen lo que ya tienen.

### Tabla `usuarios`
| Campo | Tipo | Notas |
|---|---|---|
| id | bigint PK | autoincremento |
| ruc | varchar(13) UNIQUE | viene sanitizado |
| usuario | varchar(10) UNIQUE | primeros 10 dígitos del RUC |
| clave_hash | varchar(255) | **bcrypt/argon2**, nunca en texto plano |
| razon_social | varchar(200) | UPPERCASE sin tildes |
| nombre_comercial | varchar(200) | o "NO APLICA" |
| email | varchar(150) | UPPERCASE sin tildes |
| celular | varchar(20) | |
| celular_pais | varchar(2) | EC, US, etc. |
| direccion | varchar(300) | |
| provincia | varchar(50) | UPPERCASE sin tildes |
| ciudad | varchar(80) | |
| created_at | timestamp | |
| ultimo_login | timestamp NULL | |
| estado | enum('activo', 'suspendido', 'inactivo') | |

### Tabla `usuarios_tributario`
| Campo | Tipo | Notas |
|---|---|---|
| usuario_id | bigint FK | |
| regimen | enum('GENERAL', 'RIMPE - EMPRENDEDOR', 'RIMPE - NEGOCIO POPULAR') | |
| tipo_contribuyente | enum('NO_OBLIGADO', 'OBLIGADO', 'AGENTE_RETENCION', 'CONTRIBUYENTE_ESPECIAL', 'GRAN_CONTRIBUYENTE') | |
| no_resolucion | varchar(50) NULL | solo si tipo lo requiere |

### Tabla `usuarios_facturacion`
| Campo | Tipo | Notas |
|---|---|---|
| usuario_id | bigint FK | |
| modo | enum('nuevo', 'continuar') | |
| establecimiento | varchar(3) | '001' |
| punto_emision | varchar(3) | '001' o '002' |
| descripcion | varchar(50) | 'ELECTRONICAS' por defecto |

### Tabla `usuarios_secuencias`
| Campo | Tipo | Notas |
|---|---|---|
| usuario_id | bigint FK | |
| tipo_doc | enum('factura', 'nc', 'nd', 'retencion', 'guia') | |
| siguiente_secuencia | varchar(9) | '000000001' por defecto |

### Tabla `usuarios_logo`
| Campo | Tipo | Notas |
|---|---|---|
| usuario_id | bigint FK | |
| logo_data | longblob NULL | el PNG generado (base64 decodificado) |
| created_at | timestamp | |

### Tabla `tokens_verificacion` (opcional, recomendada)
Solo si quieren server-side validation de tokens (más seguro). Ver "Nota de seguridad".

---

## 5. Cómo integrar (paso a paso)

### Paso 1: Reemplazar 4 funciones mock por fetch real

Abre `assets/token-service.js` y reemplaza:

```js
async function sendSms(destino, token) {
  console.log(`[MOCK] SMS a ${destino}: ${token}`);
  // ... mock ...
}
```

Por:

```js
async function sendSms(destino, token) {
  const res = await fetch('/api/token/sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destino, token }),
  });
  if (!res.ok) throw new Error('Falló el envío del SMS');
  return { ok: true };
}
```

**Igual para `sendEmail()`** en el mismo archivo (cambio análogo).

Abre `assets/email-service.js` y reemplaza `sendEmailHtml()` con el fetch a `/api/email/registro`.

Abre `assets/wizard.js`, en la función `finishWizard()`, agrega después del email:

```js
const respRegistro = await fetch('/api/registro', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(sanitizado),
});
if (!respRegistro.ok) throw new Error('No se pudo guardar el registro');
```

### Paso 2: Configurar dónde se aloja la landing

- Por ahora vive en GitHub Pages (`https://llpereirae-svg.github.io/Ts/`).
- En producción: muevan los archivos `index.html` + `assets/` a su servidor.
- Configuren el **mismo dominio o subdominio** que el backend, o configuren CORS si son distintos.

### Paso 3: URL del portal post-registro

Ya está hardcodeada en `assets/wizard.js` y `assets/email-service.js` como:
```
https://tbc.tributasoft.ec/Erp-web/templates/registro/login.xhtml?faces-redirect=true
```
Si cambia, actualicen las dos referencias.

### Paso 4: Provider de SMS y Email

| Servicio | Sugerencia |
|---|---|
| SMS Ecuador | Movistar, Claro, CNT (APIs locales) o Twilio |
| Email transaccional | SendGrid, AWS SES, Mailgun |

---

## 6. Lo que la landing YA hace sin necesidad de backend

✅ Valida que la firma .p12 esté bien (clave correcta, no caducada, RUC interno)
✅ Extrae del cert PDF: RUC, razón social, provincia, cantón, dirección, email, celular, régimen, tipo contribuyente, fecha de emisión
✅ Valida que la fecha de emisión del cert no tenga más de 1 mes
✅ Valida que el RUC del cert coincida con el RUC de la firma
✅ Genera los tokens SMS/Email con `crypto.getRandomValues` (entropía real)
✅ Verifica los tokens localmente (mientras esté el mock)
✅ Genera el HTML del correo de bienvenida con marca TributaSoft
✅ Sanitiza todos los datos antes de enviar (UPPERCASE + ñ→NI + sin tildes)
✅ Detecta el dispositivo (PC/Tablet/Móvil) y se adapta
✅ Genera el logo (banner 2970×300) cuando el usuario lo pide

---

## 7. Nota de seguridad importante

**Modo actual (mock):** el token se genera en el frontend y se envía al SMS/Email. El navegador también lo verifica localmente. Esto es **inseguro** porque alguien podría inspeccionar la consola y ver el código antes que llegue al SMS.

**Recomendación para producción:** que el **backend** genere y guarde el token, y solo retorne `{ ok: true }` al frontend. La verificación también debe hacerla el backend.

Flujo seguro:
1. Frontend pide `POST /api/token/sms` con `{ destino }` (sin token).
2. Backend genera el token, lo guarda en `tokens_verificacion` con TTL 5 min, lo envía por SMS.
3. Frontend hace `POST /api/token/verify` con `{ destino, codigo }`.
4. Backend compara y responde `{ valid: true/false }`.

Las funciones de `token-service.js` (Capa 1) **NO cambian** — solo cambia la Capa 2 (`sendSms`, `sendEmail`) y se agrega `verifyToken()` que llama al backend.

---

## 8. Tracking / analytics

Hay un sistema de tracking interno (`track(evento, params)` en `app.js`). Por ahora solo loguea a consola. Si quieren registrar eventos de registro (`landing_view`, `manual_open`, `terms_aceptados`, etc.), conecten esa función a su Google Analytics / Mixpanel.

---

## 9. Cómo testar la integración

1. Subir un archivo `.p12` real → debe extraer titular, RUC, fecha caducidad.
2. Subir el certificado de RUC PDF → debe extraer todos los campos.
3. En la pantalla del token: verificar que llega un SMS real al celular.
4. Verificar que llega el correo con la plantilla HTML completa al final.
5. Verificar que el registro queda guardado en la BD con los datos sanitizados.

---

## 10. Contacto

Para dudas técnicas sobre el frontend, el repo está en `https://github.com/llpereirae-svg/Ts`. Los archivos más relevantes:

- `assets/wizard.js` — máquina de estados del wizard
- `assets/screen-*.js` — cada pantalla del wizard
- `assets/firma-validator.js` — parseo de .p12 (node-forge)
- `assets/pdf-parser.js` — parseo del cert RUC (pdf.js)
- `assets/token-service.js` — **REEMPLAZAR Capa 2**
- `assets/email-service.js` — **REEMPLAZAR Capa 2**
