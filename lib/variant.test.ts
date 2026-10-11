import { describe, expect, it } from 'vitest'
import { vintageRegionsFor } from '~~/types/vintage.types'
import { boardLabel, countryOnBoard } from './variant'

describe('board membership and naming', () => {
  it('puts a country on a combined board through any of its regions', () => {
    expect(countryOnBoard('JP', ['europe', 'asia'])).toBe(true)
    expect(countryOnBoard('FR', ['europe', 'asia'])).toBe(true)
    expect(countryOnBoard('BR', ['europe', 'asia'])).toBe(false)
    expect(countryOnBoard('BR', [])).toBe(true)
  })

  it('names the board as prose', () => {
    expect(boardLabel([])).toBe('the world')
    expect(boardLabel(['europe'])).toBe('Europe')
    expect(boardLabel(['europe', 'africa'])).toBe('Europe and Africa')
    expect(boardLabel(['europe', 'africa', 'asia'])).toBe('Europe, Africa and Asia')
  })
})

describe('vintageRegionsFor', () => {
  it('deals the union of every chosen continent', () => {
    expect(vintageRegionsFor(['europe', 'asia'])).toEqual(
      expect.arrayContaining(['europe', 'middle-east', 'south-asia', 'east-asia'])
    )
    expect(vintageRegionsFor(['europe', 'asia'])).not.toContain('africa')
  })
})
