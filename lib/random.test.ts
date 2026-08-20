import { describe, expect, it } from 'vitest'
import { seedFrom, seededRandom } from '~~/lib/random'

describe('seededRandom', () => {
  it('gives the same stream for the same seed', () => {
    const a = seededRandom(1234)
    const b = seededRandom(1234)
    for (let index = 0; index < 32; index++) expect(a()).toBe(b())
  })

  it('gives different streams for different seeds', () => {
    const a = seededRandom(1)
    const b = seededRandom(2)
    const left = Array.from({ length: 8 }, () => a())
    const right = Array.from({ length: 8 }, () => b())
    expect(left).not.toEqual(right)
  })

  it('stays inside [0, 1)', () => {
    const random = seededRandom(99)
    for (let index = 0; index < 5000; index++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('spreads roughly evenly — a backdrop seeded here must not clump', () => {
    const random = seededRandom(7)
    const buckets = new Array(10).fill(0)
    for (let index = 0; index < 10000; index++) buckets[Math.floor(random() * 10)]++
    for (const count of buckets) {
      expect(count).toBeGreaterThan(800)
      expect(count).toBeLessThan(1200)
    }
  })
})

describe('seedFrom', () => {
  it('is stable and non-negative', () => {
    expect(seedFrom('room:3')).toBe(seedFrom('room:3'))
    expect(seedFrom('room:3')).toBeGreaterThanOrEqual(0)
  })

  it('separates the rounds of one room', () => {
    expect(seedFrom('abc:1')).not.toBe(seedFrom('abc:2'))
  })
})
