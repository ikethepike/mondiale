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
    beforeUrl: WOC('dubai/dubai_20001111.jpg'),
    afterUrl: WOC('dubai/dubai_ast_20110425_cyl.jpg'),
  },
  // --- South America --------------------------------------------------------
  {
    name: 'the fishbone clearings',
    title: 'Amazon deforestation',
    countries: ['BR'],
    kind: 'forest',
    coordinates: { lat: -10.5, lng: -62.5 },
    startYear: 1970,
    beforeYear: 2000,
    afterYear: 2012,
    description:
      'Settlers cut side roads off a single new highway and cleared plots along each one, stamping a fishbone pattern across the rainforest that satellites read like a diagram.',
    beforeUrl: WOC('amazon/amazon_deforestation_20000730_lrg.jpg'),
    afterUrl: WOC('amazon/amazon_deforestation_20120718_lrg.jpg'),
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
]
