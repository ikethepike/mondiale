import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { getGroupChallenge, isFlagPaletteMatch } from '~~/lib/challenges'
import { isValidGameConfiguration } from '~~/types/game.types'
import {
  autoEnabledKinds,
  CHALLENGE_GROUP_ACCESSORS,
  CHALLENGE_GROUP_BY_KIND,
  HEAVY_ACCESSORS,
  isAccessorEnabled,
  isGroupEnabled,
  isKindEnabled,
  isValidChallengeOverrides,
} from '~~/types/challenges/challenge-groups.type'

describe('isKindEnabled', () => {
  it('always deals core kinds, whatever the overrides say', () => {
    const game = {
      difficulty: 'easy',
      challengeOverrides: {
        conflicts: false,
        navigation: false,
        water: false,
        flags: false,
        culture: false,
        disputed: false,
      },
    } as const
    expect(isKindEnabled(game, 'ranking')).toBe(true)
    expect(isKindEnabled(game, 'stat-detective')).toBe(true)
    expect(isKindEnabled(game, 'two-truths')).toBe(true)
    // …so an all-off table still has a playable game.
    expect(isKindEnabled(game, 'flashpoint')).toBe(false)
    expect(isKindEnabled(game, 'capital-guess')).toBe(false)
  })

  it('deals empires on every difficulty in auto, off when the group is', () => {
    expect(isKindEnabled({ difficulty: 'easy' }, 'empire')).toBe(true)
    expect(isKindEnabled({ difficulty: 'hard' }, 'empire')).toBe(true)
    expect(
      isKindEnabled({ difficulty: 'hard', challengeOverrides: { empires: false } }, 'empire')
    ).toBe(false)
  })

  it('gates hard-only kinds by difficulty in auto', () => {
    expect(isKindEnabled({ difficulty: 'normal' }, 'flashpoint')).toBe(false)
    expect(isKindEnabled({ difficulty: 'hard' }, 'flashpoint')).toBe(true)
    expect(isKindEnabled({ difficulty: 'easy' }, 'ghost-state')).toBe(false)
    // Highlands and pin-landmark deal everywhere — their pools soften in-dealer
    // (HIGHLANDS_TIERS, PIN_LANDMARK_TIERS).
    expect(isKindEnabled({ difficulty: 'easy' }, 'highlands')).toBe(true)
    expect(isKindEnabled({ difficulty: 'easy' }, 'pin-landmark')).toBe(true)
    expect(isKindEnabled({ difficulty: 'easy' }, 'river-run')).toBe(true)
  })

  it('lets an explicit override beat the difficulty gate both ways', () => {
    expect(
      isKindEnabled({ difficulty: 'easy', challengeOverrides: { conflicts: true } }, 'flashpoint')
    ).toBe(true)
    expect(
      isKindEnabled({ difficulty: 'hard', challengeOverrides: { conflicts: false } }, 'flashpoint')
    ).toBe(false)
    // Force-enabling a mixed group lifts only its own kinds.
    const forcedWater = { difficulty: 'easy', challengeOverrides: { water: true } } as const
    expect(isKindEnabled(forcedWater, 'name-that-water')).toBe(true)
    expect(isKindEnabled(forcedWater, 'ghost-state')).toBe(false)
  })
})

describe('isAccessorEnabled', () => {
  it('treats conflict stats as hard-only in auto, like flashpoint', () => {
    for (const accessor of CHALLENGE_GROUP_ACCESSORS.conflicts) {
      expect(isAccessorEnabled({ difficulty: 'normal' }, accessor)).toBe(false)
      expect(isAccessorEnabled({ difficulty: 'hard' }, accessor)).toBe(true)
    }
  })

  it('follows the group override both ways', () => {
    const on = { difficulty: 'easy', challengeOverrides: { conflicts: true } } as const
    const off = { difficulty: 'hard', challengeOverrides: { conflicts: false } } as const
    expect(isAccessorEnabled(on, 'government.conflictsFought')).toBe(true)
    expect(isAccessorEnabled(off, 'government.yearsAtWar')).toBe(false)
  })

  it('deals non-heavy topic stats on every difficulty in auto', () => {
    expect(isAccessorEnabled({ difficulty: 'easy' }, 'economics.gdpPerCapita')).toBe(true)
    expect(isAccessorEnabled({ difficulty: 'normal' }, 'government.democracyIndex')).toBe(true)
    expect(isAccessorEnabled({ difficulty: 'easy' }, 'health.obesity')).toBe(true)
    expect(isAccessorEnabled({ difficulty: 'normal' }, 'geography.area.total')).toBe(true)
  })

  it('lets a topic override switch its stats off, others untouched', () => {
    const off = {
      difficulty: 'hard',
      challengeOverrides: { economy: false, society: false },
    } as const
    expect(isAccessorEnabled(off, 'economics.gdpPerCapita')).toBe(false)
    expect(isAccessorEnabled(off, 'infrastructure.airports')).toBe(false)
    expect(isAccessorEnabled(off, 'government.democracyIndex')).toBe(false)
    expect(isAccessorEnabled(off, 'health.obesity')).toBe(true)
    expect(isAccessorEnabled(off, 'environment.CO2Emissions')).toBe(true)
  })
})

describe('taxonomy shape', () => {
  it('assigns every kind a group and keeps the core floor', () => {
    const core = Object.entries(CHALLENGE_GROUP_BY_KIND)
      .filter(([, group]) => group === 'core')
      .map(([kind]) => kind)
    expect(core).toContain('ranking')
    expect(core).toContain('stat-detective')
    expect(core).toContain('two-truths')
  })

  it('resolves auto captions per difficulty', () => {
    expect(autoEnabledKinds('conflicts', 'normal').enabled).toHaveLength(0)
    expect(autoEnabledKinds('conflicts', 'hard').enabled).toEqual(['flashpoint'])
    const water = autoEnabledKinds('water', 'normal')
    expect(water.total).toHaveLength(4)
    // name-that-water and highlands deal below hard too — pools scale in-dealer.
    expect(water.enabled).toEqual(
      expect.arrayContaining(['river-run', 'shared-shores', 'name-that-water', 'highlands'])
    )
    expect(water.enabled).toHaveLength(4)
  })
})

describe('isGroupEnabled', () => {
  it('lets an explicit override beat the auto gate both ways', () => {
    expect(
      isGroupEnabled({ difficulty: 'easy', challengeOverrides: { trends: false } }, 'trends')
    ).toBe(false)
    expect(
      isGroupEnabled({ difficulty: 'hard', challengeOverrides: { trends: false } }, 'trends')
    ).toBe(false)
    expect(
      isGroupEnabled({ difficulty: 'easy', challengeOverrides: { trends: true } }, 'trends', false)
    ).toBe(true)
  })

  it('follows the auto gate when unset', () => {
    expect(isGroupEnabled({ difficulty: 'easy' }, 'trends')).toBe(true)
    expect(isGroupEnabled({ difficulty: 'easy' }, 'trends', false)).toBe(false)
  })
})

describe('conflicts stay a rare find', () => {
  it('never opens a game with a conflict stat', () => {
    const game = {
      variant: 'world',
      difficulty: 'hard',
      rounds: [],
      players: { p1: {} },
    } as unknown as Parameters<typeof getGroupChallenge>[0]['game']
    for (let deal = 0; deal < 30; deal++) {
      const challenge = getGroupChallenge({ game })
      expect(HEAVY_ACCESSORS.has(challenge.id)).toBe(false)
    }
  })

  it('marks only heavy-group accessors, so the opener pool stays full', () => {
    expect(HEAVY_ACCESSORS.has('government.conflictsFought')).toBe(true)
    expect(HEAVY_ACCESSORS.has('economics.gdpPerCapita')).toBe(false)
    expect(HEAVY_ACCESSORS.has('people.population')).toBe(false)
    // Everything-grouped must not mean everything-heavy.
    expect(HEAVY_ACCESSORS.size).toBe(CHALLENGE_GROUP_ACCESSORS.conflicts.length)
  })
})

describe('isValidChallengeOverrides', () => {
  it('accepts empty and well-formed override maps', () => {
    expect(isValidChallengeOverrides({})).toBe(true)
    expect(isValidChallengeOverrides({ conflicts: false, water: true })).toBe(true)
    // Hidden stat-topic groups are real groups — overrides validate today.
    expect(isValidChallengeOverrides({ economy: false, nature: true })).toBe(true)
  })

  it('rejects unknown groups, non-boolean values, and non-objects', () => {
    expect(isValidChallengeOverrides({ pirates: true })).toBe(false)
    expect(isValidChallengeOverrides({ conflicts: 'off' })).toBe(false)
    expect(isValidChallengeOverrides(['conflicts'])).toBe(false)
    expect(isValidChallengeOverrides(undefined)).toBe(false)
  })

  it('rejects prototype-chain keys that are not real groups', () => {
    expect(isValidChallengeOverrides({ toString: true })).toBe(false)
    expect(isValidChallengeOverrides({ constructor: false })).toBe(false)
    expect(isValidChallengeOverrides({ hasOwnProperty: true })).toBe(false)
  })
})

describe('isValidGameConfiguration', () => {
  const valid = {
    difficulty: 'normal',
    variant: 'world',
    length: 'medium',
    liveGuesses: true,
    challengeOverrides: { conflicts: false },
  }

  it('accepts a well-formed configuration', () => {
    expect(isValidGameConfiguration(valid)).toBe(true)
  })

  it('rejects unknown difficulty and length values, not just missing keys', () => {
    expect(isValidGameConfiguration({ ...valid, difficulty: 'nightmare' })).toBe(false)
    expect(isValidGameConfiguration({ ...valid, length: 'marathon' })).toBe(false)
    // FormData strings that never got coerced must not slip through either.
    expect(isValidGameConfiguration({ ...valid, liveGuesses: 'on' })).toBe(false)
  })

  it('rejects missing or malformed overrides', () => {
    const { challengeOverrides: _dropped, ...withoutOverrides } = valid
    expect(isValidGameConfiguration(withoutOverrides)).toBe(false)
    expect(isValidGameConfiguration({ ...valid, challengeOverrides: { toString: true } })).toBe(
      false
    )
  })
})

describe('isFlagPaletteMatch', () => {
  it('accepts the subject and any exact palette twin, nothing else', () => {
    const challenge = {
      country: 'CL',
      swatches: COUNTRIES.CL.identity.colors.slice(0, 6),
    } as const
    expect(isFlagPaletteMatch(challenge, 'CL')).toBe(true)
    // Chile and Russia fly the identical ordered palette in the dataset —
    // indistinguishable from the swatches alone, so both must count.
    if (COUNTRIES.RU.identity.colors.join('|') === COUNTRIES.CL.identity.colors.join('|')) {
      expect(isFlagPaletteMatch(challenge, 'RU')).toBe(true)
    }
    expect(isFlagPaletteMatch(challenge, 'SE')).toBe(false)
    expect(isFlagPaletteMatch(challenge, undefined)).toBe(false)
  })
})
