/**
 * Natural Earth 1:10m ships a handful of names with dropped characters
 * ("Kiz?lirmak", "Klarlven") — the damage sits in NE's own name/name_en
 * attributes, verified against the raw geojson. Raw NE name → corrected.
 * The generator warns for any entry that stops matching on an NE bump.
 */
export const WATER_NAME_FIXES: Record<string, string> = {
  'Kiz?lirmak': 'Kızılırmak',
  Klarlven: 'Klarälven',
  Tornelven: 'Torneälven',
  Skelleftelven: 'Skellefteälven',
  'Byk Menderes': 'Büyük Menderes',
  'Ro Grande de Santiago': 'Río Grande de Santiago',
  'Ro Grande de Matagalpa': 'Río Grande de Matagalpa',
  'Grande Rivire de la Baleine': 'Grande Rivière de la Baleine',
  // Rivière aux Mélèzes, northern Québec (placed by its CA-only course)
  Mlzes: 'Mélèzes',
}
