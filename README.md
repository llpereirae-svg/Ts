# TributaSoft — Landing/Registro (prototipo funcional)

Implementación de referencia HTML + JS vanilla del flujo de captación y registro unificado para TributaSoft. Este prototipo **funciona end-to-end con mocks** y sirve como **especificación viva** para que el equipo Java lo porte a JSF/PrimeFaces sobre el ERP existente.

> El diseño visual final lo aplicará Stitch — este código se enfoca en la **lógica y funcionalidad**.

---

## Cómo correrlo localmente

Solo necesitas servirlo como archivos estáticos (los módulos ES requieren `http://`, no `file://`):

```powershell
# Opción 1: con Python
cd tributasoft
python -m http.server 8080

# Opción 2: con Node
npx serve tributasoft -l 8080
```

Abre `http://localhost:8080`.

### Datos de prueba para navegar el flujo

| Escenario | RUC a usar |
|-----------|------------|
| RUC ya existe → redirige a cotizador | `1710034065001` (ficticio, marcado como registrado) |
| RUC nuevo + datos SRI encontrados (flujo completo) | `0992703601001` o `1791234567001` |
| RUC nuevo + SRI no encontrado (fallback formulario vacío) | cualquier RUC con dígito verificador válido distinto de los anteriores |
| RUC inválido (formato/verificador) | `1234567890123` |
| RUC con establecimiento ≠ 001 | `0992703601002` → rechazado (regla TributaSoft) |

**Regla de RUC en TributaSoft:** el RUC del contribuyente siempre termina en `001` (matriz). Los campos "Establecimiento" y "Punto de emisión" del formulario son **parámetros separados** que se configuran al emitir facturas; un mismo contribuyente puede tener varios. No confundir con los últimos 3 dígitos del RUC.

**Código de verificación (mock):** siempre `123456` (también se imprime en la consola del navegador).
**Clave de firma electrónica (mock):** `firma123`.
**Forzar fallo de red:** añade `?simulate=fail` al final de la URL.

---

## Estructura del proyecto

```
tributasoft/
├── index.html                # Estructura semántica
├── README.md
└── assets/
    ├── styles.css            # Mobile-first, variables CSS, animaciones
    ├── app.js                # Orquestador, conecta SM + DOM + API
    ├── state-machine.js      # Máquina de estados pura
    ├── validators.js         # RUC, celular, email, clave, firma
    ├── sri-client.js         # Cliente SRI con cache 24h + fallback
    └── api-mocks.js          # Mocks de endpoints backend (TODO BACKEND)
```

---

## Máquina de estados

```
IDLE
  └─ RUC_TYPED ──▶ VALIDATING_FORMAT
                    ├─ formato malo ──▶ ERROR_FORMAT
                    │                    └─ RUC_EDIT ──▶ IDLE
                    └─ formato OK   ──▶ CHECKING_DB
                                          ├─ existe   ──▶ REDIRECT_COTIZADOR
                                          └─ nuevo    ──▶ QUERYING_SRI
                                                            ├─ SRI OK   ──▶ FORM_OPEN_PREFILLED
                                                            └─ SRI fail ──▶ FORM_OPEN_EMPTY
FORM_OPEN_*
  └─ FORM_SUBMIT ──▶ SENDING_TOKEN ──▶ TOKEN_INPUT
                                        ├─ código mal (5 intentos) ──▶ TOKEN_LOCKED
                                        └─ código OK ──▶ PASSWORD_INPUT
                                                          └─ PASSWORD_OK ──▶ FIRMA_OPTIONAL
                                                                              ├─ subir ──▶ VALIDATING_FIRMA
                                                                              │             ├─ válida ──▶ SUCCESS
                                                                              │             └─ inválida ──▶ ERROR_FIRMA
                                                                              └─ saltar ──▶ SUCCESS
```

Toda transición se dispara con `machine.send(EVENTS.XXX, payload)`. No hay estado oculto en el DOM.

---

## Endpoints del backend Java a implementar

Todos los mocks están en `assets/api-mocks.js` y marcados con `// TODO BACKEND: replace with real endpoint`. Contratos esperados:

| Método | Ruta | Body / Params | Respuesta |
|--------|------|---------------|-----------|
| GET | `/api/clientes/existe?ruc=X` | query `ruc` | `{ "existe": bool, "url_redirect": "..." }` |
| GET | `/api/sri/consulta-ruc?ruc=X` | query `ruc` | Ver "Integración SRI" |
| POST | `/api/registro/iniciar` | `{ ruc, razonSocial, email, celular, canal, datosSRI }` | `{ registroId, tokenSentTo, expiresIn }` |
| POST | `/api/registro/verificar-token` | `{ registroId, codigo }` | `{ verificado, attemptsLeft }` |
| POST | `/api/registro/establecer-clave` | `{ registroId, clave }` | `{ ok }` |
| POST | `/api/registro/firma` (multipart) | `file`, `clave`, `registroId` | `{ valida, vigente, rucCoincide, fechaCaducidad, error? }` |
| POST | `/api/registro/finalizar` | `{ registroId }` | `{ ok, redirectUrl }` |

**Para conectar al backend real:** abre `assets/api-mocks.js`, reemplaza el cuerpo de cada función por un `fetch()` que mantenga la misma firma de retorno. **No cambies los nombres ni la forma del objeto que devuelven** — el resto del código depende de eso.

---

## Integración con el SRI

El navegador **nunca consulta al SRI directamente** (CORS lo bloquea y expondría la lógica de scraping). El flujo correcto es:

1. Frontend llama a `/api/sri/consulta-ruc?ruc=X` en nuestro propio backend.
2. Backend Java hace la consulta server-side al portal del SRI:
   - URL referencia: `https://srienlinea.sri.gob.ec/sri-en-linea/SriRucWeb/ConsultaRuc/Consultas/consultaRuc`
   - Parsear el HTML con **Jsoup** (Java).
3. Backend devuelve JSON normalizado:

```json
{
  "found": true,
  "ruc": "0992703601001",
  "razonSocial": "TRIBUTASOFT S.A.",
  "nombreComercial": "TRIBUTASOFT",
  "direccion": "...",
  "provincia": "GUAYAS",
  "ciudad": "GUAYAQUIL",
  "regimen": "RIMPE NEGOCIO POPULAR",
  "tipoContribuyente": "NO OBLIGADO",
  "estado": "ACTIVO",
  "obligadoLlevarContabilidad": false
}
```

Cuando falla: `{ "found": false, "reason": "TIMEOUT" | "NOT_FOUND" | "INVALID" }`.

**Activar modo "live":** en `assets/sri-client.js` cambia `SRI_MODE = 'mock'` a `'live'`.

**Migración a servicio premium futuro** (CipherByte, WebServices.ec, etc.): solo cambia la implementación interna del endpoint `/api/sri/consulta-ruc` en el backend. El contrato JSON con el frontend **no cambia**, así no hay acoplamiento.

---

## Cómo portar a JSF / PrimeFaces

| Elemento prototipo | Equivalente JSF/PrimeFaces |
|--------------------|----------------------------|
| `index.html` | `welcome.xhtml` (fusionado con `infoComprobantes.xhtml`) |
| `<input id="ruc">` | `<p:inputText>` con `onkeyup` para validación local |
| `<dialog>` modales | `<p:dialog>` con `modal="true"` |
| `state-machine.js` | Mantener tal cual en JS — JSF no impide JS del lado del cliente |
| `validators.js` | Mantener en JS para feedback instantáneo + replicar validaciones en el backend Java |
| `sri-client.js` | Mantener — solo cambia `SRI_MODE='live'` y apunta a tu endpoint REST |
| `api-mocks.js` | **Borrar** y reemplazar por `fetch()` reales al backend |
| `app.js` | Mantener como controlador del cliente; el backend solo expone REST |

**Recomendación de migración progresiva:** despliega este prototipo HTML en `gratis.tributasoft.ec` y apunta tus anuncios de Meta ahí mientras el equipo porta la lógica al ERP. Así rompes el 0% de conversión sin esperar al port completo.

---

## Validación de firma electrónica

La validación real (clave correcta + RUC coincide + vigencia no expirada) debe hacerla el módulo existente del ERP. El frontend solo valida:

- Extensión `.p12` o `.pfx` (no `.cer`, no tokens).
- Tamaño ≤ 5MB.

El backend recibe `multipart/form-data` con `file`, `clave`, `registroId`. Reusa el módulo de validación P12 del ERP. Devuelve:

```json
{ "valida": true, "vigente": true, "rucCoincide": true, "fechaCaducidad": "2027-12-31" }
```

O en error:

```json
{ "valida": false, "vigente": false, "rucCoincide": false, "error": "Clave incorrecta" }
```

---

## Eventos de analytics (Meta Pixel + GA4)

Cada hito dispara `window.dispatchEvent(new CustomEvent('tributasoft:event', { detail: { name, ... } }))`. Para conectar:

```html
<!-- En production, agrega esto antes del </body>: -->
<script>
  window.addEventListener('tributasoft:event', (e) => {
    const { name, ...detail } = e.detail;

    // Meta Pixel
    if (window.fbq) {
      if (name === 'registration_complete') {
        fbq('track', 'CompleteRegistration', detail);
      } else {
        fbq('trackCustom', name, detail);
      }
    }

    // GA4
    if (window.gtag) {
      gtag('event', name, detail);
    }
  });
</script>
```

**Eventos emitidos:** `landing_view`, `ruc_entered`, `ruc_valid`, `ruc_existing_redirect`, `sri_query_success`, `sri_query_failure`, `form_open`, `form_submitted`, `token_sent_email/sms/whatsapp`, `token_verified`, `token_failed`, `password_created`, `firma_uploaded_valid`, `firma_uploaded_invalid`, `firma_skipped`, **`registration_complete`** (conversión principal).

---

## Performance / objetivos

- LCP < 1.5s en 4G.
- TBT < 200ms.
- Sin frameworks. CSS crítico inline. JS modular con `defer`.
- Imágenes en WebP + `loading="lazy"` (pendientes; el equipo de diseño los suministra).

---

## Seguridad / restricciones

- **Nunca** persistas clave, token, ni firma en `localStorage` ni `sessionStorage`. Solo el draft del formulario (campos no sensibles) en `sessionStorage` para sobrevivir un refresh accidental.
- **Nunca** envíes datos sensibles en query params.
- **Nunca** loguees claves en consola en producción (los `console.info` de los mocks son solo dev).
- Backend debe replicar **todas** las validaciones de `validators.js`. JS solo es para UX; la verdad la dice el servidor.
- HTTPS obligatorio en producción.

---

## Accesibilidad

- Todos los inputs con `<label for="">` asociado.
- Errores con `aria-live="polite"` y vinculados con `aria-describedby`.
- Modales con `<dialog>` nativo (focus trap + Escape automáticos).
- Soporte para `prefers-reduced-motion` (animaciones se desactivan).
- Contraste AA verificado en colores principales.
- Texto descriptivo en todos los botones.

---

## Suposiciones que el equipo Java debe validar

1. **El endpoint de cotizador existe** en `/cotizador?ruc=X` para usuarios ya registrados. Si no, ajustar `url_redirect`.
2. **El módulo de validación de firma del ERP** se puede invocar desde un nuevo endpoint REST sin reescribirlo.
3. **El portal `app.tributasoft.ec/login`** existe y acepta el redireccionamiento post-registro.
4. **Se puede generar `registroId`** transitorio sin tocar la tabla final de clientes hasta `finalizar`.
5. **Existe proveedor SMS para Ecuador** y cuenta WhatsApp Business API (o se enviará por WhatsApp Web/Twilio). Si solo email está disponible inicialmente, deshabilitar SMS/WhatsApp en `index.html`.
6. **El plan "300 facturas gratis"** ya está modelado en el ERP y el registro lo asigna automáticamente.
7. **Las consultas al SRI desde el servidor** no están limitadas por rate-limiting agresivo del portal — si lo están, hay que poner cache server-side adicional (Redis).

---

## TODOs de integración priorizados (para el equipo Java)

### P0 — bloqueantes para lanzar a producción
1. Implementar `/api/clientes/existe` (consulta a tabla de clientes por RUC).
2. Implementar `/api/sri/consulta-ruc` con Jsoup (scraping del portal del SRI).
3. Implementar `/api/registro/iniciar` + envío de email (con plantilla del SRI).
4. Implementar `/api/registro/verificar-token` (con expiración 5min y máx 5 intentos en BD/Redis).
5. Implementar `/api/registro/finalizar` (crea el cliente real en la BD).
6. Cambiar `SRI_MODE='live'` en `sri-client.js` y borrar `api-mocks.js`.

### P1 — necesarios pero pueden venir en semana 2
7. Integrar SMS (proveedor: Twilio, Infobip, Plivo o local Ecuador).
8. Integrar WhatsApp (WhatsApp Cloud API).
9. Implementar `/api/registro/firma` (reusando módulo P12 del ERP).
10. Conectar eventos a Meta Pixel + GA4.
11. Configurar HTTPS y dominio `gratis.tributasoft.ec`.

### P2 — mejoras post-lanzamiento
12. Cache server-side de consultas SRI (Redis, TTL 24h) para reducir scraping.
13. Migrar a servicio premium del SRI cuando el volumen lo justifique.
14. A/B test del copy del hero ("2 minutos" vs "300 facturas gratis" como hook principal).
15. Honeypot anti-spam en el formulario.

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| El portal SRI cambia su HTML y el scraping se rompe | Media | Alto | Test E2E automático diario contra el portal; cache 24h para sobrevivir downtimes cortos; fallback a "formulario vacío" ya implementado en el frontend |
| El SRI bloquea nuestra IP por exceso de consultas | Baja | Alto | Cache agresivo (Redis 24h+); rotar IPs vía proxy; comprar servicio premium si supera 5k consultas/día |
| Token expira mientras el usuario tipea | Baja | Medio | Botón "Reenviar" disponible tras 30s; backend regenera y reemplaza |
| Usuario cierra el navegador antes de finalizar | Alta | Bajo | `sessionStorage` preserva el draft (sin clave/token); usuario retoma con su RUC y reabre el formulario |
| Doble submit (el usuario hace click rápido 2 veces) | Alta | Medio | Botones se deshabilitan durante la request en vuelo (ya implementado) |
| Pop-up blockers bloquean el `<dialog>` modal | Muy baja | Bajo | `<dialog>` es estándar HTML5, no pop-up; soportado en navegadores modernos. Para IE: no se soporta — bandera en el footer |
| Usuario sube `.cer` en vez de `.p12` (caso común en Ecuador) | Media | Bajo | Validación de extensión + mensaje claro: "Aceptamos solo .p12 / .pfx, no .cer" |
| Backend devuelve 500 a media sesión | Media | Alto | Banner no-bloqueante + reintento manual; estado preservado en `sessionStorage` |
| Usuario usa celular sin WhatsApp pero elige ese canal | Media | Medio | Warning visible al elegir WhatsApp; permitir reenvío cambiando a SMS/email |

---

## Variables de entorno / configuración

- **`SRI_MODE`** en `sri-client.js`: `'mock'` para dev, `'live'` para producción.
- **`NETWORK_DELAY_MS`** en `api-mocks.js`: latencia simulada en ms (default 700).
- **URLs del backend**: actualmente relativas (`/api/...`). Si frontend y backend están en dominios distintos, configura CORS en el backend y cambia a URLs absolutas.

---

## Licencia / propiedad

Código propietario de TributaSoft S.A. — uso interno.
