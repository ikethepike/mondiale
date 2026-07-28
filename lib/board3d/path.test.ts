import { describe, expect, it } from 'vitest'
import { generateTiles } from '~~/lib/tiles'
import { createTilePath } from './path'
import { createHeightSampler } from './terrain'

const tiles = generateTiles('medium', 'path-test')
const sampler = createHeightSampler('path-test')

describe('createTilePath', () => {
  it('is deterministic per seed', () => {
    const first = createTilePath('path-test', tiles, sampler)
    const second = createTilePath('path-test', tiles, sampler)
    first.transforms.forEach((transform, index) => {
      expect(transform.position.equals(second.transforms[index].position)).toBe(true)
      expect(transform.tangent.equals(second.transforms[index].tangent)).toBe(true)
    })
    expect(first.spacing).toBe(second.spacing)
  })

  it('varies with the seed', () => {
    const first = createTilePath('path-test', tiles, sampler)
    const other = createTilePath('other-seed', tiles, sampler)
    const moved = first.transforms.some(
      (transform, index) => !transform.position.equals(other.transforms[index].position)
    )
    expect(moved).toBe(true)
  })

  it('lays out one transform per tile with positive spacing', () => {
    const { transforms, spacing, shelfPoints } = createTilePath('path-test', tiles, sampler)
    expect(transforms).toHaveLength(tiles.length)
    expect(spacing).toBeGreaterThan(0)
    expect(shelfPoints.length).toBeGreaterThan(tiles.length)
    for (const transform of transforms) {
      // Unit tangents on the ground plane — markers rotate off these
      expect(transform.tangent.length()).toBeCloseTo(1, 5)
      expect(transform.tangent.y).toBe(0)
    }
  })
})
