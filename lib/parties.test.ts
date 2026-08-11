import { describe, expect, it } from 'vitest'
import { PARTIES } from '~~/data/parties.gen'
import {
  countriesInGrouping,
  governingParty,
  oppositionParties,
  partiesOf,
  partiesWithLogo,
  partySpectrum,
  partyTokens,
  seatedParties,
  SPECTRUM_BANDS,
} from './parties'
import type { ISOCountryCode } from '~~/types/geography.types'

const everyParty = () => Object.values(PARTIES).flatMap(country => country?.parties ?? [])

describe('partyTokens', () => {
  it('folds the spellings the two Factbook fields disagree on', () => {
    expect(partyTokens('Labour Party')).toEqual(partyTokens('Labor Party'))
    expect(partyTokens('Centre Party')).toEqual(partyTokens('Center Party'))
  })

  it("drops the country's own demonym", () => {
    // Norway's roster says "Labor Party" where its leader's party is the
    // "Norwegian Labour Party" — the demonym is the whole difference.
    expect(partyTokens('Norwegian Labour Party', 'NO')).toEqual(partyTokens('Labor Party', 'NO'))
  })

  it('keeps a parenthetical gloss as one token, not two', () => {
    expect(partyTokens('Labor (Labour) Party', 'GB')).toEqual(['labor'])
  })

  it('treats alliance and coalition as identifying, not decoration', () => {
    // Poland's Civic Platform and Civic Coalition are different entities.
    expect(partyTokens('Civic Platform', 'PL')).not.toEqual(partyTokens('Civic Coalition', 'PL'))
  })
})

describe('governingParty', () => {
  // Each of these was a distinct, systematic join failure before the token
  // matcher landed; they are pinned so a future tweak cannot quietly undo one.
  const joins: [ISOCountryCode, string][] = [
    ['GB', 'Labor (Labour) Party'], // parenthetical gloss
    ['NO', 'Labor Party'], // demonym prefix
    ['CZ', 'Action of Dissatisfied Citizens or ANO'], // abbreviation, mid-name
    ['HU', 'TISZA – Respect and Freedom Party'], // roster carries an extra prefix
    ['DE', 'Christian Democratic Union'],
    ['SE', 'Moderate Party'],
  ]

  for (const [isoCode, name] of joins) {
    it(`joins ${isoCode} to ${name}`, () => {
      expect(governingParty(isoCode)?.name).toBe(name)
    })
  }

  // The join must stay SILENT rather than guess when the two sources name
  // genuinely different things — a wrong party on screen is worse than a gap.
  it('refuses a party whose name merely overlaps its alliance', () => {
    // PL: the leader belongs to Civic Platform; the roster lists Civic Coalition.
    expect(governingParty('PL')).toBeUndefined()
  })

  it('refuses a match on a bare family word', () => {
    // KE's leader leads the United Democratic Alliance; the roster's
    // "Democratic Party" shares only `democrat`, which names a family.
    expect(governingParty('KE')?.name).not.toBe('Democratic Party')
    // BR's Workers' Party must not absorb the United Socialist Workers' Party.
    expect(governingParty('BR')?.name).not.toBe("United Socialist Workers' Party")
  })

  it('never returns a roster heading', () => {
    // Belgium groups its roster under "Flemish parties:" / "Francophone parties:".
    expect(governingParty('BE')?.name).not.toMatch(/parties\s*:/i)
  })

  it('covers a healthy share of the roster', () => {
    const joined = (Object.keys(PARTIES) as ISOCountryCode[]).filter(iso => governingParty(iso))
    expect(joined.length).toBeGreaterThanOrEqual(GOVERNING_JOIN_FLOOR)
  })
})

// 118 countries join today. The floor sits below that so ordinary Factbook
// drift never cries wolf, but a broken matcher does.
const GOVERNING_JOIN_FLOOR = 100

describe('oppositionParties', () => {
  it('excludes the governing party', () => {
    const governing = governingParty('SE')
    expect(governing).toBeDefined()
    expect(oppositionParties('SE')).not.toContain(governing)
    expect(oppositionParties('SE').length).toBe(partiesOf('SE').length - 1)
  })

  it('returns the whole roster when nothing governs', () => {
    expect(oppositionParties('PL').length).toBe(partiesOf('PL').length)
  })
})

describe('partySpectrum', () => {
  it('collapses onto the five bands', () => {
    for (const party of everyParty()) {
      const band = partySpectrum(party)
      if (band) expect(SPECTRUM_BANDS).toContain(band)
    }
  })

  it('reads Sweden left to right', () => {
    const band = (name: string) =>
      partySpectrum(partiesOf('SE').find(party => party.name.startsWith(name))!)
    expect(band('Left')).toBe('left')
    expect(band('Moderate')).toBe('centre-right')
    expect(band('Sweden Democrats')).toBe('right')
  })
})

describe('seatedParties', () => {
  it('orders by seats held, largest first', () => {
    const seats = seatedParties('SE').map(party => party.seats ?? 0)
    expect(seats.length).toBeGreaterThan(2)
    expect([...seats].sort((a, b) => b - a)).toEqual(seats)
  })

  it('never exceeds the chamber it is drawn from', () => {
    for (const isoCode of Object.keys(PARTIES) as ISOCountryCode[]) {
      const held = seatedParties(isoCode).reduce((total, party) => total + (party.seats ?? 0), 0)
      const listed = PARTIES[isoCode]?.listedSeats
      if (listed) expect(held).toBeLessThanOrEqual(listed)
    }
  })
})

describe('partiesWithLogo', () => {
  it('returns only parties carrying a logo path', () => {
    for (const party of partiesWithLogo('DE')) expect(party.logo).toBeTruthy()
  })
})

describe('countriesInGrouping', () => {
  it('is empty for an unknown grouping rather than throwing', () => {
    expect(countriesInGrouping('not-a-real-grouping')).toEqual([])
  })
})
