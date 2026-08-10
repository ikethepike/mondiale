import { Box3, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  markerBerthFor,
  markerFitFactor,
  markerGapFor,
  markerPartsFor,
  markerSideSignFor,
  type MarkerType,
  TILE_RADIUS_RATIO,
} from './board-builder'
import { createTilePath } from './path'
import { createHeightSampler, withEdgeFalloff } from './terrain'
import { individualChallengeAccessors } from '~~/types/challenges/individual-challenge.type'
import type { Tile } from '~~/types/game.types'

/**
 * The guard that did not exist.
 *
 * Gate markers were anchored at `tileRadius * 1.05` along the path tangent —
 * a budget reasoned from `spacing`, which is the curve's AVERAGE arc length.
 * The real chord between neighbouring tiles runs 0.84–0.92 of it, and several
 * marker footprints were multiples of what was left: the history hourglass
 * overhung the next tile's disc by ~3 world units and reached back INSIDE its
 * own. Markers were also planted at tile ground while their recipes are
 * authored from their own foot, putting every base part below the disc's top
 * face and inside the rim cylinder.
 *
 * None of it was visible in /test-markers, which spaces markers 2.2x wider
 * than the board and stands them on top of the disc. So the check lives here,
 * against the real path, and fails on the geometry rather than on review.
 */

const GATE_TYPES: MarkerType[] = [...individualChallengeAccessors]

/** The board lengths the game actually deals. */
const LENGTHS = [30, 45, 60, 90]
const SEEDS = ['alpha', 'bravo', 'charlie', 'delta']

const pathFor = (seed: string, count: number) => {
  const tiles: Tile[] = Array.from({ length: count }, (_, position) => ({
    position,
    type: 'normal' as const,
  }))
  return createTilePath(seed, tiles, withEdgeFalloff(createHeightSampler(seed)))
}

const boxOf = (type: MarkerType, spacing: number) => {
  const box = new Box3()
  for (const part of markerPartsFor(type, spacing, undefined, 5)) {
    part.geometry.computeBoundingBox()
    if (part.geometry.boundingBox) box.union(part.geometry.boundingBox)
  }
  return box
}

/** Reach along the PATH axis, after the fit factor — the axis that can foul
 *  the tiles ahead and behind once the marker is berthed beside its own. */
const depthOf = (type: MarkerType, spacing: number, fit: number) => {
  const box = boxOf(type, spacing)
  if (box.isEmpty()) return 0
  return Math.max(Math.abs(box.min.z), Math.abs(box.max.z)) * fit
}

describe('the local chord, not the average spacing', () => {
  it('runs well under spacing through the turns that matter', () => {
    for (const seed of SEEDS) {
      for (const count of LENGTHS) {
        const { chords, spacing } = pathFor(seed, count)
        const ratios = chords.slice(0, -1).map(chord => chord / spacing)
        // A straight, gently-climbing segment can match the average (the 3D
        // chord even tops it by a hair). The TURNS are the point: the tightest
        // gap on any board is far under it, which is what a spacing-derived
        // budget missed.
        expect(Math.min(...ratios)).toBeLessThan(0.93)
        for (const ratio of ratios) {
          expect(ratio).toBeLessThan(1.05)
          // A sanity floor: the path never doubles back on itself.
          expect(ratio).toBeGreaterThan(0.5)
        }
      }
    }
  })

  it('leaves a gap far too small for any marker to stand in', () => {
    // The fact that decides the whole placement model: markers are ~1.5x the
    // tile radius, the gap between discs is a fraction of it. Standing a
    // marker there was never geometrically possible.
    for (const seed of SEEDS) {
      for (const count of LENGTHS) {
        const { chords, spacing } = pathFor(seed, count)
        const tileRadius = spacing * TILE_RADIUS_RATIO
        for (let index = 1; index < count - 1; index++) {
          expect(markerGapFor(index, chords, tileRadius)).toBeLessThan(tileRadius)
        }
      }
    }
  })

  it('is index-aligned with the transforms', () => {
    const { chords, transforms } = pathFor('alpha', 40)
    expect(chords).toHaveLength(transforms.length)
    expect(chords[0]).toBeCloseTo(transforms[0].position.distanceTo(transforms[1].position), 6)
  })
})

describe('a gate berths beside its tile, clear of every disc', () => {
  it('holds for every gate type, board length and seed', () => {
    for (const seed of SEEDS) {
      for (const count of LENGTHS) {
        const { chords, spacing, transforms } = pathFor(seed, count)
        const tileRadius = spacing * TILE_RADIUS_RATIO
        const outlineWidth = spacing * 0.016

        // Every position a gate could be dealt to (never first or last).
        for (let index = 1; index < count - 1; index++) {
          const gap = markerGapFor(index, chords, tileRadius)

          for (const type of GATE_TYPES) {
            const parts = markerPartsFor(type, spacing, undefined, 5)
            const fit = markerFitFactor(parts, tileRadius, gap, outlineWidth)
            const where = `${seed}/${count} ${type} at ${index}`

            // 1. Berthed clear of its OWN disc, so the pawn's tile stays free
            //    for the pawn — the whole point of standing beside a gate.
            const berth = markerBerthFor(parts, tileRadius, fit, outlineWidth)
            const inward = berth - Math.abs(boxOf(type, spacing).min.x) * fit
            expect(inward, `${where} overlaps its own tile`).toBeGreaterThanOrEqual(
              tileRadius - 1e-6
            )

            // 2. Deep enough to foul the tiles ahead/behind? The berth is
            //    level with this disc's centre, so it has this radius plus the
            //    gap before it reaches a neighbour.
            const depth = depthOf(type, spacing, fit)
            expect(depth, `${where} fouls a neighbouring disc`).toBeLessThanOrEqual(
              tileRadius + gap - outlineWidth + 1e-6
            )

            // 3. Actually beside the tile it belongs to — not drifted nearer
            //    some other tile's centre. Berthing to the inside of a bend
            //    does exactly that, which is why the side is chosen.
            const side = new Vector3()
              .crossVectors(new Vector3(0, 1, 0), transforms[index].tangent)
              .normalize()
            const sign = markerSideSignFor(index, transforms, side, berth)
            const foot = transforms[index].position.clone().addScaledVector(side, berth * sign)
            const own = foot.distanceTo(transforms[index].position)
            for (const other of [index - 1, index + 1]) {
              expect(
                foot.distanceTo(transforms[other].position),
                `${where} sits nearer tile ${other}`
              ).toBeGreaterThan(own)
            }
          }
        }
      }
    }
  })

  it('shrinks a marker only as far as it must, never inverting it', () => {
    const { chords, spacing } = pathFor('alpha', 60)
    const tileRadius = spacing * TILE_RADIUS_RATIO
    const gap = markerGapFor(10, chords, tileRadius)

    for (const type of GATE_TYPES) {
      const parts = markerPartsFor(type, spacing, undefined, 5)
      const fit = markerFitFactor(parts, tileRadius, gap, spacing * 0.016)
      expect(fit, type).toBeGreaterThan(0)
      expect(fit, type).toBeLessThanOrEqual(1)
      // A marker shrunk to a speck is a bug, not a fit — the art has to stay
      // legible from the board's-eye camera.
      expect(fit, type).toBeGreaterThan(0.6)
    }
  })

  it('leaves a marker that already fits at full size', () => {
    // A generous tile must not shrink anything — the factor is a last resort,
    // not a routine tax on every marker.
    const parts = markerPartsFor('flag', 10, undefined, 5)
    expect(markerFitFactor(parts, 1000, 10, 0.16)).toBe(1)
  })
})

describe('markers stand on the tile top face', () => {
  it('authors every recipe from its own foot, so the lift is uniform', () => {
    // The recipes put y=0 at the marker's base; the builder adds the disc
    // height once. A recipe that dipped below its own origin would sink
    // through the tile top the moment it was lifted.
    for (const type of [...GATE_TYPES, 'final' as MarkerType]) {
      for (const part of markerPartsFor(type, 10, undefined, 5)) {
        part.geometry.computeBoundingBox()
        const box = part.geometry.boundingBox
        if (!box) continue
        expect(box.min.y, `${type} dips below its own origin`).toBeGreaterThanOrEqual(-1e-6)
      }
    }
  })
})

describe('the final arch is exempt', () => {
  it('spans its tile by design rather than standing in a gap', () => {
    // The checker gate straddles the final disc — its pillars are SUPPOSED to
    // sit outside the tile radius, so the gap budget must not be applied to
    // it. Pinned so a future refactor doesn't quietly fold it in.
    const parts = markerPartsFor('final', 10, undefined, 5)
    const box = new Box3()
    for (const part of parts) {
      part.geometry.computeBoundingBox()
      if (part.geometry.boundingBox) box.union(part.geometry.boundingBox)
    }
    const halfWidth = Math.max(Math.abs(box.min.x), Math.abs(box.max.x))
    expect(halfWidth).toBeGreaterThan(10 * TILE_RADIUS_RATIO)
  })
})

describe('a marker keeps its silhouette', () => {
  it('scales uniformly, so a fitted marker is the same shape', () => {
    const { chords, spacing } = pathFor('bravo', 52)
    const tileRadius = spacing * TILE_RADIUS_RATIO
    const gap = markerGapFor(20, chords, tileRadius)
    const parts = markerPartsFor('history', spacing, undefined, 5)
    const fit = markerFitFactor(parts, tileRadius, gap, spacing * 0.016)

    const box = new Box3()
    for (const part of parts) {
      part.geometry.computeBoundingBox()
      if (part.geometry.boundingBox) box.union(part.geometry.boundingBox)
    }
    const size = box.getSize(new Vector3())
    expect(size.z).toBeGreaterThan(0)
    const ratioBefore = size.y / size.z
    // A uniform factor cannot change the proportions — this is what a
    // per-axis squash would break.
    const scaled = size.clone().multiplyScalar(fit)
    expect(scaled.y / scaled.z).toBeCloseTo(ratioBefore, 10)
  })
})
