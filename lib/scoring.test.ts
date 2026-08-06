import { describe, expect, it } from 'vitest'
import {
  capitalGuessScore,
  getCorrectRanking,
  rankingBreakdown,
  scoreChallengeSubmission,
  scoreGhostState,
  scoreHotCold,
  scoreTraversalSubmission,
} from './challenges'
import {
  attemptFraction,
  blitzScore,
  buzzFraction,
  buzzScore,
  GATE_HINT_BITE_STEPS,
  GATE_LEAP_STEPS,
  gateLeapSteps,
  gatePot,
  HINT_BITE_FRACTION,
  hintDockedScore,
  scorePinDistance,
} from './scoring'
import { getValueByAccessorID } from './values'
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

  it('bites GATE_HINT_BITE_STEPS per bought hint, never below zero', () => {
    expect(gateLeapSteps(1, 1)).toBe(Math.max(0, GATE_LEAP_STEPS - GATE_HINT_BITE_STEPS))
    expect(gateLeapSteps(0, 1)).toBe(0)
    expect(gateLeapSteps(1, 2)).toBe(0)
  })

  it('never lets a negative or garbage hint count inflate the leap', () => {
    expect(gateLeapSteps(1, -3)).toBe(GATE_LEAP_STEPS)
    expect(gateLeapSteps(1, Number.NaN)).toBe(GATE_LEAP_STEPS)
    expect(gateLeapSteps(1, 0.4)).toBe(GATE_LEAP_STEPS)
  })

  it('shrugs off a garbage fraction instead of walking the pawn NaN steps', () => {
    expect(gateLeapSteps(Number.NaN)).toBe(GATE_LEAP_STEPS)
    expect(gateLeapSteps(Number.POSITIVE_INFINITY)).toBe(GATE_LEAP_STEPS)
    expect(gateLeapSteps(7)).toBe(2)
    expect(gateLeapSteps(-3)).toBe(1)
  })

  it('scales a deeper pot, so a bought hint is a trade and not a surrender', () => {
    const deep = gatePot('rosetta')
    expect(deep).toBeGreaterThan(GATE_HINT_BITE_STEPS)
    expect(gateLeapSteps(1, 0, deep)).toBe(deep)
    // The whole point of the deeper pot: something survives the hint.
    expect(gateLeapSteps(1, 1, deep)).toBe(deep - GATE_HINT_BITE_STEPS)
    expect(gateLeapSteps(1, 1, deep)).toBeGreaterThan(0)
  })
})

describe('gatePot', () => {
  it('pays the standard leap for a variant that declares nothing', () => {
    expect(gatePot()).toBe(GATE_LEAP_STEPS)
    expect(gatePot('find')).toBe(GATE_LEAP_STEPS)
    expect(gatePot('flag-pick')).toBe(GATE_LEAP_STEPS)
  })

  it('deepens the pot only for the variants that sell a hint worth buying', () => {
    expect(gatePot('errata')).toBeGreaterThan(GATE_LEAP_STEPS)
    expect(gatePot('rosetta')).toBeGreaterThan(GATE_LEAP_STEPS)
  })
})

describe('hintDockedScore', () => {
  it('leaves an unhinted answer untouched', () => {
    expect(hintDockedScore(15, 15)).toBe(15)
    expect(hintDockedScore(15, 15, 0)).toBe(15)
  })

  it('bites HINT_BITE_FRACTION of the pot per bought hint, never below zero', () => {
    const bite = Math.round(15 * HINT_BITE_FRACTION)
    expect(hintDockedScore(15, 15, 1)).toBe(15 - bite)
    expect(hintDockedScore(15, 15, 2)).toBe(15 - 2 * bite)
    expect(hintDockedScore(6, 15, 2)).toBe(0)
  })

  it('never lets a negative or garbage hint count inflate the score', () => {
    expect(hintDockedScore(15, 15, -3)).toBe(15)
    expect(hintDockedScore(15, 15, Number.NaN)).toBe(15)
    expect(hintDockedScore(15, 15, 0.4)).toBe(15)
  })

  it('composes with the buzz curve the way two-truths pays: curve first, flat bite after', () => {
    expect(hintDockedScore(buzzScore(15, 0.5), 15, 1)).toBe(7)
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

  // The scorecard reveal renders rankingBreakdown; the scorer sums it. These
  // pin that the two can never disagree.
  it('pays exactly what the per-country breakdown adds up to', () => {
    for (const submitted of [correct, [...correct].reverse(), correct.slice(1)]) {
      const rows = rankingBreakdown({ submitted, correct, groupChallengeAccessorId })
      expect(score(submitted).scored).toBe(rows.reduce((sum, row) => sum + row.points, 0))
    }
  })

  // Five countries on exactly 100 % electricity access: the sort that produced
  // the "correct" order broke that tie by nothing at all, so any order inside
  // the band has to pay full marks.
  describe('countries sharing a value', () => {
    const accessorId = 'energy.electricityAccess'
    const tied: ISOCountryCode[] = ['TT', 'IQ', 'AR', 'SV', 'NR']
    const dealt: ISOCountryCode[] = [...tied, 'KH']
    const order = getCorrectRanking({ groupChallengeAccessorId: accessorId, isoCodes: dealt })

    const scoreTied = (submittedRanking: ISOCountryCode[]) =>
      scoreChallengeSubmission({
        groupChallengeAccessorId: accessorId,
        submittedRanking,
        dealtCountries: dealt,
      })

    it('confirms the fixture really is a five-way tie above a lone value', () => {
      const amounts = order.map(isoCode => getValueByAccessorID(isoCode, accessorId)?.amount)
      expect(amounts).toEqual([100, 100, 100, 100, 100, 92.3])
    })

    it('pays full marks for any order within the tie band', () => {
      // Every rotation of the tied five keeps them inside slots 1–5.
      for (let rotation = 0; rotation < tied.length; rotation++) {
        const rotated = [...tied.slice(rotation), ...tied.slice(0, rotation)]
        expect(scoreTied([...rotated, 'KH'])).toEqual({ scored: 18, maximum: 18 })
      }
    })

    it('still charges for leaving the band', () => {
      // KH (92.3 %, slot 6) hoisted to the top pushes one tied country out to
      // slot 6 — one slot past the band's edge — and lands KH five slots high.
      const rows = rankingBreakdown({
        submitted: ['KH', ...tied],
        correct: order,
        groupChallengeAccessorId: accessorId,
      })
      expect(rows.map(row => row.points)).toEqual([3, 3, 3, 3, 2, 0])
      expect(scoreTied(['KH', ...tied])).toEqual({ scored: 14, maximum: 18 })
    })

    it('gives every tied country the same competition rank', () => {
      const rows = rankingBreakdown({
        submitted: dealt,
        correct: order,
        groupChallengeAccessorId: accessorId,
      })
      expect(rows.map(row => row.tieStart)).toEqual([1, 1, 1, 1, 1, 6])
      expect(rows.map(row => row.tied)).toEqual([true, true, true, true, true, false])
    })

    it('lists a tie band in the order the player chose', () => {
      const shuffled: ISOCountryCode[] = ['NR', 'SV', 'AR', 'IQ', 'TT', 'KH']
      const rows = rankingBreakdown({
        submitted: shuffled,
        correct: order,
        groupChallengeAccessorId: accessorId,
      })
      expect(rows.map(row => row.isoCode)).toEqual(shuffled)
      expect(rows.map(row => row.submittedPosition)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it('sinks an unplaced tied country to the tail of its band', () => {
      const rows = rankingBreakdown({
        submitted: ['TT', 'IQ', 'AR', 'SV', 'KH'],
        correct: order,
        groupChallengeAccessorId: accessorId,
      })
      expect(rows[4]).toEqual({
        isoCode: 'NR',
        correctPosition: 5,
        tieStart: 1,
        tiedCount: 5,
        tied: true,
        points: 0,
      })
    })
  })
})

describe('rankingBreakdown', () => {
  const correct: ISOCountryCode[] = ['RU', 'US', 'FR', 'PT', 'LU']

  it('walks the correct order with 1-based positions and per-slot points', () => {
    // US and FR swapped: both one off, everything else exact. Without an
    // accessor there are no values to tie on, so every slot stands alone.
    const rows = rankingBreakdown({ submitted: ['RU', 'FR', 'US', 'PT', 'LU'], correct })
    expect(rows).toEqual([
      { isoCode: 'RU', correctPosition: 1, tieStart: 1, tiedCount: 1, tied: false, submittedPosition: 1, offBy: 0, points: 3 }, // prettier-ignore
      { isoCode: 'US', correctPosition: 2, tieStart: 2, tiedCount: 1, tied: false, submittedPosition: 3, offBy: 1, points: 2 }, // prettier-ignore
      { isoCode: 'FR', correctPosition: 3, tieStart: 3, tiedCount: 1, tied: false, submittedPosition: 2, offBy: 1, points: 2 }, // prettier-ignore
      { isoCode: 'PT', correctPosition: 4, tieStart: 4, tiedCount: 1, tied: false, submittedPosition: 4, offBy: 0, points: 3 }, // prettier-ignore
      { isoCode: 'LU', correctPosition: 5, tieStart: 5, tiedCount: 1, tied: false, submittedPosition: 5, offBy: 0, points: 3 }, // prettier-ignore
    ])
  })

  it('marks a never-placed country as unplaced and worthless', () => {
    const rows = rankingBreakdown({ submitted: ['RU', 'US'], correct })
    expect(rows[2]).toEqual({
      isoCode: 'FR',
      correctPosition: 3,
      tieStart: 3,
      tiedCount: 1,
      tied: false,
      points: 0,
    })
  })

  it('ignores duplicates and countries outside the dealt hand', () => {
    const rows = rankingBreakdown({ submitted: ['DE', 'RU', 'RU', 'US'], correct })
    expect(rows[0]).toMatchObject({ isoCode: 'RU', submittedPosition: 1, points: 3 })
    expect(rows[1]).toMatchObject({ isoCode: 'US', submittedPosition: 2, points: 3 })
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

describe('scorePinDistance', () => {
  const taper = { perfectDistanceKm: 150, zeroDistanceKm: 3000, maximumPoints: 7 }

  it('pays the full pot anywhere inside the bullseye', () => {
    expect(scorePinDistance({ distanceKm: 0, ...taper })).toBe(7)
    expect(scorePinDistance({ distanceKm: 150, ...taper })).toBe(7)
  })

  it('tapers linearly and hits zero at the horizon', () => {
    expect(scorePinDistance({ distanceKm: 1575, ...taper })).toBe(4) // midway
    expect(scorePinDistance({ distanceKm: 3000, ...taper })).toBe(0)
    expect(scorePinDistance({ distanceKm: 12000, ...taper })).toBe(0)
  })

  it('matches the pin-landmark characterization at the shares heritage hunt uses', () => {
    // A 21-point round split over 3 beats: each beat pays up to 7.
    expect(scorePinDistance({ distanceKm: 320, ...taper })).toBe(7 - Math.round((7 * 170) / 2850))
  })
})
