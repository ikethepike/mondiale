import { describe, expect, it } from 'vitest'
import { getGroupChallenge } from '~~/lib/challenges'
import {
  autoEnabledKinds,
  CHALLENGE_GROUP_ACCESSORS,
  CHALLENGE_GROUP_BY_KIND,
  GROUPED_ACCESSORS,
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

  it('gates hard-only kinds by difficulty in auto', () => {
    expect(isKindEnabled({ difficulty: 'normal' }, 'flashpoint')).toBe(false)
    expect(isKindEnabled({ difficulty: 'hard' }, 'flashpoint')).toBe(true)
    expect(isKindEnabled({ difficulty: 'easy' }, 'highlands')).toBe(false)
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

  it('never touches ungrouped accessors', () => {
    const off = {
      difficulty: 'easy',
      challengeOverrides: { conflicts: false, water: false },
    } as const
    expect(isAccessorEnabled(off, 'economics.gdpPerCapita')).toBe(true)
    expect(isAccessorEnabled(off, 'government.democracyIndex')).toBe(true)
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
    expect(water.enabled).toEqual(expect.arrayContaining(['river-run', 'shared-shores']))
    expect(water.enabled).toHaveLength(2)
  })
})

describe('isGroupEnabled', () => {
  it('lets an explicit override beat the auto gate both ways', () => {
    expect(isGroupEnabled({ difficulty: 'easy', challengeOverrides: { trends: false } }, 'trends')).toBe(
      false
    )
    expect(isGroupEnabled({ difficulty: 'hard', challengeOverrides: { trends: false } }, 'trends')).toBe(
      false
    )
    expect(isGroupEnabled({ difficulty: 'easy', challengeOverrides: { trends: true } }, 'trends', false)).toBe(
      true
    )
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
      expect(GROUPED_ACCESSORS.has(challenge.id)).toBe(false)
    }
  })
})

describe('isValidChallengeOverrides', () => {
  it('accepts empty and well-formed override maps', () => {
    expect(isValidChallengeOverrides({})).toBe(true)
    expect(isValidChallengeOverrides({ conflicts: false, water: true })).toBe(true)
  })

  it('rejects unknown groups, non-boolean values, and non-objects', () => {
    expect(isValidChallengeOverrides({ pirates: true })).toBe(false)
    expect(isValidChallengeOverrides({ conflicts: 'off' })).toBe(false)
    expect(isValidChallengeOverrides(['conflicts'])).toBe(false)
    expect(isValidChallengeOverrides(undefined)).toBe(false)
  })
})
