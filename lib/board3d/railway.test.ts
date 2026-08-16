import { describe, expect, it } from 'vitest'
import type { Vector3 } from 'three'
import { pickLakeSite, withLakeBed } from './lake'
import { createTilePath } from './path'
import { pickRailwayLoop, pickRailwayRoute } from './railway'
import { lineCrossesItself, loopCrossesItself } from './polyline'
import { pickRiverPath, withRiverBed } from './river'
import { pickScenerySites } from './scenery'
import { pickSummitSite, withSummitMassif } from './summit'
import { createHeightSampler, EDGE_FADE_START, withEdgeFalloff, withPathShelf } from './terrain'
import { pickTownSite } from './town'
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
  const rivered = river ? withRiverBed(sculpted, river) : sculpted
  const lake = pickLakeSite(seed, path, pond, summit, river, rivered)
  const sampler = lake ? withLakeBed(rivered, lake) : rivered
  const scenery = pickScenerySites(seed, path, pond, summit, sampler, river, lake)
  const town = pickTownSite(seed, path, pond, summit, river, scenery, sampler, lake)
  const loop = pickRailwayLoop(seed, path, pond, summit, river, scenery, sampler, lake, town)
  return { loop, path, summit, sampler, town }
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

  it('deals both route kinds across seeds, deterministically', () => {
    const kinds = { loop: 0, traverse: 0 }
    for (let index = 0; index < 400 && (kinds.loop < 2 || kinds.traverse < 2); index++) {
      const seed = `railway-kind-${index}`
      const world = worldFor(seed)
      const route = pickRailwayRoute(
        seed,
        world.path,
        undefined,
        undefined,
        undefined,
        { cairns: [] },
        world.sampler
      )
      if (!route) continue
      const again = pickRailwayRoute(
        seed,
        world.path,
        undefined,
        undefined,
        undefined,
        { cairns: [] },
        world.sampler
      )
      expect(again?.closed).toBe(route.closed)
      expect(again?.points.length).toBe(route.points.length)
      kinds[route.closed ? 'loop' : 'traverse']++
    }
    expect(kinds.loop).toBeGreaterThan(1)
    expect(kinds.traverse).toBeGreaterThan(1)
  })

  it('runs a traverse off both sheet edges, gently graded, never crossing the track', () => {
    let found = 0
    for (let index = 0; index < 400 && found < 3; index++) {
      const seed = `railway-kind-${index}`
      const world = worldFor(seed)
      const route = pickRailwayRoute(
        seed,
        world.path,
        undefined,
        undefined,
        undefined,
        { cairns: [] },
        world.sampler
      )
      if (!route || route.closed) continue
      found++
      const { points } = route
      const { path, sampler } = world

      // Both ends off the sheet, far apart.
      expect(Math.hypot(points[0].x, points[0].z)).toBeGreaterThan(EDGE_FADE_START)
      const last = points[points.length - 1]
      expect(Math.hypot(last.x, last.z)).toBeGreaterThan(EDGE_FADE_START)
      expect(Math.hypot(points[0].x - last.x, points[0].z - last.z)).toBeGreaterThan(
        EDGE_FADE_START
      )

      // Two-tier clearance: hard floor everywhere, and no segment of the
      // route ever crosses the track polyline.
      for (const point of points) {
        let nearest = Infinity
        for (const shelf of path.shelfPoints) {
          nearest = Math.min(nearest, Math.hypot(shelf.x - point.x, shelf.z - point.z))
        }
        expect(nearest).toBeGreaterThanOrEqual(path.spacing * 0.8 - 1e-6)
      }
      expect(lineCrossesItself(points)).toBe(false)

      // Gentle rail grade, bounded float over dips (the trestle budget).
      for (let at = 1; at < points.length; at++) {
        const run = Math.hypot(points[at].x - points[at - 1].x, points[at].z - points[at - 1].z)
        if (run < 1e-6) continue
        expect(Math.abs(points[at].y - points[at - 1].y) / run).toBeLessThan(0.33)
      }
      for (const point of points) {
        const ground = sampler(point.x, point.z) + 0.1
        expect(point.y).toBeGreaterThanOrEqual(ground - 1e-6)
        expect(point.y - ground).toBeLessThanOrEqual(1.1 + 1e-6)
      }
    }
    expect(found).toBeGreaterThan(0)
  })

  it('takes the river on a straight trestle span, square to the flow, deck above the water', () => {
    let bridged = 0
    for (let index = 0; index < 800 && bridged < 2; index++) {
      const seed = `railway-bridge-${index}`
      const tiles: Tile[] = Array.from({ length: 65 }, (_, position) => ({
        position,
        type: 'normal' as const,
      }))
      const rawSampler = withEdgeFalloff(createHeightSampler(seed))
      const path = createTilePath(seed, tiles, rawSampler)
      const river = pickRiverPath(seed, path, undefined, undefined, rawSampler)
      if (!river) continue
      const sampler = withRiverBed(
        withPathShelf(rawSampler, path.shelfPoints, path.spacing * 1.05),
        river
      )
      const route = pickRailwayRoute(
        seed,
        path,
        undefined,
        undefined,
        river,
        { cairns: [] },
        sampler
      )
      if (!route || route.closed || !route.bridges.length) continue
      bridged++
      for (const bridge of route.bridges) {
        expect(bridge.halfLength).toBeLessThanOrEqual(8)
        // The deck's points: near the bridge center, floating over the
        // carved bed, above the river's water line there.
        const deck = route.points.filter(
          point =>
            Math.hypot(point.x - bridge.center.x, point.z - bridge.center.z) <
            bridge.halfLength
        )
        expect(deck.length).toBeGreaterThan(0)
        let nearestWater = Infinity
        let waterY = 0
        for (const point of river.points) {
          const distance = Math.hypot(point.x - bridge.center.x, point.z - bridge.center.z)
          if (distance < nearestWater) {
            nearestWater = distance
            waterY = point.y
          }
        }
        for (const point of deck) {
          expect(point.y).toBeGreaterThan(waterY)
        }
        // Square to the flow: the deck chord vs the river tangent nearby.
        if (deck.length >= 2) {
          const chordX = deck[deck.length - 1].x - deck[0].x
          const chordZ = deck[deck.length - 1].z - deck[0].z
          const chordMagnitude = Math.hypot(chordX, chordZ) || 1
          let anchor = 0
          let nearest = Infinity
          river.points.forEach((point, at) => {
            const distance = Math.hypot(
              point.x - bridge.center.x,
              point.z - bridge.center.z
            )
            if (distance < nearest) {
              nearest = distance
              anchor = at
            }
          })
          const upstream = river.points[Math.max(anchor - 2, 0)]
          const downstream = river.points[Math.min(anchor + 2, river.points.length - 1)]
          const flowX = downstream.x - upstream.x
          const flowZ = downstream.z - upstream.z
          const flowMagnitude = Math.hypot(flowX, flowZ) || 1
          const dot =
            ((chordX / chordMagnitude) * flowX + (chordZ / chordMagnitude) * flowZ) /
            flowMagnitude
          expect(Math.abs(dot)).toBeLessThan(0.75)
        }
      }
    }
    expect(bridged).toBeGreaterThan(0)
  })

  it('keeps the loop clear of a dealt town', () => {
    // The conjunction is rare (railway ~1-in-12 × town ~1-in-5) — scan wide
    // and assert non-vacuously on whatever pairs turn up.
    let pairs = 0
    for (let index = 0; index < 600 && pairs < 2; index++) {
      const { loop, town } = worldFor(`railway-town-${index}`)
      if (!loop || !town) continue
      pairs++
      for (const point of loop) {
        expect(
          Math.hypot(point.x - town.center.x, point.z - town.center.z)
        ).toBeGreaterThanOrEqual(town.radius + 1.5)
      }
    }
    expect(pairs).toBeGreaterThan(0)
  })
})
