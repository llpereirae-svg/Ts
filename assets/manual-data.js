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
    label: 'Registro de usuario',
    title: 'Cómo registrar tu cuenta',
    description: 'El proceso completo en 8 pantallas: desde subir tu firma electrónica hasta llegar al portal. Toma entre 4 y 6 minutos si tienes los archivos a mano.',
    icon: 'register',
    steps: [
      // ────────────────────────────────────────────────────────────────
      {
        id: 'firma',
        title: 'Paso 1 · Términos, firma y RUC',
        intro: 'Aceptas los términos, subes tu firma electrónica (.p12) y tu Certificado de RUC en PDF. Estos dos archivos son lo único que necesitas para empezar.',
        rules: [
          'Marcamos el checkbox de términos solo después que abras el modal y bajes hasta el final del texto.',
          'La firma debe ser .p12 (no aceptamos .cer ni tokens físicos). Su clave nunca sale de tu navegador.',
          'El Certificado de RUC debe ser PDF original del SRI (no foto ni escaneo) y tener máximo 1 mes de antigüedad.',
          'El RUC del certificado y el RUC de la firma deben coincidir.',
        ],
        errors: {
          TERMS_NO_LEIDOS: 'Si el botón "Acepto" del modal está deshabilitado, te falta bajar hasta el final del texto.',
          FIRMA_FORMATO: 'Si ves "El archivo debe ser .p12 o .pfx", revisa la extensión.',
          FIRMA_CLAVE: 'Si ves "La clave de la firma es incorrecta", es la clave del archivo .p12, no la clave de tu cuenta TributaSoft.',
          CERT_FECHA_VIEJA: 'Si ves "Estimado cliente, cargue su RUC actualizado", el PDF tiene más de 1 mes de antigüedad.',
          RUC_NO_COINCIDE: 'Si ves "El RUC del certificado no coincide con el de tu firma", subiste un certificado que pertenece a otra persona o empresa.',
        },
        tip: 'Si no tienes firma, toca el botón "No tengo firma electrónica" y te enviamos por WhatsApp el contacto del proveedor más rápido.',
        animKey: 'firma',
      },
      // ────────────────────────────────────────────────────────────────
      {
        id: 'datos',
        title: 'Paso 2 · Tus datos',
        intro: 'Mostramos los datos extraídos de tu firma y de tu Certificado de RUC. Los campos con candado vienen pre-llenados y bloqueados. Email, celular y dirección los puedes editar.',
        rules: [
          'Razón social / Nombre, Nombre comercial, Provincia y Ciudad vienen del Certificado de RUC y quedan bloqueados.',
          'Si el certificado no trae Nombre Comercial, aparece "No Aplica".',
          'Email viene del certificado pero puedes corregirlo si está desactualizado.',
          'Celular para Ecuador: 10 dígitos empezando en 09. Para otros países, formato local.',
          'Dirección la ingresas manualmente (no la extraemos del certificado).',
        ],
        errors: {
          EMAIL_INVALIDO: 'Si ves "Correo inválido", revisa que tenga arroba (@) y dominio.',
          CELULAR_INVALIDO: 'Si ves "Celular inválido", revisa la longitud según tu país.',
          DIRECCION_FALTA: 'Si ves "Ingresa tu dirección", el campo es obligatorio.',
        },
        tip: 'Si algo de los datos bloqueados está mal, regresa a Paso 1 y verifica que subiste el Certificado de RUC correcto y vigente.',
        animKey: 'datos',
      },
      // ────────────────────────────────────────────────────────────────
      {
        id: 'token',
        title: 'Paso 3 · Verifica tu identidad',
        intro: 'Enviamos dos códigos de 4 dígitos: uno al correo electrónico y otro al celular. Necesitas ingresar los dos para continuar.',
        rules: [
          'Cada código es numérico de 4 dígitos y dura 5 minutos.',
          'Los dos códigos son independientes — el del email no sirve para el SMS y viceversa.',
          'Auto-tab: al escribir un dígito, salta automáticamente al siguiente cuadro.',
          'Puedes pegar el código completo (4 dígitos) y se distribuye solo.',
          'El botón "Reenviar" tiene 30 segundos de espera entre envíos para evitar abuso.',
        ],
        errors: {
          TOKEN_FORMATO: 'Si el código tiene letras o menos de 4 dígitos, no se considera válido.',
          TOKEN_INCORRECTO: 'Si ves "El código de correo no coincide" (o "de celular"), revisa cuál es el último código enviado y vuelve a intentar.',
          TOKEN_EXPIRADO: 'Si ves "El código expiró", toca "Reenviar" para recibir uno nuevo.',
        },
        tip: 'En modo demostración verás los códigos generados debajo de las cajas (caja celeste). En producción los recibes solo en tu correo y celular.',
        animKey: 'token',
      },
      // ────────────────────────────────────────────────────────────────
      {
        id: 'tributaria',
        title: 'Paso 4 · Información tributaria',
        intro: 'Pre-llenamos tu Régimen y Tipo de Contribuyente desde el certificado de RUC. Solo si tu tipo requiere un No. de Resolución del SRI te lo pedimos abajo.',
        rules: [
          'Régimen: detectamos automáticamente GENERAL / RIMPE Emprendedor / RIMPE Negocio Popular.',
          'Tipo de Contribuyente: usamos prioridad Especial > Agente de Retención > Obligado > No Obligado.',
          'Si el certificado detecta Contribuyente Especial, puedes elegir entre Contribuyente Especial o Gran Contribuyente (estos últimos no figuran como bandera en el certificado).',
          'Tipos que requieren No. de Resolución: Agente de Retención, Contribuyente Especial y Gran Contribuyente.',
          'No. Resolución: acepta letras, números, guiones (-), puntos (.), barras (/) y guion bajo (_). Mínimo 8 alfanuméricos.',
        ],
        errors: {
          RESOLUCION_FORMATO: 'Si ves "Solo letras, números y - . / _", quita el carácter no permitido.',
          RESOLUCION_CORTA: 'Si ves "Debe tener al menos 8 caracteres", agrega más caracteres (los separadores no cuentan).',
          RESOLUCION_FALTA: 'Si ves "Ingresa el No. de Resolución…", tu tipo de contribuyente requiere uno obligatoriamente.',
        },
        tip: 'Si no figuras como Agente de Retención, Contribuyente Especial ni Gran Contribuyente, este paso se ve solo con dos campos bloqueados — solo le das Continuar.',
        animKey: 'tributaria',
      },
      // ────────────────────────────────────────────────────────────────
      {
        id: 'facturacion',
        title: 'Paso 5 · Situación de facturación',
        intro: 'Dos modos: arrancas desde cero o continúas con tu facturación electrónica actual. El segundo modo te pide algunos datos extra.',
        rules: [
          'Modo "Empezar desde cero": se asigna automáticamente Establecimiento 001 y Punto de emisión 001.',
          'Modo "Continuar con mi facturación": el Establecimiento queda 001 y el Punto pasa a 002 (porque ya tienes el 001 ocupado).',
          'Si tu Establecimiento o Punto son distintos, los puedes editar manualmente.',
          'Códigos: 3 dígitos, no se permite 000.',
          'Descripción del punto: solo letras, números y espacios (máx. 50). Por defecto "Electrónicas".',
          'Próxima factura a emitir: 9 dígitos. Si tu última factura fue 26, ingresas 000000027 (la SIGUIENTE).',
        ],
        errors: {
          COD_FORMATO: 'Si ves "Debe tener 3 dígitos", asegúrate de no dejar el campo corto.',
          COD_000: 'Si ves "No puede ser 000", el SRI no acepta ese código.',
          DESC_INVALIDA: 'Si ves "Solo letras, números y espacios", quita los caracteres especiales.',
          SEQ_FORMATO: 'Si ves "Debe tener 9 dígitos" en la secuencia, completa con ceros a la izquierda.',
        },
        tip: 'Las secuencias de Notas de Crédito, Débito, Retenciones y Guías arrancan automáticamente en 000000001 — no te las pedimos para simplificar.',
        animKey: 'facturacion',
      },
      // ────────────────────────────────────────────────────────────────
      {
        id: 'clave',
        title: 'Paso 6 · Crea tu clave',
        intro: 'Esta es la clave con la que ingresarás al portal de TributaSoft. Mínimo 4 caracteres — tú eliges la complejidad.',
        rules: [
          'Largo mínimo: 4 caracteres. Sin requisitos de mayúscula/número forzados.',
          'La confirmación debe coincidir EXACTAMENTE con la clave principal.',
          'El medidor de seguridad usa entropía Shannon: Baja (< 35 bits), Media (35-59), Alta (≥ 60).',
          'Patrones obvios como "1234", "qwerty" o "password" bajan la fuerza, pero la clave sigue siendo válida.',
          'Botón "👁": muestra/oculta la clave para que verifiques lo que escribiste.',
        ],
        errors: {
          CLAVE_CORTA: 'Si ves "La clave debe tener al menos 4 caracteres", agrega más caracteres.',
          CLAVE_NO_COINCIDE: 'Si ves "Las claves no coinciden", revisa que escribiste lo mismo en los dos campos.',
        },
        tip: 'No usamos esta clave para nada más que tu cuenta — no la uses en otros sitios. Para mejor seguridad, mezcla letras, números y símbolos.',
        animKey: 'clave',
      },
      // ────────────────────────────────────────────────────────────────
      {
        id: 'logo',
        title: 'Paso 7 · Tu logo (opcional)',
        intro: 'Personaliza el banner que va en tus comprobantes. Sube tu logo o generamos uno automáticamente con tu nombre comercial.',
        rules: [
          'Si subes un logo EXACTO 2970×300 px → lo usamos tal cual.',
          'Si subes uno de otras dimensiones → lo alineamos a la izquierda y a la derecha pintamos tu Nombre Comercial (Lobster grande) + Razón Social abajo.',
          'Si tocas "Generar uno" → banner blanco con tu Nombre Comercial centrado en Lobster + Razón Social pequeña debajo.',
          'Formato: PNG o JPG. Máximo 4 MB.',
          'El texto se normaliza para presentación: "TRIBUTASOFT S.A." → "Tributasoft S.A." (siglas con punto se quedan en mayúsculas).',
        ],
        errors: {
          LOGO_FORMATO: 'Si ves un error al subir, asegúrate que sea PNG o JPG.',
          LOGO_PESO: 'Si ves "El archivo es muy grande", comprime la imagen.',
        },
        tip: 'Este paso es OPCIONAL — si no quieres logo, dale Continuar sin subir ni generar nada y pasas al resumen. Lo puedes configurar después desde el portal.',
        animKey: 'logo',
      },
      // ────────────────────────────────────────────────────────────────
      {
        id: 'resumen',
        title: 'Paso 8 · Revisa y confirma',
        intro: 'Última pantalla antes de crear tu cuenta. Verifica todos los datos en las tarjetas. Si algo está mal, toca "Editar" en la sección correspondiente y vuelves a esa pantalla.',
        rules: [
          'Cada tarjeta tiene un botón "Editar" que regresa a esa pantalla específica del wizard.',
          'En la tarjeta "Acceso al portal" verás tu Usuario (primeros 10 dígitos del RUC) y tu Clave (•••).',
          'Al confirmar, generamos tu cuenta y enviamos un email de bienvenida con un resumen y tus credenciales.',
          'El email incluye Usuario + Clave en monospace y un botón directo al portal.',
        ],
        errors: {
          CONFIRM_BACKEND: 'Si ves "Hubo un problema al finalizar tu registro", suele ser un problema temporal de red. Intenta de nuevo.',
        },
        tip: 'Después de confirmar, ya estás dentro. Cualquier cambio posterior (logo, datos, etc.) se hace desde el portal de TributaSoft.',
        animKey: 'resumen',
      },
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

  // Paso 8 — Resumen
  CONFIRM_BACKEND:       { proceso: 'registro', paso: 'resumen' },

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
