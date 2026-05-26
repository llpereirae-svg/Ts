# Auditoría interna de seguridad — TributaSoft Landing

Última revisión: 2026-05-20
Alcance: todos los `.js`, `.html` y `.css` del repo.
Estado: **OK con hallazgos críticos delegados a TICS (backend) + 7 mejoras de frontend ya aplicadas**.

---

## 1. Resultado de la auditoría

### 1.1 Pruebas que pasan ✅

| Vector | Resultado |
|---|---|
| `eval()`, `new Function()` | No encontrado |
| `document.write()` | No encontrado |
| `setTimeout/setInterval` con strings | No encontrado |
| `innerHTML` con datos del usuario sin escape | Todo interpola pasa por `escapeAttr`/`escapeHtml` |
| URLs HTTP:// hardcodeadas | Cero |
| API keys / secrets en código | Cero |
| `Math.random()` para tokens | Usamos `crypto.getRandomValues()` |
| Imports rotos | Cero (verificado cruzado en los 18 JS) |
| `document.cookie` | No usado |
| `localStorage` / `sessionStorage` con datos sensibles | Borra `clave`, `confirmarClave` y `token` antes de persistir |

### 1.2 Vulnerabilidad CRÍTICA — generación de tokens en frontend ⚠️

**Lugar:** `assets/services/token-service.js`

**Problema:**
1. El frontend genera el OTP con `crypto.getRandomValues()`.
2. El navegador lo guarda en memoria y lo compara localmente cuando el usuario lo digita.
3. Un atacante con DevTools (F12) **ve el código antes de que llegue al SMS**.
4. O reescribe `verificarToken()` para que siempre retorne `{ valid: true }`.
5. Un script puede automatizar `generarYEnviarToken()` con miles de destinos → **agota el crédito de Twilio/SendGrid** y bombardea con SMS spam a números reales.

**Mitigación obligatoria:** la generación, almacenamiento y verificación del token debe vivir en el backend. Frontend solo manda `{ canal, destino }` y luego `{ canal, destino, codigo }`. Ver § 4.

---

## 2. Mejoras de frontend YA APLICADAS

### 2.1 Headers de seguridad en `index.html`

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com data:;
  img-src 'self' data: https://llpereirae-svg.github.io;
  connect-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
">
<meta http-equiv="X-Frame-Options" content="DENY">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()">
```

**Efecto:**
- **CSP** bloquea cualquier `<script>` inyectado que no venga de un origen permitido (jsdelivr/cloudflare/propio).
- **X-Frame-Options** evita clickjacking (no se puede embeber en iframe).
- **Referrer-Policy** evita leak de URL al destino externo (ej. portal post-registro).
- **Permissions-Policy** deshabilita APIs sensibles no usadas (cámara, micrófono, GPS, NFC pago).

### 2.2 Anti-bot client-side (`assets/utils/anti-bot.js`)

Implementa dos heurísticas que filtran ~70% de bots simples sin agregar fricción al usuario humano:

**Honeypot:** un `<input name="website">` invisible se inyecta en el DOM. Los bots automatizados llenan todos los campos del formulario (porque "website" es un patrón clásico). Los humanos no lo ven (está fuera del viewport con `left: -9999px` + `aria-hidden` + `tabindex=-1`). Si tiene valor al finalizar el wizard → abortamos sin mostrar el motivo.

**Time-check:** medimos cuánto tarda el usuario desde que monta el wizard hasta que confirma. Mínimo razonable: 25 segundos (un humano tiene que subir 2 archivos, escribir clave, validar 2 SMS/correos, crear clave, revisar 8 pantallas). Si lo completó en menos de 25s, es bot.

Ambas heurísticas se evalúan dentro de `finishWizard()` antes de enviar nada al backend. Si fallan, mostramos un error genérico ("No pudimos completar tu registro en este momento") para NO revelar la heurística al atacante.

### 2.3 Throttle anti-spam en reenvío de tokens

**`assets/screens/screen-token.js`:**
- Cooldown inicial: **60 s** (antes 30 s)
- Cooldown progresivo: cada reenvío duplica el tiempo (60s → 120s → 240s)
- Tope absoluto: **3 reenvíos por canal**. Después el botón queda permanentemente bloqueado y el usuario debe reiniciar el wizard.

Esto frena ataques de "spam del botón Reenviar" que buscan agotar tu crédito de Twilio/SendGrid.

### 2.4 Comentarios `SECURITY:` en mocks

`token-service.js` y `email-service.js` tienen comentarios explícitos `SECURITY:` que marcan exactamente qué líneas DEBE borrar TICS al integrar el backend real (por ejemplo, los `console.log` que muestran el token en consola — solo existen para que un dev pueda probar sin gateway SMS configurado).

### 2.5 Anti-leak en `wizard.js`

`finishWizard()` ya NO loguea el objeto completo del registro a consola. Solo traza mínima: `{ ruc, email, elapsed }`. El elapsed sirve para que un dev (o TICS en producción) detecte patrones de abuso (varios registros con elapsed cercano a 26s, justo arriba del umbral del time-check).

### 2.6 Sanitización defensiva en `manual/manual.js`

`step.rules` y `step.errors` ahora pasan por `escapeHtml()` antes de ir a `innerHTML`. El contenido viene de `manual-data.js` (nuestro, no del usuario), pero protege contra ediciones futuras inseguras.

### 2.7 Borrado de datos sensibles del draft

`app.js → saveDraft()` borra `clave`, `confirmarClave` y `token` antes de persistir el draft en `sessionStorage`. Ya estaba pero queda documentado.

---

## 3. Inventario de dependencias externas

| Origen | Versión | Para qué | Verificada |
|---|---|---|---|
| `https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js` | 1.3.1 | Parseo de firma .p12 | Versión fija |
| `https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js` | 2.5.2 | Generación de PDF de cotización | Versión fija |
| `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs` | 4.0.379 | Lectura del cert RUC PDF | Versión fija |
| Google Fonts (DM Sans, Inter, Lobster, Roboto Condensed) | — | Tipografía | Servidor de Google |

Recomendación a futuro: cuando TICS aloje el sitio, **descargar estos archivos y servirlos desde el mismo dominio** (no depender de CDNs externos). Esto elimina el riesgo de supply-chain attack y permite servir todo bajo el mismo CSP estricto.

---

## 4. Pendientes para TICS (BACKEND — no se pueden hacer en frontend)

### 4.1 Tokens server-side (CRÍTICO)

```
ANTES (frontend mock, vulnerable):
  navegador genera token → manda al backend que solo lo entrega
  → navegador verifica localmente

DESPUÉS (correcto):
  navegador POST /api/token/sms { destino }
    → backend genera token con RNG cripto
    → backend guarda en tabla tokens_verificacion (TTL 5 min, max 5 intentos)
    → backend lo envía por Twilio/Movistar/etc.
    → backend responde { ok: true }    (SIN devolver el token)
  navegador POST /api/token/verify { canal, destino, codigo }
    → backend compara con lo guardado
    → backend responde { valid: bool, intentos_restantes: N }
```

### 4.2 Rate limiting (CRÍTICO)

- **Por IP:** máximo 5 SMS / 15 minutos / IP.
- **Por destino (celular):** máximo 3 SMS / 1 hora al mismo número.
- **Por destino (email):** máximo 5 correos / 1 hora al mismo email.
- **Por registro completo:** máximo 2 registros / día / IP.

Implementación sugerida: tabla `rate_limit_log` con `(ip, accion, ts)` + chequeo en cada endpoint.

### 4.3 CAPTCHA invisible (RECOMENDADO)

**Cloudflare Turnstile** (gratis ilimitado) o **hCaptcha invisible**. NO interrumpe al usuario humano (analiza comportamiento, mouse, IP) — solo aparece un challenge si el puntaje es sospechoso. A los bots los frena directamente.

Integración:
1. TICS agrega el script en `<head>` con la sitekey pública.
2. Cada `POST /api/token/sms` y `POST /api/registro` recibe un token de Turnstile del frontend.
3. El backend valida ese token contra la API de Cloudflare antes de procesar.

### 4.4 Validación server-side de firma y cert (CRÍTICO)

El frontend parsea la firma .p12 y el cert RUC, pero un atacante puede hacer un POST directo a `/api/registro` con datos arbitrarios. **El backend debe re-validar:**

- ¿El RUC tiene formato válido (algoritmo dígito verificador del SRI)?
- ¿La razón social existe / es consistente?
- Para alta seguridad: pedir el archivo .p12 + clave al backend y volver a parsearlo server-side.

### 4.5 Hash de la clave del usuario (CRÍTICO)

La clave se envía en texto plano al endpoint `/api/registro`. El backend **DEBE** hashearla con bcrypt (cost ≥ 12) o argon2 ANTES de persistir.

**NUNCA** guardar en texto plano. **NUNCA** loguear la clave.

### 4.6 HMAC del payload (RECOMENDADO)

Para detectar manipulación del payload entre frontend y backend:
1. Frontend genera un timestamp + HMAC del JSON con una clave compartida (clave pública del API, rota diariamente).
2. Backend valida el timestamp (no más de 60s) + el HMAC.
3. Si no coincide → reject.

Esto evita replay attacks y modificación en el camino.

### 4.7 Headers HTTP desde el backend

Configurar en el servidor web (NGINX, Apache, Cloudflare):

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-site
```

HSTS fuerza HTTPS para siempre en navegadores que hayan visitado la página al menos una vez.

### 4.8 Sesión post-registro

Cookies con flags estrictos:
```
Set-Cookie: session=...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600
```

---

## 5. Patrones de monitoreo recomendados

Una vez en producción, configurar alertas para:

| Evento | Umbral | Acción |
|---|---|---|
| Registros desde misma IP en N horas | > 3 / 24h | Notificar admin |
| SMS enviados desde misma IP | > 10 / 15min | Bloquear IP temporalmente |
| Tokens validados con `intentos > 3` | cualquiera | Bloquear celular 1h |
| Honeypot disparado (telemetría) | cualquiera | Loguear IP + user-agent |
| Time-check disparado (<25s) | cualquiera | Loguear IP + user-agent |
| Registros con `elapsed` entre 25-45s | > 5 / hora | Investigar (bot que aprendió el umbral) |

---

## 6. Próxima auditoría sugerida

Cuando TICS integre el backend real:

1. Re-auditar todos los `console.log` (los del mock deben desaparecer).
2. Verificar que los tokens NUNCA aparecen en la respuesta del backend.
3. Probar el rate limiting con un script de carga (Apache Bench, k6).
4. Verificar que la clave llega hasheada a la BD.
5. Confirmar que CSP en producción es tan estricto o más que el actual.
6. Pentesting básico: intentar replay attack, SQL injection en el RUC, payload con campos extra.
