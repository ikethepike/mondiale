import { describe, expect, it } from 'vitest'
import { createTilePath } from './path'
import { pickScenerySites } from './scenery'
import { createHeightSampler, EDGE_FADE_START, withEdgeFalloff } from './terrain'
import type { Tile } from '~~/types/game.types'

const sitesFor = (seed: string, count = 65) => {
  const tiles: Tile[] = Array.from({ length: count }, (_, position) => ({
    position,
    type: 'normal' as const,
  }))
  const sampler = withEdgeFalloff(createHeightSampler(seed))
  const path = createTilePath(seed, tiles, sampler)
  return { sites: pickScenerySites(seed, path, undefined, undefined, sampler), path }
}

describe('pickScenerySites', () => {
  it('is deterministic per seed', () => {
    const first = sitesFor('scenery-a').sites
    const second = sitesFor('scenery-a').sites
    expect(first.cairns.length).toBe(second.cairns.length)
    first.cairns.forEach((cairn, index) => {
      expect(cairn.equals(second.cairns[index])).toBe(true)
    })
    expect(Boolean(first.compass)).toBe(Boolean(second.compass))
  })

  it('keeps every piece clear of the track and inside the page', () => {
    for (let index = 0; index < 25; index++) {
      const { sites, path } = sitesFor(`scenery-${index}`)
      const clearance = 1.6 * path.spacing
      const pieces = [...sites.cairns, ...(sites.compass ? [sites.compass] : [])]
      for (const piece of pieces) {
        expect(Math.hypot(piece.x, piece.z)).toBeLessThanOrEqual(EDGE_FADE_START)
        for (const point of path.shelfPoints) {
          const distance = Math.hypot(point.x - piece.x, point.z - piece.z)
          expect(distance, `scenery-${index}`).toBeGreaterThanOrEqual(clearance - 1e-6)
        }
      }
    }
  })

  it('deals one or two cairns, kept apart', () => {
    for (let index = 0; index < 25; index++) {
      const { sites } = sitesFor(`scenery-${index}`)
      expect(sites.cairns.length).toBeGreaterThanOrEqual(0)
      expect(sites.cairns.length).toBeLessThanOrEqual(2)
      if (sites.cairns.length === 2) {
        const [a, b] = sites.cairns
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(26)
      }
    }
  })

  it('finds cairns and a compass on most boards', () => {
    let cairned = 0
    let compassed = 0
    for (let index = 0; index < 30; index++) {
      const { sites } = sitesFor(`scenery-rate-${index}`)
      if (sites.cairns.length) cairned++
      if (sites.compass) compassed++
    }
    expect(cairned).toBeGreaterThan(20)
    expect(compassed).toBeGreaterThan(20)
  })
})
