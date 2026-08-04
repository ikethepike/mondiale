import { describe, expect, it } from 'vitest'
import { FLAGS_WIDE } from '~~/data/flags-wide.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { TARGET_HEIGHT, TARGET_WIDTH } from './types'

/**
 * The reveal card renders every country through the 3:1 wide variant. A flag
 * missing from the artifact falls back to a contained original and letterboxes
 * — silently, and only for that country. Coverage is total today; this keeps a
 * classify.ts/overrides.ts edit from quietly dropping one.
 */
describe('FLAGS_WIDE', () => {
  it('covers every ISO country', () => {
    const missing = ISOCountryCodes.filter(iso => !FLAGS_WIDE[iso])
    expect(missing).toEqual([])
  })

  it('carries no keys outside the ISO list', () => {
    const known = new Set<string>(ISOCountryCodes)
    expect(Object.keys(FLAGS_WIDE).filter(iso => !known.has(iso))).toEqual([])
  })

  it('renders every variant at the wide-tile ratio', () => {
    const viewBox = `viewBox="0 0 ${TARGET_WIDTH} ${TARGET_HEIGHT}"`
    const offRatio = ISOCountryCodes.filter(iso => !FLAGS_WIDE[iso]?.includes(viewBox))
    expect(offRatio).toEqual([])
  })
})
