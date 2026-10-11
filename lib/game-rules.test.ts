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
  regions: [],
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
    const europe = new Set(playableCountries(rules({ regions: ['europe'] })))
    expect(europe.has('SM')).toBe(false) // micro, benched
    expect(europe.has('IT')).toBe(true)
    expect(europe.has('JP')).toBe(false) // off the board

    const europeHard = new Set(
      playableCountries(rules({ regions: ['europe'], difficulty: 'hard' }))
    )
    expect(europeHard.has('SM')).toBe(true)
  })

  it('deals a combined board from the union of its regions', () => {
    const europe = playableCountries(rules({ regions: ['europe'] }))
    const africa = playableCountries(rules({ regions: ['africa'] }))
    const both = playableCountries(rules({ regions: ['europe', 'africa'] }))
    expect(new Set(both)).toEqual(new Set([...europe, ...africa]))
    // Egypt sits on both boards and must not be dealt twice.
    expect(both.filter(isoCode => isoCode === 'EG')).toHaveLength(1)
    expect(both).not.toContain('JP')
  })
})

describe('isCountryInPlay / isCountryPlayable', () => {
  it('keeps the in-play gate variant-agnostic (answers reach off-board)', () => {
    const europe = rules({ regions: ['europe'] })
    // Morocco is off the Europe board but still a legal answer…
    expect(isCountryInPlay(europe, 'MA')).toBe(true)
    expect(isCountryPlayable(europe, 'MA')).toBe(false)
    // …while a benched micro-nation is out everywhere.
    expect(isCountryInPlay(europe, 'MC')).toBe(false)
  })
})

describe('playableWorldCountries / excludedMicroNations', () => {
  it('mirrors the in-play gate world-wide', () => {
    const world = new Set(playableWorldCountries(rules({ regions: ['europe'] })))
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
    regions: [],
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

  it('takes a list of regions, never the whole world named as one', () => {
    expect(isValidGameConfiguration({ ...valid, regions: ['europe', 'africa'] })).toBe(true)
    expect(isValidGameConfiguration({ ...valid, regions: ['world'] })).toBe(false)
    expect(isValidGameConfiguration({ ...valid, regions: ['europe', 'europe'] })).toBe(false)
    expect(isValidGameConfiguration({ ...valid, regions: 'europe' })).toBe(false)
  })
})
