/**
 * The Ground Plan roster: which cities are dealt, and where each one is framed.
 *
 * Hand-edited, and deliberately so. The cut is the whole difficulty dial —
 * Manhattan sliced at Midtown is two rivers and a grid that could be anywhere,
 * sliced at the Battery it is unmistakable — and no measure tells you which is
 * which. The generator PROPOSES cuts by street density and rules none of them;
 * a human marks `signature` after looking at the rendered tile.
 *
 * `lesson` is the teaching payload the reveal reads out: what the form is and
 * who decided it. A city without one still deals, it simply teaches less.
 */
import type { ISOCountryCode } from '../../types/geography.types'

export interface CityCut {
  /** Tile slug — `data/city-plans/<slug>.gen.ts`. */
  slug: string
  /** [south, west, north, east]. The frame is the content, never a centre. */
  box: [number, number, number, number]
  /** Whether the city's diagnostic shape is in frame. Ruled on by a human. */
  signature: boolean
}

export interface CityEntry {
  /** The country that scores. */
  country: ISOCountryCode
  /** The city as the reveal names it, and the answer a typed guess must match. */
  city: string
  /** Other spellings a typed answer may arrive as. */
  aliases?: string[]
  /** Two or more framings; at least one signature outside hard mode. */
  cuts: CityCut[]
  /** The form, and whose decision it was — the round's teaching payload. */
  lesson?: string
  /** Reveal photo for a city with no `CAPITALS[iso].image` to fall back on. */
  image?: string
}

/**
 * The cut's SHORT side, ~2km. Wider and the grain stops reading; narrower and a
 * grid city becomes indistinguishable from any other grid. This is the safe
 * zone: a centred square of this size holds the city's diagnostic shape and is
 * visible whatever the screen.
 */
export const CUT_SPAN_DEGREES = 0.018

/**
 * The cut is WIDER than its safe zone so the tile can fill a screen of any
 * shape without cropping the shape the round is asking about.
 *
 * A square tile filled edge to edge loses 44% of one axis on a 16:9 display —
 * measured, not estimated. Extending to 16:9 means a landscape fill shows the
 * whole safe zone plus real city in the wings, and a portrait fill shows it
 * plus city above and below. The extra ground costs about nine kilobytes a
 * city, against the 212KB reveal photo the round already ships.
 */
export const CUT_ASPECT = 16 / 9

/** Frame a cut of the standard span around a point. */
export const cutAround = (lat: number, lng: number): [number, number, number, number] => {
  const halfLat = CUT_SPAN_DEGREES / 2
  const halfLng = (halfLat * CUT_ASPECT) / Math.cos(lat * (Math.PI / 180))
  return [lat - halfLat, lng - halfLng, lat + halfLat, lng + halfLng]
}

export const CITY_CUTS: CityEntry[] = [
  {
    country: 'GB',
    city: 'London',
    cuts: [
      { slug: 'london-westminster', box: cutAround(51.506, -0.12), signature: true },
      { slug: 'london-isle-of-dogs', box: cutAround(51.4975, -0.0185), signature: true },
      { slug: 'london-chelsea', box: cutAround(51.4855, -0.171), signature: false },
    ],
    lesson:
      'The Thames curves where London could not build, and the embankment answers it: one continuous road hugging the bank, everything else meeting it obliquely.',
  },
  {
    country: 'US',
    city: 'New York',
    aliases: ['New York City', 'NYC', 'Manhattan'],
    cuts: [
      { slug: 'new-york-battery', box: cutAround(40.709, -74.01), signature: true },
      { slug: 'new-york-midtown', box: cutAround(40.754, -73.984), signature: false },
    ],
    lesson:
      "The 1811 Commissioners' Plan ruled a grid over farmland and the old Dutch lanes below Wall Street survived underneath it — which is why downtown bends and everything above it does not.",
  },
  {
    country: 'FR',
    city: 'Paris',
    cuts: [
      { slug: 'paris-ile-de-la-cite', box: cutAround(48.855, 2.348), signature: true },
      { slug: 'paris-etoile', box: cutAround(48.8738, 2.295), signature: true },
      { slug: 'paris-belleville', box: cutAround(48.872, 2.384), signature: false },
    ],
    lesson:
      'Haussmann cut boulevards straight through the medieval city from 1853, which is why Paris radiates: the star junctions are new, the fabric between them is old.',
  },
  {
    country: 'ES',
    city: 'Barcelona',
    cuts: [
      { slug: 'barcelona-eixample', box: cutAround(41.3925, 2.164), signature: true },
      { slug: 'barcelona-gothic', box: cutAround(41.383, 2.177), signature: false },
    ],
    lesson:
      'Eixample, 1859: Cerdà chamfered every corner so trams could turn, giving Barcelona a grid of octagons no other city has.',
  },
  {
    country: 'MA',
    city: 'Fez',
    aliases: ['Fes'],
    cuts: [
      { slug: 'fez-medina', box: cutAround(34.0645, -4.9785), signature: true },
      { slug: 'fez-ville-nouvelle', box: cutAround(34.0362, -5.0035), signature: false },
    ],
    lesson:
      'Fes el-Bali grew without wheeled traffic, so its lanes answer only to footfall and property lines — the densest car-free fabric on earth.',
  },
  {
    country: 'IT',
    city: 'Turin',
    aliases: ['Torino'],
    cuts: [{ slug: 'turin-centro', box: cutAround(45.0705, 7.685), signature: true }],
    lesson:
      'Augusta Taurinorum was a Roman camp, and the grid inside the old walls is still its cardo and decumanus, two thousand years on.',
  },
  {
    country: 'NL',
    city: 'Amsterdam',
    cuts: [{ slug: 'amsterdam-grachtengordel', box: cutAround(52.3695, 4.888), signature: true }],
    lesson:
      'The canal ring was speculative property development, dug from 1613 outward in concentric arcs — infrastructure and real estate in one gesture.',
  },
  {
    country: 'JP',
    city: 'Tokyo',
    cuts: [
      { slug: 'tokyo-marunouchi', box: cutAround(35.6815, 139.766), signature: true },
      { slug: 'tokyo-shinjuku', box: cutAround(35.6905, 139.7), signature: false },
    ],
    lesson:
      "The void at the centre is the Imperial Palace, and the moats around it are Edo Castle's — the city still bends around a shogun's defences.",
  },
  {
    country: 'RU',
    city: 'Moscow',
    aliases: ['Moskva'],
    cuts: [{ slug: 'moscow-kremlin', box: cutAround(55.7525, 37.617), signature: true }],
    lesson:
      'Moscow is rings and radials because it grew outward from a fortified centre, each ring a former city wall.',
  },
  {
    country: 'AR',
    city: 'Buenos Aires',
    cuts: [
      { slug: 'buenos-aires-microcentro', box: cutAround(-34.6045, -58.3785), signature: true },
    ],
    lesson:
      'The Laws of the Indies fixed a grid and a central plaza for every Spanish colonial city — the same template from California to Patagonia.',
  },
  {
    country: 'IN',
    city: 'New Delhi',
    aliases: ['Delhi'],
    cuts: [{ slug: 'new-delhi-lutyens', box: cutAround(28.6145, 77.211), signature: true }],
    lesson:
      'Lutyens laid imperial hexagons and vistas south of the old city in 1912 — a capital designed to be looked along rather than lived in.',
  },
  {
    country: 'BR',
    city: 'Brasília',
    aliases: ['Brasilia'],
    cuts: [{ slug: 'brasilia-plano-piloto', box: cutAround(-15.7965, -47.888), signature: true }],
    lesson:
      "Costa's 1957 Plano Piloto is a single curved axis crossed by a monumental one — a whole capital drawn as one diagram, and almost unwalkable because of it.",
  },
  {
    country: 'TR',
    city: 'Istanbul',
    cuts: [
      { slug: 'istanbul-golden-horn', box: cutAround(41.0195, 28.968), signature: true },
      { slug: 'istanbul-besiktas', box: cutAround(41.043, 29.006), signature: false },
    ],
    lesson:
      'Three bodies of water meet here and the city bought only three bridges across the Bosphorus — a strait is expensive in a way a river is not.',
  },
  {
    country: 'DE',
    city: 'Berlin',
    cuts: [{ slug: 'berlin-mitte', box: cutAround(52.5175, 13.393), signature: true }],
    lesson:
      'The Spree threads Mitte and the blocks change grain mid-street where the Wall stood — a city still legibly stitched from two.',
  },
  {
    country: 'EG',
    city: 'Cairo',
    aliases: ['Al-Qahirah'],
    cuts: [{ slug: 'cairo-downtown', box: cutAround(30.046, 31.238), signature: true }],
    lesson:
      "Ismail's 1860s downtown is Haussmann copied wholesale beside a medieval city that ignored it, and the Nile's bridges are countable on one hand.",
  },
  {
    country: 'AU',
    city: 'Sydney',
    cuts: [{ slug: 'sydney-harbour', box: cutAround(-33.859, 151.209), signature: true }],
    lesson:
      'A drowned river valley, so the streets answer to headlands rather than a plan, and one bridge does the work of many.',
  },
  {
    country: 'US',
    city: 'Chicago',
    cuts: [{ slug: 'chicago-loop', box: cutAround(41.883, -87.629), signature: true }],
    lesson:
      "The Loop is named for the elevated railway that rings it, and the grid runs to the Public Land Survey's mile — the whole Midwest on one ruled sheet.",
  },
  {
    country: 'IT',
    city: 'Venice',
    aliases: ['Venezia'],
    cuts: [{ slug: 'venice-grand-canal', box: cutAround(45.4375, 12.334), signature: true }],
    lesson:
      'Built on mudflats with canals for streets, Venice has a fabric that answers to boats — the only major city where the water network outranks the road one.',
  },
  {
    country: 'US',
    city: 'Washington',
    aliases: ['Washington DC', 'Washington, D.C.', 'DC'],
    cuts: [
      { slug: 'washington-mall', box: cutAround(38.892, -77.024), signature: true },
      { slug: 'washington-dupont', box: cutAround(38.9095, -77.043), signature: false },
    ],
    lesson:
      "L'Enfant laid diagonal avenues over a grid in 1791 so the new capital would have vistas, and every place the two systems collide became a traffic circle.",
  },
  {
    country: 'SE',
    city: 'Stockholm',
    cuts: [{ slug: 'stockholm-gamla-stan', box: cutAround(59.325, 18.071), signature: true }],
    lesson:
      'Stockholm is built across fourteen islands where Lake Mälaren meets the Baltic, so almost every route is a bridge and the old town is the plug in the middle.',
  },
  {
    country: 'KR',
    city: 'Seoul',
    cuts: [{ slug: 'seoul-jongno', box: cutAround(37.5705, 126.984), signature: true }],
    lesson:
      'Seoul rebuilt fast after 1953 as superblocks: arterials enclose each block and the interior fills with capillary lanes that connect to nothing else.',
  },
  {
    country: 'NG',
    city: 'Lagos',
    cuts: [{ slug: 'lagos-island', box: cutAround(6.4535, 3.395), signature: true }],
    lesson:
      'Lagos Island was a colonial grid that the city outgrew in every direction, and the lagoon crossings are the bottleneck the whole metropolis is shaped by.',
  },
  {
    country: 'US',
    city: 'Salt Lake City',
    cuts: [{ slug: 'salt-lake-city-temple', box: cutAround(40.769, -111.891), signature: true }],
    lesson:
      'The Plat of Zion gave Salt Lake City ten-acre blocks and streets wide enough to turn a wagon team — a religious instruction still legible as pure geometry.',
  },
  {
    country: 'DE',
    city: 'Karlsruhe',
    cuts: [{ slug: 'karlsruhe-schloss', box: cutAround(49.0135, 8.404), signature: true }],
    lesson:
      'Thirty-two streets radiate from the palace tower because the margrave wanted every road in his city to point at him.',
  },
  {
    country: 'RU',
    city: 'Saint Petersburg',
    aliases: ['St Petersburg', 'Sankt-Peterburg', 'Petersburg'],
    cuts: [{ slug: 'saint-petersburg-nevsky', box: cutAround(59.934, 30.325), signature: true }],
    lesson:
      'Peter the Great ruled a European grid across the Neva delta from 1703, so the canals are drainage and the avenues are ambition.',
  },
  {
    country: 'CU',
    city: 'Havana',
    aliases: ['La Habana'],
    cuts: [{ slug: 'havana-vieja', box: cutAround(23.136, -82.354), signature: true }],
    lesson:
      'Havana Vieja is a Laws of the Indies grid bent to its harbour, and the Malecón is the seawall the city later grew a boulevard along.',
  },
  {
    country: 'FI',
    city: 'Helsinki',
    aliases: ['Helsingfors'],
    cuts: [{ slug: 'helsinki-kruununhaka', box: cutAround(60.169, 24.952), signature: true }],
    lesson:
      'Helsinki was rebuilt on a grid after 1812 to look like an imperial capital, and the sea reaches into it from three sides at once.',
  },
]
