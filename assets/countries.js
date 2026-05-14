// countries.js — Códigos de país, banderas y formato de celular.
//
// Cada país tiene:
//   code:       ISO 3166-1 alpha-2 (mayúsculas) — sirve para calcular la bandera emoji.
//   name:       Nombre del país en español.
//   dial:       Código telefónico internacional (sin "+").
//   minLen:     Mínimo de dígitos del número nacional (sin dial code).
//   maxLen:     Máximo de dígitos del número nacional.
//   placeholder: Plantilla local de ejemplo para mostrar al usuario.
//   leadingDigit: Si el celular de ese país siempre empieza con un dígito específico
//                 (ej. en EC siempre empieza con 9 al hablar de móviles), lo declaramos.
//                 Si no hay regla fija, omitir.
//
// La bandera se calcula a partir de `code` con regionalIndicator(code).

export function regionalIndicator(code) {
  // Convierte 'EC' → 🇪🇨
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map((c) => 0x1F1A5 + c.charCodeAt(0))
  );
}

export const COUNTRIES = [
  { code: 'EC', name: 'Ecuador', dial: '593', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX', leadingDigit: '9' },
  { code: 'AR', name: 'Argentina', dial: '54', minLen: 10, maxLen: 11, placeholder: '11XXXXXXXX' },
  { code: 'BO', name: 'Bolivia', dial: '591', minLen: 8, maxLen: 8, placeholder: '7XXXXXXX' },
  { code: 'BR', name: 'Brasil', dial: '55', minLen: 10, maxLen: 11, placeholder: '11XXXXXXXXX' },
  { code: 'CA', name: 'Canadá', dial: '1', minLen: 10, maxLen: 10, placeholder: 'XXXXXXXXXX' },
  { code: 'CL', name: 'Chile', dial: '56', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'CO', name: 'Colombia', dial: '57', minLen: 10, maxLen: 10, placeholder: '3XXXXXXXXX' },
  { code: 'CR', name: 'Costa Rica', dial: '506', minLen: 8, maxLen: 8, placeholder: 'XXXXXXXX' },
  { code: 'CU', name: 'Cuba', dial: '53', minLen: 8, maxLen: 8, placeholder: '5XXXXXXX' },
  { code: 'DO', name: 'República Dominicana', dial: '1', minLen: 10, maxLen: 10, placeholder: '809XXXXXXX' },
  { code: 'SV', name: 'El Salvador', dial: '503', minLen: 8, maxLen: 8, placeholder: '7XXXXXXX' },
  { code: 'ES', name: 'España', dial: '34', minLen: 9, maxLen: 9, placeholder: '6XXXXXXXX' },
  { code: 'US', name: 'Estados Unidos', dial: '1', minLen: 10, maxLen: 10, placeholder: 'XXXXXXXXXX' },
  { code: 'GT', name: 'Guatemala', dial: '502', minLen: 8, maxLen: 8, placeholder: 'XXXXXXXX' },
  { code: 'HN', name: 'Honduras', dial: '504', minLen: 8, maxLen: 8, placeholder: '9XXXXXXX' },
  { code: 'MX', name: 'México', dial: '52', minLen: 10, maxLen: 10, placeholder: 'XXXXXXXXXX' },
  { code: 'NI', name: 'Nicaragua', dial: '505', minLen: 8, maxLen: 8, placeholder: '8XXXXXXX' },
  { code: 'PA', name: 'Panamá', dial: '507', minLen: 8, maxLen: 8, placeholder: '6XXXXXXX' },
  { code: 'PY', name: 'Paraguay', dial: '595', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'PE', name: 'Perú', dial: '51', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX', leadingDigit: '9' },
  { code: 'PR', name: 'Puerto Rico', dial: '1', minLen: 10, maxLen: 10, placeholder: '787XXXXXXX' },
  { code: 'UY', name: 'Uruguay', dial: '598', minLen: 8, maxLen: 9, placeholder: '9XXXXXXX' },
  { code: 'VE', name: 'Venezuela', dial: '58', minLen: 10, maxLen: 10, placeholder: '4XXXXXXXXX' },
  // Europa
  { code: 'DE', name: 'Alemania', dial: '49', minLen: 10, maxLen: 11, placeholder: '1XXXXXXXXX' },
  { code: 'AT', name: 'Austria', dial: '43', minLen: 10, maxLen: 11, placeholder: '6XXXXXXXXX' },
  { code: 'BE', name: 'Bélgica', dial: '32', minLen: 9, maxLen: 9, placeholder: '4XXXXXXXX' },
  { code: 'DK', name: 'Dinamarca', dial: '45', minLen: 8, maxLen: 8, placeholder: 'XXXXXXXX' },
  { code: 'FI', name: 'Finlandia', dial: '358', minLen: 9, maxLen: 10, placeholder: '4XXXXXXXX' },
  { code: 'FR', name: 'Francia', dial: '33', minLen: 9, maxLen: 9, placeholder: '6XXXXXXXX' },
  { code: 'GR', name: 'Grecia', dial: '30', minLen: 10, maxLen: 10, placeholder: '69XXXXXXXX' },
  { code: 'HU', name: 'Hungría', dial: '36', minLen: 9, maxLen: 9, placeholder: '20XXXXXXX' },
  { code: 'IE', name: 'Irlanda', dial: '353', minLen: 9, maxLen: 9, placeholder: '8XXXXXXXX' },
  { code: 'IT', name: 'Italia', dial: '39', minLen: 9, maxLen: 11, placeholder: '3XXXXXXXXX' },
  { code: 'NO', name: 'Noruega', dial: '47', minLen: 8, maxLen: 8, placeholder: '4XXXXXXX' },
  { code: 'NL', name: 'Países Bajos', dial: '31', minLen: 9, maxLen: 9, placeholder: '6XXXXXXXX' },
  { code: 'PL', name: 'Polonia', dial: '48', minLen: 9, maxLen: 9, placeholder: '5XXXXXXXX' },
  { code: 'PT', name: 'Portugal', dial: '351', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'GB', name: 'Reino Unido', dial: '44', minLen: 10, maxLen: 10, placeholder: '7XXXXXXXXX' },
  { code: 'CZ', name: 'República Checa', dial: '420', minLen: 9, maxLen: 9, placeholder: '6XXXXXXXX' },
  { code: 'RO', name: 'Rumanía', dial: '40', minLen: 9, maxLen: 9, placeholder: '7XXXXXXXX' },
  { code: 'RU', name: 'Rusia', dial: '7', minLen: 10, maxLen: 10, placeholder: '9XXXXXXXXX' },
  { code: 'SE', name: 'Suecia', dial: '46', minLen: 9, maxLen: 9, placeholder: '7XXXXXXXX' },
  { code: 'CH', name: 'Suiza', dial: '41', minLen: 9, maxLen: 9, placeholder: '7XXXXXXXX' },
  { code: 'TR', name: 'Turquía', dial: '90', minLen: 10, maxLen: 10, placeholder: '5XXXXXXXXX' },
  { code: 'UA', name: 'Ucrania', dial: '380', minLen: 9, maxLen: 9, placeholder: '6XXXXXXXX' },
  // Asia / Pacífico
  { code: 'AU', name: 'Australia', dial: '61', minLen: 9, maxLen: 9, placeholder: '4XXXXXXXX' },
  { code: 'CN', name: 'China', dial: '86', minLen: 11, maxLen: 11, placeholder: '1XXXXXXXXXX' },
  { code: 'KR', name: 'Corea del Sur', dial: '82', minLen: 9, maxLen: 10, placeholder: '10XXXXXXXX' },
  { code: 'AE', name: 'Emiratos Árabes Unidos', dial: '971', minLen: 9, maxLen: 9, placeholder: '5XXXXXXXX' },
  { code: 'PH', name: 'Filipinas', dial: '63', minLen: 10, maxLen: 10, placeholder: '9XXXXXXXXX' },
  { code: 'HK', name: 'Hong Kong', dial: '852', minLen: 8, maxLen: 8, placeholder: 'XXXXXXXX' },
  { code: 'IN', name: 'India', dial: '91', minLen: 10, maxLen: 10, placeholder: '9XXXXXXXXX' },
  { code: 'ID', name: 'Indonesia', dial: '62', minLen: 9, maxLen: 12, placeholder: '8XXXXXXXXX' },
  { code: 'IL', name: 'Israel', dial: '972', minLen: 9, maxLen: 9, placeholder: '5XXXXXXXX' },
  { code: 'JP', name: 'Japón', dial: '81', minLen: 10, maxLen: 10, placeholder: '9XXXXXXXXX' },
  { code: 'MY', name: 'Malasia', dial: '60', minLen: 9, maxLen: 10, placeholder: '1XXXXXXXX' },
  { code: 'NZ', name: 'Nueva Zelanda', dial: '64', minLen: 9, maxLen: 10, placeholder: '2XXXXXXXX' },
  { code: 'PK', name: 'Pakistán', dial: '92', minLen: 10, maxLen: 10, placeholder: '3XXXXXXXXX' },
  { code: 'SG', name: 'Singapur', dial: '65', minLen: 8, maxLen: 8, placeholder: '8XXXXXXX' },
  { code: 'TW', name: 'Taiwán', dial: '886', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'TH', name: 'Tailandia', dial: '66', minLen: 9, maxLen: 9, placeholder: '8XXXXXXXX' },
  { code: 'VN', name: 'Vietnam', dial: '84', minLen: 9, maxLen: 10, placeholder: '9XXXXXXXX' },
  // África / Medio Oriente
  { code: 'ZA', name: 'Sudáfrica', dial: '27', minLen: 9, maxLen: 9, placeholder: '7XXXXXXXX' },
  { code: 'EG', name: 'Egipto', dial: '20', minLen: 10, maxLen: 10, placeholder: '1XXXXXXXXX' },
  { code: 'MA', name: 'Marruecos', dial: '212', minLen: 9, maxLen: 9, placeholder: '6XXXXXXXX' },
  { code: 'NG', name: 'Nigeria', dial: '234', minLen: 10, maxLen: 10, placeholder: '8XXXXXXXXX' },
  { code: 'KE', name: 'Kenia', dial: '254', minLen: 9, maxLen: 9, placeholder: '7XXXXXXXX' },
  { code: 'SA', name: 'Arabia Saudita', dial: '966', minLen: 9, maxLen: 9, placeholder: '5XXXXXXXX' },
  { code: 'QA', name: 'Catar', dial: '974', minLen: 8, maxLen: 8, placeholder: '3XXXXXXX' },
  // Caribe y otros
  { code: 'BS', name: 'Bahamas', dial: '1', minLen: 10, maxLen: 10, placeholder: '242XXXXXXX' },
  { code: 'JM', name: 'Jamaica', dial: '1', minLen: 10, maxLen: 10, placeholder: '876XXXXXXX' },
  { code: 'TT', name: 'Trinidad y Tobago', dial: '1', minLen: 10, maxLen: 10, placeholder: '868XXXXXXX' },
  { code: 'BB', name: 'Barbados', dial: '1', minLen: 10, maxLen: 10, placeholder: '246XXXXXXX' },
  // Resto (orden alfabético)
  { code: 'AF', name: 'Afganistán', dial: '93', minLen: 9, maxLen: 9, placeholder: '7XXXXXXXX' },
  { code: 'AL', name: 'Albania', dial: '355', minLen: 9, maxLen: 9, placeholder: '6XXXXXXXX' },
  { code: 'DZ', name: 'Argelia', dial: '213', minLen: 9, maxLen: 9, placeholder: '5XXXXXXXX' },
  { code: 'AM', name: 'Armenia', dial: '374', minLen: 8, maxLen: 8, placeholder: '7XXXXXXX' },
  { code: 'AZ', name: 'Azerbaiyán', dial: '994', minLen: 9, maxLen: 9, placeholder: '4XXXXXXXX' },
  { code: 'BD', name: 'Bangladés', dial: '880', minLen: 10, maxLen: 10, placeholder: '1XXXXXXXXX' },
  { code: 'BY', name: 'Bielorrusia', dial: '375', minLen: 9, maxLen: 9, placeholder: '2XXXXXXXX' },
  { code: 'BG', name: 'Bulgaria', dial: '359', minLen: 9, maxLen: 9, placeholder: '8XXXXXXXX' },
  { code: 'KH', name: 'Camboya', dial: '855', minLen: 8, maxLen: 9, placeholder: '9XXXXXXX' },
  { code: 'CM', name: 'Camerún', dial: '237', minLen: 9, maxLen: 9, placeholder: '6XXXXXXXX' },
  { code: 'CY', name: 'Chipre', dial: '357', minLen: 8, maxLen: 8, placeholder: '9XXXXXXX' },
  { code: 'HR', name: 'Croacia', dial: '385', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'SK', name: 'Eslovaquia', dial: '421', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'SI', name: 'Eslovenia', dial: '386', minLen: 8, maxLen: 8, placeholder: '4XXXXXXX' },
  { code: 'EE', name: 'Estonia', dial: '372', minLen: 7, maxLen: 8, placeholder: '5XXXXXXX' },
  { code: 'ET', name: 'Etiopía', dial: '251', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'GE', name: 'Georgia', dial: '995', minLen: 9, maxLen: 9, placeholder: '5XXXXXXXX' },
  { code: 'GH', name: 'Ghana', dial: '233', minLen: 9, maxLen: 9, placeholder: '2XXXXXXXX' },
  { code: 'GI', name: 'Gibraltar', dial: '350', minLen: 8, maxLen: 8, placeholder: '5XXXXXXX' },
  { code: 'IS', name: 'Islandia', dial: '354', minLen: 7, maxLen: 7, placeholder: '6XXXXXX' },
  { code: 'IR', name: 'Irán', dial: '98', minLen: 10, maxLen: 10, placeholder: '9XXXXXXXXX' },
  { code: 'IQ', name: 'Irak', dial: '964', minLen: 10, maxLen: 10, placeholder: '7XXXXXXXXX' },
  { code: 'JO', name: 'Jordania', dial: '962', minLen: 9, maxLen: 9, placeholder: '7XXXXXXXX' },
  { code: 'KZ', name: 'Kazajistán', dial: '7', minLen: 10, maxLen: 10, placeholder: '7XXXXXXXXX' },
  { code: 'KW', name: 'Kuwait', dial: '965', minLen: 8, maxLen: 8, placeholder: '5XXXXXXX' },
  { code: 'LV', name: 'Letonia', dial: '371', minLen: 8, maxLen: 8, placeholder: '2XXXXXXX' },
  { code: 'LB', name: 'Líbano', dial: '961', minLen: 7, maxLen: 8, placeholder: '3XXXXXX' },
  { code: 'LY', name: 'Libia', dial: '218', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'LT', name: 'Lituania', dial: '370', minLen: 8, maxLen: 8, placeholder: '6XXXXXXX' },
  { code: 'LU', name: 'Luxemburgo', dial: '352', minLen: 9, maxLen: 9, placeholder: '6XXXXXXXX' },
  { code: 'MK', name: 'Macedonia del Norte', dial: '389', minLen: 8, maxLen: 8, placeholder: '7XXXXXXX' },
  { code: 'MT', name: 'Malta', dial: '356', minLen: 8, maxLen: 8, placeholder: '7XXXXXXX' },
  { code: 'MD', name: 'Moldavia', dial: '373', minLen: 8, maxLen: 8, placeholder: '6XXXXXXX' },
  { code: 'MN', name: 'Mongolia', dial: '976', minLen: 8, maxLen: 8, placeholder: '8XXXXXXX' },
  { code: 'ME', name: 'Montenegro', dial: '382', minLen: 8, maxLen: 9, placeholder: '6XXXXXXX' },
  { code: 'MM', name: 'Birmania (Myanmar)', dial: '95', minLen: 8, maxLen: 10, placeholder: '9XXXXXXXX' },
  { code: 'OM', name: 'Omán', dial: '968', minLen: 8, maxLen: 8, placeholder: '9XXXXXXX' },
  { code: 'PS', name: 'Palestina', dial: '970', minLen: 9, maxLen: 9, placeholder: '5XXXXXXXX' },
  { code: 'RS', name: 'Serbia', dial: '381', minLen: 8, maxLen: 9, placeholder: '6XXXXXXX' },
  { code: 'LK', name: 'Sri Lanka', dial: '94', minLen: 9, maxLen: 9, placeholder: '7XXXXXXXX' },
  { code: 'SY', name: 'Siria', dial: '963', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'TJ', name: 'Tayikistán', dial: '992', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'TN', name: 'Túnez', dial: '216', minLen: 8, maxLen: 8, placeholder: '2XXXXXXX' },
  { code: 'TM', name: 'Turkmenistán', dial: '993', minLen: 8, maxLen: 8, placeholder: '6XXXXXXX' },
  { code: 'UZ', name: 'Uzbekistán', dial: '998', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'YE', name: 'Yemen', dial: '967', minLen: 9, maxLen: 9, placeholder: '7XXXXXXXX' },
  // África ampliada
  { code: 'AO', name: 'Angola', dial: '244', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'BJ', name: 'Benín', dial: '229', minLen: 8, maxLen: 8, placeholder: '9XXXXXXX' },
  { code: 'BW', name: 'Botsuana', dial: '267', minLen: 8, maxLen: 8, placeholder: '7XXXXXXX' },
  { code: 'BF', name: 'Burkina Faso', dial: '226', minLen: 8, maxLen: 8, placeholder: '7XXXXXXX' },
  { code: 'CI', name: 'Costa de Marfil', dial: '225', minLen: 10, maxLen: 10, placeholder: '0XXXXXXXXX' },
  { code: 'CG', name: 'Congo', dial: '242', minLen: 9, maxLen: 9, placeholder: '0XXXXXXXX' },
  { code: 'CD', name: 'RD del Congo', dial: '243', minLen: 9, maxLen: 9, placeholder: '8XXXXXXXX' },
  { code: 'GA', name: 'Gabón', dial: '241', minLen: 7, maxLen: 7, placeholder: '6XXXXXX' },
  { code: 'GM', name: 'Gambia', dial: '220', minLen: 7, maxLen: 7, placeholder: '3XXXXXX' },
  { code: 'GN', name: 'Guinea', dial: '224', minLen: 9, maxLen: 9, placeholder: '6XXXXXXXX' },
  { code: 'MG', name: 'Madagascar', dial: '261', minLen: 9, maxLen: 9, placeholder: '3XXXXXXXX' },
  { code: 'MW', name: 'Malaui', dial: '265', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'ML', name: 'Malí', dial: '223', minLen: 8, maxLen: 8, placeholder: '6XXXXXXX' },
  { code: 'MZ', name: 'Mozambique', dial: '258', minLen: 9, maxLen: 9, placeholder: '8XXXXXXXX' },
  { code: 'NA', name: 'Namibia', dial: '264', minLen: 9, maxLen: 9, placeholder: '8XXXXXXXX' },
  { code: 'NE', name: 'Níger', dial: '227', minLen: 8, maxLen: 8, placeholder: '9XXXXXXX' },
  { code: 'RW', name: 'Ruanda', dial: '250', minLen: 9, maxLen: 9, placeholder: '7XXXXXXXX' },
  { code: 'SN', name: 'Senegal', dial: '221', minLen: 9, maxLen: 9, placeholder: '7XXXXXXXX' },
  { code: 'SL', name: 'Sierra Leona', dial: '232', minLen: 8, maxLen: 8, placeholder: '7XXXXXXX' },
  { code: 'SO', name: 'Somalia', dial: '252', minLen: 8, maxLen: 9, placeholder: '6XXXXXXX' },
  { code: 'SD', name: 'Sudán', dial: '249', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'TZ', name: 'Tanzania', dial: '255', minLen: 9, maxLen: 9, placeholder: '6XXXXXXXX' },
  { code: 'TG', name: 'Togo', dial: '228', minLen: 8, maxLen: 8, placeholder: '9XXXXXXX' },
  { code: 'UG', name: 'Uganda', dial: '256', minLen: 9, maxLen: 9, placeholder: '7XXXXXXXX' },
  { code: 'ZM', name: 'Zambia', dial: '260', minLen: 9, maxLen: 9, placeholder: '9XXXXXXXX' },
  { code: 'ZW', name: 'Zimbabue', dial: '263', minLen: 9, maxLen: 9, placeholder: '7XXXXXXXX' },
];

// Ordenado alfabéticamente excepto Ecuador que va primero (mercado principal).
COUNTRIES.sort((a, b) => {
  if (a.code === 'EC') return -1;
  if (b.code === 'EC') return 1;
  return a.name.localeCompare(b.name, 'es');
});

/**
 * Devuelve el país por código ISO (case-insensitive). Devuelve EC por defecto.
 */
export function findCountry(code) {
  const upper = (code || '').toUpperCase();
  return COUNTRIES.find((c) => c.code === upper) || COUNTRIES.find((c) => c.code === 'EC');
}
