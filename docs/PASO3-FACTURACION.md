# PASO 3 — configuración inicial de Factura

## Decisión vigente

El onboarding configura únicamente Factura. No pregunta si el contribuyente ya facturó y no permite agregar otros tipos de documentos. La administración de otros documentos, establecimientos, puntos de emisión y secuencias se realiza posteriormente desde el perfil.

## Contrato de envío

```json
{
  "modo": "nuevo",
  "documentos": [
    {
      "tipo_documento": "factura",
      "establecimiento": "001",
      "punto_emision": "002",
      "secuencia": "000000001"
    }
  ]
}
```

Los valores sugeridos en pantalla son `001 / 002 / 000000001` y el usuario puede editarlos según su negocio. La secuencia acepta de 1 a 9 dígitos y se conserva normalizada a nueve dígitos desde su primera presentación en pantalla.

## Validaciones

- Establecimiento: exactamente 3 dígitos y distinto de `000`.
- Punto de emisión: exactamente 3 dígitos y distinto de `000`.
- Secuencia: de 1 a 9 dígitos; payload normalizado a 9 dígitos.
- El payload contiene exactamente un documento: `factura`.

## Compatibilidad

La proyección interna `codEstablecimiento`, `codPunto` y `secuencias.factura` se mantiene para consumidores heredados. El mock contractual acepta el mismo objeto `billing`; el backend productivo debe persistir Factura y dejar el alta de configuraciones adicionales al módulo de perfil.
