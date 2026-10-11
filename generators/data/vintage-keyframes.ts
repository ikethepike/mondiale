import type { VintageWash } from '../../types/vintage.types'

/**
 * Europe before CShapes: OpenHistoricalMap's dated borders, sampled at the
 * Dec-31 map of each keyframe and held until the next. Curated keyframes, not
 * every recorded change — the Napoleonic years alone hold dozens, which would
 * turn the rewind into flicker.
 */
export const VINTAGE_KEYFRAMES = [
  1772, 1793, 1795, 1797, 1806, 1807, 1809, 1812, 1815, 1830, 1832, 1859, 1860, 1861, 1864, 1866,
  1867, 1870, 1871, 1878,
] as const

export interface KeyframePolity {
  /** The unit it draws: a CShapes gwcode where the polity runs on past 1886
   *  (or a Gleditsch–Ward code for a state that ended before it). */
  gwcode: number
  /** What the map calls it; OpenHistoricalMap's name when absent. Polities
   *  alive in 1885 read exactly as CShapes' first era does, so the seam is
   *  never a rename. */
  name?: string
  wash?: VintageWash
  sovereign?: boolean
  /** Below the unit's own relations: provinces (Habsburg lands before the
   *  Austrian Empire) yield to any country-level polity, and the Holy Roman
   *  Empire to everything inside it. */
  rank?: number
  /** Province-level pieces count only before this year. */
  until?: number
  /** Sovereign, under no wash, from this keyframe on — a vassal whose name
   *  OpenHistoricalMap keeps across its independence. */
  sovereignFrom?: number
}

const PIECE = 1
const UMBRELLA = 0

export const KEYFRAME_POLITIES: Record<string, KeyframePolity> = {
  // Western Europe
  'Kingdom of Great Britain': { gwcode: 200, name: 'Great Britain' },
  'United Kingdom of Great Britain and Ireland': { gwcode: 200, name: 'United Kingdom' },
  'Kingdom of Ireland': { gwcode: 205, name: 'Ireland', wash: 'gb', sovereign: false },
  'Republic of the Seven United Netherlands': { gwcode: 210, name: 'Dutch Republic' },
  'Batavian Republic': { gwcode: 210, wash: 'fr', sovereign: false },
  'Batavian Commonwealth': { gwcode: 210, name: 'Batavian Republic', wash: 'fr', sovereign: false },
  'Kingdom of Holland': { gwcode: 210, wash: 'fr', sovereign: false },
  'United Netherlands': { gwcode: 210, name: 'Netherlands' },
  'Sovereign Principality of the United Netherlands': { gwcode: 210, name: 'Netherlands' },
  'Kingdom of the Netherlands': { gwcode: 210, name: 'Netherlands' },
  Belgium: { gwcode: 211 },
  Luxembourg: { gwcode: 212 },
  'Grand Duchy of Luxembourg': { gwcode: 212, name: 'Luxembourg' },
  'Kingdom of France': { gwcode: 220, name: 'France' },
  'French Republic': { gwcode: 220, name: 'France' },
  'French Republic (Empire)': { gwcode: 220, name: 'French Empire', wash: 'fr' },
  'French Empire': { gwcode: 220, wash: 'fr' },
  'Second French Empire': { gwcode: 220, name: 'France' },
  'Swiss Confederacy': { gwcode: 225, name: 'Switzerland' },
  'Helvetic Republic': { gwcode: 225, wash: 'fr', sovereign: false },
  'Swiss Confederation': { gwcode: 225, name: 'Switzerland' },
  Switzerland: { gwcode: 225 },
  Spain: { gwcode: 230 },
  'Kingdom of Portugal': { gwcode: 235, name: 'Portugal' },
  'United Kingdom of Portugal, Brazil and the Algarves': { gwcode: 235, name: 'Portugal' },

  // Germany: Prussia grows into the Empire; the larger states keep their own
  'Kingdom of Prussia': { gwcode: 255, name: 'Prussia' },
  'North German Confederation': { gwcode: 255 },
  'German Reich': { gwcode: 255, name: 'German Empire', wash: 'de' },
  Hanover: { gwcode: 240, name: 'Hanover' },
  'Kingdom of Bavaria': { gwcode: 245, name: 'Bavaria' },
  Baden: { gwcode: 267 },
  'Kingdom of Saxony': { gwcode: 269, name: 'Saxony' },
  'Electorate of Saxony': { gwcode: 269, name: 'Saxony' },
  Württemberg: { gwcode: 271 },
  'Electorate of Hesse': { gwcode: 273, name: 'Hesse-Kassel' },
  'Grand Duchy of Hesse': { gwcode: 275, name: 'Hesse-Darmstadt' },
  Hesse: { gwcode: 275, name: 'Hesse-Darmstadt' },
  'Duchy of Mecklenburg-Schwerin': { gwcode: 280, name: 'Mecklenburg' },
  'Grand Duchy of Mecklenburg-Schwerin': { gwcode: 280, name: 'Mecklenburg' },
  'Kingdom of Westphalia': { gwcode: 2551, wash: 'fr', sovereign: false },
  'Grand Duchy of Berg': { gwcode: 2552, wash: 'fr', sovereign: false },
  Frankfur: { gwcode: 2553, name: 'Frankfurt' },
  'Holy Roman Empire': { gwcode: 2550, rank: UMBRELLA },

  // Poland: partitioned away, then Napoleon's duchy, then Russia's kingdom
  'Poland-Lithuania': { gwcode: 290 },
  'Duchy of Warsaw': { gwcode: 290, wash: 'fr', sovereign: false },
  'Kingdom of Poland': { gwcode: 290, name: 'Congress Poland', wash: 'ru', sovereign: false },
  'Free City of Danzig': { gwcode: 291, sovereign: false },
  'Free City of Cracow': { gwcode: 2901, name: 'Kraków' },

  // The Habsburg lands: assembled from their provinces until the Austrian Empire
  'Austrian Empire': { gwcode: 300, wash: 'habsburg' },
  'Austria-Hungary': { gwcode: 300, wash: 'at-hu' },
  'Austrian Circle': {
    gwcode: 300,
    name: 'Habsburg Monarchy',
    wash: 'habsburg',
    rank: PIECE,
    until: 1804,
  },
  'Lands of the Bohemian Crown': {
    gwcode: 300,
    name: 'Habsburg Monarchy',
    wash: 'habsburg',
    rank: PIECE,
    until: 1804,
  },
  'Kingdom of Hungary': {
    gwcode: 300,
    name: 'Habsburg Monarchy',
    wash: 'habsburg',
    rank: PIECE,
    until: 1804,
  },
  'Kingdom of Slavonia': {
    gwcode: 300,
    name: 'Habsburg Monarchy',
    wash: 'habsburg',
    rank: PIECE,
    until: 1804,
  },
  'Galicia and Lodomeria': {
    gwcode: 300,
    name: 'Habsburg Monarchy',
    wash: 'habsburg',
    rank: PIECE,
    until: 1804,
  },
  'West Galicia': {
    gwcode: 300,
    name: 'Habsburg Monarchy',
    wash: 'habsburg',
    rank: PIECE,
    until: 1804,
  },
  'Burgundian Circle': {
    gwcode: 300,
    name: 'Habsburg Monarchy',
    wash: 'habsburg',
    rank: PIECE,
    until: 1804,
  },
  'Duchy of Milan': { gwcode: 300, name: 'Habsburg Monarchy', wash: 'habsburg' },

  // Italy: Piedmont-Sardinia grows into the Kingdom of Italy
  'Kingdom of Sardinia': { gwcode: 325, name: 'Sardinia' },
  Italy: { gwcode: 325 },
  'Papal States': { gwcode: 327 },
  'Roman Republic': { gwcode: 327, wash: 'fr', sovereign: false },
  'Kingdom of Naples': { gwcode: 329, name: 'Naples' },
  'Kingdom of the Two Sicilies': { gwcode: 329, name: 'Two Sicilies' },
  'Kingdom of Sicily': { gwcode: 3291, name: 'Sicily' },
  'Duchy of Modena and Reggio': { gwcode: 332, name: 'Modena' },
  'Duchy of Parma and Piacenza': { gwcode: 335, name: 'Parma' },
  'Grand Duchy of Tuscany': { gwcode: 337, name: 'Tuscany' },
  'Kingdom of Etruria': { gwcode: 337, name: 'Etruria', wash: 'fr', sovereign: false },
  'Republic of Venice': { gwcode: 3251, name: 'Venice' },
  'Republic of Genoa': { gwcode: 3252, name: 'Genoa' },
  'Ligurian Republic': { gwcode: 3252, wash: 'fr', sovereign: false },
  'Cisalpine Republic': { gwcode: 3253, wash: 'fr', sovereign: false },
  'Italian Republic': { gwcode: 3253, wash: 'fr', sovereign: false },
  'Kingdom of Italy': { gwcode: 3253, name: 'Napoleonic Italy', wash: 'fr', sovereign: false },
  'United Provinces of Central Italy': { gwcode: 3254, name: 'Central Italy' },
  'Knights Hospitaller': { gwcode: 338, name: 'Order of Malta' },
  'French Malta': { gwcode: 338, name: 'Malta', wash: 'fr', sovereign: false },
  'British Protectorate of Malta': { gwcode: 338, name: 'Malta', wash: 'gb', sovereign: false },
  'Crown Colony of Malta': { gwcode: 338, name: 'Malta', wash: 'gb', sovereign: false },
  'Anglo-Corsican Kingdom': { gwcode: 2201, name: 'Corsica', wash: 'gb', sovereign: false },

  // The Balkans and the east
  'Republic of Ragusa': { gwcode: 3441, name: 'Ragusa' },
  'Principality of Serbia': {
    gwcode: 340,
    name: 'Serbia',
    wash: 'tr',
    sovereign: false,
    sovereignFrom: 1878,
  },
  'Kingdom of Serbia': { gwcode: 340, name: 'Serbia' },
  'Prince-Bishopric of Montenegro': { gwcode: 341, name: 'Montenegro' },
  'Principality of Montenegro': { gwcode: 341, name: 'Montenegro' },
  'Kingdom of Greece': { gwcode: 350, name: 'Greece' },
  'Septinsular Republic': { gwcode: 3501, name: 'Ionian Islands', wash: 'ru', sovereign: false },
  'United States of the Ionian Islands': {
    gwcode: 3501,
    name: 'Ionian Islands',
    wash: 'gb',
    sovereign: false,
  },
  // Still Ottoman by law, as CShapes draws it until 1914.
  'Cyprus Protectorate': { gwcode: 640, rank: PIECE },
  'United Romanian Principalities': { gwcode: 360, name: 'Romania' },
  'Kingdom of Romania': { gwcode: 360, name: 'Romania' },
  'Russian Empire': { gwcode: 365, wash: 'ru' },
  'Crimean Khanate': { gwcode: 3651, wash: 'tr', sovereign: false },
  Sweden: { gwcode: 380 },
  'Sweden–Norway': { gwcode: 380 },
  'Denmark–Norway': { gwcode: 390 },
  Denmark: { gwcode: 390 },
  'Duchy of Schleswig-Holstein-Gottorp': { gwcode: 3901, name: 'Holstein-Gottorp' },
  'Ottoman Empire': { gwcode: 640, wash: 'tr' },
}

/** Outside the region's story, or too small to draw: their land goes to
 *  whichever neighbour borders it most. */
export const KEYFRAME_SKIPPED = new Set([
  'Alawi Sultanate',
  'Regency of Algiers',
  'French Alger',
  'French Algeria',
  'French protectorate of Tunisia',
  'Afsharid Empire',
  'Qajar Iran',
  'Persia',
  'Kingdom of Kartli-Kakheti',
  'Gibraltar',
  'Heligoland',
])

/** Polities OpenHistoricalMap starts recording only after they already
 *  existed: the south German kingdoms appear from 1810, though Napoleon made
 *  them in 1806. Their first recorded borders stand in until then. */
export const KEYFRAME_RECORDED_LATER = new Set(['Kingdom of Bavaria', 'Württemberg', 'Baden'])

/** Units CShapes draws in 1886 that OpenHistoricalMap folds into a
 *  neighbour, carried back unchanged from the year given, under their
 *  first curated era. */
export const KEYFRAME_CARRIED_BACK: Record<number, number> = {
  // Iceland: a Danish dependency throughout.
  395: 1772,
  // Bosnia and Herzegovina: occupied by Austria-Hungary at Berlin.
  3461: 1878,
  3462: 1878,
}
