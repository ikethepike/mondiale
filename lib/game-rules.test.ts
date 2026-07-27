import { describe, expect, it } from 'vitest'
import { isValidGameConfiguration, type GameRules } from '~~/types/game.types'
import {
  excludedMicroNations,
  getMicroNations,
  isCountryInPlay,
  isCountryPlayable,
  isMicroNation,
  microNationsIncluded,
  playableCountries,
  playableWorldCountries,
} from './game-rules'

const rules = (overrides: Partial<GameRules> = {}): GameRules => ({
  variant: 'world',
  difficulty: 'normal',
  ...overrides,
})

describe('getMicroNations', () => {
  it('catches the classic microstates', () => {
    for (const isoCode of ['VA', 'MC', 'SM', 'LI', 'AD', 'NR', 'TV', 'PW'] as const) {
      expect(isMicroNation(isoCode), isoCode).toBe(true)
    }
  })

  it('leaves small-but-real countries in', () => {
    for (const isoCode of ['MT', 'BB', 'MV', 'IS', 'LU', 'SG'] as const) {
      expect(isMicroNation(isoCode), isoCode).toBe(false)
    }
  })
})

describe('microNationsIncluded', () => {
  it('follows the difficulty on auto: benched below hard', () => {
    expect(microNationsIncluded(rules({ difficulty: 'easy' }))).toBe(false)
    expect(microNationsIncluded(rules({ difficulty: 'normal' }))).toBe(false)
    expect(microNationsIncluded(rules({ difficulty: 'hard' }))).toBe(true)
  })

  it('lets an explicit host override beat the difficulty', () => {
    expect(microNationsIncluded(rules({ difficulty: 'easy', includeMicroNations: true }))).toBe(
      true
    )
    expect(microNationsIncluded(rules({ difficulty: 'hard', includeMicroNations: false }))).toBe(
      false
    )
  })
})

describe('playableCountries', () => {
  it('benches micro-nations on a normal world game', () => {
    const pool = new Set(playableCountries(rules()))
    expect(pool.has('VA')).toBe(false)
    expect(pool.has('MC')).toBe(false)
    expect(pool.has('FR')).toBe(true)
  })

  it('deals them back in on hard', () => {
    const pool = new Set(playableCountries(rules({ difficulty: 'hard' })))
    expect(pool.has('VA')).toBe(true)
    expect(pool.has('LI')).toBe(true)
  })

  it('composes with the variant', () => {
    const europe = new Set(playableCountries(rules({ variant: 'europe' })))
    expect(europe.has('SM')).toBe(false) // micro, benched
    expect(europe.has('IT')).toBe(true)
    expect(europe.has('JP')).toBe(false) // off the board

    const europeHard = new Set(playableCountries(rules({ variant: 'europe', difficulty: 'hard' })))
    expect(europeHard.has('SM')).toBe(true)
  })
})

describe('isCountryInPlay / isCountryPlayable', () => {
  it('keeps the in-play gate variant-agnostic (answers reach off-board)', () => {
    const europe = rules({ variant: 'europe' })
    // Morocco is off the Europe board but still a legal answer…
    expect(isCountryInPlay(europe, 'MA')).toBe(true)
    expect(isCountryPlayable(europe, 'MA')).toBe(false)
    // …while a benched micro-nation is out everywhere.
    expect(isCountryInPlay(europe, 'MC')).toBe(false)
  })
})

describe('playableWorldCountries / excludedMicroNations', () => {
  it('mirrors the in-play gate world-wide', () => {
    const world = new Set(playableWorldCountries(rules({ variant: 'europe' })))
    expect(world.has('MA')).toBe(true)
    expect(world.has('MC')).toBe(false)
  })

  it('exposes the bench for the selection surfaces', () => {
    expect(excludedMicroNations(rules())).toEqual([...getMicroNations()])
    expect(excludedMicroNations(rules({ difficulty: 'hard' }))).toEqual([])
  })
})

describe('isValidGameConfiguration (micro-nations tri-state)', () => {
  const valid = {
    difficulty: 'normal',
    variant: 'world',
    length: 'medium',
    liveGuesses: true,
    challengeOverrides: {},
  }

  it('accepts absent (auto) and boolean values', () => {
    expect(isValidGameConfiguration(valid)).toBe(true)
    expect(isValidGameConfiguration({ ...valid, includeMicroNations: true })).toBe(true)
    expect(isValidGameConfiguration({ ...valid, includeMicroNations: false })).toBe(true)
  })

  it('rejects the stringly-typed FormData value', () => {
    expect(isValidGameConfiguration({ ...valid, includeMicroNations: 'on' })).toBe(false)
  })
})
