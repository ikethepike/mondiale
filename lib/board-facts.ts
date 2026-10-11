import { BORDERS } from '~~/data/borders.gen'
import type { CAPITAL_FACTS } from '~~/data/capital-facts.gen'
import { CHANGES } from '~~/data/changes.gen'
import { EMPIRES } from '~~/data/empires.gen'
import { EVENTS } from '~~/data/events.gen'
import { FAR_FLUNG } from '~~/data/far-flung.gen'
import type { FLAG_MEANINGS } from '~~/data/flag-meanings.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type { NAME_FACTS } from '~~/data/name-facts.gen'
import { sample, weightedPick } from '~~/lib/arrays'
import { datasetAttribution, statSourceLine } from '~~/lib/attribution'
import { countryInProse, countryName, getCountry } from '~~/lib/country'
import { isCountryPlayable } from '~~/lib/game-rules'
import { formatProseNumber } from '~~/lib/number'
import { listJoin, sentenceCase } from '~~/lib/strings'
import { curatedPlaces } from '~~/lib/places'
import { getValueByAccessorID } from '~~/lib/values'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import { isFameDealable, type Fame } from '~~/types/fame.types'
import type { GameRules } from '~~/types/game.types'
import { type Amount, type ISOCountryCode, isValidISOCode } from '~~/types/geography.types'

export const BOARD_FACT_FAMILIES = [
  'record',
  'landmark',
  'history',
  'name',
  'capital',
  'flag',
  'far-flung',
  'change',
  'empire',
  'borders',
  'clock',
] as const
export type BoardFactFamily = (typeof BOARD_FACT_FAMILIES)[number]

export interface BoardFact {
  /** Stable across loads — the no-repeat memory keys on it. */
  id: string
  family: BoardFactFamily
  /** The subject, small-caps above the fact. */
  kicker: string
  text: string
  source?: string
  /** What the fact is about — a fact rides a board only if one of these is in play. */
  countries: ISOCountryCode[]
  fame?: Fame
}

export const BOARD_FACT_TUNING = {
  maxChars: 230,
  minChars: 70,
  /** Families the next pick avoids, newest last. */
  familyMemory: 4,
  weights: {
    record: 3,
    landmark: 3,
    history: 3,
    name: 2,
    capital: 2,
    flag: 2,
    'far-flung': 2,
    change: 2,
    empire: 2,
    borders: 1,
    clock: 1,
  } satisfies Record<BoardFactFamily, number>,
} as const

// Factbook all-caps surnames ("Floki VILGERDARSON") that are not acronyms.
const KEEP_CAPS = new Set(['USA', 'USSR', 'NATO', 'UAE', 'DRC', 'OPEC', 'ASEAN', 'UNESCO', 'BCE'])
const ROMAN_NUMERAL = /^[IVXLCDM]+$/

/** Factbook prose as a sentence: italics' stray spaces closed, surnames unshouted. */
export const tidyFactbookText = (text: string): string =>
  text
    .replace(/\s+([,;:.)])/g, '$1')
    .replace(/\s*--\s*/g, ' — ')
    .replace(/\b[A-Z][A-Z'’-]{2,}\b/g, word =>
      KEEP_CAPS.has(word) || ROMAN_NUMERAL.test(word)
        ? word
        : word.toLowerCase().replace(/(^|[-'’])\p{L}/gu, letter => letter.toUpperCase())
    )
    .replace(/\s{2,}/g, ' ')
    .trim()

const finish = (text: string): string => {
  const sentence = sentenceCase(text.trim()).replace(
    /^(["“‘])(\p{Ll})/u,
    (_, quote: string, letter: string) => `${quote}${letter.toUpperCase()}`
  )
  return /[.!?…]["”’)]?$/.test(sentence) ? sentence : `${sentence}.`
}

/**
 * The longest run of whole units (Factbook clauses, then sentences) that fits
 * the aside, or undefined when even the first unit is too long or too thin.
 * "I. M. Pei" never splits: a sentence ends after two lowercase letters.
 */
export const fitFactText = (text: string, maxChars = BOARD_FACT_TUNING.maxChars) => {
  const units = text.includes('; ')
    ? text.split('; ')
    : text.split(/(?<=[\p{Ll}\d"”’)]{2}[.!?])\s+(?=["“\p{Lu}])/u)
  const separator = text.includes('; ') ? '; ' : ' '
  let kept = ''
  for (const unit of units) {
    const next = kept ? `${kept}${separator}${unit}` : unit
    if (next.length > maxChars) break
    kept = next
  }
  if (kept.length < BOARD_FACT_TUNING.minChars) return undefined
  return finish(kept.replace(/[;,:]$/, ''))
}

const factbookSource = (dataset: 'name-facts' | 'capitals' | 'flag-meanings') =>
  datasetAttribution(dataset).find(origin => origin.sourceId === 'cia-factbook')?.credit

const ETYMOLOGY_SIGNAL = /\bmean|named|"|“|deriv|comes? from|translat|refers? to/i
const DULL_ETYMOLOGY = /self-descriptive|^(?!.*["“]).*\b(unclear|obscure|unknown|uncertain)\b/i

const nameFacts = (names: typeof NAME_FACTS): BoardFact[] =>
  Object.entries(names).flatMap(([isoCode, entry]) => {
    const raw = entry?.etymology
    if (!raw || !isValidISOCode(isoCode) || !ETYMOLOGY_SIGNAL.test(raw)) return []
    if (DULL_ETYMOLOGY.test(raw) || / - /.test(raw)) return []
    const text = fitFactText(tidyFactbookText(raw))
    if (!text) return []
    return [
      {
        id: `name:${isoCode}`,
        family: 'name' as const,
        kicker: `Name origins · ${countryName(isoCode)}`,
        text,
        source: factbookSource('name-facts'),
        countries: [isoCode],
      },
    ]
  })

const capitalFacts = (capitals: typeof CAPITAL_FACTS): BoardFact[] =>
  Object.entries(capitals).flatMap(([isoCode, entry]) => {
    const raw = entry?.etymology
    if (!raw || !isValidISOCode(isoCode) || !ETYMOLOGY_SIGNAL.test(raw) || / - /.test(raw)) {
      return []
    }
    const text = fitFactText(tidyFactbookText(raw))
    if (!text) return []
    const capital = getCountry(isoCode).geography.capital.name
    return [
      {
        id: `capital:${isoCode}`,
        family: 'capital' as const,
        kicker: `${capital} · ${countryName(isoCode)}`,
        text,
        source: factbookSource('capitals'),
        countries: [isoCode],
      },
    ]
  })

const utcOffset = (timezone: string | undefined): number | undefined => {
  const match = timezone?.match(/^UTC(?:([+-]\d+(?:\.\d+)?))?$/)
  return match ? Number(match[1] ?? 0) : undefined
}

const offsetPhrase = (offset: number): string => {
  const hours = Math.floor(Math.abs(offset))
  const minutes = Math.round((Math.abs(offset) - hours) * 60)
  const hourPart = `${hours} hour${hours === 1 ? '' : 's'}`
  return minutes ? `${hourPart} ${minutes} minutes` : hourPart
}

const clockFacts = (capitals: typeof CAPITAL_FACTS): BoardFact[] => {
  const offsets = Object.entries(capitals).flatMap(([isoCode, entry]) => {
    const offset = utcOffset(entry?.timezone)
    return offset !== undefined && isValidISOCode(isoCode) ? [{ isoCode, offset }] : []
  })
  const offTheHour = offsets.filter(({ offset }) => !Number.isInteger(offset))
  const furthestAhead = Math.max(...offsets.map(({ offset }) => offset))
  const source = factbookSource('capitals')
  const capital = (isoCode: ISOCountryCode) => getCountry(isoCode).geography.capital.name

  return offsets.flatMap(({ isoCode, offset }) => {
    const side = offset > 0 ? 'ahead of' : 'behind'
    const text = !Number.isInteger(offset)
      ? `${capital(isoCode)} keeps time ${offsetPhrase(offset)} ${side} UTC — one of only ${offTheHour.length} national capitals whose clocks sit off the whole hour.`
      : offset === furthestAhead
        ? `${capital(isoCode)} runs ${offsetPhrase(offset)} ahead of UTC, so it is among the first capitals on Earth to see each new day.`
        : undefined
    if (!text) return []
    return [
      {
        id: `clock:${isoCode}`,
        family: 'clock' as const,
        kicker: `Local time · ${capital(isoCode)}`,
        text,
        source,
        countries: [isoCode],
      },
    ]
  })
}

const BLAND_FLAG = /no set meaning|is a national symbol\.?$/i

const flagFacts = (flags: typeof FLAG_MEANINGS): BoardFact[] =>
  Object.entries(flags).flatMap(([isoCode, entry]) => {
    if (!entry || !isValidISOCode(isoCode)) return []
    return (['meaning', 'history'] as const).flatMap(field => {
      const raw = entry[field]
      if (!raw || BLAND_FLAG.test(raw)) return []
      const text = fitFactText(tidyFactbookText(raw))
      if (!text) return []
      return [
        {
          id: `flag-${field}:${isoCode}`,
          family: 'flag' as const,
          kicker: `Flag of ${countryInProse(isoCode)}`,
          text,
          source: factbookSource('flag-meanings'),
          countries: [isoCode],
        },
      ]
    })
  })

interface RecordSpec {
  accessor: GroupChallengeAccessorId
  end: 'max' | 'min'
  digits?: number
  /** Several countries may share the record (they are listed); otherwise a tie voids it. */
  shareable?: boolean
  phrase: (country: string, value: string, amount: Amount<string>) => string
}

const RECORDS: RecordSpec[] = [
  {
    accessor: 'people.medianAge',
    end: 'max',
    digits: 1,
    phrase: (c, v) =>
      `Half the people in ${c} are over ${v} years old — the oldest population of any country.`,
  },
  {
    accessor: 'people.medianAge',
    end: 'min',
    digits: 1,
    phrase: (c, v) =>
      `Half the people in ${c} are younger than ${v} — the youngest population on Earth.`,
  },
  {
    accessor: 'people.lifeExpectancy',
    end: 'max',
    digits: 1,
    phrase: (c, v) =>
      `A baby born in ${c} can expect to live ${v} years, longer than anywhere else.`,
  },
  {
    accessor: 'people.childrenPerWoman',
    end: 'max',
    digits: 1,
    phrase: (c, v) =>
      `Women in ${c} have ${v} children on average — the highest fertility rate in the world.`,
  },
  {
    accessor: 'people.childrenPerWoman',
    end: 'min',
    digits: 2,
    phrase: (c, v) => `${c} has the lowest fertility rate in the world: ${v} children per woman.`,
  },
  {
    accessor: 'people.density',
    end: 'max',
    phrase: (c, v) =>
      `${c} fits ${v} people into each square kilometre — the most crowded country on Earth.`,
  },
  {
    accessor: 'people.density',
    end: 'min',
    digits: 1,
    phrase: (c, v) =>
      `${c} has just ${v} people per square kilometre, the emptiest country on the map.`,
  },
  {
    accessor: 'people.sexRatio',
    end: 'max',
    phrase: (c, _v, amount) =>
      `Men outnumber women in ${c} by roughly ${(amount.amount / 100).toFixed(1)} to 1, the most lopsided ratio of any country.`,
  },
  {
    accessor: 'people.sexRatio',
    end: 'min',
    phrase: (c, v) => `${c} has only ${v} men for every 100 women — fewer than any other country.`,
  },
  {
    accessor: 'geography.highestPeak',
    end: 'min',
    shareable: true,
    phrase: (c, v) =>
      `The highest ground in ${c} rises just ${v} m above the sea — the lowest high point of any country.`,
  },
  {
    accessor: 'geography.area.forested',
    end: 'max',
    phrase: (c, v) => `Forest covers ${v}% of ${c} — more of its land than any other country.`,
  },
  {
    accessor: 'health.maleHeight',
    end: 'max',
    digits: 1,
    phrase: (c, v) => `Men in ${c} average ${v} cm — the tallest in the world.`,
  },
  {
    accessor: 'health.meatConsumption',
    end: 'max',
    phrase: (c, v) =>
      `The average person in ${c} eats ${v} kg of meat a year — more than anywhere else.`,
  },
  {
    accessor: 'health.alcoholConsumption',
    end: 'max',
    digits: 1,
    phrase: (c, v) =>
      `${c} drinks more per person than any other country: ${v} litres of pure alcohol a year.`,
  },
  {
    accessor: 'economics.touristArrivals',
    end: 'max',
    phrase: (c, v) =>
      `${c} welcomes more foreign visitors than any other country — about ${v} a year.`,
  },
  {
    accessor: 'economics.workingHours',
    end: 'max',
    phrase: (c, v) =>
      `Workers in ${c} put in about ${v} hours a year, the most of any country with figures.`,
  },
  {
    accessor: 'economics.workingHours',
    end: 'min',
    phrase: (c, v) =>
      `Workers in ${c} put in about ${v} hours a year, the fewest of any country with figures.`,
  },
  {
    accessor: 'environment.protectedLand',
    end: 'max',
    phrase: (c, v) => `${c} protects ${v}% of its land — a larger share than any other country.`,
  },
  {
    accessor: 'environment.freshwaterPerCapita',
    end: 'max',
    phrase: (c, v) =>
      `${c} has ${v} m³ of renewable fresh water per person — more than any other country.`,
  },
  {
    accessor: 'environment.evSalesShare',
    end: 'max',
    phrase: (c, v) =>
      `${v}% of new cars sold in ${c} are electric — the highest share of any country with figures.`,
  },
  {
    accessor: 'environment.airPollution',
    end: 'min',
    digits: 1,
    phrase: (c, v) =>
      `${c} has the cleanest air of any country, averaging ${v} µg/m³ of fine particles.`,
  },
  {
    accessor: 'gender.womenInParliament',
    end: 'max',
    digits: 1,
    phrase: (c, v) =>
      `Women hold ${v}% of the seats in ${c}’s parliament, the highest share in the world.`,
  },
  {
    accessor: 'infrastructure.rail',
    end: 'max',
    phrase: (c, v) => `${c} has ${v} km of railway — the longest network of any country.`,
  },
  {
    accessor: 'government.happiness',
    end: 'max',
    digits: 2,
    phrase: (c, v) => `${c} tops the World Happiness Report, scoring ${v} out of 10.`,
  },
  {
    accessor: 'energy.consumptionPerCapita',
    end: 'max',
    phrase: (c, v) =>
      `The average person in ${c} uses ${v} kWh of energy a year — the most of any country.`,
  },
  {
    accessor: 'economics.gdpPerCapita',
    end: 'max',
    phrase: (c, v) =>
      `${c} is the world’s richest country per person, producing about $${v} a head.`,
  },
]

const recordFacts = (): BoardFact[] =>
  RECORDS.flatMap(spec => {
    const ranked = ISOCountryCodes.flatMap(isoCode => {
      const amount = getValueByAccessorID(isoCode, spec.accessor)
      return amount && Number.isFinite(amount.amount) ? [{ isoCode, amount }] : []
    }).sort((a, b) =>
      spec.end === 'max' ? b.amount.amount - a.amount.amount : a.amount.amount - b.amount.amount
    )
    const best = ranked[0]
    if (!best) return []
    const holders = ranked.filter(entry => entry.amount.amount === best.amount.amount)
    if (holders.length > 1 && !spec.shareable) return []
    const value = formatProseNumber(best.amount.amount, spec.digits ?? 0)
    const subject = listJoin(holders.map(({ isoCode }) => countryInProse(isoCode)))
    return [
      {
        id: `record:${spec.accessor}:${spec.end}`,
        family: 'record' as const,
        kicker: `World record · ${listJoin(holders.map(({ isoCode }) => countryName(isoCode)))}`,
        text: finish(spec.phrase(subject, value, best.amount)),
        source: statSourceLine(spec.accessor, best.amount),
        countries: holders.map(({ isoCode }) => isoCode),
      },
    ]
  })

const borderFacts = (): BoardFact[] => {
  const entries = Object.entries(BORDERS).filter(([isoCode]) => isValidISOCode(isoCode)) as [
    ISOCountryCode,
    ISOCountryCode[],
  ][]
  const most = Math.max(...entries.map(([, neighbours]) => neighbours.length))
  const champions = entries.filter(([, neighbours]) => neighbours.length === most)
  const source = datasetAttribution('borders')[0]?.credit
  const championNames = listJoin(champions.map(([isoCode]) => countryInProse(isoCode)))
  const record: BoardFact = {
    id: 'borders:most',
    family: 'borders',
    kicker: `Borders · ${listJoin(champions.map(([isoCode]) => countryName(isoCode)))}`,
    text: finish(
      `${championNames} ${champions.length > 1 ? 'each share' : 'shares'} a land border with ${most} countries — more than any other`
    ),
    source,
    countries: champions.map(([isoCode]) => isoCode),
  }
  const loners = entries
    .filter(([, neighbours]) => neighbours.length === 1)
    .map(([isoCode, [neighbour]]) => ({
      id: `borders:only:${isoCode}`,
      family: 'borders' as const,
      kicker: `Borders · ${countryName(isoCode)}`,
      text: finish(
        `The only country ${countryInProse(isoCode)} shares a land border with is ${countryInProse(neighbour!)}`
      ),
      source,
      countries: [isoCode, neighbour!],
    }))
  return [record, ...loners]
}

const proseFact = (
  family: BoardFactFamily,
  id: string,
  kicker: string,
  raw: string | undefined,
  countries: string[],
  fame?: Fame
): BoardFact[] => {
  const valid = countries.filter(isValidISOCode)
  const text = raw ? fitFactText(raw) : undefined
  if (!text || !valid.length) return []
  return [
    { id: `${family}:${id}`, family, kicker, text, countries: valid, ...(fame ? { fame } : {}) },
  ]
}

const buildBoardFacts = (
  names: typeof NAME_FACTS,
  capitals: typeof CAPITAL_FACTS,
  flags: typeof FLAG_MEANINGS
): BoardFact[] => [
  ...recordFacts(),
  ...nameFacts(names),
  ...capitalFacts(capitals),
  ...clockFacts(capitals),
  ...flagFacts(flags),
  ...borderFacts(),
  ...curatedPlaces().flatMap(([slug, place]) =>
    proseFact(
      'landmark',
      slug,
      `${place.name} · ${countryName(place.country)}`,
      place.description,
      [place.country],
      place.curated.fame
    )
  ),
  ...Object.entries(EVENTS).flatMap(([slug, event]) =>
    proseFact(
      'history',
      slug,
      event.name,
      event.description,
      [event.country],
      event.fame ?? 'minor'
    )
  ),
  ...Object.values(EMPIRES).flatMap(empire =>
    proseFact('empire', empire.id, empire.name, empire.blurb, empire.members.core, empire.fame)
  ),
  ...Object.entries(CHANGES).flatMap(([slug, change]) =>
    proseFact('change', slug, `Then and now · ${change.name}`, change.description, change.countries)
  ),
  ...Object.entries(FAR_FLUNG).flatMap(([slug, piece]) =>
    proseFact('far-flung', slug, `${piece.name} · ${countryName(piece.iso)}`, piece.blurb, [
      piece.iso,
    ])
  ),
]

let deck: Promise<BoardFact[]> | undefined

/** Every fact the board can tell, built once; the Factbook prose rides its own lazy chunks. */
export const loadBoardFacts = (): Promise<BoardFact[]> => {
  deck ??= Promise.all([
    import('~~/data/name-facts.gen'),
    import('~~/data/capital-facts.gen'),
    import('~~/data/flag-meanings.gen'),
  ])
    .then(([names, capitals, flags]) =>
      buildBoardFacts(names.NAME_FACTS, capitals.CAPITAL_FACTS, flags.FLAG_MEANINGS)
    )
    .catch(error => {
      deck = undefined
      throw error
    })
  return deck
}

export interface BoardFactContext {
  rules: GameRules
  seen: ReadonlySet<string>
  /** Families shown so far, oldest first. */
  recent: readonly BoardFactFamily[]
  /** A country the table just played — its facts jump the queue. */
  focus?: ISOCountryCode
  random?: () => number
}

/** Unseen facts this board can show: about a country in play, at a fame the difficulty deals. */
export const dealableBoardFacts = (
  facts: readonly BoardFact[],
  rules: GameRules,
  seen: ReadonlySet<string>
): BoardFact[] =>
  facts.filter(
    fact =>
      !seen.has(fact.id) &&
      (!fact.fame || isFameDealable(fact.fame, rules.difficulty)) &&
      fact.countries.some(isoCode => isCountryPlayable(rules, isoCode))
  )

/**
 * The next fact: the focus country's first, then a family the last few picks
 * did not use, weighted, then any unseen fact in it. Undefined once the board
 * has seen everything it may show.
 */
export const pickBoardFact = (
  facts: readonly BoardFact[],
  context: BoardFactContext
): BoardFact | undefined => {
  const pool = dealableBoardFacts(facts, context.rules, context.seen)
  const focused = context.focus ? pool.filter(fact => fact.countries.includes(context.focus!)) : []
  const candidates = focused.length ? focused : pool
  const families = [...new Set(candidates.map(fact => fact.family))]
  const recent = new Set(context.recent.slice(-BOARD_FACT_TUNING.familyMemory))
  const fresh = families.filter(family => !recent.has(family))
  const family = weightedPick(
    (fresh.length ? fresh : families).map(name => [name, BOARD_FACT_TUNING.weights[name]] as const),
    context.random
  )
  return sample(
    candidates.filter(fact => fact.family === family),
    context.random
  )
}
