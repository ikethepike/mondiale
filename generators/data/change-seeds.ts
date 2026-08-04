import type { ISOCountryCode } from '../../types/geography.types'

/**
 * Curated list of visible planetary changes for World of Change: two satellite
 * frames of one place, decades apart, crossfading. The player taps where on
 * earth it is happening; hard mode also dials the decade the change began.
 *
 * Frames come from NASA's own World of Change series — public domain, and
 * MATCHED (same footprint, same framing, years apart), which is the whole
 * reason the crossfade reads as change rather than as two different photos.
 *
 * URLs point at the Internet Archive's copy of `earthobservatory.nasa.gov`.
 * That is deliberate, not a shortcut: EO's 2024 move to WordPress retired the
 * `/ContentWOC/` tree, and the live host now answers every one of those paths
 * with a 200 and an HTML shell rather than a 404 — so a "working" URL there
 * silently yields a web page, not a picture. The `id_` endpoint returns the
 * original NASA bytes. The generator checks `content-type` for exactly this
 * reason; do not "fix" these URLs back to the live host without checking that
 * they still return `image/*`.
 *
 * Two admission gates, both enforced by the generator, not by good intentions:
 *
 * 1. THE SUBJECT MUST LIE ON LAND, inside one of `countries`. The map only
 *    dispatches a click from a country path — a tap on open water fires
 *    nothing at all — so a story whose subject sits offshore can never be
 *    answered. Retreating sea ice and bleaching reefs are out of scope until
 *    the map grows water hit-targets.
 * 2. NOTHING MAY NAME THE COUNTRY. `name` becomes the slug, and the slug names
 *    the image file — `dubai-palm-islands-before.webp` hands the answer to
 *    anyone with devtools. Keep `name` geographically mute and let `title`
 *    carry the phrase a player would recognise, the same split event-seeds
 *    uses. Both go through `mentionsCountry`, the shared giveaway scrub.
 *
 * And one the generator CANNOT check, so it falls to whoever adds a seed:
 * THE IMAGERY ITSELF MUST NOT BE ANNOTATED. Borders, place labels, scale bars
 * and inset locator maps all answer the question before it is asked — drawn
 * national borders especially, since their shapes match the game's own map
 * exactly. Look at both frames before shipping a story. This is why the Grand
 * Renaissance Dam is not here: a flawless pixel-identical filling sequence,
 * every frame overprinted with national borders.
 *
 * `countries` is the accepted set, not a single anchor: a change that straddles
 * a border (the Aral Sea is Kazakh AND Uzbek) accepts either tap. Order is
 * cosmetic; the first entry only decides which region the quota counts it in.
 *
 * Curation quota, per the empire-roster precedent: no region may carry more
 * than a quarter of the deck. The Anthropocene is not a story about one
 * continent, and the dealer weights by region on top of this.
 */
export type ChangeKind = 'water' | 'forest' | 'urban' | 'ice' | 'agriculture'

export interface ChangeSeed {
  /** Slug source — MUST NOT name the country, its capital or its people. */
  name: string
  /** What the reveal calls it; defaults to `name`. Free to be recognisable. */
  title?: string
  /** Every country whose tap is accepted. */
  countries: ISOCountryCode[]
  kind: ChangeKind
  /** Where the change is, for the reveal marker and the on-land gate. */
  coordinates: { lat: number; lng: number }
  /** The decade dial's answer — when the change became visible, not when it
   *  ended. Often earlier than the first frame: Landsat started watching long
   *  after the Aral began draining. */
  startYear: number
  /** The two frames' own years. */
  beforeYear: number
  afterYear: number
  /** The one-line why, shown at the reveal. */
  description: string
  beforeUrl: string
  afterUrl: string
  /** Override when EO credits a named visualizer rather than the observatory. */
  credit?: string
}

const WOC = (path: string) =>
  `https://web.archive.org/web/2023id_/https://earthobservatory.nasa.gov/ContentWOC/images/${path}`

/**
 * EO's per-story image records. Unlike the retired World of Change tree these
 * still serve from the live asset host, so they need no archive detour — but
 * they are one-off comparison stories rather than a time series, so the pair
 * has to be picked by hand from the record's own frame list.
 */
const EO = (path: string) => `https://eoimages.gsfc.nasa.gov/images/imagerecords/${path}`

export const CHANGE_SEEDS: ChangeSeed[] = [
  // --- Asia -----------------------------------------------------------------
  {
    name: 'the vanishing inland sea',
    title: 'The Aral Sea',
    countries: ['KZ', 'UZ'],
    kind: 'water',
    coordinates: { lat: 45.0, lng: 59.5 },
    startYear: 1960,
    beforeYear: 2000,
    afterYear: 2018,
    description:
      'Soviet planners diverted the two rivers feeding it to irrigate cotton, and the fourth-largest lake on earth drained away. Fishing towns now sit fifty kilometres from water, their trawlers rusting on salt flats.',
    beforeUrl: WOC('aral/aralsea_tmo_2000238_lrg.jpg'),
    afterUrl: WOC('aral/aralsea_tmo_2018233_lrg.jpg'),
  },
  {
    name: 'the delta megacity',
    title: 'Shanghai',
    countries: ['CN'],
    kind: 'urban',
    coordinates: { lat: 31.23, lng: 121.47 },
    startYear: 1990,
    beforeYear: 1984,
    afterYear: 2019,
    description:
      'Farmland and fish ponds east of the river became a forest of towers in a single lifetime, as a fishing-port district turned into one of the busiest financial centres on earth.',
    beforeUrl: WOC('shanghai/shanghai_tm5_1984114_lrg.jpg'),
    afterUrl: WOC('shanghai/shanghai_oli_2019210_lrg.jpg'),
  },
  // NOTE: the Yellow River delta (WOC "YellowRiver") is out. Only its 1989
  // frame was archived at full size; every later year survives solely as the
  // small rendering, and those carry burned-in labels — "Bohai Sea", "New
  // channel", "Aquaculture" — which name the answer outright. Restore it if a
  // clean later frame turns up.
  {
    name: 'the wandering braided river',
    title: 'The Padma River',
    countries: ['BD'],
    kind: 'water',
    coordinates: { lat: 23.7, lng: 89.8 },
    startYear: 1980,
    beforeYear: 1988,
    afterYear: 2018,
    description:
      'One of the world’s most restless rivers, eating its own banks and rebuilding them kilometres away — every migration takes farms and villages with it.',
    beforeUrl: WOC('padma/padma_tm5_1988002_lrg.jpg'),
    afterUrl: WOC('padma/padma_oli_2018020_lrg.jpg'),
  },
  // --- Middle East ----------------------------------------------------------
  {
    name: 'the built coastline',
    title: 'The Palm Islands',
    countries: ['AE'],
    kind: 'urban',
    // The dredged islands are open sea to the polygon; the pin sits ashore.
    coordinates: { lat: 25.2, lng: 55.27 },
    startYear: 2000,
    beforeYear: 2000,
    afterYear: 2011,
    description:
      'Ninety million cubic metres of dredged sand poured into the Gulf to make palm-shaped suburbs — a coastline drawn by decree and legible from orbit.',
    // Both frames MUST be the _cyl renderings: they are the co-registered
    // full-size series. The bare dubai_<date>.jpg files are small crops on a
    // different footprint, so mixing the two gives a jump cut, not a fade.
    beforeUrl: WOC('dubai/dubai_ast_20001111_cyl.jpg'),
    afterUrl: WOC('dubai/dubai_ast_20110425_cyl.jpg'),
  },
  {
    name: 'the drained then reflooded marshes',
    title: 'The Mesopotamian Marshes',
    countries: ['IQ'],
    kind: 'water',
    coordinates: { lat: 31.0, lng: 47.0 },
    startYear: 1990,
    beforeYear: 2000,
    afterYear: 2010,
    description:
      'Wetlands the size of a small country were deliberately drained to punish the people living in them, then partly reflooded when the dykes were broken open a decade later.',
    beforeUrl: WOC('iraq_marsh/iraq_tmo_2000059_143_lrg.jpg'),
    afterUrl: WOC('iraq_marsh/iraq_amo_2010039_143_lrg.jpg'),
  },
  // --- South America --------------------------------------------------------
  {
    name: 'the fishbone clearings',
    title: 'Amazon deforestation',
    countries: ['BR'],
    kind: 'forest',
    coordinates: { lat: -10.5, lng: -62.5 },
    startYear: 1970,
    // NASA's series opens in 2000, by which time the fishbone was already
    // cut — so this pair shows the pattern THICKENING rather than arriving.
    // The 2000 frame carries a bank of cloud over its eastern third; 2001 is
    // the earliest clear look at the same footprint.
    beforeYear: 2001,
    afterYear: 2012,
    description:
      'Settlers cut side roads off a single new highway and cleared plots along each one, stamping a fishbone pattern across the rainforest that satellites read like a diagram. It has been thickening ever since.',
    beforeUrl: WOC('amazon/amazon_deforestation_20010811_lrg.jpg'),
    afterUrl: WOC('amazon/amazon_deforestation_20120718_lrg.jpg'),
  },
  {
    name: 'the cleared dry forest',
    title: 'The Gran Chaco',
    countries: ['PY'],
    kind: 'forest',
    // Not a World of Change story: NASA's Landsat 50th-anniversary pair,
    // mirrored to Commons. Same public-domain terms, same matched framing.
    coordinates: { lat: -21.5, lng: -60.0 },
    startYear: 1990,
    beforeYear: 1985,
    afterYear: 2025,
    description:
      'The fastest-vanishing dry forest on earth, cut into rectangular cattle ranches so quickly that the frontier is visible from orbit as a straight edge marching west.',
    beforeUrl:
      'https://upload.wikimedia.org/wikipedia/commons/c/cd/Science.nasa.gov_missions_landsat_deforestation-in-paraguays-gran-chaco_January_29%2C_1985_-_February_12%2C_2025_Before-and-after_Image-1-of-2-%281985%29.png',
    afterUrl:
      'https://upload.wikimedia.org/wikipedia/commons/2/20/Science.nasa.gov_missions_landsat_deforestation-in-paraguays-gran-chaco_January_29%2C_1985_-_February_12%2C_2025_Before-and-after_Image-2-of-2-%282025%29.png',
  },
  // --- Europe ---------------------------------------------------------------
  {
    name: 'the glacier that was declared dead',
    title: 'Okjökull',
    countries: ['IS'],
    kind: 'ice',
    coordinates: { lat: 64.6, lng: -20.9 },
    startYear: 1980,
    beforeYear: 1986,
    afterYear: 2019,
    description:
      'The first glacier here to lose its status as a glacier — too thin to move under its own weight. Scientists held a funeral for it in 2019 and left a plaque addressed to the future.',
    beforeUrl: EO('145000/145439/okjokull_tm5_1986257_lrg.jpg'),
    afterUrl: EO('145000/145439/okjokull_oli_2019213_lrg.jpg'),
  },
  // --- Africa ---------------------------------------------------------------
  {
    name: 'the shrinking basin lake',
    // The lake shares its name with one of the four countries holding it, so
    // the reveal-facing title stays mute too.
    title: 'The great Sahelian lake',
    countries: ['TD', 'NE', 'NG', 'CM'],
    kind: 'water',
    coordinates: { lat: 13.0, lng: 14.2 },
    startYear: 1960,
    beforeYear: 1973,
    afterYear: 2017,
    description:
      'Drought and irrigation shrank it to a fraction of its old area, pulling the ground out from under the fishers and herders of four countries at once. The northern basin is dry sand now.',
    beforeUrl: EO('91000/91291/lakechad_ms1_1973_lrg.jpg'),
    afterUrl: EO('91000/91291/lakechad_oli_2017_lrg.jpg'),
  },
  // NOTE: the Grand Renaissance Dam's filling (CIRA's year-by-year series on
  // Commons) is a perfect crossfade — pixel-identical frames, dramatic change,
  // public domain — but every frame has NATIONAL BORDERS drawn over it. A
  // player can match the border shapes straight to the map, which hands over
  // the answer as surely as naming the country would. Out unless an
  // unannotated rendering turns up.
  {
    name: 'the lakes conjured from desert',
    title: 'The Toshka Lakes',
    countries: ['EG'],
    kind: 'water',
    coordinates: { lat: 22.7, lng: 31.0 },
    startYear: 1990,
    beforeYear: 2002,
    afterYear: 2021,
    description:
      'Floodwater pumped out of a reservoir into empty desert made a chain of brand-new lakes in the 1990s — then most of them evaporated away again within two decades.',
    beforeUrl: EO('149000/149334/ISS005-E-13562_lrg.jpg'),
    afterUrl: EO('149000/149334/iss066e091633_lrg.jpg'),
  },
  // --- North America --------------------------------------------------------
  {
    name: 'the retreating tidewater glacier',
    title: 'Columbia Glacier',
    countries: ['US'],
    kind: 'ice',
    coordinates: { lat: 61.2, lng: -147.0 },
    startYear: 1980,
    beforeYear: 1986,
    afterYear: 2019,
    description:
      'A tidewater glacier that has pulled back more than twenty kilometres and thinned by half a kilometre, dumping so many icebergs that tankers had to be re-routed around them.',
    beforeUrl: WOC('columbia_glacier/columbia_tm5_1986209_lrg.jpg'),
    afterUrl: WOC('columbia_glacier/columbiaglacier653_oli_2019172_lrg.jpg'),
  },
  {
    name: 'the boreal tar extraction',
    title: 'The Athabasca oil sands',
    countries: ['CA'],
    kind: 'urban',
    coordinates: { lat: 57.02, lng: -111.48 },
    startYear: 1970,
    beforeYear: 1984,
    afterYear: 2016,
    description:
      'Boreal forest and peat stripped away to mine the bitumen underneath, leaving open pits and tailings ponds big enough to be mistaken for lakes.',
    beforeUrl: WOC('athabasca/athabasca_tm5_19840723_lrg.jpg'),
    afterUrl: WOC('athabasca/athabasca_oli_20160715_lrg.jpg'),
  },
  {
    name: 'the blast zone regrowing',
    title: 'Mount St. Helens',
    countries: ['US'],
    kind: 'forest',
    coordinates: { lat: 46.19, lng: -122.19 },
    startYear: 1980,
    beforeYear: 1979,
    afterYear: 2016,
    description:
      'A volcano took six hundred square kilometres of forest down in minutes, and the decades since have been a live experiment in how fast a flattened landscape comes back.',
    beforeUrl: WOC('sthelens/sthelens_ms3_19790829_lrg.jpg'),
    afterUrl: WOC('sthelens/sthelens_oli_20160828_lrg.jpg'),
  },
  {
    name: 'the emptying canyon reservoir',
    title: 'Lake Powell',
    countries: ['US'],
    kind: 'water',
    coordinates: { lat: 37.07, lng: -111.25 },
    startYear: 2000,
    beforeYear: 1999,
    afterYear: 2021,
    description:
      'A reservoir drawn down to a quarter of its capacity by two decades of drought and over-allocation, ringing the canyon in a white mineral bathtub line.',
    beforeUrl: WOC('lakepowell/lakepowell_19990325_lrg.jpg'),
    afterUrl: WOC('lakepowell/lakepowell_oli_2021120_lrg.jpg'),
  },
]
