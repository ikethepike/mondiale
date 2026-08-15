import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { generateTiles } from '~~/lib/tiles'
import { createTilePath, MIN_PASS_CLEARANCE, trackIsClear, type TrackArchetype } from './path'
import { BOARD_SIZE, createHeightSampler } from './terrain'
import type { Tile } from '~~/types/game.types'

const ARCHETYPES: TrackArchetype[] = ['serpentine', 'spiral', 'horseshoe', 'ridge']
/** The lengths the game deals (`TILE_COUNTS`) plus 52, the serpentine's
 *  row-pitch pinch. */
const LENGTHS = [40, 52, 65, 90]
const SEEDS = ['alpha', 'bravo', 'charlie', 'delta']

/** Real board extent runs past the control points: the centripetal spline
 *  overshoots by ~1.5 units and endpoint jitter adds a few more. ±45 is the
 *  measured envelope of shipped serpentines with margin — far inside the
 *  terrain's EDGE_FADE_START (85). */
const EXTENT_BUDGET = (BOARD_SIZE * 0.78) / 2 + 6

const tilesOf = (count: number): Tile[] =>
  Array.from({ length: count }, (_, position) => ({ position, type: 'normal' as const }))

const pathFor = (seed: string, count: number, archetype?: TrackArchetype) =>
  createTilePath(
    seed,
    tilesOf(count),
    createHeightSampler(seed),
    archetype ? { archetype } : undefined
  )

describe('createTilePath', () => {
  it('is deterministic per seed', () => {
    const tiles = generateTiles('medium', 'path-test')
    const sampler = createHeightSampler('path-test')
    const first = createTilePath('path-test', tiles, sampler)
    const second = createTilePath('path-test', tiles, sampler)
    first.transforms.forEach((transform, index) => {
      expect(transform.position.equals(second.transforms[index].position)).toBe(true)
      expect(transform.tangent.equals(second.transforms[index].tangent)).toBe(true)
    })
    expect(first.spacing).toBe(second.spacing)
    expect(first.archetype).toBe(second.archetype)
  })

  it('varies with the seed', () => {
    const tiles = generateTiles('medium', 'path-test')
    const sampler = createHeightSampler('path-test')
    const first = createTilePath('path-test', tiles, sampler)
    const other = createTilePath('other-seed', tiles, sampler)
    const moved = first.transforms.some(
      (transform, index) => !transform.position.equals(other.transforms[index].position)
    )
    expect(moved).toBe(true)
  })

  it('lays out one transform per tile with unit ground-plane tangents', () => {
    for (const archetype of ARCHETYPES) {
      const { transforms, spacing, shelfPoints } = pathFor('alpha', 65, archetype)
      expect(transforms).toHaveLength(65)
      expect(spacing).toBeGreaterThan(0)
      expect(shelfPoints.length).toBeGreaterThan(65)
      for (const transform of transforms) {
        expect(transform.tangent.length()).toBeCloseTo(1, 5)
        expect(transform.tangent.y).toBe(0)
      }
    }
  })
})

describe('every archetype, every length, every seed', () => {
  it('stays inside the board and clears its own passes', () => {
    for (const archetype of ARCHETYPES) {
      for (const seed of SEEDS) {
        for (const count of LENGTHS) {
          const { shelfPoints, spacing, archetype: held } = pathFor(seed, count, archetype)
          const label = `${archetype}/${seed}/${count}`

          // The forced shape held — no seed in this sweep needs the fallback.
          expect(held, label).toBe(archetype)

          for (const point of shelfPoints) {
            expect(Math.abs(point.x), label).toBeLessThanOrEqual(EXTENT_BUDGET)
            expect(Math.abs(point.z), label).toBeLessThanOrEqual(EXTENT_BUDGET)
          }

          // Belt and braces over the internal guard: the RETURNED track keeps
          // its own passes MIN_PASS_CLEARANCE apart.
          expect(trackIsClear(shelfPoints, spacing), label).toBe(true)
        }
      }
    }
  })

  it('keeps chords inside the band the discs and markers are sized for', () => {
    for (const archetype of ARCHETYPES) {
      for (const seed of SEEDS) {
        for (const count of LENGTHS) {
          const { chords, spacing } = pathFor(seed, count, archetype)
          for (const chord of chords.slice(0, -1)) {
            const ratio = chord / spacing
            expect(ratio, `${archetype}/${seed}/${count}`).toBeGreaterThan(0.5)
            expect(ratio, `${archetype}/${seed}/${count}`).toBeLessThan(1.05)
          }
        }
      }
    }
  })

  it('keeps spacing in the band the board already tolerates', () => {
    // Shipped serpentines span ~7.1 (90 tiles) to ~12.2 (40 tiles). New
    // archetypes may run denser but never leave the readable band.
    for (const archetype of ARCHETYPES) {
      for (const count of LENGTHS) {
        const { spacing } = pathFor('alpha', count, archetype)
        expect(spacing, `${archetype}/${count}`).toBeGreaterThan(5)
        expect(spacing, `${archetype}/${count}`).toBeLessThan(14)
      }
    }
  })
})

describe('the archetype deal', () => {
  it('reaches every archetype across seeds, serpentine most often', () => {
    const dealt = new Map<TrackArchetype, number>()
    for (let index = 0; index < 120; index++) {
      const { archetype } = pathFor(`deal-${index}`, 65)
      dealt.set(archetype, (dealt.get(archetype) ?? 0) + 1)
    }
    for (const archetype of ARCHETYPES) {
      expect(dealt.get(archetype) ?? 0, archetype).toBeGreaterThan(0)
    }
    const counts = [...dealt.values()]
    expect(dealt.get('serpentine')).toBe(Math.max(...counts))
  })

  it('reports the shape that actually held', () => {
    const forced = pathFor('alpha', 65, 'spiral')
    expect(forced.archetype).toBe('spiral')
    const unforced = pathFor('alpha', 65)
    expect(ARCHETYPES).toContain(unforced.archetype)
  })
})

describe('trackIsClear', () => {
  it('rejects a track that crosses itself', () => {
    const spacing = 10
    // Two long perpendicular strands through the origin, far apart in index.
    const points = [
      ...Array.from({ length: 40 }, (_, i) => new Vector3(i * 2.5 - 50, 0, 0)),
      ...Array.from({ length: 40 }, (_, i) => new Vector3(0, 0, i * 2.5 - 50)),
    ]
    expect(trackIsClear(points, spacing)).toBe(false)
  })

  it('accepts every shipped serpentine — the fallback is never stricter than production', () => {
    for (let index = 0; index < 40; index++) {
      for (const count of LENGTHS) {
        const { shelfPoints, spacing } = pathFor(`fallback-${index}`, count, 'serpentine')
        expect(trackIsClear(shelfPoints, spacing), `fallback-${index}/${count}`).toBe(true)
      }
    }
  })

  it('clearance floor stays put', () => {
    // 0.75 × spacing: the measured worst shipped serpentine is 0.793. Raising
    // this floor re-litigates the production board — see the constant's doc.
    expect(MIN_PASS_CLEARANCE).toBe(0.75)
  })
})
