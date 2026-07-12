import { BORDERS } from '~~/data/borders.gen'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { titlecaseLeader } from '~~/lib/leaders'
import { MAP_REGIONS } from '~~/data/map.gen'
import type {
  BornChallenge,
  CityNocturneChallenge,
  FinalChallenge,
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
import { shuffleArray } from '../arrays'
import { mainlandBox } from '../geo'
import { getValueByAccessorID } from '../values'
import { REGION_LABELS, variantCountries } from '../variant'

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
    }
  } catch {
    return undefined
  }
}

export const getFinalChallenges = ({ game }: { game: Game }): FinalChallenge => {
  const pool = variantCountries(game.variant)
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
  const pool = variantCountries(game.variant)
  const types = shuffleArray(eligibleTypes(game, pool))
  for (const type of [...types.filter(t => !exclude.includes(t)), ...types]) {
    const item = dealChallenge(type, pool, game.difficulty)
    if (item) return item
  }
  return undefined
}

const getRegionChallenge = (pool: ISOCountryCode[]): RegionChallenge => {
  const shuffled = shuffleArray([...pool])
  const country =
    shuffled.find(isoCode => {
      const area = COUNTRIES[isoCode].geography.area.total
      return !!area && area.amount > 400
    }) ?? shuffled[0]

  return {
    _type: 'region-challenge',
    country,
  }
}

const getLanguageChallenge = (pool: ISOCountryCode[]): LanguageChallenge => {
  const languages = pool.flatMap(isoCode => COUNTRIES[isoCode].languages)
  const language = shuffleArray(languages).shift()
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
  const organization = shuffleArray(eligibleOrganizations(pool)).shift()
  if (!organization) return undefined

  const exception = shuffleArray(
    pool.filter(isoCode => !isMemberOf(isoCode, organization))
  ).shift()
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
    const qualifying = pool.filter(
      isoCode => (COUNTRIES[isoCode].government.independence?.amount ?? 0) > year
    ).length
    // Enough valid answers to be findable, few enough to need real knowledge
    if (qualifying >= Math.max(3, quota) && qualifying <= pool.length / 2) {
      return { _type: 'born-challenge', year, quota }
    }
  }
  return undefined
}

const getMadeChallenge = (pool: ISOCountryCode[]): MadeChallenge | undefined => {
  const exporterCounts = new Map<string, number>()
  for (const isoCode of pool) {
    for (const item of COUNTRIES[isoCode].economics.exports ?? []) {
      exporterCounts.set(item, (exporterCounts.get(item) ?? 0) + 1)
    }
  }
  const commodity = shuffleArray(
    [...exporterCounts.entries()].filter(([, count]) => count >= 2 && count <= 8).map(([c]) => c)
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
    const countries = windowed.sort(
      (a, b) => sunsetDuskCoordinate(b) - sunsetDuskCoordinate(a)
    )
    return {
      _type: 'sunset-blitz-challenge',
      countries,
      quotaRatio: SUNSET_QUOTA_RATIO,
      durationSeconds: Math.min(90, Math.max(40, countries.length * SUNSET_SECONDS_PER_COUNTRY)),
    }
  }
  return undefined
}

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
