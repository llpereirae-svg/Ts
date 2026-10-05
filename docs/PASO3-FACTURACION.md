# PASO 3 — configuración inicial de Factura

## Decisión vigente

El onboarding muestra y permite editar únicamente Factura. No pregunta si el contribuyente ya facturó ni muestra controles para otros tipos. Para conservar el contrato acordado con el backend, el JSON inicializa también Guía de remisión, Nota de crédito, Nota de débito, Liquidación de compra y Retención con valores predeterminados.

## Contrato de envío

```json
{
  "modo": "nuevo",
  "documentos": [
    { "tipo_documento": "factura", "establecimiento": "001", "punto_emision": "002", "secuencia": "000000001" },
    { "tipo_documento": "guia", "establecimiento": "001", "punto_emision": "001", "secuencia": "000000001" },
    { "tipo_documento": "nc", "establecimiento": "001", "punto_emision": "001", "secuencia": "000000001" },
    { "tipo_documento": "nd", "establecimiento": "001", "punto_emision": "001", "secuencia": "000000001" },
    { "tipo_documento": "liquidacion", "establecimiento": "001", "punto_emision": "001", "secuencia": "000000001" },
    { "tipo_documento": "retencion", "establecimiento": "001", "punto_emision": "001", "secuencia": "000000001" }
  ]
}
```

Factura usa los valores de pantalla —sugeridos inicialmente como `001 / 002 / 000000001`— y el usuario puede editarlos. Los otros cinco documentos no se muestran durante el onboarding y se envían con `001 / 001 / 000000001`. Los identificadores contractuales son `factura`, `guia`, `nc`, `nd`, `liquidacion` y `retencion`; deben conservarse como strings para no perder ceros.

## Validaciones

- Establecimiento: exactamente 3 dígitos y distinto de `000`.
- Punto de emisión: exactamente 3 dígitos y distinto de `000`.
- Secuencia: de 1 a 9 dígitos; payload normalizado a 9 dígitos.
- El payload contiene exactamente los seis documentos en el orden contractual anterior.

## Compatibilidad

La proyección interna `codEstablecimiento`, `codPunto` y `secuencias.factura` se mantiene para consumidores heredados. La interfaz sigue siendo simple, pero el backend recibe e inicializa los seis tipos. Cambiar este arreglo requiere coordinar una nueva versión del contrato con el backend; no debe inferirse desde los controles visibles.
