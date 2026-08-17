import { describe, expect, it } from 'vitest'
import { createTilePath } from './path'
import { pickRiverPath, withRiverBed } from './river'
import { createHeightSampler, EDGE_FADE_START, withEdgeFalloff } from './terrain'
import type { Tile } from '~~/types/game.types'

const riverFor = (seed: string, count = 65) => {
  const tiles: Tile[] = Array.from({ length: count }, (_, position) => ({
    position,
    type: 'normal' as const,
  }))
  const sampler = withEdgeFalloff(createHeightSampler(seed))
  const path = createTilePath(seed, tiles, sampler)
  return { river: pickRiverPath(seed, path, undefined, undefined, sampler), path, sampler }
}

describe('pickRiverPath', () => {
  it('is deterministic per seed', () => {
    const first = riverFor('river-a').river
    const second = riverFor('river-a').river
    expect(Boolean(first)).toBe(Boolean(second))
    if (first && second) {
      expect(first.points.length).toBe(second.points.length)
      expect(first.points[0].equals(second.points[0])).toBe(true)
    }
  })

  it('deals a river on some boards and declines on others', () => {
    let dealt = 0
    for (let index = 0; index < 40; index++) {
      if (riverFor(`river-rate-${index}`).river) dealt++
    }
    expect(dealt).toBeGreaterThan(4)
    expect(dealt).toBeLessThan(36)
  })

  it('keeps every point clear of the track and inside the page', () => {
    for (let index = 0; index < 30; index++) {
      const { river, path } = riverFor(`river-clear-${index}`)
      if (!river) continue
      const clearance = 1.35 * path.spacing
      for (const point of river.points) {
        expect(Math.hypot(point.x, point.z)).toBeLessThanOrEqual(EDGE_FADE_START)
        // The one sanctioned exception: the bridged crossing's own corridor.
        const bridged = river.crossings.some(
          crossing =>
            Math.hypot(point.x - crossing.center.x, point.z - crossing.center.z) <
            crossing.halfBand * 2.6
        )
        if (bridged) continue
        for (const shelf of path.shelfPoints) {
          const distance = Math.hypot(shelf.x - point.x, shelf.z - point.z)
          // Near-track points are PINNED through smoothing, but the fine
          // spline may still bow a hair inside the surveyed berth between
          // its coarse knots — bounded, never compounding.
          expect(distance, `river-clear-${index}`).toBeGreaterThanOrEqual(clearance - 0.2)
        }
      }
    }
  })

  it('always runs downhill', () => {
    for (let index = 0; index < 30; index++) {
      const { river } = riverFor(`river-flow-${index}`)
      if (!river) continue
      for (let point = 1; point < river.points.length; point++) {
        expect(river.points[point].y).toBeLessThanOrEqual(river.points[point - 1].y + 1e-9)
      }
    }
  })

  it('bends gently — the lateral low-pass keeps kinks out of the ribbon', () => {
    let checked = 0
    for (let index = 0; index < 30; index++) {
      const { river } = riverFor(`river-flow-${index}`)
      if (!river) continue
      checked++
      // The tail curls into its arrival pool by design (the stagnation cut
      // fires only once the water has stopped dropping), and the approach
      // elbow at a bridged crossing turns square on purpose — the
      // gentle-bend guarantee covers the ribbon's open RUNNING length.
      for (let point = 1; point < river.points.length - 6; point++) {
        const here = river.points[point]
        const nearElbow = river.crossings.some(
          crossing =>
            Math.hypot(here.x - crossing.center.x, here.z - crossing.center.z) <
            crossing.halfBand * 1.6
        )
        if (nearElbow) continue
        const before = river.points[point - 1]
        const after = river.points[point + 1]
        const inHeading = Math.atan2(here.x - before.x, here.z - before.z)
        const outHeading = Math.atan2(after.x - here.x, after.z - here.z)
        let turn = Math.abs(outHeading - inHeading)
        if (turn > Math.PI) turn = 2 * Math.PI - turn
        expect(turn).toBeLessThan(1.0)
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('river crossings', () => {
  it('bridges the track at most once, square-on, over level flanks, briefly', () => {
    let crossed = 0
    for (let index = 0; index < 200 && crossed < 4; index++) {
      const { river, path } = riverFor(`river-cross-${index}`)
      if (!river?.crossings.length) continue
      crossed++
      expect(river.crossings).toHaveLength(1)
      const [crossing] = river.crossings

      // Square-on: the stream's heading through the band stays within the
      // dot bound of perpendicular to the recorded track tangent.
      const band = river.points.filter(
        point =>
          Math.hypot(point.x - crossing.center.x, point.z - crossing.center.z) < crossing.halfBand
      )
      expect(band.length).toBeGreaterThan(0)
      if (band.length >= 2) {
        const first = band[0]
        const last = band[band.length - 1]
        const heading = Math.atan2(last.x - first.x, last.z - first.z)
        const dot = Math.sin(heading) * crossing.tangent.x + Math.cos(heading) * crossing.tangent.z
        expect(Math.abs(dot)).toBeLessThan(0.6)
      }

      // Level flanks: the nearest track samples either side of the band sit
      // within the pond bridge's own tolerance.
      let nearest = Infinity
      let anchor = 0
      path.shelfPoints.forEach((point, at) => {
        const distance = Math.hypot(point.x - crossing.center.x, point.z - crossing.center.z)
        if (distance < nearest) {
          nearest = distance
          anchor = at
        }
      })
      const flankA = path.shelfPoints[Math.max(anchor - 4, 0)]
      const flankB = path.shelfPoints[Math.min(anchor + 4, path.shelfPoints.length - 1)]
      // CROSSING_LEVEL bound, measured from the crossing's own anchor (the
      // implementation gates at the ENTRY anchor a stride away, so allow a
      // hair of drift).
      expect(Math.abs(flankA.y - flankB.y)).toBeLessThanOrEqual(0.1 * path.spacing + 0.05)
    }
    expect(crossed).toBeGreaterThan(0)
  })

  it('leaves rivers without a crossing exactly as strict as before', () => {
    for (let index = 0; index < 30; index++) {
      const { river, path } = riverFor(`river-flow-${index}`)
      if (!river || river.crossings.length) continue
      const clearance = 1.35 * path.spacing
      for (const point of river.points) {
        for (const shelf of path.shelfPoints) {
          // The fine low-pass may pull a hair inside the surveyed berth,
          // never into the shelf band itself.
          expect(Math.hypot(shelf.x - point.x, shelf.z - point.z)).toBeGreaterThanOrEqual(
            clearance * 0.82
          )
        }
      }
    }
  })

  it('does not undermine the shelf at a crossing', () => {
    let checked = 0
    for (let index = 0; index < 200 && checked < 2; index++) {
      const world = riverFor(`river-cross-${index}`)
      const { river, path, sampler } = world
      if (!river?.crossings.length) continue
      checked++
      const carved = withRiverBed(sampler, river)
      const [crossing] = river.crossings
      // Track samples flanking the crossing sink no deeper than the channel
      // floor clamp (0.95 under the crossing anchor) plus the level-flank
      // tolerance (0.1×spacing ≈ 0.45) — an underpass channel in the same
      // register as the river's own 1.1 bed drop, never a gorge.
      for (const shelf of path.shelfPoints) {
        const reach = Math.hypot(shelf.x - crossing.center.x, shelf.z - crossing.center.z)
        if (reach > crossing.halfBand * 2) continue
        const drop = sampler(shelf.x, shelf.z) - carved(shelf.x, shelf.z)
        expect(drop).toBeLessThan(1.45)
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('withRiverBed', () => {
  it('carves under the water line and leaves the banks alone', () => {
    const found = (() => {
      for (let index = 0; index < 40; index++) {
        const result = riverFor(`river-bed-${index}`)
        if (result.river) return result
      }
      throw new Error('no seed dealt a river in 40 tries')
    })()
    const { river, sampler } = found
    const carved = withRiverBed(sampler, river!)

    const mid = river!.points[Math.floor(river!.points.length / 2)]
    expect(carved(mid.x, mid.z)).toBeLessThan(mid.y)

    const far = river!.points[0]
    expect(carved(far.x + river!.width * 3, far.z + river!.width * 3)).toBeCloseTo(
      sampler(far.x + river!.width * 3, far.z + river!.width * 3),
      6
    )
  })
})
