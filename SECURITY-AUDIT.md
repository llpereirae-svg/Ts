# Auditoría interna de seguridad — TributaSoft Landing

Fecha: 2026-05-18
Alcance: todos los `.js` bajo `assets/` (post-reorganización por carpetas).
Resultado: **OK con observaciones aplicadas + 1 pendiente para producción**.

---

## 1. Pruebas ejecutadas

| Vector | Resultado | Notas |
|---|---|---|
| `eval()`, `new Function()` | ✅ No encontrado | Cero código dinámico. |
| `document.write()` | ✅ No encontrado | |
| `setTimeout(string,…)` / `setInterval(string,…)` | ✅ No encontrado | Todos pasan callbacks. |
| `innerHTML` con datos del usuario sin escape | ✅ OK | Toda interpolación pasa por `escapeAttr()` o `escapeHtml()`. |
| `localStorage` / `sessionStorage` con datos sensibles | ✅ OK | Borramos `clave`, `confirmarClave` y `token` antes de persistir el draft. Solo se guarda progreso del manual y caché de RUC (legacy). |
| `document.cookie` | ✅ No encontrado | |
| Hardcoded credentials / API keys | ✅ No encontrado | |
| Imports rotos post-reorg | ✅ OK | 18 archivos `.js`, 25 imports relativos, todos resuelven. |

---

## 2. Cambios aplicados durante la auditoría

### 2.1 `wizard.js` — leak de datos completos a consola
**Antes:** `console.log('[wizard] datos a enviar al backend:', sanitizado)` exponía RUC, razón social, email, clave en texto plano, etc.
**Después:** solo se loguea `{ ruc, email }` como traza mínima.

### 2.2 `services/email-service.js` — leak del HTML completo a consola
**Antes:** se hacía `console.log(htmlBody)` con el template entero (clave en monospace incluida).
**Después:** solo se loguea destino + asunto + tamaño en chars.

### 2.3 `services/token-service.js` — comentarios de SECURITY en mocks
Los `console.log` de los códigos OTP en `sendSms()` / `sendEmail()` se mantienen porque sin gateway real el dev no podría testear. Se agregó un comentario `SECURITY:` que indica explícitamente borrar esas líneas al integrar el fetch real al backend.

### 2.4 `manual/manual.js` — innerHTML sin escape
Aunque `step.rules` y `step.errors` vienen de `manual-data.js` (contenido estático nuestro), se agregó `escapeHtml()` por defensive coding ante futuras ediciones.

---

## 3. Pendiente para producción (responsabilidad de TI/TICS)

### 3.1 Tokens generados en frontend (inseguro)
El navegador genera el OTP con `crypto.getRandomValues()` y lo envía al backend solo para que lo entregue. Un atacante con DevTools abierto puede ver el código antes que llegue al teléfono.

**Recomendación:** que el backend genere el token, lo guarde en `tokens_verificacion` con TTL 5 min, y el frontend solo envíe el código que digita el usuario para que el backend lo compare.

Ver `HANDOVER-TICS.md` § 7 y `Explicacion-TICS.docx` § "Seguridad / Sobre los tokens".

### 3.2 Hash de clave en backend
La clave se envía en texto plano al endpoint `/api/registro`. **NUNCA** debe guardarse así en BD: usar bcrypt (cost ≥ 12) o argon2.

### 3.3 Rate limiting
Los endpoints `/api/token/sms`, `/api/token/email` y `/api/registro` deben tener rate limit (ej. máx 5 intentos/IP/15min) para evitar abuso.

### 3.4 HTTPS obligatorio
La landing **solo debe servirse por HTTPS** en producción. El backend igual. Si conviven en distintos dominios, configurar CORS con allowlist explícita.

### 3.5 CSP headers
Se recomienda enviar `Content-Security-Policy` desde el backend o configurar en el servidor estático:
```
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:;
```
(Ajustar según los CDN que se usen: jsdelivr para node-forge y pdf.js.)

---

## 4. Inventario de dependencias externas

| Origen | Para qué | Pinned |
|---|---|---|
| `https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js` | Parseo de firma .p12 | ✅ versión fija |
| `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs` | Lectura del cert RUC PDF | ✅ versión fija |
| `https://fonts.googleapis.com/css2?family=...` | Fuentes web | (Google Fonts) |

Recomendación opcional: subir esas dos libs al servidor propio (no depender de jsdelivr) para producción.

---

## 5. Patrones que confirmamos están bien implementados

- ✅ **Borrado de campos sensibles del draft:** `app.js:saveDraft()` elimina `clave`, `confirmarClave` y `token` antes de serializar a `sessionStorage`.
- ✅ **Escape consistente:** las funciones `escapeAttr()` y `escapeHtml()` están definidas en cada módulo que necesita interpolar HTML.
- ✅ **No upload de archivos sensibles:** la firma `.p12` y el cert PDF se leen en el navegador con `FileReader` y nunca se envían al servidor. Solo se persisten los datos extraídos.
- ✅ **Validación local de firma:** la clave del .p12 se verifica con `node-forge` sin enviarla a ningún servicio.
- ✅ **Entropía real para tokens:** se usa `crypto.getRandomValues()` con módulo 10 — no `Math.random()`.

---

## 6. Próxima auditoría sugerida

Cuando TI/TICS integre el backend real, conviene re-auditar:
- Que los `console.log` de los mocks ya no existan.
- Que los tokens nunca regresen al frontend (paquete `{ ok: true }` solamente).
- Que el endpoint `/api/registro` valide server-side todos los campos (no confiar en sanitización frontend).
- Que la sesión post-login use cookies `HttpOnly; Secure; SameSite=Lax`.
