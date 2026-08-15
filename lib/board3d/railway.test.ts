import { describe, expect, it } from 'vitest'
import { createTilePath } from './path'
import { loopCrossesItself, pickRailwayLoop } from './railway'
import { pickRiverPath, withRiverBed } from './river'
import { pickScenerySites } from './scenery'
import { pickSummitSite, withSummitMassif } from './summit'
import { createHeightSampler, EDGE_FADE_START, withEdgeFalloff, withPathShelf } from './terrain'
import { pickPondSite, withPondBasin } from './water'
import type { Tile } from '~~/types/game.types'

/** Mirror the builder's placement chain — the railway is picked LAST, over
 *  the final composed sampler, clear of everything already placed. */
const worldFor = (seed: string, count = 65) => {
  const tiles: Tile[] = Array.from({ length: count }, (_, position) => ({
    position,
    type: 'normal' as const,
  }))
  const rawSampler = withEdgeFalloff(createHeightSampler(seed))
  const path = createTilePath(seed, tiles, rawSampler)
  const pond = pickPondSite(seed, tiles, path)
  const summit = pickSummitSite(seed, path, pond, rawSampler, 3)
  const river = pickRiverPath(seed, path, pond, summit, rawSampler)
  const shelved = withPathShelf(rawSampler, path.shelfPoints, path.spacing * 1.05)
  const ponded = pond ? withPondBasin(shelved, pond) : shelved
  const sculpted = summit ? withSummitMassif(ponded, summit, path.spacing) : ponded
  const sampler = river ? withRiverBed(sculpted, river) : sculpted
  const scenery = pickScenerySites(seed, path, pond, summit, sampler, river)
  const loop = pickRailwayLoop(seed, path, pond, summit, river, scenery, sampler)
  return { loop, path, summit, sampler }
}

describe('pickRailwayLoop', () => {
  it('is deterministic per seed', () => {
    const first = worldFor('railway-a').loop
    const second = worldFor('railway-a').loop
    expect(Boolean(first)).toBe(Boolean(second))
    if (first && second) {
      expect(first.length).toBe(second.length)
      first.forEach((point, index) => expect(point.equals(second[index])).toBe(true))
    }
  })

  it('deals a railway on some boards and declines on others', () => {
    let dealt = 0
    let declined = 0
    for (let index = 0; index < 40; index++) {
      const { loop } = worldFor(`railway-deal-${index}`)
      if (loop) dealt++
      else declined++
    }
    expect(dealt).toBeGreaterThan(2)
    expect(declined).toBeGreaterThan(10)
  })

  it('keeps the loop clear of every track pass and inside the page', () => {
    for (let index = 0; index < 40; index++) {
      const { loop, path } = worldFor(`railway-clear-${index}`)
      if (!loop) continue
      // Cut-and-fill smoothing may drift a hair inside the surveyed berth,
      // never into the shelf band itself.
      const clearance = path.spacing * 1.45
      for (const point of loop) {
        expect(Math.hypot(point.x, point.z), `railway-clear-${index}`).toBeLessThanOrEqual(
          EDGE_FADE_START
        )
        for (const shelf of path.shelfPoints) {
          const distance = Math.hypot(shelf.x - point.x, shelf.z - point.z)
          expect(distance, `railway-clear-${index}`).toBeGreaterThanOrEqual(clearance)
        }
      }
    }
  })

  it('closes a fat loop that never crosses itself', () => {
    let seen = 0
    for (let index = 0; index < 40 && seen < 6; index++) {
      const { loop } = worldFor(`railway-shape-${index}`)
      if (!loop) continue
      seen++
      expect(loop.length).toBeGreaterThan(22)
      expect(loopCrossesItself(loop), `railway-shape-${index}`).toBe(false)
      let area = 0
      for (let corner = 0; corner < loop.length; corner++) {
        const here = loop[corner]
        const next = loop[(corner + 1) % loop.length]
        area += here.x * next.z - next.x * here.z
      }
      expect(Math.abs(area) / 2, `railway-shape-${index}`).toBeGreaterThanOrEqual(350)
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('hugs the rendered ground', () => {
    for (let index = 0; index < 20; index++) {
      const { loop, sampler } = worldFor(`railway-ground-${index}`)
      if (!loop) continue
      for (const point of loop) {
        expect(point.y).toBeCloseTo(sampler(point.x, point.z) + 0.1, 6)
      }
      return
    }
  })
})
