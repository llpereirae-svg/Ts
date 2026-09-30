# Registro vigente: cuatro pasos

Firma electrónica → Datos → Facturación → Revisión.

Correo se verifica dentro de Datos mediante `email-verification.js`. No hay una ruta/pantalla de correo independiente. Firma mantiene su composición aprobada; únicamente cambia el indicador de avance a cuatro pasos. Facturación y Revisión conservan contenido y comportamiento visual, con numeración actualizada.

## Mapeo SRI → formulario

| Respuesta normalizada | Formulario / regla |
| --- | --- |
| `ruc` desde `numeroRuc` | Campo RUC de solo lectura; la respuesta debe corresponder al RUC consultado. |
| `razonSocial` | Razón social de solo lectura; conserva el valor obtenido del SRI, sin permitir edición. |
| `nombreComercial` | Campo presente solo si la consulta proporciona un valor útil; se omiten null, vacío y no aplica. |
| `regimen` + `categoria` cuando el régimen es RIMPE | Select con GENERAL, RIMPE - EMPRENDEDOR, RIMPE - NEGOCIO POPULAR. |
| `granContribuyente`, `contribuyenteEspecial`, `agenteRetencion`, `obligadoLlevarContabilidad` | Clasificación funcional por prioridad, nunca el texto SOCIEDAD/PERSONA NATURAL. |
| `estadoContribuyenteRuc` | Solo ACTIVO permite continuar; PENDING, LOADING, error, falta de estado o estado no activo bloquean. |
| `actividadEconomicaPrincipal` | Conservada internamente; no se renderiza en Datos. |
| `representantesLegales` | El normalizador puede interpretar el contrato SRI, pero no se copian al estado del formulario ni al payload. |
| `firma.repLegal` | Solo información temporal en PASO 1 tras validar firma; no se copia a Datos, Revisión ni al payload. No es requerido. |
| `informacionFechasContribuyente` | Objeto o lista normalizados a lista; no determina la condición ACTIVO. |

Las opciones provienen de `screen-tributaria.js` y ahora se comparten desde `registration-data.js`. Se conserva la regla anterior: régimen detectado bloqueado; tipo detectado bloqueado salvo Contribuyente Especial, que permite escoger Especial o Gran Contribuyente. Si el valor no pudo mapearse, se exige elegir una opción existente.

En Datos se recupera «N.º de resolución», obligatorio exclusivamente para Agente de Retención, Contribuyente Especial y Gran Contribuyente (el formulario legado exigía los tres). Se reutiliza sin modificar `validarNoResolucion`: entre 8 y 30 alfanuméricos; permite letras ASCII, números, guion, punto, slash, guion bajo y espacios. El input conserva `maxlength=30` total, `autocomplete=off`, validación inline al escribir/salir y obligatoriedad al continuar. Los mensajes proceden del mismo validador. Ocultar elimina el campo, error y valor residual; un blur tardío no puede restaurarlo. La entrada usa opacity/translateY durante 200 ms y respeta movimiento reducido.

Prioridad del tipo: Gran (solo con bandera explícita) → Especial → Agente de Retención → Obligado → No Obligado (con bandera NO explícita). Sin evidencia de obligación, el tipo queda sin seleccionar.

## Estado y verificación

ACTIVO no renderiza mensaje positivo ni reserva espacio. No activo y servicio no disponible tienen mensajes distintos y ambos bloquean. RUC permanece como input readonly siempre visible: Contribuyente permanece abierto, Contacto es plegable en móvil.

El diálogo de correo fija el body usando los offsets previos, compensa el scrollbar y conserva los estilos originales. Bloquea gestos fuera del diálogo y rebote en sus límites; permite scroll interno y zoom. Ajusta altura al visual viewport (teclado), y al cerrar restaura scroll y foco. QA en navegador integrado: 390 px, scroll 292 → cierre 292; 430 px, scroll 242 → cierre 242, sin movimiento visual de fondo. Pruebas unitarias de touchmove, restauración y limpieza. No se dispone de una prueba en dispositivo real iOS Safari/Android Chrome; esa comprobación permanece pendiente.

La consulta continúa usando frontend → `GET /api/ruc/:ruc` → proxy propio → SRI. `SRI_RUC_URL` se configura en el entorno del proceso, nunca en el frontend. El proxy no almacena la consulta. Ante indisponibilidad no hay avance manual provisional.

Continuar valida estado ACTIVO, campos y contacto antes de abrir el diálogo. Se usa `generarYEnviarToken` / `verificarToken` sin alterar sus endpoints. El modal mantiene el foco, permite cerrar con Escape, cambiar correo, reenviar con espera y verificar. Correo destino parcialmente oculto. Cerrar no avanza. Cambiar correo invalida la confirmación previa. La verificación exitosa cierra y avanza a Facturación.

Demo se identifica expresamente: no se envió correo y se muestra un código de prueba. En localhost se usa el backend configurado; si está ausente, se muestra un error, sin éxito simulado. El backend productivo sigue siendo responsable de revalidar estado, sesión y verificación antes del alta.

## Comprobaciones

La ayuda comercial de Firma es inline: radios de 1 y 2 años con $40.25 / $51.75 IVA incluido y una sola acción «Solicitar firma por WhatsApp». Sin modal ni botón de precios. Se exige elegir vigencia antes del enlace; el mensaje menciona la vigencia y el registro en TributaSoft. No se consulta ni modifica backend ni se envía el mensaje automáticamente. La carga destaca «Subir firma electrónica», formato/límite e icono de documento firmado; al seleccionar archivo se compacta con nombre y «Cambiar archivo».

`npm test` cubre orden de cuatro pasos, flags y prioridades, valores de selects, nombre condicional, representante de firma, fechas objeto/lista, bloqueo ACTIVO, correspondencia RUC y vínculo exacto del correo, además de formato/vencimiento de OTP.

QA visual con datos sintéticos a 390 y 1366 px. QA de navegador: estado no activo bloqueado; error de servicio de correo; cambiar correo y Escape; código incorrecto; código correcto en modo demo y avance automático; edición posterior exige nueva verificación. Los arneses temporales de QA se retiran al terminar. No se guardan respuestas reales, RUC ni datos personales en fixtures, documentos o capturas.
