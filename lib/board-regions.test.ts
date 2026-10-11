import { describe, expect, it } from 'vitest'
import { isValidGameConfiguration, type Game } from '~~/types/game.types'
import {
  legacyVariantFor,
  normalizeBoardRegions,
  regionsForVariant,
  syncLegacyBoard,
  toggleBoardRegion,
  upgradeLegacyConfiguration,
} from './board-regions'

describe('board regions', () => {
  it('opens a home template as one continent or the whole world', () => {
    expect(regionsForVariant('world')).toEqual([])
    expect(regionsForVariant('africa')).toEqual(['africa'])
  })

  it('keeps one board in one order', () => {
    expect(normalizeBoardRegions(['asia', 'europe', 'asia'])).toEqual(['europe', 'asia'])
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

describe('syncLegacyBoard', () => {
  const saved = (fields: object) => ({ rounds: [], ...fields }) as unknown as Game
  const variantOf = (game: Game) => (game as Game & { variant?: string }).variant

  it('turns a pre-regions save into its regions', () => {
    const europe = saved({ variant: 'europe' })
    syncLegacyBoard(europe)
    expect(europe.regions).toEqual(['europe'])

    const world = saved({ variant: 'world' })
    syncLegacyBoard(world)
    expect(world.regions).toEqual([])
  })

  it('mirrors the board back as the variant an old bundle reads', () => {
    const single = saved({ regions: ['africa'] })
    syncLegacyBoard(single)
    expect(variantOf(single)).toBe('africa')

    const combined = saved({ regions: ['europe', 'africa'] })
    syncLegacyBoard(combined)
    expect(combined.regions).toEqual(['europe', 'africa'])
    expect(variantOf(combined)).toBe('world')
  })

  it('follows a board the host changed since the last mirror', () => {
    const game = saved({ regions: ['asia'], variant: 'europe' })
    syncLegacyBoard(game)
    expect(game.regions).toEqual(['asia'])
    expect(variantOf(game)).toBe('asia')
  })

  it('wraps the single scope of a live language round', () => {
    const game = saved({
      variant: 'europe',
      rounds: [{ groupChallenge: { _type: 'mother-tongue-challenge', scope: 'europe' } }],
    })
    syncLegacyBoard(game)
    expect(game.rounds[0].groupChallenge).toMatchObject({ scope: ['europe'] })
  })

  it('reads a combined board as the world for old bundles', () => {
    expect(legacyVariantFor([])).toBe('world')
    expect(legacyVariantFor(['europe', 'asia'])).toBe('world')
  })
})

describe('upgradeLegacyConfiguration', () => {
  const settings = {
    difficulty: 'normal',
    length: 'medium',
    liveGuesses: true,
    challengeOverrides: {},
  }

  it('reads a pre-regions settings form as its board', () => {
    expect(isValidGameConfiguration({ ...settings, variant: 'asia' })).toBe(false)
    const upgraded = upgradeLegacyConfiguration({ ...settings, variant: 'asia' })
    expect(isValidGameConfiguration(upgraded)).toBe(true)
    expect(upgraded).toMatchObject({ regions: ['asia'] })
  })

  it('leaves a current form and junk alone', () => {
    const current = { ...settings, regions: ['europe'], variant: 'asia' }
    expect(upgradeLegacyConfiguration(current)).toBe(current)
    expect(upgradeLegacyConfiguration({ ...settings, variant: 'atlantis' })).not.toHaveProperty(
      'regions'
    )
    expect(upgradeLegacyConfiguration(undefined)).toBeUndefined()
  })
})
