import { BORDERS } from '~~/data/borders.gen'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { EVENTS } from '~~/data/events.gen'
import type { EventEntry } from '~~/generators/create-events-file'
import { titlecaseLeader } from '~~/lib/leaders'
import { MAP_PATHS, MAP_REGIONS } from '~~/data/map.gen'
import type {
  BornChallenge,
  BoundaryChallenge,
  CityNocturneChallenge,
  EndonymChallenge,
  FinalChallenge,
  FinalChallengeAnswer,
  FinalChallengeItem,
  LanguageChallenge,
  LeadershipChallenge,
  MadeChallenge,
  MaxChallenge,
  MembershipChallenge,
  MinChallenge,
  MinMaxAccessorKeys,
  RegionChallenge,
  ScalesAccessorKey,
  ScalesChallenge,
  SunsetBlitzChallenge,
  YearbookChallenge,
} from '~~/types/challenges/final-challenge.type'
import type { Game, GameDifficulty } from '~~/types/game.types'
import {
  type Amount,
  type ISOCountryCode,
  isValidISOCode,
  type Region,
} from '~~/types/geography.types'
import type { CountryColorGrouping } from '~~/types/map.type'
import { OrganizationVector } from '~~/types/organization.type'
import { sample, sampleMany, shuffleArray, weightedPick } from '../arrays'
import { countryEndonym, isLargeCountry, normalizeCountryName, pickSizedCountry } from '../country'
import { editDistance } from '../strings'
import { mainlandBox } from '../geo'
import {
  boundaryDeviation,
  largestRing,
  type OutlinePoint,
  polylineLength,
  sharedBoundary,
  unsharedRuns,
} from '../outline'
import { getValueByAccessorID } from '../values'
import { playableCountries } from '../game-rules'
import { REGION_LABELS } from '../variant'

type FinalChallengeType = FinalChallengeItem['_type']

/** Extra misses a run can absorb before the knockout. */
export const GAUNTLET_LIVES: { [difficulty in GameDifficulty]: number } = {
  easy: 2,
  normal: 2,
  hard: 1,
}

const GAUNTLET_LENGTH: { [difficulty in GameDifficulty]: number } = {
  easy: 2,
  normal: 3,
  hard: 5,
}

// "Which region is X in?" answers itself on a continental board, and the
// heavier modes stay out of easy runs.
const eligibleTypes = (game: Game, pool: ISOCountryCode[]): FinalChallengeType[] => {
  const types: FinalChallengeType[] = [
    'leadership-challenge',
    'language-challenge',
    'min-challenge',
    'max-challenge',
    'born-challenge',
    'made-challenge',
    // Easy-friendly since the quota scales with difficulty (1/2/3 cities)
    'city-nocturne-challenge',
    // Easy-friendly since both levers scale: the pair pick and the tolerance
    'boundary-challenge',
    // Easy-friendly: transparent-only deck and a quota of 2
    'endonym-challenge',
    // Easy-friendly via two-headline years and the widest tolerance
    'yearbook-challenge',
  ]
  if (game.variant === 'world') types.push('region-challenge')
  if (game.difficulty !== 'easy') {
    if (eligibleOrganizations(pool).length) types.push('membership-challenge')
    types.push('scales-challenge', 'sunset-blitz-challenge')
  }
  return types
}

// A dealer returns undefined (or throws, on source-data gaps) when the board
// can't support its type — the draw just moves on to the next type.
const dealChallenge = (
  type: FinalChallengeType,
  pool: ISOCountryCode[],
  difficulty: GameDifficulty
): FinalChallengeItem | undefined => {
  try {
    switch (type) {
      case 'region-challenge':
        return getRegionChallenge(pool)
      case 'leadership-challenge':
        return getLeadershipChallenge(pool)
      case 'language-challenge':
        return getLanguageChallenge(pool)
      case 'min-challenge':
        return getMinChallenge(pool)
      case 'max-challenge':
        return getMaxChallenge(pool)
      case 'membership-challenge':
        return getMembershipChallenge(pool)
      case 'scales-challenge':
        return getScalesChallenge(pool)
      case 'sunset-blitz-challenge':
        return getSunsetBlitzChallenge(pool)
      case 'born-challenge':
        return getBornChallenge(pool, difficulty)
      case 'made-challenge':
        return getMadeChallenge(pool)
      case 'city-nocturne-challenge':
        return getCityNocturneChallenge(pool, difficulty)
      case 'boundary-challenge':
        return getBoundaryChallenge(pool, difficulty)
      case 'endonym-challenge':
        return getEndonymChallenge(pool, difficulty)
      case 'yearbook-challenge':
        return getYearbookChallenge(difficulty)
    }
  } catch {
    return undefined
  }
}

export const getFinalChallenges = ({ game }: { game: Game }): FinalChallenge => {
  const pool = playableCountries(game)
  const count = GAUNTLET_LENGTH[game.difficulty]

  const drawn: FinalChallengeItem[] = []
  for (const type of shuffleArray(eligibleTypes(game, pool))) {
    if (drawn.length >= count) break
    const item = dealChallenge(type, pool, game.difficulty)
    if (item) drawn.push(item)
  }
  if (!drawn.length) throw new ReferenceError('Unable to deal any final challenge')

  // The sunset finale anchors last; the rest keep their shuffled order
  const challenges = [
    ...drawn.filter(item => item._type !== 'sunset-blitz-challenge'),
    ...drawn.filter(item => item._type === 'sunset-blitz-challenge'),
  ]

  return {
    _type: 'final-challenge',
    difficulty: game.difficulty,
    challenges,
    lives: GAUNTLET_LIVES[game.difficulty],
    totalCount: challenges.length,
    answeredCorrect: 0,
  }
}

/**
 * A fresh question for the earned finale: missing the last question with a
 * life left redeals instead of ending the run. Avoids the missed type when
 * another is available, so the reveal can't be replayed into the answer.
 */
export const dealReplacementChallenge = ({
  game,
  exclude,
}: {
  game: Game
  exclude: FinalChallengeType[]
}): FinalChallengeItem | undefined => {
  const pool = playableCountries(game)
  const types = shuffleArray(eligibleTypes(game, pool))
  for (const type of [...types.filter(t => !exclude.includes(t)), ...types]) {
    const item = dealChallenge(type, pool, game.difficulty)
    if (item) return item
  }
  return undefined
}

const getRegionChallenge = (pool: ISOCountryCode[]): RegionChallenge => {
  return {
    _type: 'region-challenge',
    country: pickSizedCountry(pool, 'large')!,
  }
}

const getLanguageChallenge = (pool: ISOCountryCode[]): LanguageChallenge => {
  const languages = pool.flatMap(isoCode => COUNTRIES[isoCode].languages)
  const language = sample(languages)
  if (!language) throw new ReferenceError(`No language found in language challenge`)

  return {
    _type: 'language-challenge',
    language,
  }
}

const minMaxAccessors: MinMaxAccessorKeys[] = [
  'economics.gdpPerCapita',
  'economics.militarySpending',
  'gender.womenInParliament',
  'people.population',
  'health.alcoholConsumption',
  'humanRights.refugees',
  'health.obesity',
]

/**
 * Returns a sorted array (max -> min) of a given value key
 */
const buildSortedRanking = (
  accessorId: MinMaxAccessorKeys | ScalesAccessorKey,
  pool: ISOCountryCode[]
) => {
  const sortedCountries: { amount: Amount<string>; isoCode: ISOCountryCode }[] = []

  for (const isoCode of pool) {
    if (!isValidISOCode(isoCode)) continue
    const amount = getValueByAccessorID(isoCode, accessorId)
    if (!amount) continue

    sortedCountries.push({
      amount,
      isoCode,
    })
  }

  return sortedCountries.sort((a, b) => b.amount.amount - a.amount.amount)
}

const getSortedRanking = (pool: ISOCountryCode[]) => {
  // Source data drifts between regenerations and some accessors end up
  // empty — dealing one of those would crash the final challenge mid-game
  for (const candidate of shuffleArray([...minMaxAccessors])) {
    const sortedcountries = buildSortedRanking(candidate, pool)
    if (sortedcountries.length >= 6) return { accessorId: candidate, sortedcountries }
  }

  throw new ReferenceError('No min/max accessor has enough country data')
}

const getMaxChallenge = (pool: ISOCountryCode[]): MaxChallenge => {
  const { accessorId, sortedcountries } = getSortedRanking(pool)
  const country = sortedcountries.shift()
  if (!country) throw new ReferenceError('Unable to find any country for max challenge')

  return {
    _type: 'max-challenge',
    accessorId,
    country: country.isoCode,
    hints: shuffleArray(sortedcountries.slice(0, 5).flatMap(country => country.isoCode)),
  }
}

const getMinChallenge = (pool: ISOCountryCode[]): MinChallenge => {
  const { accessorId, sortedcountries } = getSortedRanking(pool)
  const country = sortedcountries.pop()
  if (!country) throw new ReferenceError('Unable to find any country for min challenge')

  return {
    _type: 'min-challenge',
    accessorId,
    country: country.isoCode,
    hints: shuffleArray(sortedcountries.slice(-5).flatMap(country => country.isoCode)),
  }
}

const isMemberOf = (isoCode: ISOCountryCode, organization: keyof typeof OrganizationVector) =>
  COUNTRIES[isoCode].membership.some(entry => entry.id === organization)

/**
 * An organization only makes a fair question when the board holds enough of
 * both sides: members to light up and non-members to hide the answer among.
 * (OPEC on the Europe board gave away Liechtenstein; the old region fallback
 * could even name a real member as the "non-member".)
 */
const eligibleOrganizations = (pool: ISOCountryCode[]): (keyof typeof OrganizationVector)[] => {
  return (Object.keys(OrganizationVector) as (keyof typeof OrganizationVector)[]).filter(org => {
    const members = pool.filter(isoCode => isMemberOf(isoCode, org)).length
    return members >= 4 && pool.length - members >= 4
  })
}

const getMembershipChallenge = (pool: ISOCountryCode[]): MembershipChallenge | undefined => {
  const organization = sample(eligibleOrganizations(pool))
  if (!organization) return undefined

  const exception = shuffleArray(pool.filter(isoCode => !isMemberOf(isoCode, organization))).shift()
  if (!exception) return undefined

  return {
    _type: 'membership-challenge',
    organization,
    exception,
  }
}

const scalesAccessors: ScalesAccessorKey[] = ['people.population', 'economics.gdpTotal']
const SCALES_MAX_PICKS = 3
const SCALES_TOLERANCE = 0.2

/** Any combination of ≤maxPicks values landing inside the balance band? */
const hasBalancedCombination = (
  values: number[],
  target: number,
  tolerance: number,
  maxPicks: number
): boolean => {
  const lower = target * (1 - tolerance)
  const upper = target * (1 + tolerance)
  const usable = values.filter(value => value <= upper)

  if (usable.some(value => value >= lower)) return true
  for (let i = 0; i < usable.length && maxPicks >= 2; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const pair = usable[i] + usable[j]
      if (pair >= lower && pair <= upper) return true
      if (pair > upper || maxPicks < 3) continue
      for (let k = j + 1; k < usable.length; k++) {
        const triple = pair + usable[k]
        if (triple >= lower && triple <= upper) return true
      }
    }
  }
  return false
}

const getScalesChallenge = (pool: ISOCountryCode[]): ScalesChallenge | undefined => {
  for (const accessorId of shuffleArray([...scalesAccessors])) {
    const ranking = buildSortedRanking(accessorId, pool)
    if (ranking.length < 8) continue

    // A heavyweight target keeps the numbers big enough that picks matter;
    // dealt only when a balanced combination actually exists
    const heavyweights = ranking.slice(0, Math.max(3, Math.floor(ranking.length / 4)))
    for (const target of shuffleArray([...heavyweights])) {
      const others = ranking
        .filter(entry => entry.isoCode !== target.isoCode)
        .map(entry => entry.amount.amount)
      if (!hasBalancedCombination(others, target.amount.amount, SCALES_TOLERANCE, SCALES_MAX_PICKS))
        continue

      return {
        _type: 'scales-challenge',
        accessorId,
        target: target.isoCode,
        maxPicks: SCALES_MAX_PICKS,
        tolerance: SCALES_TOLERANCE,
      }
    }
  }
  return undefined
}

const BORN_CUTOFFS = [1900, 1945, 1960, 1990, 2000]
const BORN_QUOTA: { [difficulty in GameDifficulty]: number } = {
  easy: 1,
  normal: 2,
  hard: 3,
}

const getBornChallenge = (
  pool: ISOCountryCode[],
  difficulty: GameDifficulty
): BornChallenge | undefined => {
  const quota = BORN_QUOTA[difficulty]
  for (const year of shuffleArray([...BORN_CUTOFFS])) {
    const qualifying = pool.filter(isoCode => bornAfter(isoCode, year)).length
    // Enough valid answers to be findable, few enough to need real knowledge
    if (qualifying >= Math.max(3, quota) && qualifying <= pool.length / 2) {
      return { _type: 'born-challenge', year, quota }
    }
  }
  return undefined
}

/** Commodities familiar enough to quiz on. The Factbook's full vocabulary runs
 *  to HS-code obscurities ("reaction and catalytic products", "orthopedic
 *  appliances") that test parsing, not geography — the dealer draws from this
 *  set only. Reveals and stat lines still show every country's real list. */
export const MADE_COMMODITIES = new Set([
  'aircraft',
  'aluminum',
  'bananas',
  'beef',
  'beer',
  'cars',
  'cloves',
  'coal',
  'cobalt',
  'cocoa beans',
  'coconuts/brazil nuts/cashews',
  'coffee',
  'computers',
  'copper ore',
  'corn',
  'cotton',
  'crude petroleum',
  'cut flowers',
  'diamonds',
  'electricity',
  'fish',
  'footwear',
  'garments',
  'gold',
  'integrated circuits',
  'iron ore',
  'jewelry',
  'liquor',
  'natural gas',
  'nickel',
  'olive oil',
  'packaged medicine',
  'palm oil',
  'perfumes',
  'platinum',
  'raw sugar',
  'refined copper',
  'refined petroleum',
  'rice',
  'rubber',
  'shellfish',
  'ships',
  'soybeans',
  'steel',
  'tea',
  'tobacco',
  'tropical fruits',
  'uranium and thorium ore',
  'vaccines',
  'vanilla',
  'watches',
  'wheat',
  'wine',
  'wood',
  'wool',
])

const getMadeChallenge = (pool: ISOCountryCode[]): MadeChallenge | undefined => {
  const exporterCounts = new Map<string, number>()
  for (const isoCode of pool) {
    for (const item of COUNTRIES[isoCode].economics.exports ?? []) {
      exporterCounts.set(item, (exporterCounts.get(item) ?? 0) + 1)
    }
  }
  const commodity = shuffleArray(
    [...exporterCounts.entries()]
      .filter(([item, count]) => MADE_COMMODITIES.has(item) && count >= 2 && count <= 8)
      .map(([item]) => item)
  ).shift()
  return commodity ? { _type: 'made-challenge', commodity } : undefined
}

const NOCTURNE_CITY_COUNT = 10
const NOCTURNE_MIN_CITIES = 6
const NOCTURNE_SECONDS = 60
const NOCTURNE_QUOTA: { [difficulty in GameDifficulty]: number } = {
  easy: 1,
  normal: 2,
  hard: 3,
}

const getCityNocturneChallenge = (
  pool: ISOCountryCode[],
  difficulty: GameDifficulty
): CityNocturneChallenge | undefined => {
  for (const country of shuffleArray([...pool])) {
    const cities = CITY_LIGHTS[country]
    if (!cities || cities.length < NOCTURNE_MIN_CITIES) continue
    const cityCount = Math.min(NOCTURNE_CITY_COUNT, cities.length)
    return {
      _type: 'city-nocturne-challenge',
      country,
      cityCount,
      quota: Math.min(NOCTURNE_QUOTA[difficulty], cityCount),
      durationSeconds: NOCTURNE_SECONDS,
    }
  }
  return undefined
}

const ENDONYM_DECK_SIZE = 5
const ENDONYM_QUOTA: { [difficulty in GameDifficulty]: number } = {
  easy: 2,
  normal: 3,
  hard: 4,
}
/** Edit-distance share of the longer normalized name at or under which an
 *  endonym reads as its exonym ("Polska", "Danmark") — the easy deck. */
export const ENDONYM_TRANSPARENT_MAX_RATIO = 0.5

/** Is the country's own name guessable from its English one? */
export const isTransparentEndonym = (isoCode: ISOCountryCode): boolean => {
  const endonym = countryEndonym(isoCode)
  if (!endonym) return false
  const local = normalizeCountryName(endonym)
  const english = normalizeCountryName(COUNTRIES[isoCode].name.english)
  const ratio = editDistance(local, english) / Math.max(local.length, english.length)
  return ratio <= ENDONYM_TRANSPARENT_MAX_RATIO
}

const getEndonymChallenge = (
  pool: ISOCountryCode[],
  difficulty: GameDifficulty
): EndonymChallenge | undefined => {
  const quota = ENDONYM_QUOTA[difficulty]
  const withEndonym = pool.filter(isoCode => countryEndonym(isoCode))
  const transparent = withEndonym.filter(isTransparentEndonym)
  const opaque = withEndonym.filter(isoCode => !isTransparentEndonym(isoCode))
  const ranked =
    difficulty === 'easy'
      ? shuffleArray(transparent) // transparent-only: every name stays guessable
      : difficulty === 'hard'
        ? [...shuffleArray(opaque), ...shuffleArray(transparent)] // opaque-first, backfill
        : shuffleArray([...withEndonym])
  // Slice picks the deck's composition; the reshuffle restores play order
  const countries = shuffleArray(ranked.slice(0, ENDONYM_DECK_SIZE))
  // The deck must leave at least one absorbable miss, or it's all-or-nothing
  if (countries.length <= quota) return undefined
  return { _type: 'endonym-challenge', countries, quota }
}

export const YEARBOOK_TUNING: {
  [difficulty in GameDifficulty]: {
    /** Headlines on the page — doubles as the year-density floor. */
    headlineCount: number
    /** |guess − year| the verdict still accepts. */
    tolerance: number
    /** Drip cadence, timeline register: slower than stat-detective's 8s —
     *  a headline needs reading, and the dial needs travelling. */
    secondsPerHeadline: number
  }
} = {
  easy: { headlineCount: 2, tolerance: 3, secondsPerHeadline: 20 },
  normal: { headlineCount: 3, tolerance: 2, secondsPerHeadline: 16 },
  hard: { headlineCount: 4, tolerance: 1, secondsPerHeadline: 14 },
}

/** Digit runs this close to the event's year read as the answer. Wider than
 *  the widest tolerance so "a year later, in 1990" can't date a 1989 page. */
export const YEARBOOK_LEAK_WINDOW = 5

/**
 * Year-leak filter: an event whose slug, name or description surfaces a year
 * near its own must not make the page. The SLUG is checked too — it travels
 * the wire as the headline key and names the card image
 * (`treaty-of-manila-1946.webp` would date the page from devtools alone).
 * BCE years compare against their absolute value ("490 BCE" leaks −490).
 */
export const yearbookLeaksYear = (slug: string, event: EventEntry): boolean => {
  const year = Math.abs(event.year)
  const tokens = `${slug} ${event.name} ${event.description}`.match(/\d{2,4}/g) ?? []
  return tokens.some(token => Math.abs(Number(token) - year) <= YEARBOOK_LEAK_WINDOW)
}

/**
 * The page's year, resolved from the dealt headlines — the reveal and the
 * verdict share this selector, and the snapshot never carries a redundant
 * (and spoilable) `year` field.
 */
export const yearbookYear = (challenge: YearbookChallenge): number | undefined =>
  EVENTS[challenge.headlines[0]]?.year

/** The dial's travel: the event library's own span, rounded out to decades. */
export const YEARBOOK_DIAL_BOUNDS = (() => {
  let min = Infinity
  let max = -Infinity
  for (const event of Object.values(EVENTS)) {
    min = Math.min(min, event.year)
    max = Math.max(max, event.year)
  }
  return { min: Math.floor(min / 10) * 10, max: Math.ceil(max / 10) * 10 }
})()

const getYearbookChallenge = (difficulty: GameDifficulty): YearbookChallenge | undefined => {
  const { headlineCount, tolerance, secondsPerHeadline } = YEARBOOK_TUNING[difficulty]

  const byYear = new Map<number, string[]>()
  for (const [slug, event] of Object.entries(EVENTS)) {
    if (yearbookLeaksYear(slug, event)) continue
    byYear.set(event.year, [...(byYear.get(event.year) ?? []), slug])
  }
  // Density guard: only years that can fill the whole front page deal
  const candidates = [...byYear.entries()].filter(([, slugs]) => slugs.length >= headlineCount)

  // Era weighting: a year's chance is inversely proportional to how crowded
  // its century is, so the deck isn't wall-to-wall 20th century
  const perCentury = new Map<number, number>()
  for (const [year] of candidates) {
    const century = Math.floor(year / 100)
    perCentury.set(century, (perCentury.get(century) ?? 0) + 1)
  }
  const picked = weightedPick(
    candidates.map(entry => [entry, 1 / perCentury.get(Math.floor(entry[0] / 100))!] as const)
  )
  if (!picked) return undefined

  return {
    _type: 'yearbook-challenge',
    // sampleMany shuffles as it picks — the famous anchor isn't always first
    headlines: sampleMany(picked[1], headlineCount),
    tolerance,
    secondsPerHeadline,
  }
}

const NIGHT_WINDOW_MAX = 12
const NIGHT_WINDOW_MIN = 8
const SUNSET_SECONDS_PER_COUNTRY = 4
const SUNSET_QUOTA_RATIO = 0.35
/** Terminator tilt off vertical, radians — the veil's top edge leads west. */
export const SUNSET_TILT = 0.17

/**
 * The pass mark: a share of the dealt window only. Wide screens show far more
 * countries — those are bonus routes to the quota, never quota inflation, or
 * a Europe board demands a dozen names in a minute.
 */
export const sunsetQuota = (challenge: SunsetBlitzChallenge): number =>
  Math.ceil(challenge.countries.length * challenge.quotaRatio)

/** A country's centre in map space — screen coordinates, east = larger x. */
export const mapRegionCentre = (isoCode: ISOCountryCode): { x: number; y: number } => {
  const rings = MAP_REGIONS[isoCode]
  if (!rings?.length) return { x: 0, y: 0 }
  const [x, y, width, height] = rings[0]
  return { x: x + width / 2, y: y + height / 2 }
}

/**
 * Position along the tilted dusk axis — the veil crosses countries in
 * DESCENDING order of this. Shared with the client so the tint timing and the
 * drawn terminator agree.
 */
export const sunsetDuskCoordinate = (isoCode: ISOCountryCode): number => {
  const { x, y } = mapRegionCentre(isoCode)
  return x - y * Math.tan(SUNSET_TILT)
}

// The window must stay a REGION: a cluster hopping through giant countries
// (Russia, China) can put centres half a world apart, and unbounded widening
// then swallows the whole board — an 80-country window with a quota of 28.
const NIGHT_WINDOW_SPAN_X = 420
const NIGHT_WINDOW_SPAN_Y = 260
const NIGHT_WINDOW_HARD_CAP = 16

/**
 * Camera split for the window: a member whose mainland outgrows the window
 * itself (Russia) frames by centre via focusContext — its full box would blow
 * the shot out to half the planet.
 */
export const sunsetCameraPlan = (
  countries: ISOCountryCode[]
): { focus: ISOCountryCode[]; context: ISOCountryCode[] } => {
  const giant = (isoCode: ISOCountryCode) => {
    const box = mainlandBox(MAP_REGIONS[isoCode], undefined)
    return !!box && (box[2] > NIGHT_WINDOW_SPAN_X || box[3] > NIGHT_WINDOW_SPAN_Y)
  }
  const focus = countries.filter(isoCode => !giant(isoCode))
  return focus.length
    ? { focus, context: countries.filter(giant) }
    : { focus: countries, context: [] }
}

const getSunsetBlitzChallenge = (pool: ISOCountryCode[]): SunsetBlitzChallenge | undefined => {
  const poolSet = new Set(pool)

  // Grow a contiguous cluster from a random seed via land borders — a dense
  // core the camera can frame, on any board that has one — bounded in
  // geographic span so it stays a window, not a hemisphere
  for (const seed of shuffleArray([...pool])) {
    const seedCentre = mapRegionCentre(seed)
    const box = { left: seedCentre.x, right: seedCentre.x, top: seedCentre.y, bottom: seedCentre.y }
    const fits = ({ x, y }: { x: number; y: number }) =>
      Math.max(box.right, x) - Math.min(box.left, x) <= NIGHT_WINDOW_SPAN_X &&
      Math.max(box.bottom, y) - Math.min(box.top, y) <= NIGHT_WINDOW_SPAN_Y
    const extend = ({ x, y }: { x: number; y: number }) => {
      box.left = Math.min(box.left, x)
      box.right = Math.max(box.right, x)
      box.top = Math.min(box.top, y)
      box.bottom = Math.max(box.bottom, y)
    }

    const cluster = new Set<ISOCountryCode>([seed])
    let frontier: ISOCountryCode[] = [seed]
    while (frontier.length && cluster.size < NIGHT_WINDOW_MAX) {
      const next: ISOCountryCode[] = []
      for (const isoCode of frontier) {
        for (const neighbour of BORDERS[isoCode] ?? []) {
          if (cluster.size >= NIGHT_WINDOW_MAX) break
          if (!poolSet.has(neighbour) || cluster.has(neighbour)) continue
          const centre = mapRegionCentre(neighbour)
          if (!fits(centre)) continue
          extend(centre)
          cluster.add(neighbour)
          next.push(neighbour)
        }
      }
      frontier = next
    }
    if (cluster.size < NIGHT_WINDOW_MIN) continue

    // Modest widening pulls in enclaves and close non-neighbours within the
    // window's own area (runtime visibility already lets the player name
    // anything else on screen — the window only drives quota, camera, sweep)
    const padX = (box.right - box.left) * 0.12 + 8
    const padY = (box.bottom - box.top) * 0.12 + 8
    const centreX = (box.left + box.right) / 2
    const centreY = (box.top + box.bottom) / 2
    const windowed = pool
      .filter(isoCode => {
        const { x, y } = mapRegionCentre(isoCode)
        return (
          x >= box.left - padX &&
          x <= box.right + padX &&
          y >= box.top - padY &&
          y <= box.bottom + padY
        )
      })
      .sort((a, b) => {
        // The cluster is the window's identity; widened extras fill remaining
        // seats nearest-first under the hard cap
        const inCluster = Number(cluster.has(b)) - Number(cluster.has(a))
        if (inCluster) return inCluster
        const aCentre = mapRegionCentre(a)
        const bCentre = mapRegionCentre(b)
        return (
          Math.hypot(aCentre.x - centreX, aCentre.y - centreY) -
          Math.hypot(bCentre.x - centreX, bCentre.y - centreY)
        )
      })
      .slice(0, NIGHT_WINDOW_HARD_CAP)

    // Night falls east→west along the tilted terminator
    const countries = windowed.sort((a, b) => sunsetDuskCoordinate(b) - sunsetDuskCoordinate(a))
    return {
      _type: 'sunset-blitz-challenge',
      countries,
      quotaRatio: SUNSET_QUOTA_RATIO,
      durationSeconds: Math.min(90, Math.max(40, countries.length * SUNSET_SECONDS_PER_COUNTRY)),
    }
  }
  return undefined
}

// --- The Boundary Commission -----------------------------------------------------
// Calibrated on simulated touchpad/phone strokes over real borders (blended
// deviation as a fraction of the pair frame's span — see outline.test.ts):
// careful touchpad lines land 0.010–0.016, honest phone-finger lines
// 0.019–0.031, sloppy-but-right corridors 0.033–0.054. Wrong lines sit apart:
// a border drawn 12% of the frame off ≥0.065, a perpendicular line ≥0.07,
// tracing a coastline instead ≥0.09.
export const BOUNDARY_TOLERANCE: { [difficulty in GameDifficulty]: number } = {
  easy: 0.055,
  normal: 0.04,
  hard: 0.032,
}

/** A drawn line must cover this share of the true border's arc length —
 *  deviation alone lets a token stub pass on a short border. */
export const BOUNDARY_MIN_COVERAGE = 0.45

// Drawable-border guards: enough vertices to be a line worth recalling, and
// long enough relative to the merged frame to be drawable at all (an
// archipelago adjacency or a sliver contact fails both).
const BOUNDARY_MIN_VERTICES = 8
const BOUNDARY_MIN_LENGTH_RATIO = 0.18
const BOUNDARY_FRAME_PAD = 0.08

export interface BoundaryScene {
  /** The erased border, in map space. */
  line: OutlinePoint[]
  /** Padded bounding box of both mainlands: x, y, width, height. */
  frame: [number, number, number, number]
  /** The frame's longer side — the deviation normalizer. */
  span: number
  /** Each country's mainland ring, in `countries` order. */
  rings: [OutlinePoint[], OutlinePoint[]]
  /** The blob's visible outline: each ring minus the shared border. */
  coasts: OutlinePoint[][]
}

const boundarySceneCache = new Map<string, BoundaryScene | undefined>()

/**
 * Everything the Boundary Commission derives from a pair: the dealer's
 * drawability guard, the server verdict and the client's blob + reveal all
 * resolve through here — the true line never rides the snapshot.
 */
export const boundaryScene = (
  countries: [ISOCountryCode, ISOCountryCode]
): BoundaryScene | undefined => {
  // Keyed by the dealt order — rings come back in `countries` order
  const cacheKey = countries.join('|')
  if (boundarySceneCache.has(cacheKey)) return boundarySceneCache.get(cacheKey)

  const build = (): BoundaryScene | undefined => {
    const [a, b] = countries
    const ringA = MAP_PATHS[a] ? largestRing(MAP_PATHS[a]) : undefined
    const ringB = MAP_PATHS[b] ? largestRing(MAP_PATHS[b]) : undefined
    if (!ringA || !ringB) return undefined

    const line = sharedBoundary(ringA, ringB)
    if (!line || line.length < BOUNDARY_MIN_VERTICES) return undefined

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of [...ringA, ...ringB]) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
    const span = Math.max(maxX - minX, maxY - minY)
    if (span <= 0 || polylineLength(line) / span < BOUNDARY_MIN_LENGTH_RATIO) return undefined

    const pad = span * BOUNDARY_FRAME_PAD
    return {
      line,
      frame: [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2],
      span,
      rings: [ringA, ringB],
      coasts: [...unsharedRuns(ringA, ringB), ...unsharedRuns(ringB, ringA)],
    }
  }

  const scene = build()
  boundarySceneCache.set(cacheKey, scene)
  return scene
}

/**
 * The pass/fail ruling, shared by the server handler and the client's result
 * beat: the drawn line must cover the border and stay inside the tolerance
 * corridor. Garbage submissions fail, they don't throw — only a `_type`
 * mismatch is a client bug.
 */
export const isBoundaryDrawnWithin = (
  challenge: BoundaryChallenge,
  drawn: [number, number][]
): boolean => {
  const scene = boundaryScene(challenge.countries)
  if (!scene || !Array.isArray(drawn)) return false
  const line = drawn.filter(
    (point): point is OutlinePoint =>
      Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])
  )
  if (line.length < 2) return false
  if (polylineLength(line) < polylineLength(scene.line) * BOUNDARY_MIN_COVERAGE) return false
  return boundaryDeviation(line, scene.line) / scene.span <= challenge.tolerance
}

const getBoundaryChallenge = (
  pool: ISOCountryCode[],
  difficulty: GameDifficulty
): BoundaryChallenge | undefined => {
  const poolSet = new Set(pool)
  // Difficulty picks the border: easy runs stay between map-findable
  // landmasses (France–Spain, not Moldova–Romania); hard opens the atlas.
  const familiarEnough = (a: ISOCountryCode, b: ISOCountryCode) => {
    if (difficulty === 'easy') return isLargeCountry(a) && isLargeCountry(b)
    if (difficulty === 'normal') return isLargeCountry(a) || isLargeCountry(b)
    return true
  }

  for (const country of shuffleArray([...pool])) {
    for (const neighbour of shuffleArray([...(BORDERS[country] ?? [])])) {
      if (!poolSet.has(neighbour) || !familiarEnough(country, neighbour)) continue
      if (!boundaryScene([country, neighbour])) continue
      return {
        _type: 'boundary-challenge',
        countries: [country, neighbour],
        tolerance: BOUNDARY_TOLERANCE[difficulty],
      }
    }
  }
  return undefined
}

/**
 * Why the line runs where it does — the reveal captions the borders whose
 * story the atlas can stand behind (crest, river, treaty meridian). Keyed by
 * the sorted ISO pair.
 */
export const BORDER_STORIES: Partial<Record<string, string>> = {
  'ES|FR':
    'The line rides the crest of the Pyrenees, fixed by treaty in 1659 — one of Europe’s oldest unchanged borders.',
  'AR|CL':
    'The border follows the highest crests of the Andes and the continental water divide — the world’s longest mountain border.',
  'CA|US':
    'West of Lake of the Woods the line is simply the 49th parallel — an 1818 treaty latitude, drawn straight through mountains and prairie alike.',
  'EG|LY':
    'A ruler-straight colonial line along the 25th meridian east, drawn across the Sahara in 1925.',
  'EG|SD': 'The 22nd parallel north, ruled across the desert by Britain in 1899.',
  'IN|PK': 'The Radcliffe Line — drawn in just five weeks in 1947 to partition British India.',
  'NO|SE':
    'The line tracks the ridge of the Scandinavian Mountains — the Kølen — from south to north.',
  'ES|PT':
    'Largely fixed by the Treaty of Alcañices in 1297 — among the world’s oldest borders, with long stretches carried by the Douro and Guadiana rivers.',
  'DE|PL': 'The Oder–Neisse line: two rivers, adopted as the border after 1945.',
  'MX|US':
    'East of El Paso the border IS the Rio Grande; westward it runs as survey lines from the 1848 Treaty of Guadalupe Hidalgo.',
  'KZ|UZ':
    'A 1920s Soviet internal boundary that became international overnight in 1991, skirting the Kyzylkum desert toward the Aral Sea.',
  'NA|ZA': 'The Orange River carries the border all the way to the Atlantic.',
  'DO|HT':
    'Hispaniola was split between Spain and France in 1697 — the island still wears that line.',
  'FI|SE': 'The Torne river valley, fixed in 1809 when Russia took Finland from Sweden.',
  'BG|RO': 'The Danube carries most of the line before it cuts overland to the Black Sea.',
  'CH|IT': 'The Alpine watershed — a border that legally moves as the glaciers defining it melt.',
  'FR|IT':
    'The crest of the Alps from Mont Blanc to the Mediterranean, settled when Savoy and Nice joined France in 1860.',
  'CN|NP': 'The high Himalaya — the line runs across the summit of Mount Everest itself.',
  'LA|TH': 'The Mekong carries the border for most of its run.',
  'AR|PY': 'Rivers nearly end to end — the Pilcomayo, Paraguay and Paraná draw the line.',
}

export const boundaryStory = (countries: [ISOCountryCode, ISOCountryCode]): string | undefined =>
  BORDER_STORIES[[...countries].sort().join('|')]

const getLeadershipChallenge = (pool: ISOCountryCode[]): LeadershipChallenge => {
  const country = shuffleArray(pool.map(isoCode => COUNTRIES[isoCode])).find(country => {
    return !!country.government.leader
  })

  if (!country) throw new ReferenceError(`Unable to find leader for leadership challenge`)

  return {
    _type: 'leadership-challenge',
    country: country.isoCode,
  }
}

/** Did this country gain independence after `year`? */
export const bornAfter = (isoCode: ISOCountryCode, year: number): boolean => {
  const independence = COUNTRIES[isoCode].government.independence
  return !!independence && independence.amount > year
}

/** Does the country speak this language? */
export const speaksLanguage = (isoCode: ISOCountryCode, language: string): boolean =>
  COUNTRIES[isoCode].languages.includes(language)

/** Do the country's top exports include the commodity? */
export const exportsCommodity = (isoCode: ISOCountryCode, commodity: string): boolean =>
  (COUNTRIES[isoCode].economics.exports ?? []).includes(commodity)

/** The scales weigh-in — shared by the verdict and the client's beam card. */
export const weighScalesPicks = (
  challenge: ScalesChallenge,
  picks: ISOCountryCode[]
): { combined: number; target: Amount<string>; balanced: boolean } | undefined => {
  const target = getValueByAccessorID(challenge.target, challenge.accessorId)
  if (!target?.amount) return undefined
  let combined = 0
  for (const isoCode of picks) {
    combined += getValueByAccessorID(isoCode, challenge.accessorId)?.amount ?? 0
  }
  const balanced =
    combined >= target.amount * (1 - challenge.tolerance) &&
    combined <= target.amount * (1 + challenge.tolerance)
  return { combined, target, balanced }
}

/** The dealt cities a nocturne answer may light — the top N of CITY_LIGHTS. */
export const nocturneDealtCities = (challenge: CityNocturneChallenge): Set<string> =>
  new Set(
    (CITY_LIGHTS[challenge.country] ?? []).slice(0, challenge.cityCount).map(city => city.name)
  )

/**
 * The single verdict for a final-challenge answer, shared by the server
 * handler and the client's result beat. Property questions ("speaks X",
 * "exports Y") accept ANY qualifying country, and the min/max extremes accept
 * exact value ties — several countries can share the dealt extreme (five tie
 * on the lowest alcohol consumption, seven on the smallest refugee count), so
 * the one that happened to sort first must not be the only right answer.
 * Throws on an answer whose shape doesn't match the question — that's a
 * client bug, and the caller must not consume a life (or a question) for it.
 */
export const isCorrectFinalAnswer = ({
  challenge,
  submittedAnswer,
  pool,
}: {
  challenge: FinalChallengeItem
  submittedAnswer: FinalChallengeAnswer
  /** The board's playable countries — scopes sunset-blitz validation. */
  pool: ISOCountryCode[]
}): boolean => {
  const throwTypeMismatch = (): never => {
    throw new TypeError(`Challenge type mismatch: ${submittedAnswer._type || challenge._type}`)
  }

  switch (challenge._type) {
    case 'region-challenge': {
      if (submittedAnswer._type !== 'region-challenge') return throwTypeMismatch()
      return COUNTRIES[challenge.country].region === submittedAnswer.region
    }
    case 'max-challenge':
    case 'min-challenge': {
      // Narrows away every variant without a single-country answer
      // (region picks a region, sunset-blitz submits a country list).
      if (!('isoCode' in submittedAnswer)) return throwTypeMismatch()
      if (!isValidISOCode(submittedAnswer.isoCode)) return false
      if (submittedAnswer.isoCode === challenge.country) return true
      const dealt = getValueByAccessorID(challenge.country, challenge.accessorId)?.amount
      const submitted = getValueByAccessorID(submittedAnswer.isoCode, challenge.accessorId)?.amount
      return dealt !== undefined && submitted === dealt
    }
    case 'leadership-challenge': {
      if (!('isoCode' in submittedAnswer)) return throwTypeMismatch()
      return (
        isValidISOCode(submittedAnswer.isoCode) && submittedAnswer.isoCode === challenge.country
      )
    }
    case 'language-challenge': {
      if (!('isoCode' in submittedAnswer)) return throwTypeMismatch()
      if (!isValidISOCode(submittedAnswer.isoCode)) return false
      return speaksLanguage(submittedAnswer.isoCode, challenge.language)
    }
    case 'membership-challenge': {
      if (submittedAnswer._type !== 'membership-challenge') return throwTypeMismatch()
      return (
        isValidISOCode(submittedAnswer.isoCode) && submittedAnswer.isoCode === challenge.exception
      )
    }
    case 'born-challenge': {
      if (submittedAnswer._type !== 'born-challenge') return throwTypeMismatch()
      // Quota of distinct picks, every one of which must qualify
      const picks = [...new Set(submittedAnswer.isoCodes)].filter(isValidISOCode)
      return picks.length >= challenge.quota && picks.every(iso => bornAfter(iso, challenge.year))
    }
    case 'made-challenge': {
      if (submittedAnswer._type !== 'made-challenge') return throwTypeMismatch()
      if (!isValidISOCode(submittedAnswer.isoCode)) return false
      return exportsCommodity(submittedAnswer.isoCode, challenge.commodity)
    }
    case 'scales-challenge': {
      if (submittedAnswer._type !== 'scales-challenge') return throwTypeMismatch()
      const picks = [...new Set(submittedAnswer.isoCodes)].filter(isValidISOCode)
      if (!picks.length || picks.length > challenge.maxPicks || picks.includes(challenge.target)) {
        return false
      }
      return !!weighScalesPicks(challenge, picks)?.balanced
    }
    case 'city-nocturne-challenge': {
      if (submittedAnswer._type !== 'city-nocturne-challenge') return throwTypeMismatch()
      // Client-trust: validate the lit names against the dealt city set
      const dealt = nocturneDealtCities(challenge)
      const lit = [...new Set(submittedAnswer.namedCities)].filter(name => dealt.has(name))
      return lit.length >= challenge.quota
    }
    case 'boundary-challenge': {
      if (submittedAnswer._type !== 'boundary-challenge') return throwTypeMismatch()
      return isBoundaryDrawnWithin(challenge, submittedAnswer.drawn)
    }
    case 'endonym-challenge': {
      if (submittedAnswer._type !== 'endonym-challenge') return throwTypeMismatch()
      // Positional: pick i answers beat i, so positions can't double-count
      const hits = challenge.countries.filter(
        (isoCode, beat) => submittedAnswer.isoCodes[beat] === isoCode
      ).length
      return hits >= challenge.quota
    }
    case 'yearbook-challenge': {
      if (submittedAnswer._type !== 'yearbook-challenge') return throwTypeMismatch()
      const year = yearbookYear(challenge)
      return (
        year !== undefined &&
        Number.isFinite(submittedAnswer.year) &&
        Math.abs(submittedAnswer.year - year) <= challenge.tolerance
      )
    }
    case 'sunset-blitz-challenge': {
      if (submittedAnswer._type !== 'sunset-blitz-challenge') return throwTypeMismatch()
      // Client-trust like higher-lower gates. The whole board is nameable
      // (the camera shows more than the dealt window), so validate against
      // the board pool; the quota is a share of the dealt window.
      const board = new Set(pool)
      const named = [...new Set(submittedAnswer.namedCountries)].filter(
        isoCode => isValidISOCode(isoCode) && board.has(isoCode)
      )
      return named.length >= sunsetQuota(challenge)
    }
  }
  return throwTypeMismatch()
}

export const getFinalChallengeDetails = ({
  challenge,
  variant = 'world',
}: {
  challenge: FinalChallengeItem
  /** The board being played — scopes min/max phrasing ("…in Europe"). */
  variant?: Game['variant']
}): { question: string } => {
  switch (challenge._type) {
    case 'language-challenge':
      return {
        question: `Select a country that speaks ${challenge.language}`,
      }
    case 'leadership-challenge': {
      // The DEALT country's leader — asking about anyone else's makes the
      // question unanswerable (validation compares against challenge.country)
      const { leader } = COUNTRIES[challenge.country].government
      return {
        question: `Which country is led by ${titlecaseLeader(leader ?? '')}?`,
      }
    }
    case 'min-challenge':
    case 'max-challenge': {
      const { accessorId, _type } = challenge

      const { max, min } = finalChallengeMinMaxQuestion[accessorId]
      const scope = variant === 'world' ? 'in the world' : `in ${REGION_LABELS[variant]}`

      return {
        question: `${_type === 'max-challenge' ? max : min} ${scope}`,
      }
    }
    case 'membership-challenge': {
      const organization = OrganizationVector[challenge.organization]

      return {
        question: `Which of the following countries is not a part of the ${organization}?`,
      }
    }
    case 'region-challenge': {
      const country = COUNTRIES[challenge.country]
      return {
        question: `Which region is ${country.name.english} a part of?`,
      }
    }
    case 'scales-challenge': {
      const target = COUNTRIES[challenge.target]
      const stat = challenge.accessorId === 'people.population' ? 'population' : 'GDP'
      const percent = Math.round(challenge.tolerance * 100)
      return {
        question: `Balance the scales: pick up to ${challenge.maxPicks} countries whose combined ${stat} lands within ${percent}% of ${target.name.english}'s`,
      }
    }
    case 'sunset-blitz-challenge':
      return {
        question: `Night is falling — name each country before the dark takes it`,
      }
    case 'born-challenge':
      return {
        question:
          challenge.quota === 1
            ? `Select a country that gained independence after ${challenge.year}`
            : `Select ${challenge.quota} countries that gained independence after ${challenge.year}`,
      }
    case 'made-challenge':
      return {
        question: `Select a country whose top exports include ${challenge.commodity}`,
      }
    case 'city-nocturne-challenge':
      return {
        question: `Light up ${COUNTRIES[challenge.country].name.english} — type its ${challenge.cityCount} biggest cities`,
      }
    case 'boundary-challenge': {
      const [first, second] = challenge.countries
      return {
        question: `The ${COUNTRIES[first].name.english}–${COUNTRIES[second].name.english} border has been erased — draw where it runs`,
      }
    }
    case 'endonym-challenge':
      return {
        question: `Countries by their own names — tap ${challenge.quota} of the ${challenge.countries.length} shown`,
      }
    case 'yearbook-challenge':
      return {
        question: `One year made this front page — dial it in (±${challenge.tolerance} year${challenge.tolerance === 1 ? '' : 's'} counts)`,
      }
    default:
      return {
        question: `Lazy, lazy get this implemented`,
      }
  }
}

/** Short stat nouns for lesson lines and the reveal card. */
export const FINAL_STAT_LABELS: { [accessor in MinMaxAccessorKeys]: string } = {
  'economics.gdpPerCapita': 'GDP per capita',
  'economics.militarySpending': 'Military spending',
  'gender.womenInParliament': 'Women in parliament',
  'people.population': 'Population',
  'health.alcoholConsumption': 'Alcohol consumption',
  'humanRights.refugees': 'Refugees hosted',
  'health.obesity': 'Obesity rate',
}

/**
 * Question stems WITHOUT a scope — the answer pool is the variant's, so the
 * phrasing must be too ("…in Europe", not "…in the world", or China really
 * is the right answer to a Europe board's population question).
 */
const finalChallengeMinMaxQuestion: {
  [accessor in MinMaxAccessorKeys]: { min: string; max: string }
} = {
  'economics.gdpPerCapita': {
    min: 'Select the country with the lowest GDP per capita',
    max: 'Select the country with the highest GDP per capita',
  },
  'economics.militarySpending': {
    min: 'Select the country with the lowest proportion of military spending',
    max: 'Select the country with the highest proportion of military spending',
  },
  'gender.womenInParliament': {
    max: 'Select the country with the highest proportion of women in parliament',
    min: 'Select the country with the lowest proportion of women in parliament',
  },
  'health.alcoholConsumption': {
    max: 'Select the country with the highest alcohol consumption',
    min: 'Select the country with the lowest alcohol consumption',
  },
  'health.obesity': {
    max: 'Select the country with the highest incidence of obesity',
    min: 'Select the country with the lowest incidence of obesity',
  },
  'humanRights.refugees': {
    max: 'Select the country with the largest refugee population',
    min: 'Select the country with the smallest refugee population',
  },
  'people.population': {
    max: 'Select the most populous country',
    min: 'Select the least populous country',
  },
}

// Soft parchment-friendly washes, one hue family apart per region, so the
// region board reads as one harmonious map instead of a shouting match:
// asia teal · europe cornflower · africa amber · n-america lavender ·
// oceania sage · middle-east dusty rose · s-america terracotta.
export const COLOR_CODED_REGIONS: { [region in Region]: CountryColorGrouping } = {
  asia: {
    color: 'hsla(178, 36%, 50%, 0.6)',
    countries: [
      'AF',
      'AM',
      'AZ',
      'BD',
      'BT',
      'BN',
      'KH',
      'CN',
      'GE',
      'IN',
      'ID',
      'JP',
      'KZ',
      'KR',
      'KP',
      'KG',
      'LA',
      'MY',
      'MV',
      'MN',
      'MM',
      'NP',
      'PK',
      'PH',
      'RU',
      'SG',
      'LK',
      'TW',
      'TJ',
      'TH',
      'TL',
      'TM',
      'UA',
      'UZ',
      'VN',
    ],
  },
  europe: {
    color: 'hsla(217, 52%, 62%, 0.6)',
    countries: [
      'AD',
      'AL',
      'AT',
      'BA',
      'BE',
      'BG',
      'BY',
      'CH',
      'CZ',
      'DE',
      'DK',
      'EE',
      'ES',
      'FI',
      'FR',
      'GB',
      'GR',
      'HR',
      'HU',
      'IE',
      'IS',
      'IT',
      'LI',
      'LT',
      'LU',
      'LV',
      'MC',
      'MD',
      'ME',
      'MK',
      'MT',
      'NL',
      'NO',
      'PL',
      'PT',
      'RO',
      'RS',
      'SE',
      'SI',
      'SK',
      'SM',
      'VA',
      'XK',
    ],
  },
  africa: {
    color: 'hsla(35, 70%, 60%, 0.65)',
    countries: [
      'EC',
      'AO',
      'BF',
      'BI',
      'BJ',
      'BW',
      'CD',
      'CF',
      'CG',
      'CI',
      'CM',
      'CV',
      'DJ',
      'DZ',
      'EG',
      'EH',
      'ER',
      'ET',
      'GA',
      'GH',
      'GM',
      'GN',
      'GQ',
      'GW',
      'IC',
      'KE',
      'KM',
      'LR',
      'LS',
      'LY',
      'MA',
      'MG',
      'ML',
      'MR',
      'MU',
      'MW',
      'MZ',
      'NA',
      'NE',
      'NG',
      'RW',
      'SC',
      'SD',
      'SL',
      'SN',
      'SO',
      'SS',
      'ST',
      'SZ',
      'TD',
      'TG',
      'TN',
      'TZ',
      'UG',
      'ZA',
      'ZM',
      'ZW',
    ],
  },
  'north-america': {
    color: 'hsla(262, 32%, 62%, 0.55)',
    countries: [
      'AG',
      'BS',
      'BB',
      'BZ',
      'CA',
      'CR',
      'CU',
      'DM',
      'DO',
      'SV',
      'GL',
      'GD',
      'GT',
      'HT',
      'HN',
      'JM',
      'MX',
      'NI',
      'PA',
      'KN',
      'LC',
      'TT',
      'US',
    ],
  },
  oceania: {
    color: 'hsla(135, 32%, 52%, 0.6)',
    countries: ['AU', 'FJ', 'KI', 'FM', 'NR', 'NZ', 'PW', 'PG', 'SB', 'TO', 'TV', 'VU'],
  },
  'middle-east': {
    color: 'hsla(345, 42%, 62%, 0.6)',
    countries: [
      'BH',
      'CY',
      'IR',
      'IQ',
      'IL',
      'JO',
      'KW',
      'LB',
      'OM',
      'PS',
      'QA',
      'SA',
      'SY',
      'TR',
      'AE',
      'YE',
    ],
  },
  'south-america': {
    color: 'hsla(12, 62%, 60%, 0.62)',
    countries: ['AR', 'GF', 'BO', 'BR', 'CL', 'CO', 'EC', 'GY', 'PY', 'PE', 'SR', 'UY', 'VE'],
  },
}
