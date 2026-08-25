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
  {
    country: 'CN',
    city: 'Beijing',
    cuts: [{ slug: 'beijing-centre', box: cutAround(39.9075, 116.3972), signature: true }],
    lesson:
      'Beijing is a Ming ceremonial diagram: a north-south axis through the Forbidden City, ring roads laid over the vanished walls, and hutong lanes filling the blocks between.',
  },
  {
    country: 'ES',
    city: 'Madrid',
    cuts: [{ slug: 'madrid-centre', box: cutAround(40.4165, -3.7026), signature: true }],
    lesson:
      'Madrid grew from a Moorish fort into a Habsburg court city, so the medieval tangle around Plaza Mayor gives way to the ruled Ensanche blocks of the 1860s.',
  },
  {
    country: 'IT',
    city: 'Rome',
    cuts: [{ slug: 'rome-centre', box: cutAround(41.8919, 12.5113), signature: true }],
    lesson:
      "Rome's centre is a medieval city poured into an ancient one: streets bend around the Pantheon and Piazza Navona still traces the outline of Domitian's stadium.",
  },
  {
    country: 'CA',
    city: 'Ottawa',
    cuts: [{ slug: 'ottawa-centre', box: cutAround(45.4112, -75.6981), signature: true }],
    lesson:
      'The Rideau Canal was cut in the 1820s as a military bypass of the St Lawrence, and Ottawa grew along it — the waterway came first and the capital followed.',
  },
  {
    country: 'NO',
    city: 'Oslo',
    cuts: [{ slug: 'oslo-centre', box: cutAround(59.9127, 10.7461), signature: true }],
    lesson:
      "Christian IV rebuilt Oslo on a grid in 1624 after fire took the medieval town, and the fjord's head still decides where every street can run.",
  },
  {
    country: 'MX',
    city: 'Mexico City',
    cuts: [{ slug: 'mexico-city-centre', box: cutAround(19.4285, -99.1327), signature: true }],
    lesson:
      "The Zócalo sits on the ruins of Tenochtitlan's sacred precinct: the Spanish grid was laid over an Aztec island city, and the lake beneath is why the ground still sinks.",
  },
  {
    country: 'CZ',
    city: 'Prague',
    cuts: [{ slug: 'prague-centre', box: cutAround(50.088, 14.4208), signature: true }],
    lesson:
      'The Vltava splits Prague into castle and town, and the Charles Bridge held a monopoly on crossing it for five hundred years.',
  },
  {
    country: 'PL',
    city: 'Warsaw',
    // Framed on the Old Town and the escarpment it stands on rather than the
    // commercial centre: the first cut sat west of the Vistula and showed 1%
    // water, which loses the river the city was built to watch over.
    cuts: [{ slug: 'warsaw-centre', box: cutAround(52.245, 21.025), signature: true }],
    lesson:
      "Warsaw's old town is a 1950s reconstruction of what the Wehrmacht demolished in 1944 — the medieval plan rebuilt deliberately, from Canaletto's paintings.",
  },
  {
    country: 'ID',
    city: 'Jakarta',
    cuts: [{ slug: 'jakarta-centre', box: cutAround(-6.1751, 106.8272), signature: true }],
    lesson:
      'Batavia was built as a Dutch canal town on the equator, and the canals that killed its colonists with malaria still thread the old city.',
  },
  {
    country: 'AU',
    city: 'Canberra',
    cuts: [{ slug: 'canberra-centre', box: cutAround(-35.2835, 149.1281), signature: true }],
    lesson:
      'Griffin won the 1912 competition with a geometry of circles and axes aimed at the hills — a capital designed whole, before anyone lived in it.',
  },
  {
    country: 'IR',
    city: 'Tehran',
    cuts: [{ slug: 'tehran-centre', box: cutAround(35.6944, 51.4215), signature: true }],
    lesson:
      'Tehran climbs from the desert plain into the Alborz foothills, so its long avenues run north-south with the slope and the wealthy live uphill.',
  },
  {
    country: 'AT',
    city: 'Vienna',
    cuts: [{ slug: 'vienna-centre', box: cutAround(48.2085, 16.3721), signature: true }],
    lesson:
      'The Ringstrasse is the city wall: Franz Joseph ordered the fortifications demolished in 1857 and a boulevard of public palaces built on the cleared ground.',
  },
  {
    country: 'CH',
    city: 'Bern',
    cuts: [{ slug: 'bern-centre', box: cutAround(46.9481, 7.4474), signature: true }],
    lesson:
      'Bern sits in a tight loop of the Aare, and the medieval town simply fills the peninsula the river left — defence by geography.',
  },
  {
    country: 'BE',
    city: 'Brussels',
    cuts: [{ slug: 'brussels-centre', box: cutAround(50.8467, 4.3499), signature: true }],
    lesson:
      'The Grand-Place is the hub of a medieval street web, and the Senne that once ran through it was vaulted over in the 1860s and turned into boulevards.',
  },
  {
    country: 'NZ',
    city: 'Wellington',
    cuts: [{ slug: 'wellington-centre', box: cutAround(-41.2866, 174.7756), signature: true }],
    lesson:
      'Wellington is pinned between harbour and fault-line hills, so its centre is built partly on land the 1855 earthquake lifted out of the sea.',
  },
  {
    country: 'DK',
    city: 'Copenhagen',
    cuts: [{ slug: 'copenhagen-centre', box: cutAround(55.6759, 12.5655), signature: true }],
    lesson:
      "Copenhagen's centre is a ring of star-fort ramparts turned into parks and lakes, with a dense medieval core behind them.",
  },
  {
    country: 'IE',
    city: 'Dublin',
    cuts: [{ slug: 'dublin-centre', box: cutAround(53.3465, -6.265), signature: true }],
    lesson:
      'The Liffey divides Georgian Dublin, and the Wide Streets Commission cut straight avenues through the medieval fabric from 1757 to make it a modern capital.',
  },
  {
    country: 'UA',
    city: 'Kyiv',
    cuts: [{ slug: 'kyiv-centre', box: cutAround(50.4547, 30.5238), signature: true }],
    lesson:
      "Kyiv stands on the Dnieper's high right bank, and Khreshchatyk runs along a filled ravine — the valley decided the city's main street.",
  },
  {
    country: 'TR',
    city: 'Ankara',
    cuts: [{ slug: 'ankara-centre', box: cutAround(39.9199, 32.8543), signature: false }],
    lesson:
      'Ankara was a provincial town of 20,000 when Atatürk made it capital in 1923; the planned grid to the south is deliberately unlike the citadel hill it replaced.',
  },
  {
    country: 'TW',
    city: 'Taipei',
    cuts: [{ slug: 'taipei-centre', box: cutAround(25.04, 121.515), signature: true }],
    lesson:
      "Taipei's walled Qing city was demolished by the Japanese in 1904 and replaced with boulevards — the wall's footprint is now a rectangle of wide roads.",
  },
  {
    country: 'RO',
    city: 'Bucharest',
    cuts: [{ slug: 'bucharest-centre', box: cutAround(44.4323, 26.1063), signature: true }],
    lesson:
      'Ceaușescu levelled a fifth of old Bucharest in the 1980s for the Centrul Civic, and its monumental axis cuts across the older organic streets.',
  },
  {
    country: 'HU',
    city: 'Budapest',
    cuts: [{ slug: 'budapest-centre', box: cutAround(47.4984, 19.0404), signature: true }],
    lesson:
      "Buda's hills and Pest's flat plain were separate cities until 1873, and the Danube between them is bridged in a deliberate ceremonial sequence.",
  },
  {
    country: 'GR',
    city: 'Athens',
    cuts: [{ slug: 'athens-centre', box: cutAround(37.976, 23.73), signature: true }],
    lesson:
      "The 1833 plan laid a neoclassical triangle between the Acropolis and the new palace, and Plaka's lanes below the rock are what survived from Ottoman Athens.",
  },
  {
    country: 'PT',
    city: 'Lisbon',
    cuts: [{ slug: 'lisbon-centre', box: cutAround(38.71, -9.1385), signature: true }],
    lesson:
      "The Baixa is Europe's first earthquake-resistant grid: Pombal rebuilt it on a strict rectangle after the 1755 quake, framed by hills that kept their old streets.",
  },
  {
    country: 'MY',
    city: 'Kuala Lumpur',
    cuts: [{ slug: 'kuala-lumpur-centre', box: cutAround(3.1478, 101.6953), signature: true }],
    lesson:
      "Kuala Lumpur means 'muddy confluence', and the city began exactly where the Klang and Gombak rivers meet — the tin-mining camp's junction is still its centre.",
  },
  {
    country: 'TH',
    city: 'Bangkok',
    cuts: [{ slug: 'bangkok-centre', box: cutAround(13.75, 100.4913), signature: true }],
    lesson:
      "Rattanakosin island was cut from the mainland by canals in 1782 to make a defensible royal city, and the khlong network was Bangkok's road system for a century.",
  },
  {
    country: 'PE',
    city: 'Lima',
    cuts: [{ slug: 'lima-centre', box: cutAround(-12.0464, -77.03), signature: true }],
    lesson:
      "Pizarro laid Lima out in 1535 on the Laws of the Indies grid, and the Rímac's valley walls are what finally stopped it spreading.",
  },
  {
    country: 'CL',
    city: 'Santiago',
    cuts: [{ slug: 'santiago-centre', box: cutAround(-33.4372, -70.6506), signature: true }],
    lesson:
      "Santiago's grid was staked out in 1541 between the Mapocho and a hill, and the Alameda follows the river channel the Spanish filled in.",
  },
  {
    country: 'CO',
    city: 'Bogotá',
    cuts: [{ slug: 'bogota-centre', box: cutAround(4.5981, -74.0758), signature: true }],
    lesson:
      'Bogotá is a colonial grid pressed against the Andean escarpment: the mountains stop it dead to the east, so the city could only grow north and south.',
  },
  {
    country: 'PH',
    city: 'Manila',
    cuts: [{ slug: 'manila-centre', box: cutAround(14.5906, 120.9799), signature: true }],
    lesson:
      'Intramuros is a Spanish walled city with its own moat, and the Pasig separating it from the rest of Manila is why the old town still reads as a fortress.',
  },
  {
    country: 'VN',
    city: 'Hanoi',
    cuts: [{ slug: 'hanoi-centre', box: cutAround(21.0333, 105.85), signature: true }],
    lesson:
      "Hanoi's Old Quarter is the 36 guild streets, each once a single trade, and the French laid a boulevard grid beside it rather than through it.",
  },
  {
    country: 'SG',
    city: 'Singapore',
    cuts: [{ slug: 'singapore-centre', box: cutAround(1.285, 103.85), signature: true }],
    lesson:
      "Raffles' 1822 plan zoned Singapore by ethnicity into separate quarters, and the Singapore River between them was the port that paid for all of it.",
  },
  {
    country: 'RS',
    city: 'Belgrade',
    cuts: [{ slug: 'belgrade-centre', box: cutAround(44.8186, 20.456), signature: true }],
    lesson:
      "Belgrade's fortress sits exactly where the Sava meets the Danube, which is why the city has been besieged more often than almost any other in Europe.",
  },
  {
    country: 'HR',
    city: 'Zagreb',
    cuts: [{ slug: 'zagreb-centre', box: cutAround(45.8144, 15.978), signature: true }],
    lesson:
      "Zagreb's Lower Town is the Green Horseshoe — a U of parks and public buildings laid out in the 1880s below the two medieval hill settlements.",
  },
  {
    country: 'BD',
    city: 'Dhaka',
    cuts: [{ slug: 'dhaka-centre', box: cutAround(23.7104, 90.4074), signature: true }],
    lesson:
      "Old Dhaka's lanes were laid for Mughal river trade on the Buriganga, and the planned blocks north of them are twentieth-century additions to a river city.",
  },
  {
    country: 'KZ',
    city: 'Astana',
    cuts: [{ slug: 'astana-centre', box: cutAround(51.128, 71.4304), signature: true }],
    lesson:
      "Astana's left bank was empty steppe until 1997: Kurokawa's plan runs one monumental axis from the presidential palace, built whole in two decades.",
  },
  {
    country: 'UY',
    city: 'Montevideo',
    cuts: [{ slug: 'montevideo-centre', box: cutAround(-34.908, -56.2), signature: true }],
    lesson:
      "Montevideo's Ciudad Vieja is a grid on a peninsula guarding the bay, and the Rambla wraps the whole waterfront as a single continuous road.",
  },
  {
    country: 'KE',
    city: 'Nairobi',
    cuts: [{ slug: 'nairobi-centre', box: cutAround(-1.2864, 36.8172), signature: true }],
    lesson:
      'Nairobi began in 1899 as a railway depot on swampy ground, and the yards where the line halted are still the seam its street grid bends around.',
  },
  {
    country: 'ZA',
    city: 'Pretoria',
    cuts: [{ slug: 'pretoria-centre', box: cutAround(-25.7449, 28.1878), signature: true }],
    lesson:
      'Herbert Baker set the Union Buildings on a hillside above Pretoria in 1910 so the government would look down a formal axis at the city it governed.',
  },
  {
    country: 'MA',
    city: 'Rabat',
    cuts: [{ slug: 'rabat-centre', box: cutAround(34.0209, -6.8416), signature: true }],
    lesson:
      "Rabat has a walled medina and, beside it, Lyautey's 1912 French ville nouvelle — colonial policy was to build alongside the old city rather than through it.",
  },
  {
    country: 'IL',
    city: 'Jerusalem',
    cuts: [{ slug: 'jerusalem-centre', box: cutAround(31.7767, 35.2345), signature: true }],
    lesson:
      "The Old City's quarters sit inside Suleiman's 1538 walls, and the grid outside them is nineteenth-century expansion once building beyond the gates became safe.",
  },
  {
    country: 'SI',
    city: 'Ljubljana',
    cuts: [{ slug: 'ljubljana-centre', box: cutAround(46.05, 14.506), signature: true }],
    lesson:
      "Plečnik reshaped Ljubljana between the wars as a single architectural work, treating the Ljubljanica's embankments and bridges as the city's spine.",
  },
  {
    country: 'BY',
    city: 'Minsk',
    cuts: [{ slug: 'minsk-centre', box: cutAround(53.902, 27.5615), signature: true }],
    lesson:
      'Minsk was rebuilt almost entirely after 1944, so its centre is a Stalinist ensemble: one monumental avenue, and superblocks rather than streets.',
  },
  {
    country: 'AM',
    city: 'Yerevan',
    cuts: [{ slug: 'yerevan-centre', box: cutAround(40.183, 44.515), signature: true }],
    lesson:
      "Tamanian's 1924 plan wrapped Yerevan in a ring boulevard around a radial core, and the pink tuff it is faced in came from the same quarries throughout.",
  },
  {
    country: 'SK',
    city: 'Bratislava',
    cuts: [{ slug: 'bratislava-centre', box: cutAround(48.144, 17.107), signature: true }],
    lesson:
      "Bratislava's old town is a compact medieval core under a castle hill, cut through in the 1970s by a motorway and bridge that took part of the Jewish quarter.",
  },
  {
    country: 'BG',
    city: 'Sofia',
    cuts: [{ slug: 'sofia-centre', box: cutAround(42.6975, 23.3241), signature: true }],
    lesson:
      "Sofia's yellow-paved centre is a planned 1880s capital laid over Roman Serdica, whose street grid is still visible in the excavations beneath it.",
  },
  {
    country: 'LT',
    city: 'Vilnius',
    cuts: [{ slug: 'vilnius-centre', box: cutAround(54.6816, 25.287), signature: true }],
    lesson:
      "Vilnius has one of Europe's largest surviving Gothic old towns, its lanes curving to the Neris and Vilnia rivers rather than to any plan.",
  },
  {
    country: 'EE',
    city: 'Tallinn',
    cuts: [{ slug: 'tallinn-centre', box: cutAround(59.437, 24.745), signature: true }],
    lesson:
      "Tallinn's upper and lower towns are two separate walled settlements — nobility on the limestone hill, merchants below — with the Hanseatic wall still around both.",
  },
  {
    country: 'LV',
    city: 'Riga',
    cuts: [{ slug: 'riga-centre', box: cutAround(56.949, 24.105), signature: true }],
    lesson:
      "Riga's medieval core is ringed by a park where the ramparts were, and beyond it stands the densest collection of Art Nouveau buildings in Europe.",
  },
  {
    country: 'VE',
    city: 'Caracas',
    cuts: [{ slug: 'caracas-centre', box: cutAround(10.5, -66.9146), signature: true }],
    lesson:
      "Caracas fills a narrow valley under the Ávila, so it can only grow east and west, and the motorway down its length is the city's only through route.",
  },
  {
    country: 'DZ',
    city: 'Algiers',
    cuts: [{ slug: 'algiers-centre', box: cutAround(36.785, 3.06), signature: true }],
    lesson:
      'The Casbah tumbles down its hillside in stepped lanes no vehicle can climb, and the French built an arcaded waterfront below it after 1830.',
  },
  {
    country: 'UG',
    city: 'Kampala',
    cuts: [{ slug: 'kampala-centre', box: cutAround(0.3163, 32.5822), signature: false }],
    lesson:
      "Kampala was built across seven hills, each historically a different institution's, so its road network radiates from hilltop to hilltop.",
  },
  {
    country: 'AF',
    city: 'Kabul',
    cuts: [{ slug: 'kabul-centre', box: cutAround(34.5281, 69.1723), signature: false }],
    lesson:
      'Kabul sits in a bowl between mountains on the old road to India, and the Kabul river through the middle is the line the bazaars grew along.',
  },
  {
    country: 'MK',
    city: 'Skopje',
    cuts: [{ slug: 'skopje-centre', box: cutAround(41.9965, 21.4314), signature: true }],
    lesson:
      "After the 1963 earthquake Skopje was rebuilt to Kenzō Tange's plan, so a brutalist centre stands directly across the Vardar from an Ottoman bazaar.",
  },
  {
    country: 'BA',
    city: 'Sarajevo',
    cuts: [{ slug: 'sarajevo-centre', box: cutAround(43.8563, 18.4131), signature: true }],
    lesson:
      'Sarajevo runs along a single valley, and you can walk from Ottoman bazaar to Austro-Hungarian boulevard in one straight line where the two empires met.',
  },
  {
    country: 'MM',
    city: 'Naypyidaw',
    cuts: [{ slug: 'naypyidaw-centre', box: cutAround(19.7633, 96.0785), signature: true }],
    lesson:
      'Naypyidaw was built from nothing after 2005 with twenty-lane highways and no crowds — a capital laid out at a scale its population has never filled.',
  },
  {
    country: 'CD',
    city: 'Kinshasa',
    cuts: [{ slug: 'kinshasa-centre', box: cutAround(-4.305, 15.31), signature: true }],
    lesson:
      'Kinshasa faces Brazzaville across the Congo, the only place on earth where two national capitals sit within sight of each other.',
  },
  {
    country: 'AO',
    city: 'Luanda',
    cuts: [{ slug: 'luanda-centre', box: cutAround(-8.815, 13.23), signature: true }],
    lesson:
      "Luanda's colonial core wraps a bay behind a sand spit, and the Marginal along the water is the city's ceremonial front.",
  },
  {
    country: 'ET',
    city: 'Addis Ababa',
    cuts: [{ slug: 'addis-ababa-centre', box: cutAround(9.025, 38.7469), signature: false }],
    lesson:
      "Addis Ababa was founded in 1886 around Menelik's palace on high ground, and its roads still radiate from that compound rather than from any grid.",
  },
  {
    country: 'GH',
    city: 'Accra',
    cuts: [{ slug: 'accra-centre', box: cutAround(5.55, -0.2), signature: false }],
    lesson:
      'Accra grew from three separate coastal forts — Danish, Dutch and British — which is why its old districts still read as distinct towns.',
  },
  {
    country: 'TZ',
    city: 'Dodoma',
    cuts: [{ slug: 'dodoma-centre', box: cutAround(-6.173, 35.7469), signature: false }],
    lesson:
      'Dodoma was made capital in 1974 to move government inland from Dar es Salaam, and its wide planned avenues are still filling in.',
  },
  {
    country: 'SN',
    city: 'Dakar',
    cuts: [{ slug: 'dakar-centre', box: cutAround(14.6928, -17.4467), signature: true }],
    lesson:
      "Dakar sits on the westernmost point of Africa, and the Plateau's colonial grid ends abruptly at cliffs above the Atlantic.",
  },
  {
    country: 'CI',
    city: 'Yamoussoukro',
    cuts: [{ slug: 'yamoussoukro-centre', box: cutAround(6.8276, -5.2893), signature: false }],
    lesson:
      "Yamoussoukro was Houphouët-Boigny's home village, made capital in 1983 and given motorway-width boulevards for a population that never arrived.",
  },
  {
    country: 'PA',
    city: 'Panama City',
    cuts: [{ slug: 'panama-city-centre', box: cutAround(8.955, -79.535), signature: true }],
    lesson:
      "Casco Viejo was rebuilt on a defensible peninsula in 1673 after pirates burned the first city, and the canal's Pacific entrance is its reason for existing.",
  },
  {
    country: 'CR',
    city: 'San José',
    cuts: [{ slug: 'san-jose-centre', box: cutAround(9.9333, -84.08), signature: false }],
    lesson:
      'San José is a colonial grid on the Central Valley floor, laid out where the coffee estates that funded the country met.',
  },
  {
    country: 'GT',
    city: 'Guatemala City',
    cuts: [{ slug: 'guatemala-city-centre', box: cutAround(14.635, -90.513), signature: true }],
    lesson:
      'Guatemala City was founded in 1776 after earthquakes destroyed Antigua, and its grid is numbered by zone rather than named.',
  },
  {
    country: 'EC',
    city: 'Quito',
    cuts: [{ slug: 'quito-centre', box: cutAround(-0.22, -78.5125), signature: true }],
    lesson:
      'Quito runs 40km along a narrow Andean shelf at 2,850m, so the colonial centre is a grid squeezed between volcano slopes.',
  },
  {
    country: 'BO',
    city: 'La Paz',
    cuts: [{ slug: 'la-paz-centre', box: cutAround(-16.4955, -68.1336), signature: true }],
    lesson:
      'La Paz is built inside a canyon to shelter from the altiplano wind, and its streets climb the walls so steeply that cable cars became public transport.',
  },
  {
    country: 'PY',
    city: 'Asunción',
    cuts: [{ slug: 'asuncion-centre', box: cutAround(-25.282, -57.635), signature: false }],
    lesson:
      "Asunción's grid faces the Paraguay river, the highway that made it the first Spanish base in the region.",
  },
  {
    country: 'JO',
    city: 'Amman',
    cuts: [{ slug: 'amman-centre', box: cutAround(31.95, 35.933), signature: false }],
    lesson:
      'Amman is built over nineteen hills around a Roman theatre, and its downtown sits in the wadi where all the slopes drain.',
  },
  {
    country: 'LB',
    city: 'Beirut',
    cuts: [{ slug: 'beirut-centre', box: cutAround(33.8938, 35.5018), signature: true }],
    lesson:
      "Beirut's centre was rebuilt after 1990 on the Green Line that had split the city for fifteen years — the war's dividing street became a boulevard.",
  },
  {
    country: 'QA',
    city: 'Doha',
    cuts: [{ slug: 'doha-centre', box: cutAround(25.2867, 51.5333), signature: true }],
    lesson:
      "Doha's Corniche curves around a dredged bay, and West Bay's towers stand on land that was seabed within living memory.",
  },
  {
    country: 'AE',
    city: 'Abu Dhabi',
    cuts: [{ slug: 'abu-dhabi-centre', box: cutAround(24.4667, 54.3667), signature: true }],
    lesson:
      'Abu Dhabi is a 1960s grid on an island, laid out with superblocks wide enough that the interiors became their own neighbourhoods.',
  },
  {
    country: 'KW',
    city: 'Kuwait City',
    cuts: [{ slug: 'kuwait-city-centre', box: cutAround(29.3759, 47.9774), signature: true }],
    lesson:
      "Kuwait City's ring roads trace the mud wall demolished in 1957, so the old town's footprint survives as motorway geometry.",
  },
  {
    country: 'SA',
    city: 'Riyadh',
    cuts: [{ slug: 'riyadh-centre', box: cutAround(24.6333, 46.7167), signature: false }],
    lesson:
      "Riyadh's Diriyah roots are mud-brick, but the modern city is a superblock grid across open desert with no geography to bend it.",
  },
  {
    country: 'UZ',
    city: 'Tashkent',
    cuts: [{ slug: 'tashkent-centre', box: cutAround(41.3111, 69.2797), signature: true }],
    lesson:
      'Tashkent was rebuilt after the 1966 earthquake as a Soviet showcase, so wide avenues and microdistricts sit beside the surviving old-town mahallas.',
  },
  {
    country: 'AZ',
    city: 'Baku',
    cuts: [{ slug: 'baku-centre', box: cutAround(40.3667, 49.8352), signature: true }],
    lesson:
      "Baku's walled Icherisheher stands on a bay, ringed by oil-boom mansions built when the city produced half the world's petroleum.",
  },
  {
    country: 'GE',
    city: 'Tbilisi',
    cuts: [{ slug: 'tbilisi-centre', box: cutAround(41.6938, 44.8015), signature: true }],
    lesson:
      "Tbilisi is squeezed into the Kura gorge, and its old town's balconied houses step up the valley sides because there is nowhere flat to build.",
  },
  {
    country: 'NP',
    city: 'Kathmandu',
    cuts: [{ slug: 'kathmandu-centre', box: cutAround(27.704, 85.308), signature: true }],
    lesson:
      "Kathmandu's Durbar Square is the centre of a medieval Newar city, its lanes woven between courtyards rather than laid out along streets.",
  },
  {
    country: 'LK',
    city: 'Colombo',
    cuts: [{ slug: 'colombo-centre', box: cutAround(6.935, 79.8487), signature: false }],
    lesson:
      "Colombo's Fort and Pettah are Dutch and British layers on a natural harbour, with the Beira Lake behind them as the old defensive water.",
  },
  {
    country: 'MN',
    city: 'Ulaanbaatar',
    aliases: ['Ulan Bator'],
    cuts: [{ slug: 'ulaanbaatar-centre', box: cutAround(47.92, 106.918), signature: true }],
    lesson:
      'Ulaanbaatar was a movable monastery town until the 1920s; the Soviet grid at its centre is ringed by ger districts that kept the older pattern.',
  },
  {
    country: 'KH',
    city: 'Phnom Penh',
    cuts: [{ slug: 'phnom-penh-centre', box: cutAround(11.5625, 104.916), signature: true }],
    lesson:
      'Phnom Penh sits at the confluence where the Mekong meets the Tonlé Sap, a river that reverses direction twice a year.',
  },
  {
    country: 'LA',
    city: 'Vientiane',
    cuts: [{ slug: 'vientiane-centre', box: cutAround(17.966, 102.6), signature: false }],
    lesson:
      'Vientiane spreads along one bank of the Mekong, with Lan Xang Avenue driven through as a ceremonial axis in the 1950s.',
  },
  {
    country: 'NG',
    city: 'Abuja',
    cuts: [{ slug: 'abuja-centre', box: cutAround(9.0579, 7.4951), signature: true }],
    lesson:
      'Abuja was planned from 1980 to replace Lagos with a neutral federal capital, its axis aimed squarely at the granite monolith of Aso Rock.',
  },
  {
    country: 'YE',
    city: 'Sanaa',
    cuts: [{ slug: 'sanaa-centre', box: cutAround(15.352, 44.207), signature: true }],
    lesson:
      "Sanaa's old city has been inhabited for 2,500 years, its tower houses of rammed earth and gypsum stacked six storeys inside a surviving wall.",
  },
  {
    country: 'CM',
    city: 'Yaoundé',
    cuts: [{ slug: 'yaounde-centre', box: cutAround(3.8667, 11.5167), signature: false }],
    lesson:
      'Yaoundé is spread over seven hills, so its roads wind along contours and the valleys between them flood in the rains.',
  },
  {
    country: 'IS',
    city: 'Reykjavík',
    cuts: [{ slug: 'reykjavik-centre', box: cutAround(64.147, -21.94), signature: true }],
    lesson:
      "Reykjavík is the world's northernmost capital, its old centre a small grid of timber and corrugated iron between a pond and the harbour.",
  },
  {
    country: 'TN',
    city: 'Tunis',
    cuts: [{ slug: 'tunis-centre', box: cutAround(36.798, 10.176), signature: true }],
    lesson:
      'Tunis pairs a UNESCO medina of covered souks with a French ville nouvelle whose Avenue Habib Bourguiba was built on a filled lagoon.',
  },
  {
    country: 'IQ',
    city: 'Baghdad',
    cuts: [{ slug: 'baghdad-centre', box: cutAround(33.315, 44.366), signature: true }],
    lesson:
      'Baghdad was founded in 762 as a perfectly circular city; nothing of that plan survives, but the Tigris through the middle still orders everything.',
  },
  {
    country: 'SY',
    city: 'Damascus',
    cuts: [{ slug: 'damascus-centre', box: cutAround(33.511, 36.306), signature: true }],
    lesson:
      'Damascus claims the longest continuous habitation of any city, and the Street Called Straight still runs the line the Romans gave it.',
  },
  {
    country: 'AL',
    city: 'Tirana',
    cuts: [{ slug: 'tirana-centre', box: cutAround(41.3275, 19.8187), signature: true }],
    lesson:
      "Tirana's centre is an Italian rationalist axis from the 1930s, its buildings later painted in blocks of colour to lift a grey socialist city.",
  },
  {
    country: 'DO',
    city: 'Santo Domingo',
    cuts: [{ slug: 'santo-domingo-centre', box: cutAround(18.473, -69.884), signature: true }],
    lesson:
      "Santo Domingo's Zona Colonial is the oldest permanent European settlement in the Americas, and its grid became the template for Spanish colonial towns.",
  },
  {
    country: 'SD',
    city: 'Khartoum',
    cuts: [{ slug: 'khartoum-centre', box: cutAround(15.588, 32.534), signature: true }],
    lesson:
      'Khartoum sits exactly where the Blue and White Niles meet, and Kitchener is said to have laid its streets in a Union Jack pattern.',
  },
  {
    country: 'ZW',
    city: 'Harare',
    cuts: [{ slug: 'harare-centre', box: cutAround(-17.829, 31.053), signature: false }],
    lesson:
      'Harare was laid out in 1890 as a colonial grid on the Mashonaland plateau, its blocks generous because land was taken as unlimited.',
  },
  {
    country: 'LU',
    city: 'Luxembourg',
    cuts: [{ slug: 'luxembourg-centre', box: cutAround(49.611, 6.13), signature: true }],
    lesson:
      'Luxembourg City is built around deep gorges cut by the Alzette, and its fortress walls used the cliffs themselves as ramparts.',
  },
  {
    country: 'CY',
    city: 'Nicosia',
    cuts: [{ slug: 'nicosia-centre', box: cutAround(35.172, 33.365), signature: true }],
    lesson:
      'Nicosia is the last divided capital in Europe, its Venetian star-fort walls enclosing a centre split by a buffer zone since 1974.',
  },
  {
    country: 'BF',
    city: 'Ouagadougou',
    cuts: [{ slug: 'ouagadougou-centre', box: cutAround(12.37, -1.525), signature: false }],
    lesson:
      'Ouagadougou grew outward from a royal Mossi compound, so a colonial grid sits over an older radial pattern of neighbourhoods.',
  },
  {
    country: 'LY',
    city: 'Tripoli',
    cuts: [{ slug: 'tripoli-centre', box: cutAround(32.895, 13.18), signature: true }],
    lesson:
      "Tripoli's walled medina stands beside a Roman arch and an Italian colonial waterfront, three occupations layered on one harbour.",
  },
  {
    country: 'MD',
    city: 'Chișinău',
    cuts: [{ slug: 'chisinau-centre', box: cutAround(47.0245, 28.8325), signature: true }],
    lesson:
      'Chișinău was laid out on a Russian imperial grid in the 1830s and rebuilt after 1944, its streets unusually wide and green for the region.',
  },
  {
    country: 'ZM',
    city: 'Lusaka',
    cuts: [{ slug: 'lusaka-centre', box: cutAround(-15.416, 28.283), signature: false }],
    lesson:
      'Lusaka was planned as a garden city in 1931 around a single main road, and Cairo Road is still the axis everything else answers to.',
  },
  {
    country: 'KG',
    city: 'Bishkek',
    cuts: [{ slug: 'bishkek-centre', box: cutAround(42.8746, 74.6122), signature: true }],
    lesson:
      'Bishkek is a Russian military grid from 1878, laid with irrigation channels along every street so the steppe city could keep its trees.',
  },
  {
    country: 'ME',
    city: 'Podgorica',
    cuts: [{ slug: 'podgorica-centre', box: cutAround(42.441, 19.262), signature: false }],
    lesson:
      'Podgorica sits where five rivers meet, rebuilt almost entirely after 1944 bombing, so its centre is post-war rather than Ottoman.',
  },
  {
    country: 'MZ',
    city: 'Maputo',
    cuts: [{ slug: 'maputo-centre', box: cutAround(-25.966, 32.583), signature: true }],
    lesson:
      "Maputo's Baixa is a Portuguese grid on a bay, its streets named for revolutionaries after independence but their geometry unchanged.",
  },
  {
    country: 'MG',
    city: 'Antananarivo',
    cuts: [{ slug: 'antananarivo-centre', box: cutAround(-18.91, 47.525), signature: true }],
    lesson:
      "Antananarivo means 'city of a thousand', and it climbs a long ridge in stairways because the royal palace claimed the summit.",
  },
  {
    country: 'HN',
    city: 'Tegucigalpa',
    cuts: [{ slug: 'tegucigalpa-centre', box: cutAround(14.082, -87.207), signature: false }],
    lesson:
      'Tegucigalpa is wrapped around hills and split by the Choluteca river from its twin Comayagüela — one capital that was two towns.',
  },
  {
    country: 'KP',
    city: 'Pyongyang',
    cuts: [{ slug: 'pyongyang-centre', box: cutAround(39.019, 125.755), signature: true }],
    lesson:
      'Pyongyang was rebuilt from almost nothing after 1953 as a socialist showpiece: monumental axes, vast plazas, and towers set to be seen from them.',
  },
  {
    country: 'CG',
    city: 'Brazzaville',
    cuts: [{ slug: 'brazzaville-centre', box: cutAround(-4.267, 15.283), signature: true }],
    lesson:
      'Brazzaville faces Kinshasa across the Congo rapids, and the pool between them is why both cities exist where the river stops being navigable.',
  },
  {
    country: 'HT',
    city: 'Port-au-Prince',
    cuts: [{ slug: 'port-au-prince-centre', box: cutAround(18.544, -72.339), signature: false }],
    lesson:
      'Port-au-Prince is a grid on a bay backed by steep hills, much of it rebuilt after the 2010 earthquake levelled the centre.',
  },
  {
    country: 'MT',
    city: 'Valletta',
    cuts: [{ slug: 'valletta-centre', box: cutAround(35.899, 14.514), signature: true }],
    lesson:
      'Valletta is a 1566 grid on a fortified peninsula, laid out by the Knights so sea breezes would run straight down every street.',
  },
  {
    country: 'ML',
    city: 'Bamako',
    cuts: [{ slug: 'bamako-centre', box: cutAround(12.65, -8.0), signature: false }],
    lesson:
      'Bamako spreads along both banks of the Niger, and the bridges over it are the bottleneck the whole city queues for.',
  },
  {
    country: 'SO',
    city: 'Mogadishu',
    cuts: [{ slug: 'mogadishu-centre', box: cutAround(2.04, 45.34), signature: false }],
    lesson:
      "Mogadishu's Hamar Weyne is a medieval Swahili-coast trading quarter of coral-stone lanes, beside an Italian colonial grid.",
  },
  {
    country: 'RW',
    city: 'Kigali',
    cuts: [{ slug: 'kigali-centre', box: cutAround(-1.944, 30.061), signature: true }],
    lesson:
      'Kigali is built across a series of ridges and valleys, so its roads run along the crests and the marshland below stays largely unbuilt.',
  },
  {
    country: 'NE',
    city: 'Niamey',
    cuts: [{ slug: 'niamey-centre', box: cutAround(13.512, 2.112), signature: false }],
    lesson:
      "Niamey sits on the Niger's left bank, a colonial grid that grew from a fishing village once the French made it a capital in 1926.",
  },
  {
    country: 'MW',
    city: 'Lilongwe',
    cuts: [{ slug: 'lilongwe-centre', box: cutAround(-13.983, 33.783), signature: false }],
    lesson:
      'Lilongwe was made capital in 1975 and built as two separate centres — old town and city centre — deliberately kept apart by a nature reserve.',
  },
  {
    country: 'SV',
    city: 'San Salvador',
    cuts: [{ slug: 'san-salvador-centre', box: cutAround(13.699, -89.191), signature: false }],
    lesson:
      "San Salvador's grid sits directly beneath a volcano, and its centre has been rebuilt after earthquakes more than a dozen times.",
  },
  {
    country: 'OM',
    city: 'Muscat',
    cuts: [{ slug: 'muscat-centre', box: cutAround(23.614, 58.592), signature: true }],
    lesson:
      'Muscat is squeezed between mountains and sea, its old harbour flanked by two Portuguese forts on the rock above.',
  },
  {
    country: 'XK',
    city: 'Pristina',
    cuts: [{ slug: 'pristina-centre', box: cutAround(42.663, 21.162), signature: false }],
    lesson:
      "Pristina's Ottoman core was largely cleared under Yugoslav planning, leaving modernist blocks where the old bazaar quarter stood.",
  },
  {
    country: 'JM',
    city: 'Kingston',
    cuts: [{ slug: 'kingston-centre', box: cutAround(17.977, -76.793), signature: true }],
    lesson:
      'Kingston was laid out on a grid in 1692 for refugees from the earthquake that sank Port Royal across the harbour.',
  },
  {
    country: 'NI',
    city: 'Managua',
    cuts: [{ slug: 'managua-centre', box: cutAround(12.136, -86.251), signature: false }],
    lesson:
      "Managua has no real downtown: the 1972 earthquake destroyed it and the centre was never rebuilt, leaving open ground at the city's heart.",
  },
  {
    country: 'BW',
    city: 'Gaborone',
    cuts: [{ slug: 'gaborone-centre', box: cutAround(-24.654, 25.908), signature: false }],
    lesson:
      'Gaborone was built from scratch in three years before independence in 1966, arranged around a central mall rather than a colonial grid.',
  },
  {
    country: 'TJ',
    city: 'Dushanbe',
    cuts: [{ slug: 'dushanbe-centre', box: cutAround(38.56, 68.787), signature: true }],
    lesson:
      "Dushanbe means 'Monday', after the village market that stood here before the Soviets built a capital on a single tree-lined avenue.",
  },
  {
    country: 'NA',
    city: 'Windhoek',
    cuts: [{ slug: 'windhoek-centre', box: cutAround(-22.57, 17.084), signature: false }],
    lesson:
      "Windhoek's Independence Avenue runs the length of a valley between hills, with German colonial buildings still lining the centre.",
  },
  {
    country: 'GA',
    city: 'Libreville',
    cuts: [{ slug: 'libreville-centre', box: cutAround(0.39, 9.454), signature: false }],
    lesson:
      'Libreville was founded for freed slaves in 1849 and grew along the estuary shore, so it is long, thin and entirely coastal.',
  },
  {
    country: 'SR',
    city: 'Paramaribo',
    cuts: [{ slug: 'paramaribo-centre', box: cutAround(5.826, -55.167), signature: true }],
    lesson:
      "Paramaribo's historic centre is Dutch colonial timber architecture on a grid, laid along a bend of the Suriname river.",
  },
  {
    country: 'TT',
    city: 'Port of Spain',
    cuts: [{ slug: 'port-of-spain-centre', box: cutAround(10.66, -61.515), signature: false }],
    lesson:
      "Port of Spain's grid runs from the waterfront to the Queen's Park Savannah, a former sugar estate kept as open ground.",
  },
  {
    country: 'MR',
    city: 'Nouakchott',
    cuts: [{ slug: 'nouakchott-centre', box: cutAround(18.079, -15.965), signature: false }],
    lesson:
      'Nouakchott was a village of a few hundred when chosen as capital in 1958, and its grid has been advancing into the Sahara ever since.',
  },
  {
    country: 'SL',
    city: 'Freetown',
    cuts: [{ slug: 'freetown-centre', box: cutAround(8.484, -13.234), signature: false }],
    lesson:
      "Freetown was settled in 1792 by freed slaves from Nova Scotia, its grid pressed between mountains and one of the world's largest natural harbours.",
  },
  {
    country: 'BS',
    city: 'Nassau',
    cuts: [{ slug: 'nassau-centre', box: cutAround(25.078, -77.339), signature: true }],
    lesson:
      "Nassau's harbour is sheltered by Paradise Island, and the colonial grid behind it climbs to forts built against the pirates who once ran the town.",
  },
  {
    country: 'DJ',
    city: 'Djibouti',
    cuts: [{ slug: 'djibouti-centre', box: cutAround(11.589, 43.145), signature: true }],
    lesson:
      "Djibouti City exists for its port at the mouth of the Red Sea, and the European Quarter's grid faces the harbour it was built to serve.",
  },
  {
    country: 'GY',
    city: 'Georgetown',
    cuts: [{ slug: 'georgetown-centre', box: cutAround(6.805, -58.155), signature: true }],
    lesson:
      'Georgetown lies below sea level behind a seawall, drained by Dutch-built canals that still run down the middle of its widest streets.',
  },
  {
    country: 'AD',
    city: 'Andorra la Vella',
    cuts: [{ slug: 'andorra-la-vella-centre', box: cutAround(42.5078, 1.5211), signature: true }],
    lesson:
      'Andorra la Vella is the highest capital in Europe, wedged so tightly into its valley that the town is essentially one long street.',
  },
  {
    country: 'MC',
    city: 'Monaco',
    cuts: [{ slug: 'monaco-centre', box: cutAround(43.7384, 7.4246), signature: true }],
    lesson:
      'Monaco is built up a cliff face in terraces, and its street circuit is simply the public roads that thread between them.',
  },
  {
    country: 'MU',
    city: 'Port Louis',
    cuts: [{ slug: 'port-louis-centre', box: cutAround(-20.162, 57.498), signature: true }],
    lesson:
      'Port Louis sits in an amphitheatre of mountains around a harbour, its French colonial grid hemmed in on every landward side.',
  },
  {
    country: 'BH',
    city: 'Manama',
    cuts: [{ slug: 'manama-centre', box: cutAround(26.228, 50.586), signature: true }],
    lesson:
      "Manama's old souk backs onto a financial district built almost entirely on reclaimed land — the coastline has moved within one lifetime.",
  },
  {
    country: 'TG',
    city: 'Lomé',
    cuts: [{ slug: 'lome-centre', box: cutAround(6.131, 1.222), signature: false }],
    lesson:
      'Lomé sits right on the Ghanaian border with its port beside the centre, so the city trades across a frontier it can walk to.',
  },
  {
    country: 'TM',
    city: 'Ashgabat',
    cuts: [{ slug: 'ashgabat-centre', box: cutAround(37.94, 58.38), signature: true }],
    lesson:
      'Ashgabat was rebuilt after a 1948 earthquake and again after 1991 in white marble, holding the world record for marble-clad buildings.',
  },
  {
    country: 'BT',
    city: 'Thimphu',
    cuts: [{ slug: 'thimphu-centre', box: cutAround(27.472, 89.639), signature: true }],
    lesson:
      'Thimphu runs along a single valley floor and is famously the only capital with no traffic lights, policemen directing cars instead.',
  },
  {
    country: 'BN',
    city: 'Bandar Seri Begawan',
    cuts: [{ slug: 'bandar-seri-begawan-centre', box: cutAround(4.89, 114.942), signature: true }],
    lesson:
      'Bandar Seri Begawan faces Kampong Ayer, a water village of stilt houses on the river that has been inhabited for over a thousand years.',
  },
  {
    country: 'MV',
    city: 'Malé',
    cuts: [{ slug: 'male-centre', box: cutAround(4.1755, 73.5093), signature: true }],
    lesson:
      'Malé is one of the most densely populated islands on earth: the city covers its island entirely, coast to coast, with no room left over.',
  },
]
