# TributaSoft — Landing de Registro

Landing estática (HTML + CSS + JavaScript ES modules) con un wizard de 8 pantallas para que un contribuyente se registre en TributaSoft sin necesidad de hablar con APIs externas del SRI.

**Producción:** [llpereirae-svg.github.io/Ts](https://llpereirae-svg.github.io/Ts/)
**Portal post-registro:** [tbc.tributasoft.ec](https://tbc.tributasoft.ec/Erp-web/templates/registro/login.xhtml?faces-redirect=true)

---

## Idea

El usuario sube **dos archivos** y la landing extrae todo lo demás:

1. **Firma electrónica `.p12`** — parseamos con `node-forge` (en el navegador) para sacar titular, RUC, fecha de caducidad.
2. **Certificado de RUC en PDF** — parseamos con `pdf.js` para sacar razón social, dirección, provincia, cantón, régimen, tipo de contribuyente, email y celular.

El resto del wizard solo confirma o ajusta lo extraído. No hay scraping del SRI, no hay llamadas a APIs externas para validar el RUC.

---

## Estructura del repo

```
tributasoft/
├── index.html
├── HANDOVER-TICS.md         ← Doc técnica para el equipo TI/TICS
├── Explicacion-TICS.docx    ← Mismo contenido en Word para reuniones
├── SECURITY-AUDIT.md        ← Auditoría interna de seguridad
└── assets/
    ├── app.js               ← Legacy: maneja modales Cotizar, Pago, Términos
    ├── wizard.js            ← Orquestador del wizard de 8 pantallas
    ├── styles.css
    ├── wizard.css
    ├── screens/             ← Una pantalla por archivo
    │   ├── screen-firma.js
    │   ├── screen-datos.js
    │   ├── screen-token.js
    │   ├── screen-tributaria.js
    │   ├── screen-facturacion.js
    │   ├── screen-clave.js
    │   └── screen-logo.js
    ├── services/            ← Solo lo que necesita backend real
    │   ├── token-service.js   (SMS + email OTP — mock hasta integrar)
    │   └── email-service.js   (email de bienvenida — mock hasta integrar)
    ├── parsers/             ← Lectura local de archivos del usuario
    │   ├── firma-validator.js   (.p12 con node-forge)
    │   └── pdf-parser.js        (cert RUC con pdf.js)
    ├── utils/               ← Helpers reutilizables
    │   ├── validators.js
    │   ├── state-machine.js
    │   ├── countries.js
    │   └── cities.js
    └── manual/              ← Manual interactivo (modal con tabs)
        ├── manual.js
        └── manual-data.js
```

---

## Qué hace la landing sola (sin backend)

✅ Valida la firma .p12 — clave, vigencia y RUC interno.
✅ Lee el certificado de RUC PDF — razón social, dirección, régimen, tipo de contribuyente, fecha de emisión.
✅ Valida que el cert no tenga más de 1 mes de emitido.
✅ Valida que el RUC del cert coincida con el de la firma.
✅ Genera tokens de verificación con `crypto.getRandomValues()`.
✅ Sanitiza datos antes de enviar (UPPERCASE, sin tildes, ñ → NI).
✅ Detecta dispositivo (PC/Tablet/Móvil) automáticamente.
✅ Genera el banner del logo (2970×300 PNG) con la imagen del usuario o solo con su nombre comercial.

## Qué necesita el backend (4 endpoints)

| # | Endpoint | Archivo |
|---|---|---|
| 1 | `POST /api/token/sms` | `services/token-service.js` |
| 2 | `POST /api/token/email` | `services/token-service.js` |
| 3 | `POST /api/email/registro` | `services/email-service.js` |
| 4 | `POST /api/registro` | `wizard.js → finishWizard()` |

Detalles completos (JSON, schema BD, ejemplos de fetch) en **`HANDOVER-TICS.md`**.

---

## Desarrollo local

```bash
cd tributasoft
python -m http.server 8000
# abrir http://localhost:8000
```

No hay build step. Es ES modules + CSS + assets estáticos. Edita un archivo y recarga el navegador.

**Cache-busting:** todos los imports llevan `?v=YYYYMMDDx`. Al cambiar código de cualquier `.js` o `.css`, bumpea ese sufijo en TODOS los archivos para que los visitantes no vean caché vieja. Hay un patrón en commits previos (`20260518a`, `b`, `c`, `d`…).

---

## Stack de dependencias externas

Cargadas desde CDN (jsdelivr), versiones fijas:

- [`node-forge@1.3.1`](https://www.npmjs.com/package/node-forge) — parseo de PKCS#12.
- [`pdfjs-dist@4.0.379`](https://www.npmjs.com/package/pdfjs-dist) — extracción de texto del cert RUC.
- [`jsPDF`](https://github.com/parallax/jsPDF) — generación del PDF de la cotización y del manual.

Google Fonts: DM Sans (titulares), Inter (cuerpo), Lobster (logo), Roboto Condensed (PDFs corporativos).

---

## Seguridad

Auditoría completa en `SECURITY-AUDIT.md`. Resumen de lo crítico:

### Lo que YA está implementado en frontend
- HTTPS automático (GitHub Pages) — cero URLs HTTP hardcodeadas.
- Headers de seguridad: `Content-Security-Policy`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- Anti-bot client-side: honeypot invisible + time-check (mínimo 25s para completar el wizard).
- Throttle del botón "Reenviar token": cooldown progresivo (60s → 120s → 240s) + máximo 3 reenvíos por canal.
- Cero `eval()`, `document.write`, secrets hardcodeados o uso de `Math.random()` para tokens.
- Borrado de campos sensibles (`clave`, `confirmarClave`, `token`) antes de persistir el draft en `sessionStorage`.

### Lo que falta y debe hacer TICS (backend)
- **Tokens server-side** (el frontend actualmente los genera y verifica — vulnerable a abuso).
- **Rate limiting** por IP y por destino en los 4 endpoints.
- **CAPTCHA invisible** (Cloudflare Turnstile) en los endpoints sensibles.
- **Hash de clave** con bcrypt/argon2 al persistir (NUNCA texto plano).
- **HMAC** del payload entre frontend y backend.
- **Validación server-side** de RUC + cert + firma (no confiar solo en frontend).
- **HSTS** y otros headers desde el backend.

La firma `.p12` y el cert PDF **NO se suben al servidor**: se leen en el navegador y se descartan. Solo viajan los datos extraídos.

---

## Documentación

- **`HANDOVER-TICS.md`** — Documento técnico para el equipo de desarrollo del backend.
- **`Explicacion-TICS.docx`** — Mismo contenido en lenguaje común, para llevar a reunión con TI/TICS.
- **`SECURITY-AUDIT.md`** — Hallazgos de la auditoría interna + pendientes para producción.

---

## Licencia

© 2026 TributaSoft S.A. — Todos los derechos reservados.
