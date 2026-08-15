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
        for (const shelf of path.shelfPoints) {
          const distance = Math.hypot(shelf.x - point.x, shelf.z - point.z)
          expect(distance, `river-clear-${index}`).toBeGreaterThanOrEqual(clearance - 1e-6)
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
