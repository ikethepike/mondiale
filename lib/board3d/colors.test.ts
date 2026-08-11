import { describe, expect, it } from 'vitest'
import { BOARD_COLORS, TILE_TOP_TINTS } from './colors'
import { colorDistance } from '~~/lib/palette'
import { individualChallengeAccessors } from '~~/types/challenges/individual-challenge.type'

/**
 * The gate-top washes are chosen by MEASURED distance, not by theme — the
 * reasoning is written through `colors.ts` in prose ("ΔE 14.3 barely announced
 * itself", "the palette's own worst pair") but nothing enforced it until here.
 * A new tint that lands on top of an existing one makes two gates look alike
 * on the board, which is invisible in review and obvious in play.
 */

/** The one ΔE implementation — Parliament measures its seat colours with it too. */
const deltaE = colorDistance

/**
 * The floor the `lexicon` tint established when it was picked: its own
 * tightest neighbour sits at 12.2, and that was accepted as the closest any
 * pair involving a NEW tint may get.
 *
 * Three pairs already sit at or under it and are grandfathered rather than
 * repainted — moving a shipped gate's colour is a bigger change than this test
 * is worth, and each of the three is a pair whose MARKERS differ, so the board
 * still tells them apart. Only `isoCode` vs `government.leader` (8.6) is named
 * in `colors.ts`; the other two were found by this test, which is the point of
 * having it. Do not add to this set to make a new tint pass — pick a
 * different colour.
 */
const TINT_DELTA_FLOOR = 12
const GRANDFATHERED = new Set([
  'isoCode|government.leader', // 8.6 — compass rose vs lectern
  'isoCode|landmarks', // 11.8 — compass rose vs camera
  'capital.name|lexicon', // 12.2 — skyline vs plume
])

/** A top that barely differs from a plain tile does not read as a gate. */
const PLAIN_TILE_FLOOR = 20

describe('tile-top tints', () => {
  it('gives every gate theme a top', () => {
    for (const accessor of individualChallengeAccessors) {
      expect(TILE_TOP_TINTS[accessor]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('keeps every pair far enough apart to tell two gates apart', () => {
    const themes = [...individualChallengeAccessors]
    for (let first = 0; first < themes.length; first += 1) {
      for (let second = first + 1; second < themes.length; second += 1) {
        const pair = `${themes[first]}|${themes[second]}`
        if (GRANDFATHERED.has(pair)) continue
        const distance = deltaE(TILE_TOP_TINTS[themes[first]!]!, TILE_TOP_TINTS[themes[second]!]!)
        expect(distance, `${pair} is only ΔE ${distance.toFixed(1)} apart`).toBeGreaterThanOrEqual(
          TINT_DELTA_FLOOR
        )
      }
    }
  })

  it('keeps every top clear of a plain tile', () => {
    for (const accessor of individualChallengeAccessors) {
      const distance = deltaE(TILE_TOP_TINTS[accessor]!, BOARD_COLORS.sourMilk)
      expect(distance, `${accessor} barely reads as a gate`).toBeGreaterThanOrEqual(
        PLAIN_TILE_FLOOR
      )
    }
  })

  // The parties gate shares the leader gate's lectern, so the top is the ONLY
  // thing separating them — it must clear the floor by a wide margin, not sit
  // on it. The precedent doing the same job (errata, which shares the ISO
  // gate's signpost) measures 20.6.
  it('separates the two gates that share a marker', () => {
    const shared = deltaE(TILE_TOP_TINTS['government.parties'], TILE_TOP_TINTS['government.leader'])
    const precedent = deltaE(TILE_TOP_TINTS.errata, TILE_TOP_TINTS.isoCode)
    expect(shared).toBeGreaterThanOrEqual(precedent)
  })
})
