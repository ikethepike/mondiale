import { describe, expect, it } from 'vitest'
import { createTilePath, type TrackArchetype } from './path'
import { LEDGE_SLAB_INSET, pickSummitSite, summitClimbAnchor, withSummitMassif } from './summit'
import { createHeightSampler, EDGE_FADE_START, withEdgeFalloff } from './terrain'
import type { Tile } from '~~/types/game.types'

const STAGES = 5

const pathFor = (seed: string, count = 65, archetype?: TrackArchetype) => {
  const tiles: Tile[] = Array.from({ length: count }, (_, position) => ({
    position,
    type: 'normal' as const,
  }))
  const sampler = withEdgeFalloff(createHeightSampler(seed))
  return { path: createTilePath(seed, tiles, sampler, archetype ? { archetype } : undefined), sampler }
}

const siteFor = (seed: string, count = 65, archetype?: TrackArchetype) => {
  const { path, sampler } = pathFor(seed, count, archetype)
  return { site: pickSummitSite(seed, path, undefined, sampler, STAGES), path, sampler }
}

describe('pickSummitSite', () => {
  it('is deterministic per seed', () => {
    const first = siteFor('summit-a').site
    const second = siteFor('summit-a').site
    expect(Boolean(first)).toBe(Boolean(second))
    if (first && second) {
      expect(first.center.equals(second.center)).toBe(true)
      expect(first.climbAnchors.length).toBe(second.climbAnchors.length)
    }
  })

  it('deals a massif on some boards and declines on others', () => {
    let dealt = 0
    let declined = 0
    for (let index = 0; index < 60; index++) {
      const { site } = siteFor(`summit-deal-${index}`)
      if (site) dealt++
      else declined++
    }
    expect(dealt).toBeGreaterThan(5)
    expect(declined).toBeGreaterThan(5)
  })

  it('keeps the flank clear of every track pass and inside the page', () => {
    for (let index = 0; index < 40; index++) {
      const { site, path } = siteFor(`summit-clear-${index}`)
      if (!site) continue
      const clearance = site.radius + path.spacing * 1.05
      for (const point of path.shelfPoints) {
        const distance = Math.hypot(point.x - site.center.x, point.z - site.center.z)
        expect(distance, `summit-clear-${index}`).toBeGreaterThanOrEqual(clearance - 1e-6)
      }
      expect(Math.hypot(site.center.x, site.center.z)).toBeLessThanOrEqual(EDGE_FADE_START)
    }
  })

  it('declines the spiral, whose finale is walled in by its own coils', () => {
    for (let index = 0; index < 20; index++) {
      const { site } = siteFor(`summit-spiral-${index}`, 65, 'spiral')
      expect(site, `summit-spiral-${index}`).toBeUndefined()
    }
  })

  it('lays a rising ladder: one flank ledge per stage, then the summit', () => {
    for (let index = 0; index < 40; index++) {
      const { site } = siteFor(`summit-ladder-${index}`)
      if (!site) continue
      expect(site.climbAnchors).toHaveLength(STAGES + 1)
      for (let step = 1; step < site.climbAnchors.length; step++) {
        expect(
          site.climbAnchors[step].y,
          `summit-ladder-${index} step ${step}`
        ).toBeGreaterThan(site.climbAnchors[step - 1].y)
      }
      const summit = site.climbAnchors[site.climbAnchors.length - 1]
      expect(summit.x).toBe(site.center.x)
      expect(summit.z).toBe(site.center.z)
      expect(site.snowlineY).toBeLessThan(site.center.y)
    }
  })
})

describe('withSummitMassif', () => {
  it('raises the peak and pins each ledge flat at its anchor', () => {
    const { site, path, sampler } = siteFor('summit-a-massif-hunt')
    if (!site) return
    const massif = withSummitMassif(sampler, site, path.spacing)

    expect(massif(site.center.x, site.center.z)).toBeCloseTo(site.center.y, 6)

    // Each ledge's shelf carves a slab-inset below its anchor — the slab
    // platform makes up the difference, its top face at the anchor itself.
    for (const anchor of site.climbAnchors.slice(0, -1)) {
      expect(massif(anchor.x, anchor.z)).toBeCloseTo(anchor.y - LEDGE_SLAB_INSET, 6)
    }

    // Beyond the flank the field is untouched.
    const far = massif(site.center.x + site.radius * 2, site.center.z)
    expect(far).toBeCloseTo(sampler(site.center.x + site.radius * 2, site.center.z), 6)
  })
})

describe('summitClimbAnchor', () => {
  it('maps cleared stages onto the ladder, summit on victory', () => {
    const { site } = (() => {
      for (let index = 0; index < 40; index++) {
        const result = siteFor(`summit-anchor-${index}`)
        if (result.site) return result
      }
      throw new Error('no seed dealt a massif in 40 tries')
    })()

    expect(summitClimbAnchor(site!, 0, STAGES)).toBeUndefined()
    const first = summitClimbAnchor(site!, 1, STAGES)
    expect(first?.equals(site!.climbAnchors[0])).toBe(true)
    const summit = summitClimbAnchor(site!, STAGES, STAGES)
    expect(summit?.equals(site!.climbAnchors[STAGES])).toBe(true)

    // A thin deal (fewer questions than ledges) still tops out at the summit.
    const thin = summitClimbAnchor(site!, 2, 2)
    expect(thin?.equals(site!.climbAnchors[STAGES])).toBe(true)
  })
})
