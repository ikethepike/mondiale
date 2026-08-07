/**
 * Rosetta's relations — the analogy gate's single source of truth.
 *
 * A round reads "K2 : Pakistan :: Cerro Aconcagua : ___". The exemplar pair
 * is what tells the player WHICH relation is meant, so the same right-hand
 * term can head three different questions ("Tokyo : Japan", "Fuji : Japan",
 * "Yen : Japan") without either one being ambiguous.
 *
 * Everest deliberately heads nothing — the Factbook gives it to China AND
 * Nepal, so `rosettaTerms` drops it. Illustrations here have to be dealable,
 * or the next reader "fixes" the guard to make the example work.
 *
 * The dealer, the buyable hint and the reveal all read this table, so the
 * relation a round asks and the relation its lesson explains agree by
 * construction rather than by a comment.
 */
import { COUNTRIES } from '~~/data/countries.gen'
import { LANDMARKS } from '~~/data/landmarks.gen'
import type { ISOCountryCode } from '~~/types/geography.types'
import { mentionsCountry } from './country'
import { currencyName } from './currency'
import { politicalLeader } from './leaders'
import { normalizeAnswer } from './strings'

export interface RosettaRelation {
  /** The relation in words — the hint's content and the reveal's lesson. */
  label: string
  /** Left-hand terms this country can supply, display-ready. Empty when the
   *  country carries no value for the relation. */
  terms: (isoCode: ISOCountryCode) => string[]
}

/** Landmarks grouped by country, built once — LANDMARKS is a flat slug map. */
let landmarksByCountry: Partial<Record<ISOCountryCode, string[]>> | undefined
const landmarkNames = (isoCode: ISOCountryCode): string[] => {
  if (!landmarksByCountry) {
    landmarksByCountry = {}
    for (const entry of Object.values(LANDMARKS)) {
      ;(landmarksByCountry[entry.country] ??= []).push(entry.name)
    }
  }
  return landmarksByCountry[isoCode] ?? []
}

export const ROSETTA_RELATIONS = {
  capital: {
    label: 'its capital city',
    terms: isoCode => [COUNTRIES[isoCode]?.geography.capital.name].filter(Boolean) as string[],
  },
  peak: {
    label: 'its highest mountain',
    terms: isoCode => [COUNTRIES[isoCode]?.geography.highestPeak?.name].filter(Boolean) as string[],
  },
  currency: {
    label: 'its currency',
    terms: isoCode => {
      const code = COUNTRIES[isoCode]?.currency
      return code ? [currencyName(code)].filter(Boolean) : []
    },
  },
  leader: {
    label: 'who leads it',
    terms: isoCode => [politicalLeader(isoCode)?.name].filter(Boolean) as string[],
  },
  // No demonym relation: `mentionsCountry` reads `name.demonyms` as markers,
  // so every demonym betrays its own country by definition and the scrub
  // rejects all 193 of them. That is the giveaway gate working, not a gap —
  // "Dane : Denmark" is not a question.
  landmark: {
    label: 'a landmark you find there',
    terms: landmarkNames,
  },
} as const satisfies Record<string, RosettaRelation>

export type RosettaRelationId = keyof typeof ROSETTA_RELATIONS

export const rosettaRelationIds = Object.keys(ROSETTA_RELATIONS) as RosettaRelationId[]

/** One dealable side of an analogy: a term and the country it points at. */
export interface RosettaTerm {
  isoCode: ISOCountryCode
  term: string
}

/**
 * Every (country, term) pair for a relation that can safely head an analogy.
 *
 * Two guards, and both matter:
 *
 * 1. **Uniqueness across the whole world**, not the board. A term unique among
 *    the countries in play but shared globally (a Caribbean dollar, a euro)
 *    would mark a legitimate answer wrong the moment someone names the other
 *    country. Rosetta submits a strict ISO code, so the term must identify
 *    exactly one country on earth.
 * 2. **The term must not name its own country.** "Mexico City", "Kuwaiti
 *    dinar" and "Guatemala City" answer the question themselves; the scrub is
 *    `mentionsCountry`, the same one the leader hints depend on.
 *
 * The order is load-bearing: index EVERY term first, then scrub. Scrubbing as
 * we index would drop Switzerland's "Swiss franc" (it names its own country)
 * and leave Liechtenstein holding the term alone — a "unique" answer that
 * marks Switzerland wrong.
 *
 * Memoized per (relation, world): the dealer tries relations until one yields,
 * so a single gate could walk the whole atlas five times over, and every input
 * is generated data read through deterministic selectors. Callers get a copy —
 * they all filter and shuffle what comes back.
 */
const termCache = new Map<string, RosettaTerm[]>()

export const rosettaTerms = (
  relation: RosettaRelationId,
  world: readonly ISOCountryCode[]
): RosettaTerm[] => {
  const cacheKey = `${relation}|${world.join(',')}`
  const cached = termCache.get(cacheKey)
  if (cached) return [...cached]

  const { terms } = ROSETTA_RELATIONS[relation]
  const byTerm = new Map<string, RosettaTerm[]>()

  for (const isoCode of world) {
    for (const term of terms(isoCode)) {
      const key = normalizeAnswer(term)
      if (!key) continue
      const bucket = byTerm.get(key)
      if (bucket) bucket.push({ isoCode, term })
      else byTerm.set(key, [{ isoCode, term }])
    }
  }

  const dealable = [...byTerm.values()]
    // One distinct COUNTRY per term, not one entry — a country listing the
    // same landmark twice must not disqualify its own term.
    .filter(bucket => bucket.every(entry => entry.isoCode === bucket[0].isoCode))
    .map(bucket => bucket[0])
    .filter(entry => !mentionsCountry(entry.term, entry.isoCode))

  termCache.set(cacheKey, dealable)
  return [...dealable]
}
