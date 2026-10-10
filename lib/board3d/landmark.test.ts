import { describe, expect, it } from 'vitest'
import { pickBoatMooring } from './boat'
import { pickLakeSite, withLakeBed } from './lake'
import { Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { LANDMARK_KINDS, LANDMARK_REGIONS, pickLandmarkSite } from './landmark'
import { landmarkParts } from './landmark-models'
import { createTilePath } from './path'
import { pickRiverPath, withRiverBed } from './river'
import { furniturePoints, pickScenerySites, pickWaymarkSites } from './scenery'
import { pickSummitSite, withSummitMassif } from './summit'
import { createHeightSampler, EDGE_FADE_START, withEdgeFalloff, withPathShelf } from './terrain'
import { pickTownSite } from './town'
import { pickPondSite, withPondBasin } from './water'
import type { Tile } from '~~/types/game.types'
import { REGION_LABELS } from '~~/lib/variant'

/** Mirror the builder's chain up to the landmark, which is sited last. */
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
  const waymarks = pickWaymarkSites(path, pond, summit, river, scenery, sampler, lake, town)
  const mooring = pickBoatMooring(seed, pond, lake, path.spacing, sampler)
  const furniture = [
    ...furniturePoints(scenery),
    ...waymarks.map(mark => mark.position),
    ...(mooring ? [mooring.position] : []),
  ]
  const landmark = pickLandmarkSite(seed, path, sampler, {
    pond,
    summit,
    river,
    lake,
    town,
    furniture,
  })
  return { landmark, path, town, furniture }
}

describe('pickLandmarkSite', () => {
  it('is deterministic per seed', () => {
    for (let index = 0; index < 30; index++) {
      const first = worldFor(`landmark-det-${index}`).landmark
      const second = worldFor(`landmark-det-${index}`).landmark
      expect(first?.kind).toBe(second?.kind)
      if (first && second) expect(first.center.equals(second.center)).toBe(true)
    }
  })

  it('is a rare treat dealing a broad mix of monuments', () => {
    const SCAN = 150
    const kinds = new Set<string>()
    let dealt = 0
    for (let index = 0; index < SCAN; index++) {
      const { landmark } = worldFor(`landmark-rate-${index}`)
      if (!landmark) continue
      dealt++
      kinds.add(landmark.kind)
    }
    expect(dealt / SCAN).toBeGreaterThan(0.08)
    expect(dealt / SCAN).toBeLessThan(0.25)
    expect(kinds.size).toBeGreaterThan(LANDMARK_KINDS.length / 2)
  }, 60_000)

  it('stands clear of the track, the hamlet and the furniture, inside the page', () => {
    let checked = 0
    for (let index = 0; index < 300 && checked < 20; index++) {
      const { landmark, path, town, furniture } = worldFor(`landmark-clear-${index}`)
      if (!landmark) continue
      checked++
      const { center, radius } = landmark
      expect(Math.hypot(center.x, center.z) + radius).toBeLessThanOrEqual(EDGE_FADE_START)
      for (const point of path.shelfPoints) {
        expect(Math.hypot(point.x - center.x, point.z - center.z)).toBeGreaterThanOrEqual(
          path.spacing * 1.6 + radius
        )
      }
      if (town)
        expect(Math.hypot(town.center.x - center.x, town.center.z - center.z)).toBeGreaterThan(
          town.radius + radius
        )
      for (const piece of furniture) {
        expect(Math.hypot(piece.x - center.x, piece.z - center.z)).toBeGreaterThan(radius)
      }
    }
    expect(checked).toBeGreaterThan(0)
  }, 60_000)

  it('reaches every region and Antarctica', () => {
    const covered = new Set<string>(Object.values(LANDMARK_REGIONS))
    for (const region of [...Object.keys(REGION_LABELS), 'antarctica']) {
      expect(covered.has(region), region).toBe(true)
    }
  })

  it('builds every monument into mergeable, finite geometry', () => {
    for (const kind of LANDMARK_KINDS) {
      const parts = landmarkParts({ kind, center: new Vector3(), sink: 0.4, radius: 2.6, yaw: 0 })
      const merged = mergeGeometries(parts.map(part => part.geometry.toNonIndexed()))
      expect(merged, kind).toBeTruthy()
      merged.computeBoundingBox()
      const { min, max } = merged.boundingBox!
      expect(Number.isFinite(max.y), kind).toBe(true)
      expect(Math.max(-min.x, max.x, -min.z, max.z), kind).toBeLessThanOrEqual(2.6)
    }
  })
})
