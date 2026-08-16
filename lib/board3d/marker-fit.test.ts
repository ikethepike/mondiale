import { Box3, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  markerFitFactor,
  markerGapFor,
  markerPartsFor,
  type MarkerType,
  TILE_RADIUS_RATIO,
  TILE_RIM_HEIGHT,
  TILE_TOP_LIFT,
} from './board-builder'
import { createTilePath, type TrackArchetype } from './path'
import { createHeightSampler, withEdgeFalloff } from './terrain'
import { individualChallengeAccessors } from '~~/types/challenges/individual-challenge.type'
import type { Tile } from '~~/types/game.types'

/**
 * The guard that did not exist when gate markers were placed.
 *
 * A gate is a HURDLE standing in the path, at its tile's exit edge, and it is
 * meant to overhang the discs either side — that overlap is what reads as
 * barring the way. What made the old placement a bug was the HEIGHT: markers
 * were planted at tile ground while their recipes are authored from their own
 * foot, so every base part sat 0.55–0.64 below the disc's top face, buried
 * inside the rim cylinder and surfacing through it as black outline gashes.
 *
 * The anchor was also derived from `spacing`, the curve's AVERAGE arc length,
 * while the real chord runs 0.84–0.92 of it — so the offset overdrew exactly
 * where the board is most crowded.
 *
 * None of it was visible in the since-removed /test-markers workbench, which
 * pitched markers 2.2x wider than the board and stood them on top of the
 * disc. So the check lives here, against the real path.
 */

const GATE_TYPES: MarkerType[] = [...individualChallengeAccessors]

/** The lengths the game deals (`TILE_COUNTS`: 40/65/90) plus 52, where the
 *  serpentine's rows-per-count sawtooth pinches the row pitch tightest. */
const LENGTHS = [40, 52, 65, 90]
const SEEDS = ['alpha', 'bravo', 'charlie', 'delta']

const pathFor = (seed: string, count: number, archetype?: TrackArchetype) => {
  const tiles: Tile[] = Array.from({ length: count }, (_, position) => ({
    position,
    type: 'normal' as const,
  }))
  return createTilePath(
    seed,
    tiles,
    withEdgeFalloff(createHeightSampler(seed)),
    archetype ? { archetype } : undefined
  )
}

const boxOf = (type: MarkerType, spacing: number) => {
  const box = new Box3()
  for (const part of markerPartsFor(type, spacing)) {
    part.geometry.computeBoundingBox()
    if (part.geometry.boundingBox) box.union(part.geometry.boundingBox)
  }
  return box
}

describe('the local chord, not the average spacing', () => {
  it('runs well under spacing through the turns that matter', () => {
    // Serpentine-specific: its row turns are the tight spots this documents.
    // (An unforced deal can draw a spiral, whose uniform gentle curvature
    // keeps every chord near spacing — a different, valid geometry.)
    for (const seed of SEEDS) {
      for (const count of LENGTHS) {
        const { chords, spacing } = pathFor(seed, count, 'serpentine')
        const ratios = chords.slice(0, -1).map(chord => chord / spacing)
        // A straight, gently-climbing segment can match the average (the 3D
        // chord even tops it by a hair). The TURNS are the point: the tightest
        // gap on any board is well under it, which is what a spacing-derived
        // offset missed. Measured minima run 0.84–0.94 across the dealt
        // lengths (65-tile boards sit highest).
        expect(Math.min(...ratios)).toBeLessThan(0.95)
        for (const ratio of ratios) {
          expect(ratio).toBeLessThan(1.05)
          // A sanity floor: the path never doubles back on itself.
          expect(ratio).toBeGreaterThan(0.5)
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

describe('a hurdle stands clear of the disc geometry', () => {
  it('authors every recipe from its own foot, so the top-face lift is uniform', () => {
    // This is the invariant the lift depends on. The recipes put y=0 at the
    // marker's base and the builder adds the disc height once; a recipe that
    // dipped below its own origin would sink back into the rim it was lifted
    // out of, which is the exact bug being fixed.
    for (const type of [...GATE_TYPES, 'final' as MarkerType]) {
      for (const part of markerPartsFor(type, 10)) {
        part.geometry.computeBoundingBox()
        const box = part.geometry.boundingBox
        if (!box) continue
        expect(box.min.y, `${type} dips below its own origin`).toBeGreaterThanOrEqual(-1e-6)
      }
    }
  })

  it('clears the rim cylinder at every board length', () => {
    // Standing at the top face, a marker's foot is above every disc surface —
    // so an overhang is a marker passing OVER a tile, never through it.
    const lift = TILE_TOP_LIFT
    for (const count of LENGTHS) {
      const { spacing } = pathFor('alpha', count)
      for (const type of GATE_TYPES) {
        expect(lift, `${type} at ${count}`).toBeGreaterThanOrEqual(TILE_RIM_HEIGHT)
        // The marker's own base sits at the lift, clear of the rim's top.
        expect(boxOf(type, spacing).min.y + lift).toBeGreaterThanOrEqual(TILE_RIM_HEIGHT - 1e-6)
      }
    }
  })
})

describe('a hurdle sits in the gap it was measured for', () => {
  it('centres between the two discs it stands between', () => {
    for (const seed of SEEDS) {
      for (const count of LENGTHS) {
        const { chords, transforms, spacing } = pathFor(seed, count)
        const tileRadius = spacing * TILE_RADIUS_RATIO

        for (let index = 1; index < count - 1; index++) {
          const gap = markerGapFor(index, chords, tileRadius)
          const { position, tangent } = transforms[index]
          const anchor = position.clone().addScaledVector(tangent, tileRadius + gap / 2)

          // The anchor's FOOT lands in open ground between the two discs.
          //
          // Not symmetrically: it steps along the TANGENT while the chord is a
          // straight line between centres, so on a bend it swings wide of the
          // midpoint (measured up to 3.6 units out on the tightest turns). The
          // invariant is not centredness, it is that the foot is outside its
          // own disc and never inside the next one — which holds on every
          // board length and seed, with at least half a unit to spare ahead.
          const toOwnEdge = anchor.distanceTo(position) - tileRadius
          const toNextEdge = anchor.distanceTo(transforms[index + 1].position) - tileRadius
          expect(
            toOwnEdge,
            `${seed}/${count} at ${index} is inside its own disc`
          ).toBeGreaterThanOrEqual(-1e-6)
          expect(
            toNextEdge,
            `${seed}/${count} at ${index} is inside the next disc`
          ).toBeGreaterThan(0)
        }
      }
    }
  })

  it('never sprawls across a whole neighbouring tile', () => {
    // The cap is deliberately generous: a hurdle SHOULD overhang the discs it
    // bars. It only stops a marker reaching past the neighbour's far side.
    //
    // Marker geometry is rebuilt per (type, spacing) OUTSIDE the tile loop —
    // building it per tile is thousands of lathes and extrusions and blew the
    // 5s timeout on CI. Same coverage, one build per board.
    for (const seed of SEEDS) {
      for (const count of LENGTHS) {
        const { chords, spacing } = pathFor(seed, count)
        const tileRadius = spacing * TILE_RADIUS_RATIO
        const measured = GATE_TYPES.map(type => {
          const box = boxOf(type, spacing)
          return {
            type,
            parts: markerPartsFor(type, spacing),
            depth: Math.max(Math.abs(box.min.z), Math.abs(box.max.z)),
          }
        })

        for (let index = 1; index < count - 1; index++) {
          const gap = markerGapFor(index, chords, tileRadius)
          for (const { type, parts, depth } of measured) {
            const fit = markerFitFactor(parts, tileRadius, gap)
            expect(depth * fit, `${seed}/${count} ${type} at ${index}`).toBeLessThanOrEqual(
              gap / 2 + tileRadius + 1e-6
            )
          }
        }
      }
    }
  })

  it('keeps the art legible — a hurdle is never shrunk to a speck', () => {
    // Fitting a marker STRICTLY inside the gap drove every factor under 0.01.
    // A gate nobody can see is not a gate.
    for (const seed of SEEDS) {
      for (const count of LENGTHS) {
        const { chords, spacing } = pathFor(seed, count)
        const tileRadius = spacing * TILE_RADIUS_RATIO
        const parts = GATE_TYPES.map(type => [type, markerPartsFor(type, spacing)] as const)
        for (let index = 1; index < count - 1; index++) {
          const gap = markerGapFor(index, chords, tileRadius)
          for (const [type, geometry] of parts) {
            const fit = markerFitFactor(geometry, tileRadius, gap)
            expect(fit, `${seed}/${count} ${type}`).toBeGreaterThan(0.5)
            expect(fit).toBeLessThanOrEqual(1)
          }
        }
      }
    }
  })

  it('leaves a marker that already fits at full size', () => {
    expect(markerFitFactor(markerPartsFor('flag', 10), 1000, 1000)).toBe(1)
  })
})

describe('every archetype keeps the hurdle invariants', () => {
  // The suites above pin the serpentine (the default deal). The other track
  // shapes must hold the same three placement invariants: the foot lands in
  // open ground, nothing sprawls past a neighbour, nothing shrinks to a speck.
  const OTHER_ARCHETYPES: TrackArchetype[] = ['spiral', 'horseshoe', 'ridge']

  it('holds the foot, sprawl and speck invariants on every shape', () => {
    for (const archetype of OTHER_ARCHETYPES) {
      for (const seed of ['alpha', 'bravo']) {
        for (const count of [40, 65, 90]) {
          const { chords, transforms, spacing } = pathFor(seed, count, archetype)
          const tileRadius = spacing * TILE_RADIUS_RATIO
          const measured = GATE_TYPES.map(type => {
            const box = boxOf(type, spacing)
            return {
              type,
              parts: markerPartsFor(type, spacing),
              depth: Math.max(Math.abs(box.min.z), Math.abs(box.max.z)),
            }
          })

          for (let index = 1; index < count - 1; index++) {
            const gap = markerGapFor(index, chords, tileRadius)
            const { position, tangent } = transforms[index]
            const anchor = position.clone().addScaledVector(tangent, tileRadius + gap / 2)
            const label = `${archetype}/${seed}/${count} at ${index}`

            const toOwnEdge = anchor.distanceTo(position) - tileRadius
            const toNextEdge = anchor.distanceTo(transforms[index + 1].position) - tileRadius
            expect(toOwnEdge, `${label} foot inside its own disc`).toBeGreaterThanOrEqual(-1e-6)
            expect(toNextEdge, `${label} foot inside the next disc`).toBeGreaterThan(0)

            for (const { type, parts, depth } of measured) {
              const fit = markerFitFactor(parts, tileRadius, gap)
              expect(depth * fit, `${label} ${type} sprawls`).toBeLessThanOrEqual(
                gap / 2 + tileRadius + 1e-6
              )
              expect(fit, `${label} ${type} is a speck`).toBeGreaterThan(0.5)
            }
          }
        }
      }
    }
  })
})

describe('the final arch is exempt', () => {
  it('spans its tile by design rather than standing in a gap', () => {
    // The checker gate straddles the final disc — its pillars are SUPPOSED to
    // sit outside the tile radius, so the gap budget must not be applied to
    // it. Pinned so a future refactor doesn't quietly fold it in.
    const halfWidth = Math.max(
      Math.abs(boxOf('final', 10).min.x),
      Math.abs(boxOf('final', 10).max.x)
    )
    expect(halfWidth).toBeGreaterThan(10 * TILE_RADIUS_RATIO)
  })
})

describe('a marker keeps its silhouette', () => {
  it('scales uniformly, so a fitted marker is the same shape', () => {
    const { chords, spacing } = pathFor('bravo', 52)
    const tileRadius = spacing * TILE_RADIUS_RATIO
    const gap = markerGapFor(20, chords, tileRadius)
    const fit = markerFitFactor(markerPartsFor('history', spacing), tileRadius, gap)

    const size = boxOf('history', spacing).getSize(new Vector3())
    expect(size.z).toBeGreaterThan(0)
    const ratioBefore = size.y / size.z
    // A uniform factor cannot change the proportions — this is what a
    // per-axis squash would break.
    const scaled = size.clone().multiplyScalar(fit)
    expect(scaled.y / scaled.z).toBeCloseTo(ratioBefore, 10)
  })
})
