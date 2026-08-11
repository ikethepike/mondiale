import type { MediaCredit } from '../../lib/attribution'
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
  /** Override when the frames are not the observatory's own — another agency's
   *  series (Earthshots), or EO crediting a named visualizer. */
  credit?: Partial<MediaCredit>
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

/**
 * USGS Earthshots — the EROS Center's own before/after Landsat series, a
 * second curated trove alongside NASA's. Public domain like all USGS work.
 * Use only the co-registered `*Intro` frames: the sibling `-labels` and
 * per-suburb crop variants carry burned-in annotations or other footprints.
 */
const EARTHSHOTS = (path: string) => `https://eros.usgs.gov/sites/eros.usgs.gov/files/${path}`

/**
 * Countries searched across both troves that yielded NOTHING usable, so the
 * ground is not re-covered: Sweden (EO holds two single-frame scenics — Kiruna
 * 2016, the Siljan Ring 2020 — and Earthshots has no Nordic story but
 * Svalbard), Poland, France, Thailand, and Japan (Isahaya Bay publishes only
 * `-label` frames). South Africa's Theewaterskloof pair is real and
 * co-registered but is a WIDE regional view in which the drought-hit reservoir
 * is a small shape and a seasonal green-to-brown shift dominates the frame —
 * the same flaw that rules out Batagaika's crater. Kiruna's relocating town is
 * the best unclaimed story going; nobody has published it as a pair, so it
 * would have to be built from raw Landsat scenes.
 */
const EARTHSHOTS_CREDIT = {
  credit: 'USGS EROS Center',
  license: 'Public domain',
  imageSource: 'usgs-earthshots',
} satisfies Partial<MediaCredit>

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
  {
    name: 'the factory delta',
    title: 'The Pearl River Delta',
    countries: ['CN'],
    kind: 'urban',
    coordinates: { lat: 22.55, lng: 114.05 },
    startYear: 1980,
    beforeYear: 1988,
    afterYear: 2014,
    description:
      'Rice paddies and fish ponds became the largest continuous urban area on earth in a single generation, after a sleepy border town was declared a special economic zone and tens of millions moved in to work the factories.',
    beforeUrl: EO('86000/86603/prd_tm_1988329_lrg.jpg'),
    afterUrl: EO('86000/86603/prd_oli_2014320_lrg.jpg'),
  },
  {
    name: 'the northern plains megacity',
    title: 'Delhi',
    countries: ['IN'],
    kind: 'urban',
    coordinates: { lat: 28.6, lng: 77.2 },
    startYear: 1990,
    beforeYear: 1989,
    afterYear: 2018,
    description:
      'A capital whose population tripled past thirty million in three decades, sprawling outward along every highway at once and swallowing the farmland of two neighbouring states.',
    beforeUrl: EO('92000/92813/dehliurban_tm5_1989339_lrg.jpg'),
    afterUrl: EO('92000/92813/dehliurban_oli_2018156_lrg.jpg'),
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
  {
    name: 'the desert crop circles',
    title: 'Wadi as-Sirhan',
    countries: ['SA'],
    kind: 'agriculture',
    coordinates: { lat: 30.3, lng: 38.3 },
    startYear: 1980,
    beforeYear: 1987,
    afterYear: 2012,
    description:
      'Fossil water pumped up from beneath the sand turned bare desert into thousands of green circles of wheat and fodder — centre-pivot irrigation drawing down an aquifer that last filled during the ice age.',
    beforeUrl: EO('77000/77900/saudiarabia_tm5_1987036_lrg.jpg'),
    afterUrl: EO('77000/77900/saudiarabia_etm_2012017_lrg.jpg'),
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
  {
    name: 'the vanished highland lake',
    title: 'Lake Poopó',
    countries: ['BO'],
    kind: 'water',
    coordinates: { lat: -18.8, lng: -67.1 },
    startYear: 1990,
    beforeYear: 2013,
    afterYear: 2016,
    description:
      'The Altiplano’s second-largest lake — already shallow, already shrinking for decades — evaporated entirely in the space of three years, stranding fishing villages on a salt plain nearly four kilometres above the sea.',
    beforeUrl: EO('87000/87363/lakepoopo_oli_2013102_lrg.jpg'),
    afterUrl: EO('87000/87363/lakepoopo_oli_2016015_lrg.jpg'),
  },
  {
    name: 'the tropical ice cap',
    title: 'The Quelccaya Ice Cap',
    countries: ['PE'],
    kind: 'ice',
    coordinates: { lat: -13.93, lng: -70.82 },
    startYear: 1980,
    beforeYear: 1988,
    afterYear: 2023,
    description:
      'The largest ice cap in the tropics, high in the Andes, has lost half its area since satellites began watching — and with it the archive of eighteen centuries of climate held in its ice.',
    beforeUrl: EO('152000/152124/quelccaya_tm_1988246_lrg.jpg'),
    afterUrl: EO('152000/152124/quelccaya_oli_2023295_lrg.jpg'),
  },
  // --- Europe ---------------------------------------------------------------
  // NOTE: three Earthshots stories here were tried and rejected. Chernobyl's
  // 2024 frame carries a white no-data wedge and sits offset from 1986;
  // Svalbard's 1976 frame is half black wedge; and every Copenhagen frame
  // after 2001 has city names burned into it. All three are restorable if
  // cleaner renderings appear.
  {
    name: 'the sea turned into fields',
    title: 'The IJsselmeer polders',
    countries: ['NL'],
    kind: 'agriculture',
    // The pin sits on the reclaimed land itself, which the polygon has held
    // since long before Natural Earth was drawn.
    coordinates: { lat: 52.51, lng: 5.47 },
    startYear: 1960,
    beforeYear: 1973,
    afterYear: 2021,
    description:
      'An inland sea walled off from the ocean and then pumped dry in stages, turning open water into a province of farms and new towns — land that simply did not exist when the people farming it were born.',
    beforeUrl: EARTHSHOTS('2021-06/1973-Intro.png'),
    afterUrl: EARTHSHOTS('2021-06/2021-Intro.png'),
    credit: EARTHSHOTS_CREDIT,
  },
  {
    name: 'the mine pits filled with water',
    title: 'The Leipzig lake district',
    countries: ['DE'],
    kind: 'water',
    coordinates: { lat: 51.34, lng: 12.38 },
    startYear: 1990,
    beforeYear: 1987,
    afterYear: 2020,
    // The 1987 frame exists ONLY as false-colour 432, so the after frame must
    // be the 543 rendering: EO also publishes a natural-colour 2020 frame at
    // the same footprint, and pairing that one turns the crossfade into a
    // red-to-green palette flip instead of a landscape changing.
    description:
      'When the brown-coal industry collapsed, the open pits it left behind were flooded on purpose — a district of vast holes in the ground remade over thirty years into a chain of lakes with beaches and marinas.',
    beforeUrl: EO('148000/148031/leipzig432_tm5_1987119_lrg.jpg'),
    afterUrl: EO('148000/148031/leipzig543_oli_2020114_lrg.jpg'),
  },
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
  {
    name: 'the glacier that opened a lagoon',
    title: 'Breiðamerkurjökull',
    countries: ['IS'],
    kind: 'ice',
    coordinates: { lat: 64.05, lng: -16.28 },
    startYear: 1970,
    beforeYear: 1973,
    afterYear: 2021,
    description:
      'An outlet glacier that has pulled back so far from the sea that the meltwater lagoon left behind is now one of the deepest lakes in the country, calving icebergs that drift out onto a black sand beach.',
    beforeUrl: EARTHSHOTS('2020-12/9-22-1973_main%28chs.%204%2C2%2C1%29.png'),
    afterUrl: EARTHSHOTS('2021-09/8_9-9-2021_main.png'),
    credit: EARTHSHOTS_CREDIT,
  },
  {
    name: 'the great alpine tongue',
    title: 'The Aletsch Glacier',
    countries: ['CH'],
    kind: 'ice',
    coordinates: { lat: 46.43, lng: 8.08 },
    startYear: 1980,
    beforeYear: 1984,
    afterYear: 2024,
    description:
      'The largest glacier in the Alps has pulled back more than a kilometre in forty years, thinning so fast that mountain huts built at the ice’s edge now overlook a canyon of bare rock.',
    beforeUrl: EO('154000/154043/aletschglacier_tm5_19840902_lrg.jpg'),
    afterUrl: EO('154000/154043/aletschglacier_oli_20240806_lrg.jpg'),
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
  {
    name: 'the green fan',
    title: 'The Nile Delta',
    countries: ['EG'],
    kind: 'agriculture',
    coordinates: { lat: 30.9, lng: 31.1 },
    startYear: 1970,
    // The series opens in 1972, but that MSS frame carries a black no-data
    // wedge across its eastern third — a triangle that crossfades into real
    // land reads as a glitch, not as change. 1984 is the first full frame.
    beforeYear: 1984,
    afterYear: 2024,
    description:
      'Forty years of a river’s fan remade: cities ballooning into some of the world’s oldest farmland while new fields push out into the desert at the edges, all of it fed by one dammed river.',
    beforeUrl: EARTHSHOTS('2022-09/1984_Nile-Intro.png'),
    afterUrl: EARTHSHOTS('2025-01/2024_Nile-Intro.png'),
    credit: EARTHSHOTS_CREDIT,
  },
  // --- Oceania --------------------------------------------------------------
  // NOTE: Sydney (Earthshots "sydney-australia") is out. Every frame after
  // 1975 is a rotated swath with black corner wedges, and the band composite
  // changes between frames — the crossfade reads as a palette shift with
  // wandering black triangles, not as growth. Restore it if a north-up,
  // consistently-rendered pair turns up.
  {
    name: 'the golden super pit',
    title: 'The Super Pit at Kalgoorlie',
    countries: ['AU'],
    kind: 'urban',
    coordinates: { lat: -30.75, lng: 121.47 },
    startYear: 1990,
    beforeYear: 1986,
    afterYear: 2023,
    description:
      'Dozens of century-old underground gold mines merged into one open cut that grew to swallow them all — three and a half kilometres long, and deep enough to hide the world’s tallest towers.',
    beforeUrl: EARTHSHOTS('2023-01/1986_Kalgoorlie-Intro.png'),
    afterUrl: EARTHSHOTS('2023-01/2023_Kalgoorlie-Intro.png'),
    credit: EARTHSHOTS_CREDIT,
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
