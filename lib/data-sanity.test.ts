/**
 * Cardinality floors for generated data — the gate the DataUpdate workflow
 * runs before auto-committing a refresh. A partial upstream fetch (an API
 * answering 30 countries instead of 200) parses and type-checks fine; these
 * floors are what stop it from shipping. Floors sit well under the real
 * counts so ordinary drift never cries wolf.
 */
import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { conflictMapping } from '~~/data/conflicts.gen'
import { LEADERS } from '~~/data/leaders.gen'
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

describe('countries.gen', () => {
  const countries = Object.values(COUNTRIES)

  it('covers the sovereign roster', () => {
    expect(countries.length).toBeGreaterThanOrEqual(COUNTRY_FLOOR)
  })

  it('every country carries a name and flag markup', () => {
    for (const country of countries) {
      expect(country.name.english).toBeTruthy()
      expect(country.flag).toContain('<svg')
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
      expect(`${meta.id}: ${parties}`).toBe(
        `${meta.id}: ${Math.max(parties, meta.minimumParties)}`
      )
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
