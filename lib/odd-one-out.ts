import { sampleMany } from '~~/lib/arrays'
import { countryName, getCountry } from '~~/lib/country'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * How the sheet that lists an odd-one-out question's lit countries orders and
 * groups them (components/challenge/MembershipSheet.vue).
 *
 * Grouping by region was the obvious design and it hands over the answer: every
 * African Union member is African, so a non-African impostor stands alone under
 * its own heading — 100% of AU deals, 80% of EU, 69% of NATO. A first letter
 * carries no membership signal, so a lone row under "P" says nothing.
 *
 * Short rosters get no headings at all: six CSTO members cannot spread over the
 * alphabet, and heading a list that sparse would strand three quarters of its
 * impostors. Flat is safe.
 */

/** Below this a list reads fine as one block and headings are noise — or worse. */
export const MIN_ROWS_FOR_LETTERS = 12

/**
 * Longest lineup worth putting in front of a player. The Convention on the
 * Rights of the Child binds 191 countries; lighting all of them is a lit
 * planet with no question in it, and a roster that long is scrolled past
 * rather than read. Roughly a screen and a half on a phone.
 */
export const MAX_LINEUP = 24

/**
 * Fewest bound countries a question needs to be worth dealing. Below this the
 * lineup is too thin to hide the odd one out among — and unlike the size of
 * the unbound pool, this one matters, because the lineup IS the question: the
 * map tap is gated to it, so nothing outside is ever a legal answer.
 */
export const MIN_LINEUP_BOUND = 4

/**
 * The countries a question actually puts on the board: the odd one out, plus
 * enough of the bound set to hide it in. Sampling keeps a huge instrument
 * playable without changing what is being asked.
 *
 * The odd one out is added LAST and the result sorted, so its position carries
 * no information — appending it to a sampled list would park the answer at the
 * end of every lineup.
 */
export const buildLineup = (
  oddOneOut: ISOCountryCode,
  bound: ISOCountryCode[],
  limit = MAX_LINEUP
): ISOCountryCode[] => {
  const others = bound.filter(isoCode => isoCode !== oddOneOut)
  const kept = others.length > limit - 1 ? sampleMany(others, limit - 1) : others
  return [...kept, oddOneOut].sort((a, b) =>
    countryName(getCountry(a)).localeCompare(countryName(getCountry(b)))
  )
}

/** The grouping key: first letter of the displayed name. */
export const groupKey = (isoCode: ISOCountryCode) =>
  countryName(getCountry(isoCode)).slice(0, 1).toUpperCase()

export interface LetterGroup {
  letter: string
  isoCodes: ISOCountryCode[]
}

/**
 * Alphabetical, split into letter buckets once the list earns them. A stable
 * order matters: a player who scrolls away and back keeps their place.
 */
export const groupByLetter = (isoCodes: ISOCountryCode[], headings: boolean): LetterGroup[] => {
  const sorted = [...isoCodes].sort((a, b) =>
    countryName(getCountry(a)).localeCompare(countryName(getCountry(b)))
  )
  if (!headings) return sorted.length ? [{ letter: '', isoCodes: sorted }] : []

  const groups: LetterGroup[] = []
  for (const isoCode of sorted) {
    const letter = groupKey(isoCode)
    const last = groups[groups.length - 1]
    if (last?.letter === letter) last.isoCodes.push(isoCode)
    else groups.push({ letter, isoCodes: [isoCode] })
  }
  return groups
}
