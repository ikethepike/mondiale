import { describe, expect, it } from 'vitest'
import { CONFLICTS, CONFLICTS_BY_COUNTRY } from '~~/data/conflict-profiles.gen'
import { CONFLICT_FIELDS } from '~~/data/conflict-events.gen'
import { conflictMapping } from '~~/data/conflicts.gen'
import { BORDERS } from '~~/data/borders.gen'
import { mentionsCountry } from '~~/lib/country'
import { flashpointSeconds } from '~~/lib/round-beats'
import type { ISOCountryCode } from '~~/types/geography.types'
import { dominantConflict } from '~~/types/vendor/ucdp/ucdp.types'

/**
 * The flashpoint ladder is copy GENERATED over real data, which is exactly the
 * shape of logic that regresses silently: a template reaches one field further
 * than it should and the round starts handing itself over, on one country in
 * sixty, with nothing failing. These walk the whole dealt pool.
 *
 * The dealer's own pool filter lives in `getFlashpointChallenge`; it is
 * mirrored here rather than exported, because what is under test is the DATA
 * the ladder draws from, not the dealer's plumbing.
 */
const MIN_POINTS = 40
const MIN_ERAS = 2

const pool = Object.entries(CONFLICT_FIELDS)
  .filter(
    ([isoCode, field]) =>
      !!field &&
      field.total >= MIN_POINTS &&
      field.eras.length >= MIN_ERAS &&
      (CONFLICTS_BY_COUNTRY[isoCode as ISOCountryCode] ?? []).length > 0
  )
  .map(([isoCode]) => isoCode as ISOCountryCode)

const definingFor = (isoCode: ISOCountryCode) =>
  dominantConflict((CONFLICTS_BY_COUNTRY[isoCode] ?? []).flatMap(id => CONFLICTS[id] ?? []))

describe('flashpoint hint sources', () => {
  it('deals a pool worth having a ladder for', () => {
    expect(pool.length).toBeGreaterThan(50)
    // Every country the dealer can pick must be able to build the ladder —
    // that is what the profile clause in the pool filter buys.
    for (const isoCode of pool) expect(definingFor(isoCode)).toBeDefined()
  })

  it('never lets a country with dots but no ACD profile into the pool', () => {
    // Brazil is the live example: 200+ GED dots, no primary-party conflict, and
    // metrics that read "0 disputes since 1946" underneath them.
    const orphans = Object.entries(CONFLICT_FIELDS).filter(
      ([isoCode, field]) =>
        !!field &&
        field.total >= MIN_POINTS &&
        field.eras.length >= MIN_ERAS &&
        !(CONFLICTS_BY_COUNTRY[isoCode as ISOCountryCode] ?? []).length
    )
    for (const [isoCode] of orphans) expect(pool).not.toContain(isoCode)
  })

  /**
   * The giveaway gate. `mentionsCountry` catches text naming the ANSWER, but
   * it cannot catch a hint naming a NEIGHBOUR that pinpoints the region just as
   * well ("Republic of Croatia" for Serbia). So the defence is structural: the
   * ladder reads none of the four fields that carry a name.
   */
  it('keeps the answer out of every field the ladder reads', () => {
    for (const isoCode of pool) {
      const defining = definingFor(isoCode)
      if (!defining) continue

      // The rungs' actual inputs: a decade, two label lookups, episode spans
      // and integer metrics. None can carry a name.
      expect(Number.isFinite(defining.episodes[0]?.[0])).toBe(true)
      expect(['colonial', 'interstate', 'civil war', 'internationalized civil war']).toContain(
        defining.type
      )
      expect(['territory', 'government', 'both']).toContain(defining.incompatibility)
      const metrics = conflictMapping[isoCode]
      if (metrics) {
        expect(Number.isFinite(metrics.total)).toBe(true)
        expect(Number.isFinite(metrics.recent)).toBe(true)
      }
    }
  })

  it('proves the withheld fields WOULD have given the answer away', () => {
    // Not a hypothetical: this is why `territory`, `name`, `sideA` and `sideB`
    // are unreadable. If this ever stops finding leaks, the ladder could be
    // widened — until then, the exclusion is load-bearing.
    const leaks = pool.filter(isoCode => {
      const defining = definingFor(isoCode)
      if (!defining) return false
      return [defining.name, defining.territory ?? '', ...defining.sideA, ...defining.sideB].some(
        value => value && mentionsCountry(value, isoCode)
      )
    })
    expect(leaks.length).toBeGreaterThan(0)
  })

  it('sketches neighbours only where there are enough to read as a region', () => {
    for (const isoCode of pool) {
      const neighbours = (BORDERS[isoCode] ?? []).filter(Boolean)
      // The rung is dropped below two; where it IS dealt, it must never point
      // at the answer's own shape.
      if (neighbours.length >= 2) expect(neighbours).not.toContain(isoCode)
    }
  })

  it('lands every dealt round inside a sane clock', () => {
    for (const isoCode of pool) {
      const eras = CONFLICT_FIELDS[isoCode]!.eras.length
      // Four rungs is the floor (islands lose `bounds`), five the ceiling.
      // The band runs from the shortest round the pool can deal (two eras,
      // four rungs) to the longest (four eras, five) — wide enough to survive
      // a tuning nudge, tight enough that a runaway schedule trips it.
      for (const hints of [4, 5]) {
        const seconds = flashpointSeconds(eras, hints)
        expect(seconds).toBeGreaterThanOrEqual(37)
        expect(seconds).toBeLessThanOrEqual(50)
      }
    }
  })
})
