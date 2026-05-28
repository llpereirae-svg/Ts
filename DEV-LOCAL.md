# Guía de instalación local — TributaSoft Landing

Para devs que van a construir el backend desde cero o que necesitan tocar el frontend en su máquina antes de pushear.

**Lectura mínima:** secciones 0, 1, 2, 5, 6 y 10.

---

## 0. Resumen rápido

- **Frontend:** ya existe, está en producción en https://llpereirae-svg.github.io/Ts. Es HTML + CSS + ES modules nativos. **Cero build step.** Editas un archivo, recargas el navegador, listo.
- **Backend:** NO existe. Lo construye este equipo desde cero. La landing tiene 4 endpoints "mock" que hay que reemplazar por llamadas reales.
- **Base de datos:** NO existe. Schema sugerido en `HANDOVER-TICS.md` (tablas `usuarios`, `usuarios_tributario`, `usuarios_facturacion`, etc.).
- **Meta Pixel + CAPI:** considerar desde el inicio del backend para que la atribución de ads funcione bien (ver §10).
- **Validaciones de firma .p12 y cert RUC PDF:** ya funcionan en frontend (probadas con 3 PDFs reales). No hay que rehacerlas.

---

## 1. Prerequisitos

| Herramienta | Versión mínima | Para qué |
|---|---|---|
| Git | cualquiera | Clonar el repo |
| Python | 3.7+ (recomendado 3.11) | Servidor estático local + smoke test |
| Node.js (opcional) | 16+ | Alternativa al server de Python |
| Navegador moderno | Chrome/Firefox/Edge/Safari última versión | Probar el flujo |
| Editor de código | VS Code recomendado | Editar el frontend |

**Verificar:**
```bash
git --version
python --version    # o python3 --version
node --version      # opcional
```

---

## 2. Clonar y levantar el frontend (5 minutos)

```bash
git clone https://github.com/llpereirae-svg/Ts.git tributasoft
cd tributasoft
```

### Opción A: Python (más simple, viene con todo)
```bash
python -m http.server 8000 --bind 127.0.0.1
```

### Opción B: Node.js
```bash
npx serve -p 8000
```

### Opción C: PHP (si ya lo tenés instalado)
```bash
php -S 127.0.0.1:8000
```

Abrir en el navegador: **http://localhost:8000**

Deberías ver la landing igual que en producción. Si no:
- Revisá la consola del navegador (F12 → Console) por errores
- Verificá que el puerto 8000 no esté en uso (cambialo a 8001)
- Limpiá caché con Ctrl+F5

### Por qué necesitás un servidor HTTP (no abrir el archivo directo)

Si abrís `index.html` con doble clic (file://), los ES modules no cargan (los navegadores los bloquean por seguridad). **Siempre** servirlo con HTTP.

---

## 3. Estructura del repo

```
tributasoft/
├── index.html                  ← Entry point. Carga bootstrap.js.
├── DEV-LOCAL.md               ← Este archivo.
├── HANDOVER-TICS.md           ← Doc técnica del backend (LEER).
├── SECURITY-AUDIT.md          ← Auditoría de seguridad + pendientes backend.
├── flujo-registro.json        ← Contrato wizard paso a paso.
├── pdf-header-spec.json       ← Cómo reproducir el header de PDFs.
│
├── .github/
│   ├── workflows/deploy-pages.yml    ← CI/CD a GitHub Pages
│   └── smoke-test.py                 ← Valida antes del deploy
│
└── assets/
    ├── bootstrap.js           ← Carga wizard.js + app.js
    ├── wizard.js              ← Orquestador del wizard 8 pantallas
    ├── app.js                 ← Modales auxiliares (Cotizar, Pago, etc.)
    ├── styles.css
    ├── wizard.css
    │
    ├── screens/               ← Una pantalla del wizard por archivo
    │   ├── screen-firma.js        (paso 1: firma + cert)
    │   ├── screen-datos.js        (paso 2: datos personales)
    │   ├── screen-token.js        (paso 3: SMS + email OTP)
    │   ├── screen-tributaria.js   (paso 4: régimen + tipo)
    │   ├── screen-facturacion.js  (paso 5: facturación)
    │   ├── screen-clave.js        (paso 6: crear clave)
    │   └── screen-logo.js         (paso 7: logo opcional)
    │
    ├── services/              ← LO QUE HAY QUE CONECTAR AL BACKEND
    │   ├── token-service.js   ← reemplazar Capa 2 (SMS + email OTP)
    │   └── email-service.js   ← reemplazar Capa 2 (correo bienvenida)
    │
    ├── parsers/               ← Lectura local de archivos del usuario
    │   ├── firma-validator.js     (node-forge: .p12)
    │   └── pdf-parser.js          (pdf.js: cert RUC)
    │
    ├── utils/
    │   ├── validators.js          (RUC, email, celular, clave)
    │   ├── state-machine.js
    │   ├── countries.js           (catálogo países + dial code)
    │   ├── cities.js
    │   └── anti-bot.js            (honeypot + time-check)
    │
    └── manual/                ← Manual interactivo del usuario
        ├── manual.js
        └── manual-data.js
```

---

## 4. Probar el flujo completo

### Necesitás
- Tu propia firma electrónica `.p12` (cualquiera real del SRI sirve)
- Tu propio certificado de RUC en PDF reciente del SRI (máximo 1 mes)

Si no tenés acceso a archivos reales, pedí a TributaSoft un set de prueba sanitizado.

### Pasos
1. Abrir http://localhost:8000
2. Click "Iniciar registro" → Paso 1
3. Marcar checkbox de términos (hay que abrir el modal y hacer scroll-to-bottom)
4. Subir firma .p12 + clave → debe extraer titular, RUC, fecha caducidad
5. Subir cert RUC PDF → debe autocompletar razón social, dirección, etc.
6. Continuar → Paso 2 (datos) → completar dirección, email, celular
7. Continuar → Paso 3 (token) → **abrir consola (F12) para ver el código mock**:
   ```
   [token-service MOCK] SMS a 0998429901: código 7559
   ```
8. Ingresar el código → se desbloquea email → ingresar el segundo código
9. Continuar por pasos 4-7 → llegar al Resumen
10. Confirmar → en consola verás `[wizard] enviando registro {ruc, email, elapsed}`
11. Pantalla de éxito

> **OJO:** en modo mock NO se envía ningún SMS/correo real. Todo queda en consola del navegador.

---

## 5. Conectar el frontend a TU backend mientras lo construyes (LA SECCIÓN PRINCIPAL)

### 5.1 Los 4 endpoints a implementar

| # | Endpoint | Archivo | Función mock a reemplazar |
|---|---|---|---|
| 1 | `POST /api/token/sms` | `assets/services/token-service.js` | `sendSms()` |
| 2 | `POST /api/token/email` | `assets/services/token-service.js` | `sendEmail()` |
| 3 | `POST /api/email/registro` | `assets/services/email-service.js` | `sendEmailHtml()` |
| 4 | `POST /api/registro` | `assets/wizard.js → finishWizard()` | (agregar fetch nuevo) |

> **IMPORTANTE de seguridad (ver SECURITY-AUDIT.md §4.1):** el modelo correcto es que el backend genere el token (no el frontend) y lo guarde en una tabla `tokens_verificacion`. El frontend solo manda el destino al pedir el SMS y el código al verificar.

### 5.2 Setup recomendado durante desarrollo

Tu backend corre en un puerto, el frontend en otro:

```
Frontend  →  http://localhost:8000   (este repo)
Backend   →  http://localhost:8080   (tu Spring Boot / Node / Django)
```

### 5.3 Cómo cambiar las funciones mock por fetch reales

**Antes (mock actual en `token-service.js`):**
```js
async function sendSms(destino, token) {
  console.log(`[token-service MOCK] SMS a ${destino}: código ${token}`);
  await new Promise((r) => setTimeout(r, 250));
  return { ok: true };
}
```

**Después (apuntando a tu backend local):**
```js
const BACKEND_URL = 'http://localhost:8080';  // dev local

async function sendSms(destino /* SOLO destino, NO token */) {
  const res = await fetch(`${BACKEND_URL}/api/token/sms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destino }),
    credentials: 'include',  // para cookies fbp/fbc del pixel (ver §10)
  });
  if (!res.ok) throw new Error('Falló el envío del SMS');
  return { ok: true };
}
```

Y la verificación pasa también al backend (ver `verificarToken()` en el mismo archivo).

### 5.4 Centralizar la URL del backend

Recomendado: crear `assets/services/config.js` con la URL base, así no la repetís en cada servicio:

```js
// assets/services/config.js
const HOSTNAME = window.location.hostname;
export const BACKEND_URL =
  HOSTNAME === 'localhost' || HOSTNAME === '127.0.0.1'
    ? 'http://localhost:8080'                  // dev
    : 'https://api.tributasoft.ec';             // producción
```

Y en cada servicio:
```js
import { BACKEND_URL } from './config.js';
fetch(`${BACKEND_URL}/api/token/sms`, ...);
```

Así no tenés que cambiar nada al deployar — el frontend detecta solo si está en dev o producción.

### 5.5 Headers CSP a actualizar

Cuando agregues `fetch('http://localhost:8080/...')`, hay que permitir ese origen en el CSP del `index.html`:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  ...
  connect-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com http://localhost:8080;
">
```

Solo agregás `http://localhost:8080` a `connect-src`. En producción reemplazás por `https://api.tributasoft.ec`.

---

## 6. CORS (importante cuando frontend ≠ backend)

Cuando el frontend en `http://localhost:8000` le hace `fetch()` al backend en `http://localhost:8080`, son orígenes distintos. El navegador bloquea la respuesta a menos que tu backend mande headers CORS apropiados.

### 6.1 Ejemplo Spring Boot (Java)

```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOrigins(
                "http://localhost:8000",
                "https://llpereirae-svg.github.io",
                "https://www.tributasoft.com.ec"
            )
            .allowedMethods("GET", "POST", "OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(true)   // para cookies del pixel
            .maxAge(3600);
    }
}
```

### 6.2 Ejemplo Node.js (Express)

```js
const cors = require('cors');
app.use(cors({
  origin: [
    'http://localhost:8000',
    'https://llpereirae-svg.github.io',
    'https://www.tributasoft.com.ec',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  maxAge: 3600,
}));
```

### 6.3 Ejemplo Django (Python)

```python
# settings.py
INSTALLED_APPS = [..., 'corsheaders', ...]
MIDDLEWARE = ['corsheaders.middleware.CorsMiddleware', ...]
CORS_ALLOWED_ORIGINS = [
    "http://localhost:8000",
    "https://llpereirae-svg.github.io",
    "https://www.tributasoft.com.ec",
]
CORS_ALLOW_CREDENTIALS = True
```

> **NO usar** `Access-Control-Allow-Origin: *` con `allowCredentials: true` — los navegadores lo rechazan. Siempre listar orígenes específicos.

---

## 7. Workflow de desarrollo día a día

```bash
# Mañana
git pull origin main           # traer últimos cambios
python -m http.server 8000     # levantar frontend

# Hacer cambios al frontend / backend en tu editor

# Antes de pushear
python .github/smoke-test.py   # validar que no rompiste nada

# Si OK
git add .
git commit -m "feat: ..."
git push origin main
# El workflow corre solo y deploya en ~1 min
# https://github.com/llpereirae-svg/Ts/actions
```

---

## 8. Smoke test local

`.github/smoke-test.py` valida ANTES del deploy:

1. CSP vs `<script>`/`<style>` inline (bloquearía la página)
2. URLs externas vs allowlist del CSP
3. Referencias `src=` / `href=` que apunten a archivos existentes
4. Imports relativos en JS que no estén rotos
5. Cache buster consistente en todo el repo

**Correrlo antes de cada push:**
```bash
python .github/smoke-test.py
```

Si imprime `Smoke test OK — deploy autorizado` podés pushear. Si imprime `[FAIL]` arreglalo antes — el workflow va a abortar igual y la página quedará desactualizada.

---

## 9. Cache busters (importante cuando cambies JS o CSS)

Todos los imports del frontend llevan `?v=YYYYMMDDx` (ej. `20260520d`). El navegador cachea por URL completa, así que sin bumpear el cache buster los visitantes van a seguir viendo la versión vieja por horas.

**Cómo bumpear todos los archivos a la vez:**

```bash
# Reemplazar versión vieja por nueva en todo el repo
python -c "
from pathlib import Path
old, new = '20260520d', '20260520e'  # actualizar a la fecha del cambio
for f in list(Path('.').rglob('*.js')) + list(Path('.').rglob('*.html')) + list(Path('.').rglob('*.css')):
    if '.git' in f.parts or '_stitch_ref' in f.parts: continue
    t = f.read_text(encoding='utf-8')
    if old in t: f.write_text(t.replace(old, new), encoding='utf-8')
print('OK')
"
```

Formato sugerido: `YYYYMMDD` + letra (a, b, c, d…) por cambios en el mismo día.

---

## 10. Meta Pixel + Conversions API (CAPI) — armar el backend con esto en mente

Esta sección es para que el backend que vas a construir ya considere desde el inicio la integración con Meta Ads. Hacerlo después es 5x más costoso.

### 10.1 Qué es el Pixel y qué es CAPI

| Cosa | Dónde corre | Para qué |
|---|---|---|
| **Meta Pixel** | Navegador del usuario (frontend) | Trackea automáticamente PageView, clics, conversiones. Pierde datos con bloqueadores de ads (uBlock, Brave, Safari ITP). |
| **Conversions API (CAPI)** | Backend (tu servidor) | Manda los mismos eventos directamente a Meta. Sobrevive a bloqueadores. Mejor atribución de campañas pagadas. |

Lo correcto es **usar ambos** y deduplicarlos con un `event_id` común. Si pones solo el pixel pierdes ~30% de conversiones; si pones solo CAPI pierdes el contexto del navegador.

### 10.2 Lo que va en el FRONTEND (a configurar cuando esté listo el pixel)

Vas a necesitar el **PIXEL_ID** que el equipo de marketing crea en https://business.facebook.com (Events Manager → Conectar fuentes de datos → Web → Meta Pixel).

**Snippet base en `index.html` (dentro de `<head>`):**
```html
<!-- Meta Pixel -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'TU_PIXEL_ID');
fbq('track', 'PageView');
</script>
```

> Como este script es **inline** y nuestro CSP no permite scripts inline, hay que ajustar el CSP para agregar el hash del script (`'sha256-...'`) o moverlo a un archivo `assets/meta-pixel.js`. La ruta más limpia es archivo externo + agregar `https://connect.facebook.net` a `script-src` del CSP.

**Conectar al `track()` interno de `app.js`:** ya hay un sistema de tracking interno que dispara `CustomEvent('tributasoft:event')`. Agregar este listener en `bootstrap.js`:

```js
window.addEventListener('tributasoft:event', (e) => {
  const { name, ...detail } = e.detail;
  if (!window.fbq) return;
  // Eventos estándar de Meta: Lead, CompleteRegistration, etc.
  const mapaEventosMeta = {
    'firma_validada': ['Lead', { content_name: 'Wizard paso 1 completo' }],
    'registro_completado': ['CompleteRegistration', { content_name: 'Wizard finalizado' }],
  };
  const evento = mapaEventosMeta[name];
  if (evento) {
    const [nombre, params] = evento;
    fbq('track', nombre, { ...params, event_id: detail.eventId });
  }
});
```

El `event_id` lo genera el frontend con `crypto.randomUUID()` y se manda **igual** al backend para que CAPI lo use → así Meta deduplica el mismo evento llegando por ambas vías.

### 10.3 Lo que va en el BACKEND — Conversions API

Vas a necesitar:
- `PIXEL_ID` (mismo del frontend)
- `ACCESS_TOKEN` del System User en Business Manager (NUNCA exponer al frontend)
- URL: `https://graph.facebook.com/v18.0/{PIXEL_ID}/events`

**Cuándo dispararlo (mínimo):**
- Después de `POST /api/registro` exitoso → evento `CompleteRegistration`
- (Opcional) Después de `POST /api/token/sms` exitoso → evento `Lead`

**Estructura del payload (ejemplo en pseudocódigo):**
```json
POST https://graph.facebook.com/v18.0/{PIXEL_ID}/events?access_token=XXX
{
  "data": [{
    "event_name": "CompleteRegistration",
    "event_time": 1716800000,
    "event_id": "uuid-que-vino-del-frontend",
    "action_source": "website",
    "event_source_url": "https://www.tributasoft.com.ec/registro",
    "user_data": {
      "em": ["SHA256_DEL_EMAIL_EN_LOWERCASE"],
      "ph": ["SHA256_DEL_CELULAR_E164"],
      "fbp": "cookie _fbp del navegador",
      "fbc": "cookie _fbc del navegador",
      "client_ip_address": "IP del usuario",
      "client_user_agent": "User-Agent del usuario"
    },
    "custom_data": {
      "currency": "USD",
      "value": 0
    }
  }]
}
```

**Cookies `_fbp` y `_fbc`:** las setea el Pixel del navegador. El frontend tiene que enviarlas al backend en cada request (por eso `credentials: 'include'` en los `fetch()` y la cookie tiene que ser `SameSite=Lax` o `None`). El backend las pasa a CAPI para que Meta haga match con el usuario.

**Snippet Spring Boot (Java) sugerido:**
```java
@Service
public class MetaCapiService {
    @Value("${meta.pixel.id}") String pixelId;
    @Value("${meta.access.token}") String accessToken;

    public void sendEvent(String eventName, String eventId, UserData ud, CustomData cd) {
        String url = String.format(
            "https://graph.facebook.com/v18.0/%s/events?access_token=%s",
            pixelId, accessToken
        );
        // ... build payload, POST con WebClient ...
    }
}
```

### 10.4 Hash de los datos del usuario (obligatorio para CAPI)

Antes de mandar email/celular a Meta, hay que hashearlos con SHA-256 (Meta los matchea contra sus usuarios hasheados):

```python
# Python ejemplo
import hashlib
def hash_for_meta(s):
    return hashlib.sha256(s.strip().lower().encode('utf-8')).hexdigest()

hash_for_meta('Cliente@TributaSoft.com')  # → 'a3f2...'
hash_for_meta('+593998429901')             # → 'b7c1...'
```

> NO mandar email/celular en texto plano a Meta. Solo el SHA-256 en lowercase.

### 10.5 Testing del Pixel + CAPI

Meta Events Manager tiene una pestaña **"Test events"** donde se ven los eventos en tiempo real. Sirve para validar:
1. Que el Pixel dispara `PageView` automático.
2. Que el Pixel dispara `Lead` cuando se valida la firma.
3. Que CAPI dispara `CompleteRegistration` desde el backend al finalizar el registro.
4. Que los dos eventos `CompleteRegistration` (uno del pixel, uno de CAPI) se deduplican porque comparten `event_id`.

### 10.6 Resumen visual del flujo Pixel + CAPI

```
Usuario completa registro en /registro
                │
                ├──→ Frontend (pixel):  fbq('track', 'CompleteRegistration', { event_id: 'abc-123' })
                │                       └─→ Meta servers
                │
                └──→ Backend recibe POST /api/registro
                     ├─→ Guarda en BD (hashea clave, persiste)
                     ├─→ Manda correo de bienvenida
                     └─→ Manda CAPI a Meta:
                         POST graph.facebook.com/v18.0/{PIXEL_ID}/events
                         { event_id: 'abc-123', user_data: { em: sha256(email), ... } }

Meta ve dos eventos con event_id='abc-123' → deduplica → 1 conversión atribuida
```

---

## 11. Troubleshooting común

| Síntoma | Causa probable | Fix |
|---|---|---|
| Página en blanco | Smoke test detectaría — probablemente CSP bloqueando algo | Abrir consola (F12 → Console). Buscar "Refused to load" o "blocked by CSP". |
| `CORS error` en consola | Backend no manda headers CORS | Revisar §6. Confirmar que el backend permite el origen `http://localhost:8000` con `Allow-Credentials: true`. |
| `404` en GitHub Pages | Pages se desactivó | Settings → Pages → Source = "GitHub Actions" (intervención manual única). |
| `Failed to fetch` al cargar JS | Imports rotos | Correr `python .github/smoke-test.py` |
| Cambios no se ven aunque haya commit | Cache del navegador | Ctrl+F5 o bumpear cache buster en todo el repo (ver §9) |
| Workflow falla en CI pero local pasa | Diferencia de encoding o tab/space | Mirar el log del job en pestaña Actions |
| Token SMS no llega a tu celular | Estás en modo mock | El código aparece en consola del navegador (F12 → Console). Solo desaparece cuando reemplaces `sendSms()` por el fetch real al backend. |
| Pixel no dispara eventos | Bloqueador de anuncios activo | Probar en ventana incógnita sin extensiones. O instalar la extensión "Meta Pixel Helper" para Chrome. |
| CAPI rechaza el evento | Token expirado o pixel_id mal | Logs del System User en Business Manager. El error suele ser `(#190) Error validating access token`. |

---

## 12. Referencias

| Archivo | Para qué |
|---|---|
| `HANDOVER-TICS.md` | Detalle técnico de los 4 endpoints, schema BD, snippets de código |
| `SECURITY-AUDIT.md` | Auditoría de seguridad + pendientes (tokens server-side, rate limiting, hash clave, etc.) |
| `flujo-registro.json` | Contrato del wizard paso a paso (1 a 8) — qué entra, qué sale en cada pantalla |
| `pdf-header-spec.json` | Cómo reproducir el header corporativo de los PDFs (cotización, brochure) |
| `Terminos-y-Condiciones.txt` | Texto legal de las 9 cláusulas (para referencia) |
| `Explicacion-TICS.docx` | Versión Word para llevar a reunión con TI/TICS |

**Repositorio:** https://github.com/llpereirae-svg/Ts
**Producción:** https://llpereirae-svg.github.io/Ts
**Portal post-registro:** https://tbc.tributasoft.ec/Erp-web/templates/registro/login.xhtml

---

## Contacto

Dudas sobre el frontend o esta doc: abrir un issue en el repo o contactar al equipo que armó la landing.
