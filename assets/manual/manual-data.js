// manual-data.js — Contenido estructurado del manual de TributaSoft.
// Consumido tanto por el manual interactivo (manual.js) como por el
// generador de PDF estático.
//
// Idioma: español ecuatoriano neutro (forma "tú", sin voseo).
//
// Cada paso declara:
//   - id              identificador único dentro del proceso
//   - title           encabezado corto (≤ 40 chars)
//   - intro           1-2 frases que describen QUÉ hace este paso
//   - rules           array de strings con las reglas/validaciones que aplican
//   - errors          mapa errorCode → mensaje cuando algo falla
//   - tip             consejo / aclaración opcional
//   - animKey         clave de la animación a reproducir (ver manual.js)
//
// IMPORTANTE: los ids de los pasos del proceso 'registro' coinciden con
// los SCREENS del wizard (assets/wizard.js). Si agregas/quitas pantallas
// del wizard, hay que sincronizar esta tabla.

export const MANUAL = {
  registro: {
    label: 'Registro',
    title: 'Cómo registrarse en TributaSoft',
    description: 'Necesitas dos archivos: tu firma electrónica (.p12) y tu certificado de RUC (PDF reciente del SRI). Toma 4 minutos.',
    icon: 'register',
    steps: [
      // ────────────────────────────────────────────────────────────────
      {
        id: 'firma',
        title: 'Paso 1 · Firma y certificado',
        intro: 'Aceptas términos, subes tu firma .p12 y tu certificado de RUC en PDF.',
        rules: [
          'Marca el checkbox de términos (te abre un texto que debes bajar hasta el final).',
          'Sube tu firma electrónica .p12 y escribe su clave.',
          'Sube tu certificado de RUC en PDF (original del SRI, máximo 1 mes de antigüedad).',
        ],
        errors: {
          TERMS_NO_LEIDOS: 'El botón "Acepto" no se habilita hasta que bajes hasta el final del modal.',
          FIRMA_CLAVE: 'Es la clave del archivo .p12, no la clave de tu cuenta.',
          CERT_FECHA_VIEJA: 'Tu certificado de RUC tiene más de 1 mes — descarga uno nuevo en el portal del SRI.',
          RUC_NO_COINCIDE: 'El RUC del certificado debe ser el mismo que el de la firma.',
        },
        tip: 'Si no tienes firma, toca "No tengo firma electrónica" — te abrimos WhatsApp con el contacto del proveedor.',
        animKey: 'firma',
      },
      // ────────────────────────────────────────────────────────────────
      {
        id: 'datos',
        title: 'Paso 2 · Tus datos',
        intro: 'Llenamos casi todo. Solo escribes tu dirección, revisas correo y celular.',
        rules: [
          'Razón social, Nombre comercial, Provincia y Ciudad: bloqueados (vienen del certificado).',
          'Dirección, Correo electrónico y Celular: los puedes editar.',
        ],
        errors: {
          EMAIL_INVALIDO: 'Revisa que tenga @ y dominio.',
          CELULAR_INVALIDO: 'Para Ecuador son 10 dígitos empezando en 09.',
        },
        tip: 'Si algo bloqueado está mal, regresa al Paso 1 y sube un certificado de RUC actualizado.',
        animKey: 'datos',
      },
      // ────────────────────────────────────────────────────────────────
      {
        id: 'token',
        title: 'Paso 3 · Verifica tu identidad',
        intro: 'Primero validas el código que te llega por SMS. Después se desbloquea el campo del correo.',
        rules: [
          '1) Escribe los 4 dígitos del SMS que llegó a tu celular.',
          '2) Cuando se valide, te enviamos un código por correo y se desbloquea el campo.',
          '3) Escribe los 4 dígitos del correo. Listo, puedes continuar.',
        ],
        errors: {
          TOKEN_INCORRECTO: 'Revisa cuál es el último código enviado.',
          TOKEN_EXPIRADO: 'El código expiró. Toca "Reenviar".',
        },
        tip: 'Cada código dura 5 minutos. Si no llega, espera 30s y toca "Reenviar".',
        animKey: 'token',
      },
      // ────────────────────────────────────────────────────────────────
      {
        id: 'tributaria',
        title: 'Paso 4 · Información tributaria',
        intro: 'Detectamos tu régimen y tipo de contribuyente desde el certificado.',
        rules: [
          'Si NO eres Agente de Retención ni Contribuyente Especial: la pantalla salta sola.',
          'Si eres Agente de Retención o Contribuyente Especial: te pedimos el No. de Resolución del SRI.',
        ],
        errors: {
          RESOLUCION_FALTA: 'Ingresa el No. de Resolución del SRI que te designó.',
        },
        tip: 'Si el certificado dice Contribuyente Especial pero también eres Gran Contribuyente, puedes cambiarlo en el menú.',
        animKey: 'tributaria',
      },
      // ────────────────────────────────────────────────────────────────
      {
        id: 'facturacion',
        title: 'Paso 5 · Situación de facturación',
        intro: 'Elige si arrancas desde cero o si ya venías facturando electrónicamente.',
        rules: [
          'Empezar desde cero: se asigna Establecimiento 001 y Punto 001 automáticamente.',
          'Continuar con mi facturación: Establecimiento 001 y Punto 002 (puedes cambiarlos). Te pedimos el número de tu PRÓXIMA factura a emitir.',
        ],
        errors: {
          SEQ_FORMATO: 'La secuencia debe tener 9 dígitos. Completa con ceros a la izquierda.',
        },
        tip: 'Si tu última factura fue la 26, ingresa 000000027 (la siguiente que vas a emitir).',
        animKey: 'facturacion',
      },
      // ────────────────────────────────────────────────────────────────
      {
        id: 'clave',
        title: 'Paso 6 · Crea tu clave',
        intro: 'Esta clave es para ingresar al portal. Mínimo 4 caracteres.',
        rules: [
          'Escribe tu clave (la barra te muestra qué tan segura es).',
          'Escríbela otra vez para confirmar — deben coincidir exactamente.',
        ],
        errors: {
          CLAVE_NO_COINCIDE: 'Revisa que escribiste lo mismo en los dos campos.',
        },
        tip: 'El icono del ojo te deja ver lo que estás escribiendo.',
        animKey: 'clave',
      },
      // ────────────────────────────────────────────────────────────────
      {
        id: 'logo',
        title: 'Paso 7 · Tu logo (opcional)',
        intro: 'Sube tu logo o generamos uno con tu nombre. Puedes omitir este paso.',
        rules: [
          'Subir mi logo: PNG o JPG, máximo 4 MB. Si no encaja en 2970×300 px, lo ajustamos manteniendo tu imagen tal cual (sin agregarle texto).',
          'Generar uno: hacemos un banner solo con tu nombre comercial.',
          'Omitir: dale Continuar sin subir nada.',
        ],
        errors: {},
        tip: 'Lo puedes configurar después desde el portal de TributaSoft.',
        animKey: 'logo',
      },
      // NOTA: pantalla 8 (Resumen + Confirmar) no figura como paso del manual.
    ],
  },

  cotizacion: {
    label: 'Cotización',
    title: 'Cómo cotizar tu plan',
    description: 'Calcula en segundos cuánto cuesta tu plan anual y descarga la propuesta en PDF.',
    icon: 'quote',
    steps: [
      {
        id: 'open',
        title: 'Abre el cotizador',
        intro: 'No hace falta estar registrado. Toca "Cotizar" en la esquina superior derecha de la página.',
        rules: [
          'El botón Cotizar siempre está disponible.',
          'En celular aparece como ícono — el texto se oculta para ahorrar espacio.',
        ],
        errors: {},
        tip: 'Si ya tienes cuenta, puedes volver al cotizador para descargar PDFs de planes alternativos.',
        animKey: 'cotOpen',
      },
      {
        id: 'volumen',
        title: 'Ingresa tu volumen mensual',
        intro: 'Cantidad promedio de comprobantes que emites por mes. Si todavía no facturas, estima el primer año.',
        rules: [
          'Mínimo: 1 documento por mes.',
          'Máximo: 100,000,000 (cualquier valor mayor se considera empresa de gran volumen — contáctanos).',
          'Solo dígitos. Sin punto, coma ni espacios.',
        ],
        errors: {
          COT_VOLUMEN: 'Si ves "Ingresa un número entre 1 y 100,000,000", el valor está fuera de rango o el campo está vacío.',
        },
        tip: 'Un comprobante = factura, nota de crédito, nota de débito, comprobante de retención o guía de remisión. Cada emisión, registro o anulación cuenta como uno.',
        animKey: 'cotVol',
      },
      {
        id: 'calcular',
        title: 'Calcula tu plan',
        intro: 'Toca "Calcular" y te mostramos el resumen anual. La fórmula es transparente — puedes verificarla.',
        rules: [
          'Documentos por año = volumen mensual × 12.',
          'Subtotal = $6.00 base + (documentos por año × $0.20).',
          'IVA (15%) = subtotal × 0.15.',
          'Total = subtotal + IVA.',
          'Vigencia: 12 meses desde la contratación o hasta agotar el cupo, lo que ocurra primero.',
        ],
        errors: {},
        tip: 'Si quieres probar con otro volumen, toca "Refrescar" y empiezas de cero.',
        animKey: 'cotCalc',
      },
      {
        id: 'pdf',
        title: 'Descarga tu cotización',
        intro: 'PDF corporativo de una página, alrededor de 60 KB, con texto seleccionable y tipografía Roboto Condensed.',
        rules: [
          'El archivo se llama cotizacion-tributasoft-AAAAMMDD.pdf.',
          'Incluye tu volumen, cálculo, vigencia y firma "TributaSoft S.A. — Departamento de Facturación Electrónica Pre-Pago".',
          'Es válido como propuesta comercial.',
        ],
        errors: {
          PDF_GENERAR: 'Si ves "No pudimos generar el PDF", revisa tu conexión e intenta de nuevo.',
        },
        tip: 'El PDF se genera 100% en tu navegador. No subimos nada a ningún servidor externo.',
        animKey: 'cotPdf',
      },
    ],
  },

  contratacion: {
    // Mantenemos la clave 'contratacion' para no romper el localStorage de
    // los usuarios que ya navegaron el manual antes; pero el LABEL visible
    // pasa a ser "Pago" para que coincida con el tabbing del cliente.
    label: 'Pago',
    title: 'Cómo contratar y pagar',
    description: 'Una vez tienes tu cotización, contratas en 3 pasos y reportas el pago para activar tu cuenta.',
    icon: 'contract',
    steps: [
      {
        id: 'cotizar-primero',
        title: 'Calcula primero una cotización',
        intro: 'No se puede contratar sin cotizar antes — necesitamos saber qué plan vas a comprar.',
        rules: [
          'Sigue los pasos del proceso "Cotización" primero.',
          'Cualquier volumen entre 1 y 100,000,000 documentos por mes funciona.',
        ],
        errors: {},
        tip: 'Puedes cotizar varias veces hasta encontrar el plan que mejor se ajusta a tu negocio.',
        animKey: 'contQuote',
      },
      {
        id: 'click-contratar',
        title: 'Toca "Contratar"',
        intro: 'En el resumen de la cotización, abajo a la derecha. Te lleva al paso de validación de RUC.',
        rules: [
          'El botón Contratar aparece solo después de calcular.',
          'Puedes descargar el PDF antes y volver a contratar después.',
        ],
        errors: {},
        tip: 'Si te arrepientes en cualquier paso, puedes cerrar el modal con la flecha "atrás" (← arriba a la izquierda).',
        animKey: 'contClick',
      },
      {
        id: 'ruc-empresa',
        title: 'Confirma tu RUC',
        intro: 'Validamos que tu RUC esté en nuestra base de empresas registradas antes de cobrarte.',
        rules: [
          'El RUC debe estar previamente registrado en TributaSoft.',
          'Si nunca te registraste, no puedes contratar — primero completa el flujo de Registro.',
          'Validación en dos capas: estructura (mismo algoritmo del SRI) + presencia en la tabla "empresas".',
        ],
        errors: {
          RUC_NO_REGISTRADO: 'Si ves "No encontramos este RUC como empresa registrada", revisa que el número esté bien o completa primero el registro.',
        },
        tip: 'Para probar la versión de demostración puedes usar 0930452024001, 0992703601001, 1710034065001 o 1792060346001 — están en la tabla de prueba.',
        animKey: 'contRuc',
      },
      {
        id: 'pago',
        title: 'Reporta tu pago',
        intro: 'Banco, fecha, forma de pago (depósito o transferencia) y comprobante. Te damos toda la información bancaria de TributaSoft.',
        rules: [
          'Bancos aceptados: Procredit, Pichincha, Pacífico.',
          'Forma de pago: depósito en efectivo o transferencia (preferentemente desde el mismo banco).',
          'Comprobante: JPG, PNG o PDF. Máximo 400 KB.',
          'Toca "Información bancaria" para copiar las cuentas al portapapeles.',
        ],
        errors: {
          PAGO_BANCO: 'Si ves "Selecciona el banco", debes elegir uno antes de enviar.',
          PAGO_ARCHIVO_TIPO: 'Si ves "Solo se aceptan archivos JPG, PNG o PDF", convierte tu archivo a uno de esos formatos.',
          PAGO_ARCHIVO_PESO: 'Si ves "El archivo no puede pesar más de 400 KB", comprime la imagen o saca una foto más liviana.',
        },
        tip: 'Si tienes dudas con el comprobante, toca "Soporte" para abrir WhatsApp con un mensaje pre-rellenado.',
        animKey: 'contPago',
      },
      {
        id: 'enviar',
        title: 'Envía y espera la validación',
        intro: 'Una vez enviado, validamos tu pago en máximo 2 horas. Te avisamos por correo cuando tu cuenta queda activa.',
        rules: [
          'Aceptas los términos y condiciones (incluyen la cláusula de pago erróneo o fraudulento).',
          'Si el monto no coincide con lo cotizado, suspendemos el servicio hasta regularizar.',
          'Te llega la factura por correo en cuestión de segundos.',
        ],
        errors: {
          PAGO_TERMS: 'Si ves "Tienes que aceptar los términos", marca la casilla antes de enviar.',
        },
        tip: 'Si el pago no se efectiviza en 2 horas, escríbenos por WhatsApp al +593 96 917 3466 con tu nombre y RUC.',
        animKey: 'contEnviar',
      },
    ],
  },
};

// Mapa errorCode → ubicación en el manual.
// Lo usa la integración con setFieldError para que el popup de ayuda
// salte directo al paso correcto del manual.
export const ERROR_TO_MANUAL = {
  // Paso 1 — Firma + RUC + Certificado
  TERMS_NO_LEIDOS:       { proceso: 'registro', paso: 'firma' },
  FIRMA_FORMATO:         { proceso: 'registro', paso: 'firma' },
  FIRMA_CLAVE:           { proceso: 'registro', paso: 'firma' },
  FIRMA_CADUCADA:        { proceso: 'registro', paso: 'firma' },
  CERT_FECHA_VIEJA:      { proceso: 'registro', paso: 'firma' },
  RUC_NO_COINCIDE:       { proceso: 'registro', paso: 'firma' },

  // Paso 2 — Datos
  EMAIL_INVALIDO:        { proceso: 'registro', paso: 'datos' },
  CELULAR_INVALIDO:      { proceso: 'registro', paso: 'datos' },
  DIRECCION_FALTA:       { proceso: 'registro', paso: 'datos' },

  // Paso 3 — Token
  TOKEN_FORMATO:         { proceso: 'registro', paso: 'token' },
  TOKEN_INCORRECTO:      { proceso: 'registro', paso: 'token' },
  TOKEN_EXPIRADO:        { proceso: 'registro', paso: 'token' },

  // Paso 4 — Tributaria
  RESOLUCION_FORMATO:    { proceso: 'registro', paso: 'tributaria' },
  RESOLUCION_CORTA:      { proceso: 'registro', paso: 'tributaria' },
  RESOLUCION_FALTA:      { proceso: 'registro', paso: 'tributaria' },

  // Paso 5 — Facturación
  COD_FORMATO:           { proceso: 'registro', paso: 'facturacion' },
  COD_000:               { proceso: 'registro', paso: 'facturacion' },
  DESC_INVALIDA:         { proceso: 'registro', paso: 'facturacion' },
  SEQ_FORMATO:           { proceso: 'registro', paso: 'facturacion' },

  // Paso 6 — Clave
  CLAVE_CORTA:           { proceso: 'registro', paso: 'clave' },
  CLAVE_NO_COINCIDE:     { proceso: 'registro', paso: 'clave' },

  // Paso 7 — Logo
  LOGO_FORMATO:          { proceso: 'registro', paso: 'logo' },
  LOGO_PESO:             { proceso: 'registro', paso: 'logo' },

  // Cotizador
  COT_VOLUMEN:           { proceso: 'cotizacion', paso: 'volumen' },
  PDF_GENERAR:           { proceso: 'cotizacion', paso: 'pdf' },

  // Contratación / Pago
  RUC_NO_REGISTRADO:     { proceso: 'contratacion', paso: 'ruc-empresa' },
  PAGO_BANCO:            { proceso: 'contratacion', paso: 'pago' },
  PAGO_ARCHIVO_TIPO:     { proceso: 'contratacion', paso: 'pago' },
  PAGO_ARCHIVO_PESO:     { proceso: 'contratacion', paso: 'pago' },
  PAGO_TERMS:            { proceso: 'contratacion', paso: 'enviar' },
};

// Helper: dado un fieldId del DOM, retorna el step del manual al que apunta.
// Estos IDs son los de los campos del wizard nuevo (con prefijo f-/c-/d-/t-).
export const FIELD_TO_MANUAL = {
  // Paso 1
  'f-terminos':          { proceso: 'registro', paso: 'firma' },
  'f-firma-file':        { proceso: 'registro', paso: 'firma' },
  'f-firma-clave':       { proceso: 'registro', paso: 'firma' },
  'f-cert-file':         { proceso: 'registro', paso: 'firma' },
  // Paso 2
  'd-direccion':         { proceso: 'registro', paso: 'datos' },
  'd-email':             { proceso: 'registro', paso: 'datos' },
  'd-celular':           { proceso: 'registro', paso: 'datos' },
  // Paso 3
  't-email-inputs':      { proceso: 'registro', paso: 'token' },
  't-sms-inputs':        { proceso: 'registro', paso: 'token' },
  // Paso 4
  't-resolucion':        { proceso: 'registro', paso: 'tributaria' },
  // Paso 5
  'f-establecimiento':   { proceso: 'registro', paso: 'facturacion' },
  'f-punto':             { proceso: 'registro', paso: 'facturacion' },
  'f-descripcion':       { proceso: 'registro', paso: 'facturacion' },
  'f-seq-factura':       { proceso: 'registro', paso: 'facturacion' },
  // Paso 6
  'c-clave':             { proceso: 'registro', paso: 'clave' },
  'c-confirmar':         { proceso: 'registro', paso: 'clave' },
  // Paso 7
  'l-uploader':          { proceso: 'registro', paso: 'logo' },
  // Cotizador
  'cot-docs':            { proceso: 'cotizacion', paso: 'volumen' },
  // Contratación
  'contratar-ruc':       { proceso: 'contratacion', paso: 'ruc-empresa' },
  'pago-banco':          { proceso: 'contratacion', paso: 'pago' },
  'pago-archivo':        { proceso: 'contratacion', paso: 'pago' },
};
