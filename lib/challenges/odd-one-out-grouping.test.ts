/**
 * The sheet that lists an odd-one-out question's lit countries groups them by
 * first letter, and only once the list is long enough to need headings
 * (components/challenge/MembershipSheet.vue). Both halves of that rule are
 * load-bearing, and this is their tripwire.
 *
 * Region grouping was the obvious design and it hands over the answer: every
 * African Union member is African, so a non-African impostor stands alone under
 * its own heading — 100% of AU deals, 80% of EU, 69% of NATO.
 *
 * A first letter carries no membership signal, so a lone row under "P" says
 * nothing. It is still worth keeping rare, and it falls to roughly a quarter
 * (AU) or a tenth (NATO, OECD). The exception is a short roster: the CSTO's six
 * members cannot cover the alphabet, so 76% of its impostors would be alone.
 * That is why headings only appear past MIN_ROWS_FOR_LETTERS — a short list
 * renders flat, with no headings to read anything into.
 */
import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { countryName, getCountry } from '~~/lib/country'
import {
  buildLineup,
  groupByLetter,
  groupKey,
  MAX_LINEUP,
  MIN_ROWS_FOR_LETTERS,
} from '~~/lib/odd-one-out'
import { type ISOCountryCode } from '~~/types/geography.types'
import { OrganizationVector } from '~~/types/organization.type'

type OrgId = keyof typeof OrganizationVector

const all = Object.values(COUNTRIES)
const membersOf = (org: OrgId) =>
  all.filter(country => country.membership.some(entry => entry.id === org))
const nonMembersOf = (org: OrgId) =>
  all.filter(country => !country.membership.some(entry => entry.id === org))



/** Share of legal impostors that would sit alone under their own heading. */
const strandedShare = (org: OrgId, key: (isoCode: ISOCountryCode) => string) => {
  const members = membersOf(org).map(country => country.isoCode)
  const counts = new Map<string, number>()
  for (const isoCode of members) counts.set(key(isoCode), (counts.get(key(isoCode)) ?? 0) + 1)
  const impostors = nonMembersOf(org)
  const alone = impostors.filter(country => !counts.has(key(country.isoCode)))
  return alone.length / impostors.length
}

const regionKey = (isoCode: ISOCountryCode) => getCountry(isoCode).region

describe('odd-one-out sheet grouping', () => {
  it('shows no headings on a roster too short to spread over the alphabet', () => {
    // The CSTO is the case: six members, and a letter heading would strand
    // three quarters of its impostors. The sheet renders it flat instead.
    for (const org of Object.keys(OrganizationVector) as OrgId[]) {
      if (membersOf(org).length + 1 >= MIN_ROWS_FOR_LETTERS) continue
      expect(strandedShare(org, groupKey)).toBeGreaterThan(0.5)
    }
  })

  it('beats the region key wherever headings actually render', () => {
    for (const org of Object.keys(OrganizationVector) as OrgId[]) {
      if (membersOf(org).length + 1 < MIN_ROWS_FOR_LETTERS) continue
      // BRI is the one org spread across six regions, so region grouping is
      // already safe there; everywhere else the letter key must win outright.
      if (org === 'bri') continue
      expect(`${org}: letter beats region`).toBe(
        strandedShare(org, groupKey) < strandedShare(org, regionKey)
          ? `${org}: letter beats region`
          : `${org}: region wins — regrouping leaked`
      )
    }
  })

  // The measurement that killed region grouping, kept as this file's reason
  // for existing: propose it again and the cost is right here.
  it('strands every African Union impostor under a region key', () => {
    expect(strandedShare('au', regionKey)).toBe(1)
    expect(strandedShare('au', groupKey)).toBeLessThan(0.3)
  })

  it('groups every country exactly once, headings or not', () => {
    const lit = [...membersOf('au').map(country => country.isoCode), 'PT' as ISOCountryCode]
    for (const headings of [true, false]) {
      const grouped = groupByLetter(lit, headings).flatMap(group => group.isoCodes)
      expect(grouped.length).toBe(lit.length)
      expect(new Set(grouped)).toEqual(new Set(lit))
    }
  })

  it('sorts alphabetically so a scrolled position survives a re-render', () => {
    const grouped = groupByLetter(['ZW', 'AO', 'KE'] as ISOCountryCode[], false)
    expect(grouped[0]?.isoCodes).toEqual(['AO', 'KE', 'ZW'])
  })
})

describe('odd-one-out lineup', () => {
  const bound = Object.values(COUNTRIES).map(country => country.isoCode)

  it('caps a huge instrument at a readable length', () => {
    // The CRC binds 191 countries; the lineup has to stay something a player
    // reads rather than scrolls past.
    const lineup = buildLineup('US', bound)
    expect(lineup.length).toBe(MAX_LINEUP)
  })

  it('always contains the odd one out', () => {
    for (const oddOneOut of ['US', 'PT', 'ZW'] as ISOCountryCode[]) {
      expect(buildLineup(oddOneOut, bound)).toContain(oddOneOut)
    }
  })

  it('gives the odd one out no fixed position', () => {
    // Appending it to a sampled list would park the answer at the same index
    // every deal. Sorting means it lands wherever its name does — which for
    // "United States" is often late, but never reliably.
    const positions = new Set<number>()
    for (let attempt = 0; attempt < 40; attempt++) {
      positions.add(buildLineup('US', bound).indexOf('US' as ISOCountryCode))
    }
    expect(positions.size).toBeGreaterThan(1)
  })

  it('orders the lineup by name, so position tracks the alphabet only', () => {
    const lineup = buildLineup('US', bound)
    const names = lineup.map(isoCode => countryName(getCountry(isoCode)))
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('keeps a short roster whole', () => {
    const csto = Object.values(COUNTRIES)
      .filter(country => country.membership.some(entry => entry.id === 'csto'))
      .map(country => country.isoCode)
    const lineup = buildLineup('MN' as ISOCountryCode, csto)
    expect(lineup.length).toBe(csto.length + 1)
    expect(new Set(lineup)).toEqual(new Set([...csto, 'MN']))
  })

  it('lists no country twice when the odd one out is already bound', () => {
    const lineup = buildLineup('SE' as ISOCountryCode, bound)
    expect(lineup.length).toBe(new Set(lineup).size)
  })
})
