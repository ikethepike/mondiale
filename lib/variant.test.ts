import { describe, expect, it } from 'vitest'
import type { Game } from '~~/types/game.types'
import { vintageRegionsFor } from '~~/types/vintage.types'
import {
  boardLabel,
  countryOnBoard,
  normalizeBoardRegions,
  regionsForVariant,
  toggleBoardRegion,
  upgradeLegacyBoard,
} from './variant'

describe('board regions', () => {
  it('opens a home template as one continent or the whole world', () => {
    expect(regionsForVariant('world')).toEqual([])
    expect(regionsForVariant('africa')).toEqual(['africa'])
  })

  it('keeps one board in one order', () => {
    expect(normalizeBoardRegions(['asia', 'europe', 'asia'])).toEqual(['europe', 'asia'])
  })

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

describe('toggleBoardRegion', () => {
  it('clears the board when World is picked', () => {
    expect(toggleBoardRegion(['europe', 'asia'], 'world')).toEqual([])
  })

  it('adds a continent in picker order, and drops it on a second pick', () => {
    expect(toggleBoardRegion(['asia'], 'europe')).toEqual(['europe', 'asia'])
    expect(toggleBoardRegion(['europe', 'asia'], 'europe')).toEqual(['asia'])
  })

  it('falls back to the whole world when the last continent goes', () => {
    expect(toggleBoardRegion(['europe'], 'europe')).toEqual([])
  })
})

describe('upgradeLegacyBoard', () => {
  const legacy = (fields: object) => ({ rounds: [], ...fields }) as unknown as Game

  it('turns a saved single variant into its regions', () => {
    const europe = legacy({ variant: 'europe' })
    upgradeLegacyBoard(europe)
    expect(europe.regions).toEqual(['europe'])
    expect('variant' in europe).toBe(false)

    const world = legacy({ variant: 'world' })
    upgradeLegacyBoard(world)
    expect(world.regions).toEqual([])
  })

  it('wraps the single scope of a live language round', () => {
    const game = legacy({
      variant: 'europe',
      rounds: [{ groupChallenge: { _type: 'mother-tongue-challenge', scope: 'europe' } }],
    })
    upgradeLegacyBoard(game)
    expect(game.rounds[0].groupChallenge).toMatchObject({ scope: ['europe'] })
  })

  it('leaves a current game alone', () => {
    const game = legacy({ regions: ['africa', 'asia'] })
    upgradeLegacyBoard(game)
    expect(game.regions).toEqual(['africa', 'asia'])
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
