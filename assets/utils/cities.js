// cities.js — Cantones del Ecuador por provincia.
// Se usan los nombres oficiales. La capital de cada provincia va primero.

export const CITIES_BY_PROVINCE = {
  'AZUAY': ['Cuenca', 'Camilo Ponce Enríquez', 'Chordeleg', 'El Pan', 'Girón', 'Guachapala', 'Gualaceo', 'Nabón', 'Oña', 'Paute', 'Pucará', 'San Fernando', 'Santa Isabel', 'Sevilla de Oro', 'Sígsig'],
  'BOLIVAR': ['Guaranda', 'Caluma', 'Chillanes', 'Chimbo', 'Echeandía', 'Las Naves', 'San Miguel'],
  'CANAR': ['Azogues', 'Biblián', 'Cañar', 'Déleg', 'El Tambo', 'La Troncal', 'Suscal'],
  'CARCHI': ['Tulcán', 'Bolívar', 'Espejo', 'Mira', 'Montúfar', 'San Pedro de Huaca'],
  'CHIMBORAZO': ['Riobamba', 'Alausí', 'Chambo', 'Chunchi', 'Colta', 'Cumandá', 'Guamote', 'Guano', 'Pallatanga', 'Penipe'],
  'COTOPAXI': ['Latacunga', 'La Maná', 'Pangua', 'Pujilí', 'Salcedo', 'Saquisilí', 'Sigchos'],
  'EL ORO': ['Machala', 'Arenillas', 'Atahualpa', 'Balsas', 'Chilla', 'El Guabo', 'Huaquillas', 'Las Lajas', 'Marcabelí', 'Pasaje', 'Piñas', 'Portovelo', 'Santa Rosa', 'Zaruma'],
  'ESMERALDAS': ['Esmeraldas', 'Atacames', 'Eloy Alfaro', 'Muisne', 'Quinindé', 'Rioverde', 'San Lorenzo'],
  'GALAPAGOS': ['San Cristóbal', 'Isabela', 'Santa Cruz'],
  'GUAYAS': ['Guayaquil', 'Alfredo Baquerizo Moreno', 'Balao', 'Balzar', 'Colimes', 'Coronel Marcelino Maridueña', 'Daule', 'Durán', 'El Empalme', 'El Triunfo', 'General Antonio Elizalde', 'Isidro Ayora', 'Lomas de Sargentillo', 'Milagro', 'Naranjal', 'Naranjito', 'Nobol', 'Palestina', 'Pedro Carbo', 'Playas', 'Salitre', 'Samborondón', 'Santa Lucía', 'Simón Bolívar', 'Yaguachi'],
  'IMBABURA': ['Ibarra', 'Antonio Ante', 'Cotacachi', 'Otavalo', 'Pimampiro', 'San Miguel de Urcuquí'],
  'LOJA': ['Loja', 'Calvas', 'Catamayo', 'Celica', 'Chaguarpamba', 'Espíndola', 'Gonzanamá', 'Macará', 'Olmedo', 'Paltas', 'Pindal', 'Puyango', 'Quilanga', 'Saraguro', 'Sozoranga', 'Zapotillo'],
  'LOS RIOS': ['Babahoyo', 'Baba', 'Buena Fe', 'Mocache', 'Montalvo', 'Palenque', 'Pueblo Viejo', 'Quevedo', 'Quinsaloma', 'Urdaneta', 'Valencia', 'Ventanas', 'Vinces'],
  'MANABI': ['Portoviejo', '24 de Mayo', 'Bolívar', 'Chone', 'El Carmen', 'Flavio Alfaro', 'Jama', 'Jaramijó', 'Jipijapa', 'Junín', 'Manta', 'Montecristi', 'Olmedo', 'Paján', 'Pedernales', 'Pichincha', 'Puerto López', 'Rocafuerte', 'San Vicente', 'Santa Ana', 'Sucre', 'Tosagua'],
  'MORONA SANTIAGO': ['Macas', 'Gualaquiza', 'Huamboya', 'Limón Indanza', 'Logroño', 'Pablo Sexto', 'Palora', 'San Juan Bosco', 'Santiago', 'Sucúa', 'Taisha', 'Tiwintza'],
  'NAPO': ['Tena', 'Archidona', 'Carlos Julio Arosemena Tola', 'El Chaco', 'Quijos'],
  'ORELLANA': ['Francisco de Orellana', 'Aguarico', 'La Joya de los Sachas', 'Loreto'],
  'PASTAZA': ['Puyo', 'Arajuno', 'Mera', 'Santa Clara'],
  'PICHINCHA': ['Quito', 'Cayambe', 'Mejía', 'Pedro Moncayo', 'Pedro Vicente Maldonado', 'Puerto Quito', 'Rumiñahui', 'San Miguel de los Bancos'],
  'SANTA ELENA': ['Santa Elena', 'La Libertad', 'Salinas'],
  'SANTO DOMINGO': ['Santo Domingo', 'La Concordia'],
  'SUCUMBIOS': ['Nueva Loja', 'Cascales', 'Cuyabeno', 'Gonzalo Pizarro', 'Putumayo', 'Shushufindi', 'Sucumbíos'],
  'TUNGURAHUA': ['Ambato', 'Baños de Agua Santa', 'Cevallos', 'Mocha', 'Patate', 'Pelileo', 'Píllaro', 'Quero', 'Tisaleo'],
  'ZAMORA CHINCHIPE': ['Zamora', 'Centinela del Cóndor', 'Chinchipe', 'El Pangui', 'Nangaritza', 'Palanda', 'Paquisha', 'Yacuambi', 'Yantzaza'],
};

/**
 * Devuelve la lista de ciudades para una provincia dada.
 * Si la provincia no existe, devuelve [].
 */
export function citiesFor(provincia) {
  if (!provincia) return [];
  return CITIES_BY_PROVINCE[provincia.toUpperCase()] || [];
}
