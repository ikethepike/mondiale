import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PARTIES } from '~~/data/parties.gen'
import {
  benchesOf,
  benchStandings,
  chambersWithCabinet,
  countriesInGrouping,
  governingParty,
  impostorParties,
  oppositionParties,
  partiesOf,
  partiesWithLogo,
  partyLeaning,
  partySpectrum,
  partyTokens,
  playableChambers,
  seatedParties,
  seatingOrder,
  spectrumAt,
  spectrumCentre,
  spectrumRank,
  SPECTRUM_BANDS,
  type Party,
} from './parties'
import type { ISOCountryCode } from '~~/types/geography.types'

const ROOT = new URL('..', import.meta.url).pathname

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

  it("drops Wikipedia's country disambiguator, which is not part of the name", () => {
    // A cabinet names its parties by article title. The roster says "Republican
    // Party", so carrying "(United States)" into the tokens meant the United
    // States and Japan could never name their own governments.
    expect(partyTokens('Republican Party (United States)', 'US')).toEqual(
      partyTokens('Republican Party', 'US')
    )
    expect(partyTokens('Liberal Democratic Party (Japan)', 'JP')).toEqual(
      partyTokens('Liberal Democratic Party', 'JP')
    )
  })

  it("cuts the Factbook's inline alias list, which is a second name not a longer one", () => {
    // The roster writes aliases with "or": Denmark's Conservatives are listed
    // as "Conservative People's Party or DKF" where the chamber seats plain
    // "Conservative People's Party". Tokenising the whole string carried `or`
    // and the abbreviation, so the two could never match.
    expect(partyTokens("Conservative People's Party or DKF", 'DK')).toEqual(
      partyTokens("Conservative People's Party", 'DK')
    )
    expect(partyTokens('Democratic Party for the People or DPFP', 'JP')).toEqual(
      partyTokens('Democratic Party For the People', 'JP')
    )
    // A party whose own name contains "or" as a word is not an alias list.
    expect(partyTokens('Order and Justice', 'LT')).toContain('order')
  })

  it('keeps a disambiguator that is doing more than naming the country', () => {
    // South Korea's "(South Korea, 2015)" separates this Democratic Party from
    // an earlier one of the same name — strip it and the roster is lost.
    expect(partyTokens('Democratic Party (South Korea, 2015)', 'KR')).toContain('2015')
    // And a gloss that names no country at all is still folded in, not dropped.
    expect(partyTokens('Lega (political party)', 'IT')).toContain('political')
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
  // Poland is the case: its leader belongs to Civic Platform while the Factbook
  // roster lists only the Civic COALITION it stands in. Adopting the seated
  // parties from the election data gave the roster the real party, so the join
  // now lands on it — but never on the alliance.
  it('joins the party, never the alliance it stands in', () => {
    expect(governingParty('PL')?.name).toBe('Civic Platform')
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
    // Vatican City has no party politics at all.
    expect(oppositionParties('VA').length).toBe(partiesOf('VA').length)
  })
})

describe('benchStandings', () => {
  // Sweden is the case the three-way split exists for, and Isaac's own catch:
  // the Sweden Democrats are the chamber's second-largest bench and hold NO
  // ministries, so a government/opposition binary files them wrong either way.
  // The cabinet is M+KD+L, SD supply the majority, everyone else opposes.
  it('separates backers from both government and opposition', () => {
    const standings = benchStandings('SE')
    expect(standings).toBeDefined()
    expect(standings?.government.map(bench => bench.name)).toEqual([
      'Moderate Party',
      'Christian Democrats',
      'Liberals',
    ])
    expect(standings?.backing.map(bench => bench.name)).toEqual(['Sweden Democrats'])
    expect(standings?.opposition.map(bench => bench.name)).toContain(
      'Swedish Social Democratic Party'
    )
  })

  it('accounts for every bench exactly once', () => {
    for (const isoCode of chambersWithCabinet()) {
      const standings = benchStandings(isoCode)!
      const placed = [...standings.government, ...standings.backing, ...standings.opposition]
      expect(placed.length).toBe(benchesOf(isoCode).length)
      expect(new Set(placed).size).toBe(placed.length)
    }
  })

  // A government holding no seats is the signature of a join that matched
  // nothing — the round would open on a question with no answer on screen.
  it('never seats a government of nobody', () => {
    for (const isoCode of chambersWithCabinet()) {
      const standings = benchStandings(isoCode)!
      expect(standings.government.length).toBeGreaterThan(0)
      expect(standings.government.reduce((total, bench) => total + bench.seats, 0)).toBeGreaterThan(
        0
      )
    }
  })

  it('deals from a healthy share of the chambers that name a cabinet', () => {
    expect(chambersWithCabinet().length).toBeGreaterThanOrEqual(CABINET_JOIN_FLOOR)
  })

  // The gate is TWO questions, and each was measured against a case the other
  // gets wrong. Coverage — how much of the cabinet's own party list reached a
  // bench — is what catches a broken join; seat share is only a backstop
  // against a government too small to build a round on.
  //
  // Before this split, one seat-share floor at 25% did both jobs and did the
  // second one badly: Germany was refused at 19% for seating CDU and CSU as one
  // bench, while Sweden, Finland and Norway — honest minority governments that
  // name every one of their parties — survived by a hair.
  it('refuses a chamber whose cabinet list did not really join', () => {
    // Nothing in these cabinets' party lists reaches a bench.
    for (const isoCode of ['MY', 'BG', 'FR', 'PL', 'RS', 'UA'] as const) {
      expect(benchStandings(isoCode), `${isoCode} joined nothing`).toBeUndefined()
    }
    // Croatia matched three names in ten — the real government of 61 was filed
    // as opposition, which teaches the opposite of the truth.
    expect(benchStandings('HR')).toBeUndefined()
  })

  it('keeps a minority government that named every one of its parties', () => {
    // Under 40% of the chamber each, and all three are the lesson rather than a
    // failure: a government can hold power without holding half the seats.
    for (const isoCode of ['SE', 'FI', 'NO'] as const) {
      const standings = benchStandings(isoCode)
      expect(standings, `${isoCode} should seat a government`).toBeDefined()
      expect(standings!.government.length).toBeGreaterThan(0)
    }
  })
})

// The cabinet pass resolves 28 chambers to a government we can seat. The floor
// sits under that because Wikipedia renames cabinet articles as governments
// change, but a collapse means the party-name reader broke — and it used to sit
// AT the measured number, where a single renamed article failed the suite.
const CABINET_JOIN_FLOOR = 24

describe('impostorParties', () => {
  // Rulers deals an impostor as "the party that does NOT govern here". A
  // coalition partner dealt there makes the question's answer false, and
  // `oppositionParties` excludes only the leader's own party — seventeen
  // candidates were genuinely in government, Finland's Finns Party among them.
  it('never offers a party that is in government or backing it', () => {
    for (const isoCode of chambersWithCabinet()) {
      const standings = benchStandings(isoCode)!
      const inside = new Set(
        [...standings.government, ...standings.backing].flatMap(bench =>
          bench.party ? [bench.party] : []
        )
      )
      for (const impostor of impostorParties(isoCode)) {
        expect(inside.has(impostor), `${isoCode}: ${impostor.name} governs`).toBe(false)
      }
    }
  })

  // A logo identical to the government's own is a question with no answer.
  it("never offers the governing party's own logo", () => {
    for (const isoCode of chambersWithCabinet()) {
      const governing = governingParty(isoCode)
      for (const impostor of impostorParties(isoCode)) {
        expect(impostor.logo).toBeTruthy()
        expect(impostor.logo).not.toBe(governing?.logo)
      }
    }
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

describe('partyLeaning', () => {
  // Wikidata's own vocabulary is what a player must never see: "centrism",
  // "far-left politics" and "right-wing extremism" are labels for a query, not
  // copy for a reveal card. The bands are the phrasing already on screen.
  it('reads as game copy, never as the database', () => {
    for (const party of everyParty()) {
      const line = partyLeaning(party)
      if (!line) continue
      expect(line, party.name).not.toMatch(
        /centrism|far-left politics|right-wing extremism|big tent|syncretic|radical left/
      )
    }
  })

  it('leads with the band, then what the party calls itself', () => {
    const labor = partiesOf('AU').find(party => party.abbreviation === 'ALP')!
    expect(partyLeaning(labor)).toBe('Centre-left · social democracy')
  })

  it('stands on either half alone, and vanishes with neither', () => {
    expect(partyLeaning({ name: 'X', ideologies: ['populism'] })).toBe('populism')
    expect(partyLeaning({ name: 'X', position: 'centrism' })).toBe('Centre')
    expect(partyLeaning({ name: 'X' })).toBeUndefined()
  })

  // A reveal card gives this ONE line. The ideology arrays run past twenty
  // entries, so a regression that starts joining the whole list wraps.
  it('fits one line for every governing party', () => {
    for (const isoCode of Object.keys(PARTIES) as ISOCountryCode[]) {
      const governing = governingParty(isoCode)
      const line = governing ? partyLeaning(governing) : undefined
      if (line) expect(line.length, `${isoCode}: ${line}`).toBeLessThanOrEqual(48)
    }
  })

  // A collapse here means the generator lost P1387/P1142 upstream.
  it('can place most governments on the spectrum', () => {
    const resolved = (Object.keys(PARTIES) as ISOCountryCode[])
      .map(isoCode => governingParty(isoCode))
      .filter((party): party is Party => !!party)
    const placed = resolved.filter(party => partyLeaning(party))
    expect(placed.length / resolved.length).toBeGreaterThan(0.8)
  })

  // The leader reveal renders a governing party's logo as an <img>, so a path
  // the roster claims but the repo never shipped is a broken image on screen.
  it('ships the logo file every party claims', () => {
    for (const party of everyParty()) {
      if (!party.logo) continue
      expect(existsSync(`${ROOT}public${party.logo}`), party.name).toBe(true)
    }
  })
})

describe('spectrumAt / spectrumCentre', () => {
  // The slider answers with a position, the roster states a band: these two
  // are what join them, so a drift here silently regrades the whole question.
  it('lands every band on itself', () => {
    for (const band of SPECTRUM_BANDS) {
      expect(spectrumAt(spectrumCentre(band))).toBe(band)
    }
  })

  it('reads the axis left to right, ends included', () => {
    expect(spectrumAt(0)).toBe('left')
    expect(spectrumAt(1)).toBe('right')
    expect(spectrumAt(0.5)).toBe('centre')
  })

  it('gives every band an equal share of the axis', () => {
    // The band's width IS the tolerance a dragged answer gets, so an uneven
    // split would quietly make some parties harder to place than others.
    const width = 1 / SPECTRUM_BANDS.length
    for (const [index, band] of SPECTRUM_BANDS.entries()) {
      expect(spectrumAt(index * width + 0.001)).toBe(band)
      expect(spectrumAt((index + 1) * width - 0.001)).toBe(band)
    }
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

describe('benchesOf', () => {
  // A bench the roster never names is a bench Parliament cannot deal: no logo,
  // no colour, no ideology. Before the election tables' own parties were adopted
  // into the roster, 31% of benches were orphans — including the LARGEST bloc in
  // 16 chambers. What is left is mostly honest: "Independents" is not a party.
  it('joins nearly every bench to a roster party', () => {
    const benches = playableChambers().flatMap(isoCode => benchesOf(isoCode))
    const orphans = benches.filter(bench => !bench.party)
    expect(orphans.length / benches.length).toBeLessThanOrEqual(BENCH_ORPHAN_CEILING)
  })
})

// ~26% of benches are orphans today: independents, unnamed alliances, and the
// parties Wikidata files under a name the Factbook roster never lists (Iraq's
// Sadrist Movement and Progress Party are most of one chamber). It ROSE when
// 21 stale elections were refreshed — a chamber that just voted seats parties
// the Factbook's roster has not caught up with.
//
// This ROSE from 9% when one Wikidata entity was allowed only one party. That
// is the fix working, not a regression: a bench that "joined" by sharing
// another party's entity was wearing that party's logo and ideology. An honest
// orphan is better than a bench dressed as someone else.
const BENCH_ORPHAN_CEILING = 0.3

describe('seatingOrder', () => {
  const rankOf = (bench: { party?: Party }) => spectrumRank(bench.party)

  it('runs left to right', () => {
    for (const isoCode of playableChambers()) {
      const ranks = seatingOrder(isoCode)
        .map(rankOf)
        .filter((rank): rank is number => rank !== undefined)
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
    }
  })

  // The order Isaac reads a Swedish chamber in. V sits left of S; SD sits at
  // the far right — and the Red-Greens (V, S, MP) stay adjacent because the
  // alliance is the TIE-BREAKER within a position, not the primary sort.
  it('seats Sweden the way the chamber reads', () => {
    const names = seatingOrder('SE')
      .filter(bench => rankOf(bench) !== undefined)
      .map(bench => bench.name)
    expect(names[0]).toBe('Left Party')
    expect(names[names.length - 1]).toBe('Sweden Democrats')
    expect(names.indexOf('Centre Party')).toBeGreaterThan(
      names.indexOf('Swedish Social Democratic Party')
    )
    expect(names.indexOf('Centre Party')).toBeLessThan(names.indexOf('Moderate Party'))
  })

  // Guessing a position from a party's name would seat it somewhere it does
  // not belong; parking the unplaced together is the honest alternative.
  it('parks parties with no known position after those that have one', () => {
    for (const isoCode of playableChambers()) {
      const ranks = seatingOrder(isoCode).map(rankOf)
      const firstUnplaced = ranks.indexOf(undefined)
      if (firstUnplaced === -1) continue
      expect(ranks.slice(firstUnplaced).every(rank => rank === undefined)).toBe(true)
    }
  })

  it('seats every bench exactly once', () => {
    for (const isoCode of playableChambers()) {
      expect(seatingOrder(isoCode).length).toBe(benchesOf(isoCode).length)
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
