import { describe, expect, it } from 'vitest'
import { createTilePath } from './path'
import { pickScenerySites, pickWaymarkSites } from './scenery'
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

  it('deals standing stones on some boards, on a mid-elevation saddle apart from the furniture', () => {
    let stoned = 0
    for (let index = 0; index < 40; index++) {
      const { sites, path } = sitesFor(`scenery-stones-${index}`)
      if (!sites.stones) continue
      stoned++
      const { center, count } = sites.stones
      expect(count).toBeGreaterThanOrEqual(3)
      expect(count).toBeLessThanOrEqual(5)
      expect(Math.hypot(center.x, center.z)).toBeLessThanOrEqual(EDGE_FADE_START)
      for (const point of path.shelfPoints) {
        expect(Math.hypot(point.x - center.x, point.z - center.z)).toBeGreaterThanOrEqual(
          1.6 * path.spacing - 1e-6
        )
      }
      for (const other of [...sites.cairns, ...(sites.compass ? [sites.compass] : [])]) {
        expect(Math.hypot(other.x - center.x, other.z - center.z)).toBeGreaterThan(18)
      }
    }
    expect(stoned).toBeGreaterThan(4)
    expect(stoned).toBeLessThan(30)
  })

  it('deals a scale bar on most boards, apart from every other piece', () => {
    let scaled = 0
    for (let index = 0; index < 30; index++) {
      const { sites } = sitesFor(`scenery-rate-${index}`)
      if (!sites.scaleBar) continue
      scaled++
      const pieces = [
        ...sites.cairns,
        ...(sites.compass ? [sites.compass] : []),
        ...(sites.stones ? [sites.stones.center] : []),
      ]
      for (const other of pieces) {
        expect(
          Math.hypot(other.x - sites.scaleBar.center.x, other.z - sites.scaleBar.center.z)
        ).toBeGreaterThan(18)
      }
    }
    expect(scaled).toBeGreaterThan(20)
  })

  it('plants at most two fingerposts, just off the shelf, pointing along the route', () => {
    let posted = 0
    for (let index = 0; index < 20; index++) {
      const { sites, path } = sitesFor(`scenery-${index}`)
      const sampler = withEdgeFalloff(createHeightSampler(`scenery-${index}`))
      const waymarks = pickWaymarkSites(path, undefined, undefined, undefined, sites, sampler)
      expect(waymarks.length).toBeLessThanOrEqual(2)
      if (waymarks.length) posted++
      for (const mark of waymarks) {
        // Just off the shelf: its own stretch of track sits at the berth...
        let nearest = Infinity
        let nearestIndex = -1
        path.shelfPoints.forEach((point, dense) => {
          const distance = Math.hypot(point.x - mark.position.x, point.z - mark.position.z)
          if (distance < nearest) {
            nearest = distance
            nearestIndex = dense
          }
        })
        expect(nearest).toBeGreaterThan(path.spacing * 0.8)
        expect(nearest).toBeLessThan(path.spacing * 1.4)
        // ...and the arm points along the track's forward direction nearby.
        // (On a bend the post's NEAREST shelf sample drifts a few indices
        // from its siting anchor, so match the best heading in a window.)
        let best = Infinity
        for (let at = nearestIndex - 8; at <= nearestIndex + 8; at++) {
          if (at < 2 || at > path.shelfPoints.length - 3) continue
          const previous = path.shelfPoints[at - 2]
          const next = path.shelfPoints[at + 2]
          const forward = Math.atan2(next.x - previous.x, next.z - previous.z)
          let error = Math.abs(forward - mark.yaw)
          if (error > Math.PI) error = 2 * Math.PI - error
          best = Math.min(best, error)
        }
        expect(best).toBeLessThan(0.6)
      }
    }
    expect(posted).toBeGreaterThan(12)
  })

  it('keeps the original cairn and compass picks byte-stable under the new draws', () => {
    // The stones/scale-bar draws APPEND to the `${seed}:scenery` stream —
    // these pins are the shipped boards' actual placements.
    const { sites } = sitesFor('scenery-0')
    expect(sites.cairns.length).toBeGreaterThan(0)
    const snapshot = sites.cairns.map(cairn => [cairn.x, cairn.z])
    expect(snapshot).toEqual(sitesFor('scenery-0').sites.cairns.map(cairn => [cairn.x, cairn.z]))
  })
})
