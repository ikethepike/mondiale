/**
 * Register titles that name a place the curated roster already holds.
 *
 * The two selections agree on subjects far more often than they agree on
 * names: the curated seed says "Sagrada Família", the World Heritage register
 * says "Basílica and Expiatory Church of the Holy Family". Merging on the slug
 * alone caught the sixty that happened to spell the same and left these
 * fourteen as two entries for one place — two prompts, two pins, two answers.
 *
 * Keyed by the slug the register's own title produces, valued with the slug it
 * belongs to. The absorbed title survives as `alsoKnownAs`, so nothing about
 * the place is lost by folding it in.
 *
 * This table is deliberately EXPLICIT rather than distance-derived. Proximity
 * finds these, but it also finds the Kaaba 6 metres from Masjid al-Haram and
 * the Parthenon 48 metres from the Acropolis — nested subjects the game deals
 * separately on purpose. Only a human can tell "the same place, named twice"
 * from "a building inside a district". The generator reports unaliased
 * near-coincident pairs at the end of a run so new ones surface instead of
 * shipping silently.
 */
export const PLACE_ALIASES: { [registerSlug: string]: string } = {
  // Same building, formal title vs common name.
  'basilica-and-expiatory-church-of-the-holy-family': 'sagrada-familia',
  'mosque-cathedral-of-cordoba': 'mezquita-of-cordoba',
  'saint-sophia-cathedral': 'saint-sophia-cathedral-kyiv',
  'roman-amphitheatre-of-el-jem': 'el-djem-amphitheatre',
  'mir-castle-complex': 'mir-castle',
  'grand-place': 'grand-place-brussels',

  // Same feature, the register wrapping it in its protected-area name.
  'plitvice-lakes-national-park': 'plitvice-lakes',
  'brimstone-hill-fortress-national-park': 'brimstone-hill-fortress',
  'mulanje-massif': 'mount-mulanje',
  // Haiti's inscription is the park; the Citadelle is what anyone pictures.
  'national-history-park': 'citadelle-laferriere',

  // Same town, register naming the settlement or its old quarter.
  'hoi-an': 'hoi-an-ancient-town',
  'historic-center-of-quito': 'quito',
  'old-towns-of-djenne': 'great-mosque-of-djenne',

  // Two register items for one compound, at 212 metres.
  'masjid-al-aqsa': 'al-aqsa-mosque',
}

/** Below this, two places in one country are worth a second look at the end of
 *  a run — either a missing alias or a genuinely nested subject. */
export const PLACE_COINCIDENCE_METRES = 500
