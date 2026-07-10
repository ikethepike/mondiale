import { describe, expect, it } from 'vitest'
import {
  capitalGuessScore,
  getCorrectRanking,
  scoreChallengeSubmission,
  scoreGhostState,
  scoreHotCold,
  scoreTraversalSubmission,
} from './challenges'
import { attemptFraction, blitzScore, buzzFraction, GATE_LEAP_STEPS, gateLeapSteps } from './scoring'
import type { GhostStateChallenge, HotColdChallenge } from '~~/types/challenges/group-modes.type'
import type { TraversalChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

// Characterization tests: these pin the point outcomes the game produces TODAY,
// before scoreTraversalSubmission/scoreHotCold delegate to attemptDecayScore.
// They must stay green through that refactor unchanged.

const hotCold = (maximumPoints: number): HotColdChallenge => ({
  _type: 'hot-cold-challenge',
  country: 'PE',
  maximumGuesses: 8,
  maximumPoints,
})

// FR -> DE -> PL is a real border route: optimalHops 2, so minimumGuesses is 1.
const traversal = (maximumPoints: number): TraversalChallenge => ({
  _type: 'traversal-challenge',
  start: 'FR',
  target: 'PL',
  optimalHops: 2,
  optimalPath: ['FR', 'DE', 'PL'],
  maximumClicks: 6,
  maximumPoints,
})

describe('scoreHotCold', () => {
  it('pays nothing when the last probe is not the target', () => {
    expect(scoreHotCold({ challenge: hotCold(21), submittedGuesses: ['BR', 'CL'] })).toEqual({
      scored: 0,
      maximum: 21,
    })
  })

  it('pays full marks when the target is found on the first probe', () => {
    expect(scoreHotCold({ challenge: hotCold(21), submittedGuesses: ['PE'] })).toEqual({
      scored: 21,
      maximum: 21,
    })
  })

  it('docks two points per wasted probe', () => {
    expect(scoreHotCold({ challenge: hotCold(21), submittedGuesses: ['BR', 'CL', 'PE'] })).toEqual({
      scored: 17,
      maximum: 21,
    })
  })

  it('floors a found-but-wasteful attempt at two points', () => {
    const submittedGuesses: ISOCountryCode[] = [
      'BR',
      'CL',
      'AR',
      'CO',
      'EC',
      'BO',
      'UY',
      'VE',
      'PY',
      'GY',
      'PE',
    ]
    expect(scoreHotCold({ challenge: hotCold(21), submittedGuesses })).toEqual({
      scored: 2,
      maximum: 21,
    })
  })
})

describe('scoreTraversalSubmission', () => {
  it('pays nothing when the guesses never bridge start to target', () => {
    expect(
      scoreTraversalSubmission({ challenge: traversal(21), submittedGuesses: ['ES', 'PT'] })
    ).toEqual({ scored: 0, maximum: 21 })
  })

  it('pays full marks for the optimal single-country bridge', () => {
    expect(
      scoreTraversalSubmission({ challenge: traversal(21), submittedGuesses: ['DE'] })
    ).toEqual({ scored: 21, maximum: 21 })
  })

  it('docks two points per guess beyond the minimum', () => {
    expect(
      scoreTraversalSubmission({ challenge: traversal(21), submittedGuesses: ['BE', 'DE'] })
    ).toEqual({ scored: 19, maximum: 21 })
  })

  it('floors a completed-but-wasteful route at two points', () => {
    const submittedGuesses: ISOCountryCode[] = [
      'BE',
      'NL',
      'LU',
      'CH',
      'AT',
      'IT',
      'SI',
      'HR',
      'HU',
      'SK',
      'CZ',
      'DE',
    ]
    expect(scoreTraversalSubmission({ challenge: traversal(21), submittedGuesses })).toEqual({
      scored: 2,
      maximum: 21,
    })
  })
})

describe('buzzFraction', () => {
  it('pays the whole pot for an instant answer and floors a late one at 35%', () => {
    expect(buzzFraction(1)).toBe(1)
    expect(buzzFraction(0)).toBeCloseTo(0.35)
  })

  it('clamps input outside 0..1', () => {
    expect(buzzFraction(-1)).toBeCloseTo(0.35)
    expect(buzzFraction(2)).toBe(1)
  })

  // Silhouette and stat-detective inlined this curve before it moved here.
  it('reproduces the curve it replaced', () => {
    for (const f of [0, 0.13, 0.5, 0.87, 1]) {
      expect(buzzFraction(f)).toBeCloseTo(0.35 + 0.65 * f, 12)
    }
  })
})

describe('gateLeapSteps', () => {
  it('pays the whole pot when no clock is reported (untimed gates)', () => {
    expect(gateLeapSteps()).toBe(GATE_LEAP_STEPS)
  })

  it('pays the pot for a fast answer, one step for a slow one', () => {
    expect(gateLeapSteps(1)).toBe(2)
    expect(gateLeapSteps(0.7)).toBe(2)
    expect(gateLeapSteps(0.5)).toBe(1)
    expect(gateLeapSteps(0)).toBe(1)
  })

  it('bites one step for the outline hint, never below zero', () => {
    expect(gateLeapSteps(1, true)).toBe(1)
    expect(gateLeapSteps(0, true)).toBe(0)
  })

  it('shrugs off a garbage fraction instead of walking the pawn NaN steps', () => {
    expect(gateLeapSteps(Number.NaN)).toBe(GATE_LEAP_STEPS)
    expect(gateLeapSteps(Number.POSITIVE_INFINITY)).toBe(GATE_LEAP_STEPS)
    expect(gateLeapSteps(7)).toBe(2)
    expect(gateLeapSteps(-3)).toBe(1)
  })
})

describe('attemptFraction', () => {
  it('pays full marks on the first attempt', () => {
    expect(attemptFraction(1, 2)).toBe(1)
    expect(attemptFraction(1, 5)).toBe(1)
  })

  it('pays the last-attempt fraction on the last attempt', () => {
    expect(attemptFraction(2, 2)).toBeCloseTo(0.4)
    expect(attemptFraction(5, 5)).toBeCloseTo(0.4)
  })

  // name-that-water used a fixed 0.3-per-guess bite; at its cap of 3 the
  // derived curve must pay exactly what it paid before.
  it('matches name-that-water’s previous payouts at a cap of three', () => {
    for (const attempt of [1, 2, 3]) {
      expect(attemptFraction(attempt, 3)).toBeCloseTo(1 - (attempt - 1) * 0.3, 12)
    }
  })

  it('never goes negative when the cap grows, unlike the fixed rate it replaced', () => {
    for (let attempt = 1; attempt <= 6; attempt++) {
      expect(attemptFraction(attempt, 6)).toBeGreaterThanOrEqual(0.4)
    }
  })

  it('degrades monotonically and clamps an over-run attempt', () => {
    expect(attemptFraction(2, 3)).toBeGreaterThan(attemptFraction(3, 3))
    expect(attemptFraction(9, 3)).toBeCloseTo(attemptFraction(3, 3))
  })
})

describe('capitalGuessScore', () => {
  it('pays full marks first try, the retry rate on the last', () => {
    expect(capitalGuessScore(1, 2, 15)).toBe(15)
    expect(capitalGuessScore(2, 2, 15)).toBe(6)
    expect(capitalGuessScore(1, 2, 21)).toBe(21)
    expect(capitalGuessScore(2, 2, 21)).toBe(8)
  })

  it('never rounds a correct answer down to nothing', () => {
    expect(capitalGuessScore(2, 2, 1)).toBe(1)
    expect(capitalGuessScore(2, 2, 0)).toBe(1)
  })

  it('never lets a later attempt beat an earlier one', () => {
    for (const maximum of [12, 15, 21]) {
      expect(capitalGuessScore(2, 2, maximum)).toBeLessThan(capitalGuessScore(1, 2, maximum))
    }
  })
})

describe('scoreChallengeSubmission', () => {
  const groupChallengeAccessorId = 'geography.area.total'
  const dealtCountries: ISOCountryCode[] = ['RU', 'US', 'FR', 'PT', 'LU']
  // RU > US > FR > PT > LU by total area — derived, not hardcoded, so a data
  // regeneration can't silently invalidate the expectations below.
  const correct = getCorrectRanking({ groupChallengeAccessorId, isoCodes: dealtCountries })

  const score = (submittedRanking: ISOCountryCode[]) =>
    scoreChallengeSubmission({ groupChallengeAccessorId, submittedRanking, dealtCountries })

  it('pays full marks for the exact ranking', () => {
    expect(score(correct)).toEqual({ scored: 15, maximum: 15 })
  })

  it('credits the top-ranked country when placed a slot late', () => {
    // Swapping #1 and #2 leaves both one slot off (2 points each); the
    // asymmetric scorer this replaces paid the displaced #1 nothing.
    const swapped = [correct[1], correct[0], ...correct.slice(2)]
    expect(score(swapped)).toEqual({ scored: 13, maximum: 15 })
  })

  it('scores displacement symmetrically in both directions', () => {
    // Reversal displaces the ends by 4, the next pair by 2, centre exact.
    expect(score([...correct].reverse())).toEqual({ scored: 5, maximum: 15 })
  })

  it('ignores countries that were never dealt', () => {
    // A padded submission must not inflate the score (it feeds movement 1:1)
    const padded: ISOCountryCode[] = ['DE', 'BR', ...correct, 'CN', 'IN']
    expect(score(padded)).toEqual({ scored: 15, maximum: 15 })
  })

  it('counts a duplicated country once and keeps the dealt maximum', () => {
    expect(score([correct[0], correct[0], correct[0]])).toEqual({ scored: 3, maximum: 15 })
  })
})

describe('blitzScore', () => {
  const answers: ISOCountryCode[] = ['FR', 'DE', 'PL', 'CZ', 'AT']

  it('scales the pot by the found ratio', () => {
    expect(blitzScore(answers, ['FR', 'DE'], 15)).toEqual({ scored: 6, maximum: 15 })
    expect(blitzScore(answers, [...answers], 15)).toEqual({ scored: 15, maximum: 15 })
  })

  it('bites one point per wrong guess and counts duplicates once', () => {
    expect(blitzScore(answers, ['FR', 'DE', 'ES', 'ES'], 15)).toEqual({ scored: 5, maximum: 15 })
  })

  it('never pays below zero', () => {
    expect(blitzScore(answers, ['ES', 'PT', 'IT', 'GB'], 15)).toEqual({ scored: 0, maximum: 15 })
  })
})

// scoreGhostState grades a wrong tap by projected distance from the claimant.
// It measures each country's mainland (largest ring), NOT its whole bounding
// box: the US box spans the Pacific to reach Guam, which used to score Canada
// at zero and Russia at 62%.
describe('scoreGhostState proximity', () => {
  const ghostState = (parent: ISOCountryCode): GhostStateChallenge => ({
    _type: 'ghost-state-challenge',
    territoryId: 'test',
    parent,
    durationSeconds: 25,
    maximumPoints: 100,
  })

  const percentFor = async (tapped: ISOCountryCode, parent: ISOCountryCode) =>
    (await scoreGhostState({ challenge: ghostState(parent), submittedGuesses: [tapped] })).scored

  it('pays full marks for naming the claimant', async () => {
    expect(await percentFor('TR', 'TR')).toBe(100)
  })

  it('credits a land neighbour across a long border', async () => {
    expect(await percentFor('US', 'CA')).toBe(52)
    expect(await percentFor('MX', 'US')).toBe(60)
  })

  it('pays nothing across the antimeridian', async () => {
    expect(await percentFor('RU', 'US')).toBe(0)
  })

  it('credits a close neighbour whose islands skew its bounding box', async () => {
    expect(await percentFor('ES', 'PT')).toBe(90)
    expect(await percentFor('CL', 'AR')).toBe(91)
  })

  it('credits an island neighbour with no land border', async () => {
    expect(await percentFor('CY', 'TR')).toBe(90)
  })

  it('pays nothing for the far side of the world', async () => {
    expect(await percentFor('NL', 'PE')).toBe(0)
  })
})
