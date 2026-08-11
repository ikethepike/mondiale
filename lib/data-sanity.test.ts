/**
 * Cardinality floors for generated data — the gate the DataUpdate workflow
 * runs before auto-committing a refresh. A partial upstream fetch (an API
 * answering 30 countries instead of 200) parses and type-checks fine; these
 * floors are what stop it from shipping. Floors sit well under the real
 * counts so ordinary drift never cries wolf.
 */
import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { FLAGS } from '~~/data/flags.gen'
import { conflictMapping } from '~~/data/conflicts.gen'
import { LEADERS } from '~~/data/leaders.gen'
import { ELECTIONS } from '~~/data/elections.gen'
import { PARTIES } from '~~/data/parties.gen'
import { MARRIAGE_RIGHTS } from '~~/data/marriage-rights.gen'
import { owidMapping } from '~~/data/owid.gen'
import { TREATIES } from '~~/data/treaties.gen'
import { worldBankMapping } from '~~/data/worldbank.gen'
import { TREATY_META } from '~~/types/treaty.type'

// 194 countries today; the UN would notice before we dip under 190.
const COUNTRY_FLOOR = 190
// Live stat feeds cover 190+ countries today.
const STAT_COVERAGE_FLOOR = 150
// UCDP: 169 countries carry an entry, 118 have a recorded conflict.
const CONFLICT_ENTRY_FLOOR = 130
const CONFLICT_ACTIVE_FLOOR = 80
// 303 conflict profiles / 123 mapped-event countries today.
const CONFLICT_PROFILE_FLOOR = 200
const CONFLICT_FIELD_FLOOR = 90
// 38 countries have legalized same-sex marriage; mirrors the generator's own
// floor, so a shrunken Equaldex fetch fails here too.
const MARRIAGE_COUNTRY_FLOOR = 35
// 192 countries / ~2,040 parties from the Factbook roster today. Wikidata
// enriches 80% of them once the en.wikipedia fallback runs; the floor sits
// well under that because match rate moves with Wikidata's own coverage, but
// a drop past here means the fallback broke rather than the world changing.
const PARTY_COUNTRY_FLOOR = 180
const PARTY_FLOOR = 1800
const PARTY_MATCH_FLOOR = 0.65
// 738 logos and 492 grouping memberships today — both are what the party-facing
// modes deal from, so a collapse should fail rather than quietly thin the pool.
const PARTY_LOGO_FLOOR = 600
const PARTY_GROUPING_FLOOR = 380
// Some chambers really are mostly independents (Kuwait bans parties outright),
// so a few thin joins are honest; a jump means the name-matching broke.
const SEAT_JOIN_MISS_CEILING = 8
// 53 chambers parse from 54 seeded articles today. The floor is the seed list's
// worth minus room for an article being renamed after an election.
const CHAMBER_FLOOR = 45
// 47 carry vote share; the rest print seats only.
const CHAMBER_VOTE_FLOOR = 35

describe('countries.gen', () => {
  const countries = Object.values(COUNTRIES)

  it('covers the sovereign roster', () => {
    expect(countries.length).toBeGreaterThanOrEqual(COUNTRY_FLOOR)
  })

  it('every country carries a name and flag markup', () => {
    for (const country of countries) {
      expect(country.name.english).toBeTruthy()
      expect(FLAGS[country.isoCode]).toContain('<svg')
    }
  })
})

describe('elections.gen', () => {
  const chambers = Object.values(ELECTIONS)

  it('covers the seeded chambers', () => {
    expect(chambers.length).toBeGreaterThanOrEqual(CHAMBER_FLOOR)
  })

  it('keeps the vote share the Factbook never publishes', () => {
    const withVotes = chambers.filter(chamber =>
      chamber?.parties.some(party => party.votePct !== undefined)
    )
    expect(withVotes.length).toBeGreaterThanOrEqual(CHAMBER_VOTE_FLOOR)
  })

  // A parse that drifts reads seats off the wrong rows, and the giveaway is a
  // chamber whose parties hold more seats than the chamber has.
  it('never seats more members than the chamber holds', () => {
    for (const chamber of chambers) {
      if (!chamber?.totalSeats) continue
      const held = chamber.parties.reduce((total, party) => total + party.seats, 0)
      expect(held).toBeLessThanOrEqual(chamber.totalSeats)
    }
  })

  // Sweden files its Social Democrats, Left Party and Greens under one
  // "Red-Greens" alliance; reading the alliance as the party's name drew three
  // different benches under one label.
  it('names parties, not the alliances they stood in', () => {
    for (const chamber of chambers) {
      const names = (chamber?.parties ?? []).map(party => party.party)
      expect(names.length).toBe(new Set(names).size)
    }
  })
})

describe('parties.gen', () => {
  const countries = Object.values(PARTIES)
  const parties = countries.flatMap(country => country?.parties ?? [])

  it('covers the Factbook roster', () => {
    expect(countries.length).toBeGreaterThanOrEqual(PARTY_COUNTRY_FLOOR)
    expect(parties.length).toBeGreaterThanOrEqual(PARTY_FLOOR)
  })

  it('enriches a healthy share against Wikidata', () => {
    const matched = parties.filter(party => party.qid)
    expect(matched.length / parties.length).toBeGreaterThanOrEqual(PARTY_MATCH_FLOOR)
  })

  it('keeps the pools the party modes deal from stocked', () => {
    expect(parties.filter(party => party.logo).length).toBeGreaterThanOrEqual(PARTY_LOGO_FLOOR)
    expect(parties.filter(party => party.groupings?.length).length).toBeGreaterThanOrEqual(
      PARTY_GROUPING_FLOOR
    )
  })

  // Commons hosts free files only, so a logo carrying a non-free flag means the
  // harvest reached past Commons and the licence question changes with it.
  it('holds only freely licensed logos', () => {
    expect(parties.filter(party => party.nonFree).length).toBe(0)
  })

  // Seat share is a fraction of the LISTED seats. It sums to at most 1, and
  // legitimately to LESS: the Factbook balances many chambers with "Other" and
  // "Independents" rows, which count toward the chamber but are not parties.
  // Overshooting 1 is the real failure — it means the join double-counted.
  it('keeps every seat share a real fraction of its chamber', () => {
    for (const country of countries) {
      const shares = (country?.parties ?? [])
        .map(party => party.seatShare)
        .filter((share): share is number => share !== undefined)
      if (!shares.length) continue
      for (const share of shares) {
        expect(share).toBeGreaterThan(0)
        expect(share).toBeLessThanOrEqual(1)
      }
      expect(shares.reduce((total, share) => total + share, 0)).toBeLessThanOrEqual(1.001)
    }
  })

  // The join between the roster and the seat table is spelling-sensitive
  // ("Swedish Social Democratic Party" vs "Social Democratic Party"), and when
  // it fails it fails silently — the country keeps its parties and quietly
  // loses its biggest one. A chamber whose named parties hold under a third of
  // the seats is the signature of that break.
  it('joins the seat table onto the roster', () => {
    const thin = countries.filter(country => {
      const shares = (country?.parties ?? [])
        .map(party => party.seatShare)
        .filter((share): share is number => share !== undefined)
      return shares.length >= 2 && shares.reduce((total, share) => total + share, 0) < 0.33
    })
    expect(thin.length).toBeLessThanOrEqual(SEAT_JOIN_MISS_CEILING)
  })

  // The roster is the Factbook's; commentary filed under "Political parties"
  // ("the Taliban Government enforces…") is prose, not a dealable subject.
  it('holds names, not prose', () => {
    for (const party of parties) {
      expect(party.name.split(/\s+/).length).toBeLessThanOrEqual(9)
      expect(party.name).not.toMatch(/;\s*note/i)
    }
  })
})

describe('marriage-rights.gen', () => {
  const years = Object.values(MARRIAGE_RIGHTS)

  it('keeps the ranking round stocked', () => {
    expect(years.length).toBeGreaterThanOrEqual(MARRIAGE_COUNTRY_FLOOR)
  })

  // The Netherlands went first; a run that loses it has lost the ISO join.
  it('starts with the Netherlands in 2001', () => {
    expect(MARRIAGE_RIGHTS.NL?.year).toBe(2001)
  })

  it('carries plausible years only', () => {
    for (const right of years) {
      expect(right.year).toBeGreaterThanOrEqual(2001)
      expect(right.year).toBeLessThanOrEqual(new Date().getFullYear() + 1)
    }
  })
})

describe('treaties.gen', () => {
  it('carries every instrument the deck expects', () => {
    for (const meta of TREATY_META) expect(TREATIES[meta.id]).toBeTruthy()
  })

  it('holds each instrument above its own floor', () => {
    for (const meta of TREATY_META) {
      const parties = Object.values(TREATIES[meta.id] ?? {}).filter(
        status => status.standing === 'party'
      ).length
      expect(parties, `${meta.id} parties`).toBeGreaterThanOrEqual(meta.minimumParties)
    }
  })

  // The canary. The United States signed the Convention on the Rights of the
  // Child in 1995 and is the only country never to have ratified it. If this
  // reads anything else, either that changed or the scrape broke — and the
  // scrape is a UNTC HTML table, so bet on the scrape.
  it('still finds the United States outside the CRC', () => {
    expect(TREATIES.crc?.US?.standing).toBe('signatory')
  })

  it('records only the three standings', () => {
    for (const statuses of Object.values(TREATIES)) {
      for (const status of Object.values(statuses)) {
        expect(['party', 'signatory', 'withdrawn']).toContain(status.standing)
      }
    }
  })
})

describe('worldbank.gen / owid.gen', () => {
  it('world bank coverage holds', () => {
    const entries = Object.values(worldBankMapping)
    expect(entries.filter(entry => entry.womenInParliament).length).toBeGreaterThanOrEqual(
      STAT_COVERAGE_FLOOR
    )
  })

  it('owid coverage holds', () => {
    const entries = Object.values(owidMapping)
    expect(entries.filter(entry => entry.lifeExpectancy).length).toBeGreaterThanOrEqual(
      STAT_COVERAGE_FLOOR
    )
  })
})

describe('leaders.gen', () => {
  const entries = Object.values(LEADERS)

  it('heads of state coverage holds, portraits included', () => {
    const headsOfState = entries.flatMap(entry => entry.headOfState ?? [])
    expect(headsOfState.length).toBeGreaterThanOrEqual(STAT_COVERAGE_FLOOR)
    expect(headsOfState.filter(leader => leader.image).length).toBeGreaterThanOrEqual(
      STAT_COVERAGE_FLOOR
    )
  })

  it('every present leader is displayable', () => {
    for (const entry of entries) {
      for (const leader of [entry.headOfState, entry.headOfGovernment]) {
        if (!leader) continue
        expect(leader.name).toBeTruthy()
        if (leader.image) expect(leader.image).toMatch(/^\/leaders\//)
      }
    }
  })
})

describe('conflict data', () => {
  it('conflict mapping coverage holds', () => {
    const entries = Object.values(conflictMapping)
    expect(entries.length).toBeGreaterThanOrEqual(CONFLICT_ENTRY_FLOOR)
    expect(entries.filter(entry => entry.total > 0).length).toBeGreaterThanOrEqual(
      CONFLICT_ACTIVE_FLOOR
    )
  })

  it('profiles and mapped events hold', async () => {
    const { CONFLICTS } = await import('~~/data/conflict-profiles.gen')
    const { CONFLICT_FIELDS } = await import('~~/data/conflict-events.gen')
    expect(Object.keys(CONFLICTS).length).toBeGreaterThanOrEqual(CONFLICT_PROFILE_FLOOR)
    expect(Object.keys(CONFLICT_FIELDS).length).toBeGreaterThanOrEqual(CONFLICT_FIELD_FLOOR)
  })
})
