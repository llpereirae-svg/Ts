// manual-data.js — Contenido estructurado del manual de TributaSoft.
// Consumido tanto por el manual interactivo (manual.js) como por el
// generador de PDF estático.
//
// Cada paso declara:
//   - id              identificador único dentro del proceso
//   - title           encabezado corto (≤ 40 chars)
//   - intro           1-2 frases que describen QUÉ hace este paso
//   - rules           array de strings con las reglas/validaciones que aplican
//   - errors          mapa errorCode → mensaje cuando algo falla
//   - tip             consejo / aclaración opcional ("Si SRI no responde...")
//   - animKey         clave de la animación a reproducir (ver manual.js)

export const MANUAL = {
  registro: {
    label: 'Registro',
    title: 'Cómo registrar tu cuenta',
    description: 'El proceso completo desde tu RUC hasta el portal de TributaSoft. Te toma entre 3 y 5 minutos.',
    icon: 'register',
    steps: [
      {
        id: 'ruc',
        title: 'Ingresá tu RUC',
        intro: 'Validamos en segundos que tu RUC esté bien formado y que pertenezca a una persona natural o jurídica habilitada por el SRI.',
        rules: [
          'Debe tener exactamente 13 dígitos numéricos.',
          'Los dos primeros indican la provincia (01 a 24).',
          'Termina en 001 — identifica al contribuyente, no a un establecimiento.',
          'El último dígito es verificador y debe coincidir con el algoritmo del SRI.',
        ],
        errors: {
          RUC_FORMAT: '"El RUC debe tener exactamente 13 dígitos numéricos." → revisá que no falten ni sobren.',
          RUC_PROVINCIA: '"Provincia inválida (01-24)." → cambiá los dos primeros dígitos.',
          RUC_NO_001: '"El RUC debe terminar en 001." → 001 identifica al contribuyente; los códigos del establecimiento van más adelante.',
          RUC_DIGITO_BAD: '"Dígito verificador no válido." → es muy probable que tipeaste mal un número.',
        },
        tip: 'Si el SRI te ya tiene fichado, autocompletamos razón social, dirección y régimen tributario en el siguiente paso.',
        animKey: 'ruc',
      },
      {
        id: 'datos',
        title: 'Completá tus datos',
        intro: 'Razón social, dirección, provincia/ciudad y contacto. Si el SRI tiene tu información, varios campos se autocompletan; vos sólo confirmás.',
        rules: [
          'Razón social: tal cual aparece en tu RUC.',
          'Nombre comercial: opcional. Marcá "No aplica" si no usás uno.',
          'Email: formato válido (ej. ventas@tuempresa.com). Es donde recibís la factura.',
          'Celular: 09XXXXXXXX para Ecuador (10 dígitos). Para otros países, mismo formato local.',
          'Provincia → ciudad: las ciudades dependen de la provincia que elegís.',
        ],
        errors: {
          RAZON_SOCIAL: '"Ingresá la razón social." → campo obligatorio.',
          EMAIL_INVALIDO: '"Formato de email inválido." → revisá que tenga @ y dominio.',
          CELULAR_INVALIDO: '"Para Ecuador, el número debe tener 10 dígitos empezando en 09." → asegurate del prefijo.',
          PROVINCIA_FALTA: '"Selecciona una provincia." → no se puede saltar.',
          CIUDAD_FALTA: '"Selecciona la ciudad." → activá primero la provincia.',
        },
        tip: 'El régimen tributario condiciona qué tipos de contribuyente podés elegir después. Si elegís RIMPE — Negocio Popular, queda fijado en "No Obligado a Llevar Contabilidad".',
        animKey: 'datos',
      },
      {
        id: 'token',
        title: 'Verificá tu código',
        intro: 'Te mandamos un código de 6 dígitos por email o WhatsApp (vos elegís dónde). Lo escribís y validamos.',
        rules: [
          'El código tiene 6 dígitos y dura 5 minutos.',
          'Tenés 5 intentos antes de que se bloquee — si te quedás sin intentos, hay que empezar de nuevo.',
          'Podés copiar/pegar el código completo y se distribuye automático en los 6 cuadros.',
          'Si no te llegó, esperá 30 segundos y tocá "Reenviar código".',
        ],
        errors: {
          TOKEN_FORMATO: '"Ingresá los 6 dígitos del código." → no podés enviar incompleto.',
          TOKEN_INCORRECTO: '"Código incorrecto. Intentos restantes: X." → revisá tu email/WhatsApp por el último código enviado.',
          TOKEN_BLOQUEADO: '"Demasiados intentos. Por seguridad, debes empezar de nuevo." → recargá la página y arrancá desde el RUC.',
        },
        tip: 'En modo demo el código siempre es 123456 y aparece también en la consola del navegador (F12 → Console).',
        animKey: 'token',
      },
      {
        id: 'clave',
        title: 'Creá tu clave',
        intro: 'Mínimo 4 caracteres — vos elegís la complejidad. La barra te indica el nivel de seguridad usando entropía Shannon, igual que NIST 800-63B.',
        rules: [
          'Largo mínimo: 4 caracteres.',
          'Sin requisitos forzados — podés usar sólo dígitos, letras o lo que prefieras.',
          'La confirmación debe coincidir exacto con la clave principal.',
          'La barra calcula la entropía y la clasifica: Baja (<35 bits), Media (35-59), Alta (≥60).',
        ],
        errors: {
          CLAVE_CORTA: '"La clave debe tener al menos 4 caracteres." → tipeá al menos 4.',
          CLAVE_NO_COINCIDE: '"Las claves no coinciden." → confirmá que escribiste lo mismo en los dos campos.',
          CLAVE_GUARDAR: '"No pudimos guardar la clave. Intenta de nuevo." → puede ser un problema de red transitorio.',
        },
        tip: 'Patrones obvios como "1234", "qwerty" o "password" bajan la fuerza a Baja aunque cumpla la longitud — sigue siendo válida pero no recomendada.',
        animKey: 'clave',
      },
      {
        id: 'firma',
        title: 'Subí tu firma electrónica',
        intro: 'Es opcional. Aceptamos archivos .p12 o .pfx de cualquier proveedor autorizado del Ecuador. La clave de tu firma NUNCA sale de tu navegador.',
        rules: [
          'Formato: .p12 o .pfx (no .cer ni tokens físicos).',
          'Tamaño máximo: 5 MB.',
          'El RUC del certificado debe coincidir con el RUC de tu registro.',
          'El certificado no puede estar caducado.',
          'Si todavía no la tenés, tocá "No tengo firma electrónica" y te ayudamos a tramitarla por WhatsApp.',
        ],
        errors: {
          FIRMA_FORMATO: '"El archivo no parece ser un .p12 o .pfx válido." → revisá la extensión y que el archivo no esté corrupto.',
          FIRMA_CLAVE: '"La clave de la firma es incorrecta." → la clave del .p12, no la clave de tu cuenta TributaSoft.',
          FIRMA_RUC_NO_COINCIDE: '"El RUC del certificado no coincide con el RUC del registro." → estás subiendo la firma equivocada.',
          FIRMA_CADUCADA: '"La firma caducó." → tenés que renovarla con tu proveedor antes de seguir.',
        },
        tip: 'Si la subís ahora se valida en el navegador con node-forge — vemos titular, RUC y caducidad. Si la dejás para después, podés cargarla desde el portal sin perder tu cuenta.',
        animKey: 'firma',
      },
      {
        id: 'logo',
        title: 'Personalizá tu logo',
        intro: 'Tenés dos opciones: subir tu logo o generar uno con tu nombre comercial. El resultado es un banner de 2970×300 PNG.',
        rules: [
          'Formato del logo: PNG o JPG, máximo 5 MB.',
          'Se ajusta automáticamente al banner (2970×300) sin deformarse.',
          'Si pedís auto-generación, usamos tu nombre comercial. Si no marcaste uno, usamos la razón social.',
          'La capitalización se normaliza: "lEnin PerEira" → "Lenin Pereira".',
        ],
        errors: {
          LOGO_FORMATO: '"Sólo se aceptan archivos PNG o JPG." → convertí tu archivo o subí otro.',
          LOGO_TAMANO: '"El logo no puede pesar más de 5 MB." → comprimilo o subí uno más liviano.',
          LOGO_PROCESO: '"No pudimos procesar la imagen." → intentá con otro archivo.',
        },
        tip: 'El banner se guarda en tu cuenta y aparece en tus comprobantes electrónicos. Podés cambiarlo desde el portal cuando quieras.',
        animKey: 'logo',
      },
      {
        id: 'confirm',
        title: 'Confirmá y al portal',
        intro: 'Última pantalla antes de crear tu cuenta. Te mostramos tu usuario y te ofrecemos guardar la clave en este navegador.',
        rules: [
          'Tu usuario es los primeros 10 dígitos de tu RUC.',
          'Si marcás "Guardar mi clave", la próxima vez que entres a tbc.tributasoft.com.ec el navegador te ofrece autocompletar.',
          'Una vez confirmás, los datos quedan grabados — para cambios contactá a soporte.',
          'Te redirigimos a tbc.tributasoft.com.ec con tu usuario pre-rellenado.',
        ],
        errors: {
          FINAL_BACKEND: '"Error finalizando el registro." → puede ser red. Reintentá.',
        },
        tip: 'Después de este paso ya estás dentro del portal. Cualquier cambio (firma, datos, banner) se hace desde ahí.',
        animKey: 'confirm',
      },
    ],
  },

  cotizacion: {
    label: 'Cotización',
    title: 'Cómo cotizar tu plan',
    description: 'Calculá en segundos cuánto te cuesta tu plan anual y descargate la propuesta en PDF.',
    icon: 'quote',
    steps: [
      {
        id: 'open',
        title: 'Abrí el cotizador',
        intro: 'No hace falta estar registrado. Tocá "Cotizar" en la esquina superior derecha de la landing.',
        rules: [
          'El botón Cotizar siempre está disponible.',
          'En móvil aparece como ícono — el texto se oculta para ahorrar espacio.',
        ],
        errors: {},
        tip: 'Si ya tenés cuenta, podés volver al cotizador para descargar PDFs de planes alternativos.',
        animKey: 'cotOpen',
      },
      {
        id: 'volumen',
        title: 'Ingresá tu volumen mensual',
        intro: 'Cantidad promedio de comprobantes que emitís por mes. Si todavía no facturás, estimá el primer año.',
        rules: [
          'Mínimo: 1 documento por mes.',
          'Máximo: 100,000,000 (cualquier valor mayor se considera empresa de gran volumen — contactanos).',
          'Sólo dígitos — sin punto, coma ni espacios.',
        ],
        errors: {
          COT_VOLUMEN: '"Ingresá un número entre 1 y 100,000,000." → fuera de rango o vacío.',
        },
        tip: 'Un comprobante = factura, nota de crédito, nota de débito, retención o guía de remisión. Cada emisión, registro o anulación cuenta como uno.',
        animKey: 'cotVol',
      },
      {
        id: 'calcular',
        title: 'Calculá tu plan',
        intro: 'Tocá "Calcular" y te mostramos el resumen anual. Fórmula transparente — podés validarla.',
        rules: [
          'Documentos por año = volumen mensual × 12.',
          'Subtotal = $6.00 base + (documentos por año × $0.20).',
          'IVA (15%) = subtotal × 0.15.',
          'Total = subtotal + IVA.',
          'Vigencia: 12 meses desde la contratación o hasta agotar el cupo, lo que ocurra primero.',
        ],
        errors: {},
        tip: 'Si querés probar con otro volumen, tocá "Refrescar" y empezás de cero.',
        animKey: 'cotCalc',
      },
      {
        id: 'pdf',
        title: 'Descargá tu cotización',
        intro: 'PDF corporativo de una página, ~60 KB, con texto seleccionable y tipografía Roboto Condensed.',
        rules: [
          'El archivo se llama cotizacion-tributasoft-YYYYMMDD.pdf.',
          'Incluye tu volumen, cálculo, vigencia y firma "TributaSoft S.A. — Departamento de Facturación Electrónica Pre-Pago".',
          'Es válido como propuesta comercial.',
        ],
        errors: {
          PDF_GENERAR: '"No pudimos generar el PDF." → revisá tu conexión, intentá de nuevo.',
        },
        tip: 'El PDF se genera 100% en tu navegador. No subimos nada a ningún servidor.',
        animKey: 'cotPdf',
      },
    ],
  },

  contratacion: {
    label: 'Contratación',
    title: 'Cómo contratar y pagar',
    description: 'Una vez tenés tu cotización, contratás en 3 pasos y reportás el pago para activar tu cuenta.',
    icon: 'contract',
    steps: [
      {
        id: 'cotizar-primero',
        title: 'Calculá una cotización',
        intro: 'No se puede contratar sin cotizar antes — necesitamos saber qué plan vas a comprar.',
        rules: [
          'Seguí los pasos del manual de cotización primero.',
          'Cualquier volumen entre 1 y 100,000,000 docs/mes funciona.',
        ],
        errors: {},
        tip: 'Podés cotizar varias veces hasta encontrar el plan que mejor se ajusta a tu negocio.',
        animKey: 'contQuote',
      },
      {
        id: 'click-contratar',
        title: 'Tocá "Contratar"',
        intro: 'En el resumen de la cotización, abajo a la derecha. Te lleva al paso de validación de RUC.',
        rules: [
          'El botón Contratar aparece sólo después de calcular.',
          'Podés descargar el PDF antes y volver a contratar después.',
        ],
        errors: {},
        tip: 'Si te arrepentís en cualquier paso, podés cerrar el modal con la flecha atrás (← arriba a la izquierda).',
        animKey: 'contClick',
      },
      {
        id: 'ruc-empresa',
        title: 'Confirmá tu RUC',
        intro: 'Validamos que tu RUC esté en nuestra base de empresas registradas antes de cobrarte.',
        rules: [
          'El RUC debe estar previamente registrado en TributaSoft.',
          'Si nunca te registraste, no podés contratar — primero seguí el flujo de Registro.',
          'Validación en dos capas: estructura (mismo algoritmo SRI) + presencia en tabla "empresas".',
        ],
        errors: {
          RUC_NO_REGISTRADO: '"No encontramos este RUC como empresa registrada." → o el RUC está mal o todavía no completaste el registro.',
        },
        tip: 'Para probar la demo podés usar 0930452024001, 0992703601001, 1710034065001 o 1792060346001 — están en la tabla mock.',
        animKey: 'contRuc',
      },
      {
        id: 'pago',
        title: 'Reportá tu pago',
        intro: 'Banco, fecha, forma de pago (depósito o transferencia) y comprobante. Te damos toda la info bancaria de TributaSoft.',
        rules: [
          'Bancos aceptados: Procredit, Pichincha, Pacífico.',
          'Forma de pago: depósito en efectivo o transferencia (preferentemente del mismo banco).',
          'Comprobante: JPG, PNG o PDF, máximo 400 KB.',
          'Tocá "Información bancaria" para copiar las cuentas al portapapeles.',
        ],
        errors: {
          PAGO_BANCO: '"Selecciona el banco." → no podés enviar sin esto.',
          PAGO_ARCHIVO_TIPO: '"Sólo se aceptan archivos JPG, PNG o PDF." → convertí tu archivo.',
          PAGO_ARCHIVO_PESO: '"El archivo no puede pesar más de 400 KB." → comprimí o sacá una foto más liviana.',
        },
        tip: 'Si tenés dudas con el comprobante, tocá "Soporte" para abrir WhatsApp con un mensaje pre-llenado.',
        animKey: 'contPago',
      },
      {
        id: 'enviar',
        title: 'Enviar y esperar validación',
        intro: 'Una vez enviado, validamos tu pago en máximo 2 horas. Te avisamos por correo cuando tu cuenta queda activa.',
        rules: [
          'Aceptás los términos y condiciones (incluyen la cláusula de pago erróneo o fraudulento).',
          'Si el monto no coincide con lo cotizado, suspendemos el servicio hasta regularizar.',
          'Te llega la factura por correo en cuestión de segundos.',
        ],
        errors: {
          PAGO_TERMS: '"Tenés que aceptar los términos." → marcá la casilla.',
        },
        tip: 'Si no te efectivizan el pago en 2 horas, contactanos por WhatsApp al +593 96 917 3466 con tu nombre y RUC.',
        animKey: 'contEnviar',
      },
    ],
  },
};

// Mapa de errorCode → ubicación en el manual.
// Lo usa la integración con setFieldError para que el popup de ayuda
// salte directo al paso correcto del manual.
export const ERROR_TO_MANUAL = {
  // RUC (paso 1 del registro)
  RUC_FORMAT_BAD:    { proceso: 'registro', paso: 'ruc' },
  RUC_INCOMPLETO:    { proceso: 'registro', paso: 'ruc' },
  RUC_NO_001:        { proceso: 'registro', paso: 'ruc' },
  RUC_DIGITO_BAD:    { proceso: 'registro', paso: 'ruc' },

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

  // Contratación
  RUC_NO_REGISTRADO: { proceso: 'contratacion', paso: 'ruc-empresa' },
  PAGO_BANCO:        { proceso: 'contratacion', paso: 'pago' },
  PAGO_ARCHIVO_TIPO: { proceso: 'contratacion', paso: 'pago' },
  PAGO_ARCHIVO_PESO: { proceso: 'contratacion', paso: 'pago' },
  PAGO_TERMS:        { proceso: 'contratacion', paso: 'enviar' },
};

// Helper: dado un fieldId del DOM, retorna el step del manual al que apunta.
// Permite enganchar el popup de ayuda contextual directamente sobre los inputs.
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
