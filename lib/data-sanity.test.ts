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
import { PARTIES } from '~~/data/parties.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { decorativeLogos, governingParty, isDecorativeLogo, partiesWithLogo } from '~~/lib/parties'
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
// 192 countries / ~2,220 parties: the Factbook roster plus the seated benches
// adopted from the election tables, which is where the chambers' biggest parties
// often live. Wikidata enriches 80% once the en.wikipedia fallback runs; the
// floor sits well under that because match rate moves with Wikidata's own
// coverage, but a drop past here means the fallback broke rather than the
// world changing.
const PARTY_COUNTRY_FLOOR = 180
const PARTY_FLOOR = 2000
const PARTY_MATCH_FLOOR = 0.7
// 737 logos and ~500 grouping memberships today — both are what the party-facing
// modes deal from, so a collapse should fail rather than quietly thin the pool.
//
// The count READ 957 before one entity was allowed only one party: 239 of those
// were duplicate references, several roster rows pointing at one file because
// they had resolved to the same Wikidata entity. 737 rows on 737 distinct files
// is the honest number, and it is UP on the 718 real files we had.
const PARTY_LOGO_FLOOR = 640
// A handful of rosters genuinely resolve to nothing (one-party states,
// microstates). Fourteen was a bug; four is the honest tail.
// Gulf monarchies and Pacific microstates whose chambers seat only unlinked
// rows — no party holds a Wikidata entity because, in several, no party is
// legal. The ceiling rose from 6 with the polity swap because the roster now
// covers 196 countries rather than 192: more of the world is described, so
// more of the genuinely partyless world is visible.
const BLANK_COUNTRY_CEILING = 10
const PARTY_GROUPING_FLOOR = 420
// Some chambers really are mostly independents (Kuwait bans parties outright),
// so a few thin joins are honest; a jump means the name-matching broke.
const SEAT_JOIN_MISS_CEILING = 8
// 53 chambers parse from 54 seeded articles today. The floor is the seed list's
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

  it('every country speaks something, officially', () => {
    // Both lists feed rounds that grade against them, and an empty one is a
    // country that silently drops out of Mother Tongue and the manhunt's
    // language subpoena rather than failing loudly.
    for (const country of countries) {
      expect(country.languages.length, country.isoCode).toBeGreaterThan(0)
      expect(country.officialLanguages.length, country.isoCode).toBeGreaterThan(0)
    }
  })

  it('parses officials from the Factbook for most of the roster', () => {
    // 21 countries carry no "(official)" marker and fall back to the spoken
    // list. If a parser regression pushed that fallback wide, the official
    // field would quietly become a copy of `languages` — and the rounds that
    // CLAIM officiality would be guessing again.
    // 55 of 194 differ today (a different set, a different order, or both).
    const differs = countries.filter(
      country => country.officialLanguages.join('|') !== country.languages.join('|')
    )
    expect(differs.length).toBeGreaterThan(40)
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
  //
  // A handful of marks are published nowhere but the party's own site, and
  // `LOCAL_LOGOS` in the parties generator carries them deliberately. The rule
  // is therefore not "no non-free logos" but "no non-free logo whose source we
  // cannot name" — an unattributed one is a harvest that wandered off Commons
  // by accident, which is the case worth failing on.
  // Rulers sizes every mark to equal painted AREA, which it can only do from
  // the artwork's shape — and the shape ships in the data (`generate:logo-dims`
  // reads it off the saved files). A half-run backfill is the failure worth
  // catching: the stage silently falls back to square boxes, and the mode goes
  // back to pointing at whichever option happens to be a crest on a big country.
  it('carries the shape of every logo it ships', () => {
    const withLogo = parties.filter(party => party.logo)
    const stamped = withLogo.filter(party => party.logoRatio !== undefined)
    expect(stamped.length / withLogo.length).toBeGreaterThanOrEqual(0.99)
    for (const party of stamped) {
      expect(
        Number.isFinite(party.logoRatio) && party.logoRatio! > 0,
        `${party.name} has a junk logoRatio (${party.logoRatio})`
      ).toBe(true)
    }
    // A ratio without a logo is a stamp that outlived its artwork.
    for (const party of parties.filter(party => party.logoRatio !== undefined)) {
      expect(party.logo, `${party.name} has a logoRatio but no logo`).toBeTruthy()
    }
  })

  it('names the source of every non-free logo', () => {
    for (const party of parties.filter(party => party.nonFree)) {
      expect(party.logo, `${party.name} is flagged non-free without a logo`).toBeTruthy()
      expect(party.credit, `${party.name} has a non-free logo with no credit`).toBeTruthy()
      expect(party.license, `${party.name} has a non-free logo with no licence`).toBeTruthy()
    }
  })

  // `nonFree` is not the only licence that obliges us. CC BY and CC BY-SA are
  // free to re-host and REQUIRE attribution, and 144 logos carry one — so a
  // credit-less row here is a licence breach hiding behind a free licence.
  // Three shipped that way (Costa Rica's PASE, Ireland's Greens, Turkey's HDP)
  // because the harvest dropped any credit over 80 characters while keeping
  // the licence; `shortenCredit` now trims instead of discarding.
  // The Factbook lists electoral coalitions beside parties and says so in its
  // own endonym. They keep their seats (the chamber's arithmetic needs them)
  // but must never be DEALT: Albania's governing "party" was a bloc, so Rulers
  // asked which mark is not a ruling party with an alliance as its truth.
  it('never deals an electoral coalition as a party', () => {
    const blocs = parties.filter(party => party.coalition)
    expect(blocs.length, 'blocs should still be flagged').toBeGreaterThan(5)
    // The flag used to require an ENDONYM justifying it, because the Factbook
    // only declared a bloc in its own gloss ("electoral coalition led by PD")
    // and a name reading "Coalition" proves nothing — 161 real parties are
    // named that way. polity states the kind outright, so the endonym is no
    // longer the evidence.
    //
    // What the flag is FOR is unchanged, and that is what these assert: a
    // flagged bloc is never dealt as a subject, and never named as the
    // governing party.
    for (const isoCode of ISOCountryCodes) {
      for (const party of partiesWithLogo(isoCode)) {
        expect(party.coalition, `${party.name} is dealable in ${isoCode}`).toBeFalsy()
      }
      expect(governingParty(isoCode)?.coalition).toBeFalsy()
    }
  })

  // A backdrop scatters marks with no caption under them, which is a
  // different permission from showing one AS the question. These pin the
  // gate: everything the decorative pool admits must owe nobody a credit and
  // offend nobody, because nothing downstream can catch it if it doesn't.
  it('never scatters a mark that owes a credit or carries a swastika', () => {
    const pool = decorativeLogos()
    // Deep enough to fill a field without repeating — if a licence sweep ever
    // guts it, that is a design problem and should fail loudly here.
    expect(pool.length).toBeGreaterThan(400)
    for (const party of pool) {
      expect(party.nonFree, `${party.name} is fair-use and cannot be decoration`).toBeFalsy()
      expect(party.license, `${party.name} has no licence`).toMatch(/^(public domain|cc0|pd)$/i)
      expect(
        party.logoRestrictions ?? '',
        `${party.name} carries a restriction a backdrop must not scatter`
      ).not.toMatch(/nazi|insignia|communist/i)
      expect(party.coalition, `${party.name} is a bloc, not a party`).toBeFalsy()
    }
  })

  it("keeps the SSNP zawba'a out of the decorative pool", () => {
    // The two rows the restriction exists for. Named, so a generator change
    // that drops the flag fails here instead of shipping the mark.
    const flagged = Object.values(PARTIES)
      .flatMap(chamber => chamber?.parties ?? [])
      .filter(party => /nazi/i.test(party.logoRestrictions ?? ''))
    expect(flagged.length, 'expected the flagged rows to still exist').toBeGreaterThan(0)
    for (const party of flagged) expect(isDecorativeLogo(party)).toBe(false)
  })

  it('credits every logo whose licence demands attribution', () => {
    const owed = parties.filter(party => party.logo && /^CC BY/i.test(party.license ?? ''))
    expect(owed.length, 'expected attribution-bearing logos in the roster').toBeGreaterThan(50)
    for (const party of owed) {
      expect(party.credit, `${party.name} ships under ${party.license} with no credit`).toBeTruthy()
    }
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
  // "none" was the Vatican's entire roster and shipped as a dealable subject;
  // Czechia and Ethiopia carried "Independents"/"Independent" rows the seat
  // table filter caught but the roster never did.
  // A country whose entire roster failed to resolve is invisible to every
  // party mode, and it fails SILENTLY — 14 countries (143 parties) were in
  // that state because a 40-id Wikidata batch hit an undocumented 12MB
  // response cap and dropped their country entity before any party was
  // searched for. South Africa and South Korea had zero matches each.
  it('resolves at least one party in almost every country', () => {
    const withParties = Object.entries(PARTIES).filter(([, entry]) => entry?.parties.length)
    const blank = withParties.filter(([, entry]) => !entry!.parties.some(party => party.qid))
    // Some rosters really are unresolvable (one-party states, microstates).
    expect(blank.length, blank.map(([iso]) => iso).join(' ')).toBeLessThanOrEqual(
      BLANK_COUNTRY_CEILING
    )
  })

  // `?? id` kept the raw Q-id whenever a label lookup missed, so a reveal would
  // have told a player the Christian Union is a "Q16481705" party.
  it('never leaks a raw Q-id into a displayable field', () => {
    for (const party of parties) {
      for (const ideology of party.ideologies ?? []) expect(ideology).not.toMatch(/^Q\d+$/)
      if (party.position) expect(party.position).not.toMatch(/^Q\d+$/)
      for (const grouping of party.groupings ?? []) expect(grouping).not.toMatch(/^Q\d+$/)
    }
  })

  // A chamber really does seat independents and really does hold vacancies, and
  // their seats have to count or the arc does not add up. What must never
  // happen is DEALING one as a subject: "which party governs?" has no answer
  // when the answer is "Independent". `coalition` is the existing flag for
  // exactly that — counts in the arithmetic, never dealt — so the rule is that
  // a placeholder carries it, not that it cannot exist.
  it('never deals a placeholder as a party', () => {
    const placeholder = /^(none|other|others|independents?|vacant|unaffiliated|n\/a|various)$/i
    for (const party of parties) {
      if (!placeholder.test(party.name.trim())) continue
      expect(party.coalition, `${party.name} is dealable`).toBe(true)
    }
  })

  // Wikidata's colour property is free text often enough to matter — Moldova's
  // National Alternative Movement carried "dark green", which reaches a view as
  // `background: #dark green` and silently paints nothing.
  it('carries only hex colours', () => {
    for (const party of parties) {
      for (const colour of party.colors ?? []) expect(colour).toMatch(/^[0-9A-Fa-f]{6}$/)
    }
  })

  // Yemen's Nasserist Unionist People's Organization carried a founding year
  // of 25. The oldest real party is Britain's Tories.
  it('carries plausible founding years', () => {
    for (const party of parties) {
      if (party.foundedYear === undefined) continue
      expect(party.foundedYear, party.name).toBeGreaterThanOrEqual(1700)
      expect(party.foundedYear, party.name).toBeLessThanOrEqual(new Date().getFullYear() + 1)
    }
  })

  it('holds names, not prose', () => {
    for (const party of parties) {
      // Long but real: the DRC's "Alliance of Political Parties Allied to the
      // Movement for the Liberation of the Congo" is fourteen words and a
      // genuine party; "Electoral Action of Poles in Lithuania – Christian
      // Families Alliance" is ten. The guard is against PROSE, which the
      // `; note` check below is the sharper test for.
      expect(party.name.split(/\s+/).length).toBeLessThanOrEqual(14)
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
