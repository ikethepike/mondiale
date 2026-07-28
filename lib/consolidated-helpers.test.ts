import { describe, expect, it } from 'vitest'
import { sample, sampleMany, weightedPick } from './arrays'
import { boardProgress, playerDisplayName, seatLabel } from './player'
import { clampScore, jaccardFraction } from './scoring'
import { editDistance, normalizeAnswer, sentenceCase, titleCase } from './strings'
import { clamp, clamp01, formatKm } from './number'
import { expectChallengeType, isChallengeOfType, latestRound } from './rounds'
import type { Game } from '~~/types/game.types'

describe('normalizeAnswer', () => {
  it('flattens case, diacritics, punctuation and a leading article', () => {
    expect(normalizeAnswer("The Côte d'Ivoire!")).toBe('cote divoire')
    expect(normalizeAnswer('  São   Tomé  ')).toBe('sao tome')
  })

  it('keeps digits unless told otherwise', () => {
    expect(normalizeAnswer('Area 51')).toBe('area 51')
    expect(normalizeAnswer('Area 51', { digits: false })).toBe('area')
  })

  it('drops only the configured articles', () => {
    expect(normalizeAnswer('El Niño', { articles: ['the', 'el', 'la', 'il'] })).toBe('nino')
    expect(normalizeAnswer('La Manche')).toBe('la manche')
  })
})

describe('editDistance', () => {
  it('counts a transposition as one edit', () => {
    expect(editDistance('mughal', 'muhgal')).toBe(1)
  })

  it('respects the budget short-circuit', () => {
    expect(editDistance('short', 'a very long string indeed', 2)).toBe(3)
  })

  it('is exact without a budget', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3)
  })
})

describe('string casings', () => {
  it('titleCase humanizes kebab slugs', () => {
    expect(titleCase('north-america')).toBe('North America')
  })

  it('sentenceCase lifts only the first letter', () => {
    expect(sentenceCase('the Ottoman Empire')).toBe('The Ottoman Empire')
    expect(sentenceCase('')).toBe('')
  })
})

describe('array picks', () => {
  it('sample stays inside the array and handles empty', () => {
    expect(sample([])).toBeUndefined()
    expect([1, 2, 3]).toContain(sample([1, 2, 3]))
  })

  it('sampleMany returns distinct members, capped at length', () => {
    const picked = sampleMany([1, 2, 3], 5)
    expect(picked).toHaveLength(3)
    expect(new Set(picked).size).toBe(3)
  })

  it('weightedPick never lands on a zero-weight entry when others carry weight', () => {
    for (let i = 0; i < 50; i++) {
      expect(
        weightedPick([
          ['never', 0],
          ['always', 1],
        ])
      ).toBe('always')
    }
    expect(weightedPick([])).toBeUndefined()
  })
})

describe('score helpers', () => {
  it('clampScore folds into 0..maximum and rounds', () => {
    expect(clampScore(12.4, 10)).toBe(10)
    expect(clampScore(-3, 10)).toBe(0)
    expect(clampScore(7.5, 10)).toBe(8)
  })

  it('jaccardFraction measures set overlap, both-empty is perfect', () => {
    expect(jaccardFraction(new Set(), new Set())).toBe(1)
    expect(jaccardFraction(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3)
  })
})

describe('clamp helpers', () => {
  it('clamp and clamp01 bound both sides', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-5, 0, 3)).toBe(0)
    expect(clamp01(1.4)).toBe(1)
    expect(clamp01(-0.4)).toBe(0)
  })

  it('formatKm rounds and labels', () => {
    expect(formatKm(1234.6)).toBe(`${(1235).toLocaleString()} km`)
  })
})

describe('player labels', () => {
  it('falls back to Anonymous exactly once, everywhere', () => {
    expect(playerDisplayName(undefined)).toBe('Anonymous')
    expect(playerDisplayName({ name: '' })).toBe('Anonymous')
    expect(playerDisplayName({ name: 'Ada' })).toBe('Ada')
  })

  it('seatLabel says You for the viewer', () => {
    const players = { p1: { name: 'Ada' }, p2: { name: '' } }
    expect(seatLabel(players, 'p1', 'p1')).toBe('You')
    expect(seatLabel(players, 'p1', 'p2')).toBe('Ada')
    expect(seatLabel(players, 'p2', 'p1')).toBe('Anonymous')
    expect(seatLabel(players, 'missing', 'p1')).toBe('Anonymous')
  })

  it('boardProgress lands on 1 at the last tile', () => {
    expect(boardProgress(0, 41)).toBe(0)
    expect(boardProgress(40, 41)).toBe(1)
    expect(boardProgress(99, 41)).toBe(1)
  })
})

describe('round narrowing', () => {
  const game = {
    rounds: [
      { groupChallenge: { _type: 'silhouette-challenge' }, groupAnswers: {}, playerTurns: {} },
    ],
  } as unknown as Game

  it('latestRound returns the round in play', () => {
    expect(latestRound(game)).toBe(game.rounds[0])
    expect(latestRound({ rounds: [] } as unknown as Game)).toBeUndefined()
  })

  it('isChallengeOfType narrows by discriminant', () => {
    expect(isChallengeOfType(game.rounds[0].groupChallenge, 'silhouette-challenge')).toBe(true)
    expect(isChallengeOfType(game.rounds[0].groupChallenge, 'empire-challenge')).toBe(false)
  })

  it('expectChallengeType throws on kind mismatch', () => {
    expect(() => expectChallengeType(game.rounds[0].groupChallenge, 'empire-challenge')).toThrow(
      TypeError
    )
  })
})

describe('monotoneCurvePath', () => {
  it('passes through both endpoints with cubic segments between', async () => {
    const { monotoneCurvePath } = await import('./charts')
    const path = monotoneCurvePath([
      { x: 0, y: 10 },
      { x: 50, y: 40 },
      { x: 100, y: 20 },
    ])
    expect(path.startsWith('M 0.00,10.00')).toBe(true)
    expect(path.endsWith('100.00,20.00')).toBe(true)
    expect(path.match(/C /g)).toHaveLength(2)
  })

  it('keeps a monotone run inside the data (no overshoot at the peak)', async () => {
    const { monotoneCurvePath } = await import('./charts')
    const path = monotoneCurvePath([
      { x: 0, y: 0 },
      { x: 10, y: 30 },
      { x: 20, y: 30 },
    ])
    const ys = [...path.matchAll(/[\s,](\d+\.\d+)(?=[\s]|$)/g)].map(m => Number(m[1]))
    for (const y of ys) expect(y).toBeLessThanOrEqual(30.001)
  })

  it('handles degenerate inputs', async () => {
    const { monotoneCurvePath } = await import('./charts')
    expect(monotoneCurvePath([])).toBe('')
    expect(monotoneCurvePath([{ x: 4, y: 5 }])).toBe('M 4.00,5.00')
  })
})
