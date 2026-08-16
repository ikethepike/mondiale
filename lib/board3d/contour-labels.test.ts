import { describe, expect, it } from 'vitest'
import { MAJOR_CONTOUR_STEP, pickContourLabels } from './contour-labels'
import { createTilePath } from './path'
import { createHeightSampler, EDGE_FADE_START, withEdgeFalloff, withPathShelf } from './terrain'
import type { Tile } from '~~/types/game.types'

/** Labels only need the shelved base world — water/rail avoidance is a set
 *  of pure distance checks exercised through the options. */
const worldFor = (seed: string, count = 65) => {
  const tiles: Tile[] = Array.from({ length: count }, (_, position) => ({
    position,
    type: 'normal' as const,
  }))
  const rawSampler = withEdgeFalloff(createHeightSampler(seed))
  const path = createTilePath(seed, tiles, rawSampler)
  const sampler = withPathShelf(rawSampler, path.shelfPoints, path.spacing * 1.05)
  return { path, sampler }
}

describe('pickContourLabels', () => {
  it('is deterministic per seed', () => {
    const { path, sampler } = worldFor('labels-0')
    const first = pickContourLabels(sampler, path)
    const second = pickContourLabels(sampler, path)
    expect(second.sites).toEqual(first.sites)
    expect(second.levels).toEqual(first.levels)
  })

  it('finds labels on most boards', () => {
    let labelled = 0
    for (let index = 0; index < 30; index++) {
      const { path, sampler } = worldFor(`labels-${index}`)
      if (pickContourLabels(sampler, path).sites.length > 0) labelled++
    }
    expect(labelled).toBeGreaterThan(20)
  })

  it('sits every label ON its major level, on sloped ground, apart from its neighbours', () => {
    for (let index = 0; index < 12; index++) {
      const { path, sampler } = worldFor(`labels-${index}`)
      const { levels, sites } = pickContourLabels(sampler, path)
      for (const site of sites) {
        expect(Math.abs(sampler(site.x, site.z) - levels[site.levelIndex])).toBeLessThan(0.1)
        expect(levels[site.levelIndex] % MAJOR_CONTOUR_STEP).toBeCloseTo(0, 6)
        const gradient = Math.hypot(
          (sampler(site.x + 1, site.z) - sampler(site.x - 1, site.z)) / 2,
          (sampler(site.x, site.z + 1) - sampler(site.x, site.z - 1)) / 2
        )
        expect(gradient).toBeGreaterThanOrEqual(0.05)
        expect(gradient).toBeLessThanOrEqual(0.5)
      }
      for (const site of sites) {
        const others = sites.filter(other => other !== site)
        for (const other of others) {
          expect(Math.hypot(site.x - other.x, site.z - other.z)).toBeGreaterThanOrEqual(24)
        }
      }
    }
  })

  it('keeps clear of the track and inside the page', () => {
    for (let index = 0; index < 12; index++) {
      const { path, sampler } = worldFor(`labels-${index}`)
      const { sites } = pickContourLabels(sampler, path)
      for (const site of sites) {
        expect(Math.hypot(site.x, site.z)).toBeLessThanOrEqual(EDGE_FADE_START)
        for (const shelf of path.shelfPoints) {
          expect(Math.hypot(shelf.x - site.x, shelf.z - site.z)).toBeGreaterThanOrEqual(
            path.spacing * 0.95
          )
        }
      }
    }
  })

  it('drops every level above the snowline', () => {
    const { path, sampler } = worldFor('labels-3')
    const snowbound = pickContourLabels(sampler, path, { snowlineY: MAJOR_CONTOUR_STEP })
    expect(snowbound.levels).toHaveLength(0)
    expect(snowbound.sites).toHaveLength(0)
  })
})
