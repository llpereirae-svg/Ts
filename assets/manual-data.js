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

export const MANUAL = {
  registro: {
    label: 'Registro de usuario',
    title: 'Cómo registrar tu cuenta',
    description: 'El proceso completo desde tu RUC hasta el portal de TributaSoft. Toma entre 3 y 5 minutos.',
    icon: 'register',
    steps: [
      {
        id: 'ruc',
        title: 'Ingresa tu RUC',
        intro: 'Validamos en segundos que tu RUC esté bien formado y que pertenezca a una persona natural o jurídica habilitada por el SRI.',
        rules: [
          'Debe tener exactamente 13 dígitos numéricos.',
          'Los dos primeros indican la provincia (01 a 24).',
          'Termina en 001 — identifica al contribuyente, no a un establecimiento.',
          'El último dígito es verificador y debe coincidir con el algoritmo del SRI.',
        ],
        errors: {
          RUC_FORMAT: 'Si ves "El RUC debe tener exactamente 13 dígitos", revisa que no falten ni sobren números.',
          RUC_PROVINCIA: 'Si ves "Provincia inválida (01-24)", cambia los dos primeros dígitos.',
          RUC_NO_001: 'Si ves "El RUC debe terminar en 001", recuerda: 001 identifica al contribuyente principal; los códigos del establecimiento van más adelante en el formulario.',
          RUC_DIGITO_BAD: 'Si ves "Dígito verificador no válido", muy probablemente escribiste mal un número del RUC.',
        },
        tip: 'Si el SRI ya te tiene registrado, autocompletamos razón social, dirección y régimen tributario en el siguiente paso. Solo confirmas.',
        animKey: 'ruc',
      },
      {
        id: 'datos',
        title: 'Completa tus datos',
        intro: 'Razón social, dirección, provincia / ciudad y contacto. Si el SRI tiene tu información, varios campos se autocompletan y solo confirmas.',
        rules: [
          'Razón social: tal cual aparece en tu RUC.',
          'Nombre comercial: opcional. Marca "No aplica" si no usas uno.',
          'Email: con formato válido (ej. ventas@tuempresa.com). Es donde recibes la factura.',
          'Celular: 09XXXXXXXX para Ecuador (10 dígitos). Para otros países, mismo formato local.',
          'Provincia → ciudad: las ciudades dependen de la provincia que eliges.',
        ],
        errors: {
          RAZON_SOCIAL: 'Si ves "Ingresa la razón social", el campo es obligatorio.',
          EMAIL_INVALIDO: 'Si ves "Formato de email inválido", revisa que tenga arroba (@) y dominio.',
          CELULAR_INVALIDO: 'Si ves "Para Ecuador, el número debe tener 10 dígitos empezando en 09", asegúrate del prefijo.',
          PROVINCIA_FALTA: 'Si ves "Selecciona una provincia", elige una del menú desplegable.',
          CIUDAD_FALTA: 'Si ves "Selecciona la ciudad", primero debes elegir la provincia.',
        },
        tip: 'El régimen tributario condiciona qué tipos de contribuyente aparecen como opción. Si eliges RIMPE — Negocio Popular, queda fijado en "No Obligado a Llevar Contabilidad".',
        animKey: 'datos',
      },
      {
        id: 'token',
        title: 'Verifica tu código',
        intro: 'Te enviamos un código de 6 dígitos por email o WhatsApp (tú eliges dónde). Lo escribes y lo validamos.',
        rules: [
          'El código tiene 6 dígitos y dura 5 minutos.',
          'Tienes 5 intentos antes de que se bloquee. Si te quedas sin intentos, hay que empezar de nuevo.',
          'Puedes copiar y pegar el código completo y se distribuye automáticamente en los 6 cuadros.',
          'Si no te llegó, espera 30 segundos y toca "Reenviar código".',
        ],
        errors: {
          TOKEN_FORMATO: 'Si ves "Ingresa los 6 dígitos del código", aún te falta llenar algún cuadro.',
          TOKEN_INCORRECTO: 'Si ves "Código incorrecto. Intentos restantes: X", revisa tu email / WhatsApp y usa el último código enviado.',
          TOKEN_BLOQUEADO: 'Si ves "Demasiados intentos. Por seguridad, debes empezar de nuevo", recarga la página y arranca desde el RUC.',
        },
        tip: 'En la versión de demostración el código siempre es 123456. También aparece en la consola del navegador (presiona F12 → pestaña Console).',
        animKey: 'token',
      },
      {
        id: 'clave',
        title: 'Crea tu clave',
        intro: 'Mínimo 4 caracteres — tú eliges la complejidad. La barra de seguridad usa entropía Shannon (el mismo enfoque de NIST 800-63B) para clasificar tu clave.',
        rules: [
          'Largo mínimo: 4 caracteres.',
          'Sin requisitos forzados — puedes usar solo dígitos, solo letras o lo que prefieras.',
          'La confirmación debe coincidir exactamente con la clave principal.',
          'Niveles de seguridad: Baja (< 35 bits), Media (35-59 bits), Alta (≥ 60 bits).',
        ],
        errors: {
          CLAVE_CORTA: 'Si ves "La clave debe tener al menos 4 caracteres", agrega más caracteres.',
          CLAVE_NO_COINCIDE: 'Si ves "Las claves no coinciden", revisa que escribiste lo mismo en los dos campos.',
          CLAVE_GUARDAR: 'Si ves "No pudimos guardar la clave. Intenta de nuevo", suele ser un problema temporal de conexión.',
        },
        tip: 'Patrones obvios como "1234", "qwerty" o "password" bajan la fuerza a Baja, aunque la clave cumpla la longitud mínima. Sigue siendo válida, pero no recomendada.',
        animKey: 'clave',
      },
      {
        id: 'firma',
        title: 'Sube tu firma electrónica',
        intro: 'Es opcional. Aceptamos archivos .p12 o .pfx de cualquier proveedor autorizado en Ecuador. La clave de tu firma NUNCA sale de tu navegador.',
        rules: [
          'Formato: .p12 o .pfx (no aceptamos .cer ni tokens físicos).',
          'Tamaño máximo: 5 MB.',
          'El RUC del certificado debe coincidir con el RUC de tu registro.',
          'El certificado no puede estar caducado.',
          'Si todavía no la tienes, toca "No tengo firma electrónica" y te ayudamos a tramitarla por WhatsApp.',
        ],
        errors: {
          FIRMA_FORMATO: 'Si ves "El archivo no parece ser un .p12 o .pfx válido", revisa la extensión y que el archivo no esté dañado.',
          FIRMA_CLAVE: 'Si ves "La clave de la firma es incorrecta", recuerda: es la clave del archivo .p12, no la clave de tu cuenta TributaSoft.',
          FIRMA_RUC_NO_COINCIDE: 'Si ves "El RUC del certificado no coincide con el RUC del registro", estás subiendo la firma equivocada.',
          FIRMA_CADUCADA: 'Si ves "La firma caducó", debes renovarla con tu proveedor antes de continuar.',
        },
        tip: 'Si la subes ahora, se valida en el navegador con node-forge — verás titular, RUC y caducidad. Si la dejas para después, puedes cargarla desde el portal sin perder tu cuenta.',
        animKey: 'firma',
      },
      {
        id: 'logo',
        title: 'Personaliza tu logo',
        intro: 'Tienes dos opciones: subir tu logo o generar uno con tu nombre comercial. El resultado es un banner de 2970×300 píxeles en formato PNG.',
        rules: [
          'Formato del logo: PNG o JPG, máximo 5 MB.',
          'Se ajusta automáticamente al banner (2970×300) sin deformarse.',
          'Si pides auto-generación, usamos tu nombre comercial. Si marcaste "No aplica", usamos la razón social.',
          'La capitalización se normaliza: "lEnin PerEira" se convierte en "Lenin Pereira".',
        ],
        errors: {
          LOGO_FORMATO: 'Si ves "Solo se aceptan archivos PNG o JPG", convierte tu archivo o sube otro.',
          LOGO_TAMANO: 'Si ves "El logo no puede pesar más de 5 MB", comprime la imagen o usa una más liviana.',
          LOGO_PROCESO: 'Si ves "No pudimos procesar la imagen", intenta con otro archivo.',
        },
        tip: 'El banner se guarda en tu cuenta y aparece en tus comprobantes electrónicos. Puedes cambiarlo desde el portal cuando quieras.',
        animKey: 'logo',
      },
      {
        id: 'confirm',
        title: 'Confirma y entra al portal',
        intro: 'Última pantalla antes de crear tu cuenta. Te mostramos cuál será tu usuario y te ofrecemos guardar la clave en este navegador.',
        rules: [
          'Tu usuario son los primeros 10 dígitos de tu RUC.',
          'Si marcas "Guardar mi clave", la próxima vez que entres a tbc.tributasoft.com.ec el navegador te ofrece autocompletar.',
          'Una vez confirmas, los datos quedan grabados — para cambios contacta a soporte.',
          'Te redirigimos a tbc.tributasoft.com.ec con tu usuario pre-rellenado.',
        ],
        errors: {
          FINAL_BACKEND: 'Si ves "Error finalizando el registro", suele ser un problema temporal de red. Intenta de nuevo.',
        },
        tip: 'Después de este paso ya estás dentro del portal. Cualquier cambio (firma, datos, banner) se hace desde ahí.',
        animKey: 'confirm',
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
  // RUC (paso 1 del registro)
  RUC_FORMAT_BAD:    { proceso: 'registro', paso: 'ruc' },
  RUC_INCOMPLETO:    { proceso: 'registro', paso: 'ruc' },
  RUC_NO_001:        { proceso: 'registro', paso: 'ruc' },
  RUC_DIGITO_BAD:    { proceso: 'registro', paso: 'ruc' },
  RUC_FORMAT:        { proceso: 'registro', paso: 'ruc' },
  RUC_PROVINCIA:     { proceso: 'registro', paso: 'ruc' },

  // Datos del formulario
  EMAIL_INVALIDO:    { proceso: 'registro', paso: 'datos' },
  CELULAR_INVALIDO:  { proceso: 'registro', paso: 'datos' },
  RAZON_SOCIAL:      { proceso: 'registro', paso: 'datos' },
  DIRECCION:         { proceso: 'registro', paso: 'datos' },
  PROVINCIA:         { proceso: 'registro', paso: 'datos' },
  CIUDAD:            { proceso: 'registro', paso: 'datos' },
  RESOLUCION:        { proceso: 'registro', paso: 'datos' },

  // Token (paso 3)
  TOKEN_FORMATO:     { proceso: 'registro', paso: 'token' },
  TOKEN_INCORRECTO:  { proceso: 'registro', paso: 'token' },
  TOKEN_BLOQUEADO:   { proceso: 'registro', paso: 'token' },

  // Clave (paso 4)
  CLAVE_CORTA:       { proceso: 'registro', paso: 'clave' },
  CLAVE_NO_COINCIDE: { proceso: 'registro', paso: 'clave' },
  CLAVE_GUARDAR:     { proceso: 'registro', paso: 'clave' },

  // Firma (paso 5)
  FIRMA_FORMATO:     { proceso: 'registro', paso: 'firma' },
  FIRMA_CLAVE:       { proceso: 'registro', paso: 'firma' },
  FIRMA_RUC_NO_COINCIDE: { proceso: 'registro', paso: 'firma' },
  FIRMA_CADUCADA:    { proceso: 'registro', paso: 'firma' },

  // Cotizador
  COT_VOLUMEN:       { proceso: 'cotizacion', paso: 'volumen' },

  // Contratación / Pago
  RUC_NO_REGISTRADO: { proceso: 'contratacion', paso: 'ruc-empresa' },
  PAGO_BANCO:        { proceso: 'contratacion', paso: 'pago' },
  PAGO_ARCHIVO_TIPO: { proceso: 'contratacion', paso: 'pago' },
  PAGO_ARCHIVO_PESO: { proceso: 'contratacion', paso: 'pago' },
  PAGO_TERMS:        { proceso: 'contratacion', paso: 'enviar' },
};

// Helper: dado un fieldId del DOM, retorna el step del manual al que apunta.
export const FIELD_TO_MANUAL = {
  'ruc':                 { proceso: 'registro', paso: 'ruc' },
  'razon-social':        { proceso: 'registro', paso: 'datos' },
  'nombre-comercial':    { proceso: 'registro', paso: 'datos' },
  'direccion':           { proceso: 'registro', paso: 'datos' },
  'provincia':           { proceso: 'registro', paso: 'datos' },
  'ciudad':              { proceso: 'registro', paso: 'datos' },
  'email':               { proceso: 'registro', paso: 'datos' },
  'celular':             { proceso: 'registro', paso: 'datos' },
  'no-resolucion':       { proceso: 'registro', paso: 'datos' },
  'clave':               { proceso: 'registro', paso: 'clave' },
  'confirmar-clave':     { proceso: 'registro', paso: 'clave' },
  'firma-uploader':      { proceso: 'registro', paso: 'firma' },
  'firma-clave':         { proceso: 'registro', paso: 'firma' },
  'cot-docs':            { proceso: 'cotizacion', paso: 'volumen' },
  'contratar-ruc':       { proceso: 'contratacion', paso: 'ruc-empresa' },
  'pago-banco':          { proceso: 'contratacion', paso: 'pago' },
  'pago-archivo':        { proceso: 'contratacion', paso: 'pago' },
};
