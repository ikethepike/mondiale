import { describe, expect, it } from 'vitest'
import { BOARD_COLORS, TILE_TOP_TINTS } from './colors'
import { individualChallengeAccessors } from '~~/types/challenges/individual-challenge.type'

/**
 * The gate-top washes are chosen by MEASURED distance, not by theme — the
 * reasoning is written through `colors.ts` in prose ("ΔE 14.3 barely announced
 * itself", "the palette's own worst pair") but nothing enforced it until here.
 * A new tint that lands on top of an existing one makes two gates look alike
 * on the board, which is invisible in review and obvious in play.
 */

const CHANNELS = [1, 3, 5] as const

const linear = (hex: string) =>
  CHANNELS.map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(channel =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  )

/** CIE L*a*b*, via XYZ under D65 — the space ΔE is defined in. */
const lab = (hex: string): [number, number, number] => {
  const [red = 0, green = 0, blue = 0] = linear(hex)
  const x = (0.4124 * red + 0.3576 * green + 0.1805 * blue) / 0.95047
  const y = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  const z = (0.0193 * red + 0.1192 * green + 0.9505 * blue) / 1.08883
  const f = (value: number) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const deltaE = (a: string, b: string): number => {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

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
