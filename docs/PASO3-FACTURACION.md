# PASO 3 — configuración por documento (contrato vigente)
## Decisión del owner
Reemplaza el contrato de establecimiento/punto compartidos. Factura obligatoria; opcionales: Guía de remisión, Nota de crédito, Nota de débito, Liquidación de compra y Retención. Solo un registro de códigos por documento. No multipunto dentro de un tipo.

## Contrato de envío
```json
{
  "facturacion": {
    "modo": "continuar",
    "documentos": [
      { "tipo_documento": "factura", "establecimiento": "001", "punto_emision": "001", "secuencia": "000000027" },
      { "tipo_documento": "nc", "establecimiento": "003", "punto_emision": "017", "secuencia": "000000001" }
    ]
  }
}
```
Identificadores: factura, guia, nc, nd, liquidacion, retencion. Se reutilizan las claves históricas, con liquidacion como incorporación. Todos los códigos son strings: conservar ceros. En la ruta continuar, el usuario ingresa la última secuencia usada con 1–9 dígitos; al terminar la edición se rellena a nueve dígitos por la izquierda. El frontend envía ese valor normalizado y el backend debe continuar con el número siguiente. No se envían establecimiento/punto/secuencias compartidos ni descripción en el nuevo objeto facturacion.

Para `modo: "nuevo"`, la pantalla muestra únicamente Factura, pero el payload inicializa los seis documentos con `001 / 001 / 000000001`:

```json
{
  "modo": "nuevo",
  "documentos": [
    { "tipo_documento": "factura", "establecimiento": "001", "punto_emision": "001", "secuencia": "000000001" },
    { "tipo_documento": "guia", "establecimiento": "001", "punto_emision": "001", "secuencia": "000000001" },
    { "tipo_documento": "nc", "establecimiento": "001", "punto_emision": "001", "secuencia": "000000001" },
    { "tipo_documento": "nd", "establecimiento": "001", "punto_emision": "001", "secuencia": "000000001" },
    { "tipo_documento": "liquidacion", "establecimiento": "001", "punto_emision": "001", "secuencia": "000000001" },
    { "tipo_documento": "retencion", "establecimiento": "001", "punto_emision": "001", "secuencia": "000000001" }
  ]
}
```

## Reglas y estado
- Defaults aprobados: 001 / 001 / 000000001. En ambas rutas son editables.
- Códigos: exactamente tres dígitos, distintos de 000. Secuencia: entrada de 1–9 dígitos, solo numérica; se normaliza a nueve al salir del campo y siempre antes del payload. Se conserva la aceptación histórica de 000000000.
- Factura siempre existe, incluso al aceptar una selección vacía. No aparece entre los checkboxes opcionales.
- En `continuar`, solo los seleccionados se validan/envían. En `nuevo`, los seis tipos se inicializan en el payload aunque solo Factura sea visible. Al quitar un tipo en `continuar` se elimina del estado, proyección antigua y borrador; reañadirlo usa defaults.
- Cancelar/cerrar/Escape descarta cambios del selector. Aceptar los aplica.
- Cambiar entre Nuevo y Continuar limpia todos los adicionales, sus configuraciones y cualquier copia en borrador: hay que seleccionarlos otra vez. Factura permanece obligatoria. Nuevo aplica sus defaults; Continuar recupera únicamente el borrador de Factura.
- La descripción dejó de ser un campo editable/obligatorio de PASO 3 según el nuevo listado cerrado de tres campos. El default histórico Electrónicas queda solo en memoria para compatibilidad; tampoco se enviaba en el contrato anterior.

## Consumidores del contrato anterior e impacto
1. assets/wizard.js — renderSummary (PASO 4) consume el contrato por documento. Mantiene el overview aprobado y presenta la numeración de Factura con guiones.
2. assets/services/email-service.js — plantilla interna lee codEstablecimiento, codPunto, nombrePunto y secuencias.factura. Sin cambios: misma proyección de Factura y default histórico de descripción.
3. assets/wizard.js — buildRegistrationPayload ahora delega solo facturacion a construirFacturacion. Los demás campos del registro y los renderers de pasos 1, 2 y 4 no se modifican.
4. assets/services/registration-service.js — transporta JSON sin descomponer facturacion. Localhost y Dev Tunnel usan el mock explícito del mismo origen; el endpoint productivo debe consumir el contrato autorizado. La persistencia real sigue pendiente.
5. Tests billing-data sustituidos para usar el modelo canónico documentosFacturacion. La proyección legacy es de lectura: no puede representar códigos diferentes por documento y nunca se usa para el envío nuevo.

## UX
Se reutilizan datos-section, form-grid, inputs, CTA y diálogo email-verification con bloqueo de scroll existente. Documentos adicionales plegados, título/chevron/divisor y resumen numérico. Modal desktop y bottom sheet móvil con selección múltiple. No cards nuevas, dependencias, badges ni otros colores. Animación ligera y reduced-motion existentes.

## QA
La suite vigente cubre ambos caminos, los seis tipos, normalización 1–9 a nueve dígitos, limpieza al alternar, contrato nuevo, overview con guiones y seguridad del mock de alta.
Navegador con datos ficticios: selección de NC, retorno a Nuevo, regreso a Continuar sin residuos, secuencia `27` durante escritura y `000000027` al salir, tooltip por click/tap, cierre exterior/Escape y permanencia dentro del viewport.
Capturas revisadas a 390 y 1,366 px para Nuevo, Continuar, overview y post-creación. La petición real a `/api/registro` respondió 201 por localhost y por el Dev Tunnel autorizado.
PASOS 1 y 2 no fueron modificados. Sin datos reales, persistencia, push ni deploy. Arnés QA temporal eliminado al cerrar.
