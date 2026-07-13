import { describe, expect, it } from 'vitest'
import { forgeFlag, type ForgeFamily } from './forge'

const hashes = (() => {
  let x = 0x2f6e2b1
  return Array.from({ length: 500 }, () => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0
    return x.toString(16).padStart(8, '0').slice(0, 7)
  })
})()

describe('forgeFlag', () => {
  it('is deterministic for a given seed', () => {
    for (const h of hashes.slice(0, 25)) {
      expect(forgeFlag(h)).toEqual(forgeFlag(h))
    }
  })

  it('produces distinct flags for distinct seeds (no seed collapse)', () => {
    const svgs = new Set(hashes.map((h) => forgeFlag(h).svg))
    expect(svgs.size).toBeGreaterThan(hashes.length * 0.95)
  })

  it('produces a well-formed single-root SVG with 2-6 colors', () => {
    for (const h of hashes) {
      const flag = forgeFlag(h)
      expect(flag.svg).toMatch(/^<svg [^>]+>.+<\/svg>$/)
      expect(flag.svg).not.toContain('NaN')
      expect(flag.svg).not.toContain('undefined')
      expect(flag.colors.length).toBeGreaterThanOrEqual(2)
      expect(flag.colors.length).toBeLessThanOrEqual(6)
    }
  })

  it('reaches every composition family across many seeds', () => {
    const families = new Set(hashes.map((h) => forgeFlag(h).family))
    const all: ForgeFamily[] = [
      'h-stripes',
      'v-stripes',
      'hoist-triangle',
      'nordic-cross',
      'canton',
      'field-emblem',
      'diagonal',
      'saltire',
    ]
    for (const f of all) expect(families).toContain(f)
  })
})
