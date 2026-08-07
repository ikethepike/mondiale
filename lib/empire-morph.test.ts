import { describe, expect, it } from 'vitest'
import { EMPIRE_PATHS } from '~~/data/empire-paths.gen'
import { parsePolygons, ringArea, ringCentroid } from '~~/lib/outline'
import { pairRings } from '~~/lib/useEmpireMorph'

type Ring = [number, number][]

const square = (x: number, y: number, size = 10): Ring => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
]
const isCollapsed = (r: Ring) => new Set(r.map(([x, y]) => `${x},${y}`)).size === 1
const key = (r: Ring) => r.map(([x, y]) => `${x},${y}`).join('|')

describe('pairRings', () => {
  it('pairs equal ring counts one-to-one by centroid', () => {
    const from = [square(0, 0), square(100, 100)]
    const to = [square(102, 102), square(2, 2)]
    const groups = pairRings(from, to)

    expect(groups).toHaveLength(2)
    // Nearest-centroid, not index order.
    expect(groups[0].to).toEqual(to[1])
    expect(groups[1].to).toEqual(to[0])
  })

  it.each([
    ['grows', [square(0, 0)], [square(0, 0), square(100, 100)]],
    ['shrinks', [square(0, 0), square(100, 100)], [square(0, 0)]],
    ['equal', [square(0, 0)], [square(5, 5)]],
  ])('emits exactly one ring per side when the count %s', (_label, from, to) => {
    for (const group of pairRings(from as Ring[], to as Ring[])) {
      expect(Array.isArray(group.from[0])).toBe(true)
      expect(Array.isArray(group.to[0])).toBe(true)
      expect(group.from.length).toBeGreaterThanOrEqual(3)
      expect(group.to.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('emits max(n, m) groups so no ring is ever dropped', () => {
    const from = [square(0, 0), square(50, 50), square(100, 100)]
    const to = [square(0, 0)]

    expect(pairRings(from, to)).toHaveLength(3)
    expect(pairRings(to, from)).toHaveLength(3)
  })

  it('keeps every real ring exactly once, on its own side', () => {
    const from = [square(0, 0), square(50, 50)]
    const to = [square(0, 0), square(50, 50), square(200, 200)]
    const groups = pairRings(from, to)

    const realFrom = groups.map(g => g.from).filter(r => !isCollapsed(r))
    const realTo = groups.map(g => g.to).filter(r => !isCollapsed(r))
    expect(realFrom.map(key).sort()).toEqual(from.map(key).sort())
    expect(realTo.map(key).sort()).toEqual(to.map(key).sort())
  })

  it('seeds an unpaired ring at its own centroid, not at the mainland', () => {
    const island = square(500, 500)
    const groups = pairRings([square(0, 0)], [square(0, 0), island])
    const seeded = groups.find(g => isCollapsed(g.from))

    expect(seeded).toBeDefined()
    expect(seeded!.to).toEqual(island)
    expect(seeded!.from[0]).toEqual(ringCentroid(island))
  })
})

describe('the empire data never reaches flubber separate/combine', () => {
  // The regression lock: a group with more than one ring per side is exactly
  // what routes into separate()/combine(), whose triangulation is the seam.
  it('pairs every keyframe boundary of every empire one-to-one', () => {
    const empires = Object.entries(EMPIRE_PATHS)
    expect(empires.length).toBeGreaterThan(0)

    for (const [id, paths] of empires) {
      const frames = paths.map(d =>
        (parsePolygons(d) as Ring[])
          .filter(r => r.length >= 3)
          .sort((a, b) => ringArea(b) - ringArea(a))
      )
      for (let i = 0; i < frames.length - 1; i++) {
        const groups = pairRings(frames[i], frames[i + 1])
        expect(groups, `${id} segment ${i}`).toHaveLength(
          Math.max(frames[i].length, frames[i + 1].length)
        )
        for (const group of groups) {
          // A Ring is [number, number][]; a bare pair would mean a k-ring group.
          expect(Array.isArray(group.from[0]), `${id} segment ${i}`).toBe(true)
          expect(Array.isArray(group.to[0]), `${id} segment ${i}`).toBe(true)
        }
      }
    }
  })
})
