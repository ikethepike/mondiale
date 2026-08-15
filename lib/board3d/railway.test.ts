import { describe, expect, it } from 'vitest'
import type { Vector3 } from 'three'
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

type World = ReturnType<typeof worldFor> & { loop: Vector3[] }

/** A railway is deliberately rare — scan a seed family until enough boards
 *  have dealt one, so the shape suites never pass vacuously. */
const dealtWorlds = (prefix: string, want: number, scan = 240): World[] => {
  const worlds: World[] = []
  for (let index = 0; index < scan && worlds.length < want; index++) {
    const world = worldFor(`${prefix}-${index}`)
    if (world.loop) worlds.push(world as World)
  }
  expect(worlds.length).toBeGreaterThan(0)
  return worlds
}

describe('pickRailwayLoop', () => {
  it('is deterministic per seed', () => {
    const seed = 'railway-deal-20'
    const first = worldFor(seed).loop
    const second = worldFor(seed).loop
    expect(Boolean(first)).toBe(Boolean(second))
    if (first && second) {
      expect(first.length).toBe(second.length)
      first.forEach((point, index) => expect(point.equals(second[index])).toBe(true))
    }
  })

  it('deals a railway on a few boards and declines the rest', () => {
    let dealt = 0
    let declined = 0
    for (let index = 0; index < 100; index++) {
      const { loop } = worldFor(`railway-deal-${index}`)
      if (loop) dealt++
      else declined++
    }
    expect(dealt).toBeGreaterThan(1)
    expect(declined).toBeGreaterThan(85)
  })

  it('keeps the loop clear of every track pass and inside the page', () => {
    for (const { loop, path } of dealtWorlds('railway-clear', 4)) {
      // Cut-and-fill smoothing may drift a hair inside the surveyed berth,
      // never into the shelf band itself.
      const clearance = path.spacing * 1.45
      for (const point of loop) {
        expect(Math.hypot(point.x, point.z)).toBeLessThanOrEqual(EDGE_FADE_START)
        for (const shelf of path.shelfPoints) {
          const distance = Math.hypot(shelf.x - point.x, shelf.z - point.z)
          expect(distance).toBeGreaterThanOrEqual(clearance)
        }
      }
    }
  })

  it('closes a fat loop that never crosses itself', () => {
    for (const { loop } of dealtWorlds('railway-shape', 4)) {
      expect(loop.length).toBeGreaterThan(22)
      expect(loopCrossesItself(loop)).toBe(false)
      let area = 0
      for (let corner = 0; corner < loop.length; corner++) {
        const here = loop[corner]
        const next = loop[(corner + 1) % loop.length]
        area += here.x * next.z - next.x * here.z
      }
      expect(Math.abs(area) / 2).toBeGreaterThanOrEqual(350)
    }
  })

  it('hugs the rendered ground', () => {
    for (const { loop, sampler } of dealtWorlds('railway-ground', 2)) {
      for (const point of loop) {
        expect(point.y).toBeCloseTo(sampler(point.x, point.z) + 0.1, 6)
      }
    }
  })
})
