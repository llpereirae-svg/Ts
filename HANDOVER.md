# Handover — Landing de registro TributaSoft

Frontend HTML/CSS/JS vainilla. Sin build, sin framework. Funciona abriendo
`index.html` en cualquier navegador moderno.

---

## 1. Cómo probarlo en local (1 min)

```bash
git clone https://github.com/llpereirae-svg/Ts.git
cd Ts/tributasoft
python -m http.server 3000
```

Abrir <http://localhost:3000>.

Datos de prueba con los mocks actuales:
- Cualquier RUC válido (13 dígitos con dígito verificador SRI correcto, terminando en 001) avanza.
- RUC `1710034065001` simula "cliente ya existe → redirige al cotizador".
- Código OTP siempre es `123456` (también queda visible en `console.log`).
- La clave del .p12 se valida 100 % client-side con `node-forge`: **la clave no sale del navegador**.

---

## 2. Lo único que hay que adaptar para producción (3 archivos)

> **No tocar** `app.js`, `state-machine.js`, `validators.js`, `firma-validator.js`,
> `countries.js`, `cities.js`, ni el HTML/CSS. Toda la lógica del flujo y las
> validaciones ya están listas y son agnósticas del backend.

### 2.1. `assets/api-mocks.js`

Reemplazar las 5 funciones por llamadas `fetch()` reales. Las firmas, los
contratos JSON y los comportamientos esperados (incluyendo errores) están
documentados como JSDoc en cada función. Solo cambia el cuerpo.

### 2.2. `assets/sri-client.js`

`consultarRUC(ruc)` hoy hace una consulta externa. Cámbienla por una
consulta interna contra la tabla `empresas`:

- Si el RUC existe, retornar `{ found: true, razonSocial, nombreComercial, direccion, provincia, ciudad, regimen }`.
- Si no existe o falla, retornar `{ found: false }` — el frontend deja que el usuario complete los datos manualmente.

### 2.3. `assets/app.js` (solo `finalizarFlow`)

Agregar el envío del banner PNG (2970×300) al endpoint de finalización.
Justo antes de la llamada actual a `finalizarRegistro()`, armar un
`FormData` y enviarlo en multipart:

```js
const fd = new FormData();
fd.append('registroId', flow.registroId);
if (flow.bannerBlob) fd.append('banner', flow.bannerBlob, 'banner.png');
// ... y mandar fd al endpoint
```

El blob ya viene como PNG 2970×300, ajustado client-side. Si quieren
re-validar dimensiones server-side, usar Pillow (Python) o sharp (Node).

---

## 3. Endpoints a implementar

| Método + path                          | Request                                                      | Response                                                  |
|----------------------------------------|--------------------------------------------------------------|-----------------------------------------------------------|
| `GET /api/clientes/existe?ruc=`        | —                                                            | `{ existe: bool, url_redirect: string \| null }`          |
| `GET /api/empresas/:ruc`               | —                                                            | `{ found, razonSocial, nombreComercial, direccion, ... }` |
| `POST /api/registro/iniciar`           | `{ ruc, razonSocial, email, celular, canal, ... }`           | `{ registroId, tokenSentTo, expiresIn }`                  |
| `POST /api/registro/verificar-token`   | `{ registroId, codigo }`                                     | `{ verificado, attemptsLeft, reason? }`                   |
| `POST /api/registro/establecer-clave`  | `{ registroId, clave }`                                      | `{ ok }`                                                  |
| `POST /api/registro/finalizar`         | `multipart: { registroId, banner: File }`                    | `{ ok, redirectUrl }`                                     |

Las formas exactas están como JSDoc dentro de `assets/api-mocks.js`.

---

## 4. Esquema de DB sugerido

```sql
CREATE TABLE registros (
  id                 UUID PRIMARY KEY,
  ruc                VARCHAR(13) UNIQUE NOT NULL,
  razon_social       VARCHAR(255) NOT NULL,
  nombre_comercial   VARCHAR(255),
  direccion          TEXT NOT NULL,
  provincia          VARCHAR(50) NOT NULL,
  ciudad             VARCHAR(80) NOT NULL,
  email              VARCHAR(255) NOT NULL,
  celular            VARCHAR(20) NOT NULL,
  celular_pais       CHAR(2) NOT NULL DEFAULT 'EC',
  canal_token        VARCHAR(10) NOT NULL,         -- 'email' | 'whatsapp'
  regimen            VARCHAR(50) NOT NULL,
  tipo_contribuyente VARCHAR(40) NOT NULL,
  no_resolucion      VARCHAR(30),
  modo_facturacion   VARCHAR(20) NOT NULL,         -- 'nuevo' | 'continuar'
  establecimiento    CHAR(3) NOT NULL DEFAULT '001',
  punto_emision      CHAR(3) NOT NULL,
  descripcion_punto  VARCHAR(50) NOT NULL DEFAULT 'Electrónicas',
  secuencias         JSONB NOT NULL,               -- { factura, nc, nd, retencion, guia }
  clave_hash         VARCHAR(255) NOT NULL,        -- bcrypt / argon2
  firma_titular      VARCHAR(255),
  firma_ruc          VARCHAR(13),
  firma_caducidad    DATE,
  banner_url         VARCHAR(500),                 -- o BYTEA si va inline
  terminos_aceptados_at TIMESTAMP NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE registros_otp (
  registro_id  UUID REFERENCES registros(id),
  codigo_hash  VARCHAR(60) NOT NULL,               -- bcrypt del código
  intentos     SMALLINT NOT NULL DEFAULT 0,
  expira_at    TIMESTAMP NOT NULL,
  PRIMARY KEY (registro_id)
);
```

---

## 5. Seguridad

- **Hash de clave:** bcrypt (cost ≥ 12) o argon2id. Nunca guardar en plain.
- **Rate limit:** en `POST /iniciar` (5/min por IP) y en `/verificar-token` (10/min por `registroId`).
- **OTP:** guardar el hash, máximo 5 intentos, expira en 5 minutos.
- **Firma electrónica:** la clave del .p12 **nunca** se envía. El servidor solo recibe los datos ya extraídos por el cliente (titular, RUC, caducidad).
- **CORS:** permitir solo el origen donde quede el frontend (por ejemplo `https://tributasoft.ec`).
- **Banner:** validar Content-Type y tamaño en el endpoint. Re-encoder a PNG para sanitizar.

---

## 6. Despliegue del frontend

Tres caminos, de más simple a más controlado:

1. **GitHub Pages** (lo que ya hace este repo) — push a `main` y listo.
2. **Servir como estático** desde el mismo backend o un CDN (S3 + CloudFront, Cloudflare Pages, Nginx, etc.).
3. **Embebido** dentro del Erp-web si lo prefieren — los archivos van a `WEB-INF/...` o equivalente y se sirven igual.

Importante: si cambian la URL del backend, configurar CORS o servir frontend y API desde el mismo origen.

---

## 7. Versionado y cache busting

El bundle se carga con un parámetro `?v=YYYYMMDDx`. Cuando hagan un cambio
en JS o CSS, bumpean ese valor en `index.html` (en la línea
`const APP_VER = '...'`) y los navegadores piden la versión nueva.

Las cabeceras `Cache-Control: no-cache` ya están como `<meta>`. Si la
infra lo permite, sumar los headers HTTP equivalentes en la respuesta del
servidor.

---

## 8. Si tienen dudas

Frontend: [tu email / WhatsApp]

Repo: <https://github.com/llpereirae-svg/Ts>
