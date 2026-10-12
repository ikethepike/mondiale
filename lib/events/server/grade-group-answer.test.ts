import { describe, expect, it } from 'vitest'
import { capitalGuessScore } from '~~/lib/challenges'
import { groundPlanRemainingFraction } from '~~/lib/ground-plan'
import { sketchSubmission, sketchTarget, type OutlinePoint } from '~~/lib/outline'
import { statDetectiveRemainingFraction, TIMEOUT_SLACK_MS } from '~~/lib/round-beats'
import { buzzScore, hintDockedScore } from '~~/lib/scoring'
import type { Game, Round } from '~~/types/game.types'
import type { SeatCursor } from '~~/types/seat.types'
import { gradeGroupAnswer, type GroupSubmission } from './grade-group-answer'

const PLAY_STARTS_AT = 1_000_000
const MAX = 10

const grade = async (
  challenge: object,
  submission: Record<string, unknown>,
  { at, seat }: { at: number; seat?: Pick<SeatCursor, 'deadline' | 'hints'> }
) =>
  (
    await gradeGroupAnswer({
      game: { difficulty: 'normal', regions: [] } as unknown as Game,
      round: {
        groupChallenge: challenge,
        groupAnswers: {},
        playerTurns: {},
        playStartsAt: PLAY_STARTS_AT,
      } as unknown as Round,
      playerId: 'p',
      submission: submission as GroupSubmission,
      seat,
      at,
    })
  ).scoring.scored

/** Server time when the answer arrives `ms` into the play window, wire slack included. */
const into = (ms: number) => PLAY_STARTS_AT + ms + TIMEOUT_SLACK_MS

describe('buzz pay is priced off the server clock, never the claim', () => {
  const silhouette = {
    _type: 'silhouette-challenge',
    country: 'FR',
    durationSeconds: 20,
    maximumPoints: MAX,
  }

  it('pays a claimed 9999 what the clock says', async () => {
    const claim = { ranking: ['FR'], clientScore: 9999 }
    expect(await grade(silhouette, claim, { at: into(0) })).toBe(MAX)
    expect(await grade(silhouette, claim, { at: into(10_000) })).toBe(buzzScore(MAX, 0.5))
    expect(await grade(silhouette, claim, { at: into(60_000) })).toBe(buzzScore(MAX, 0))
    expect(await grade(silhouette, { ...claim, ranking: ['DE'] }, { at: into(0) })).toBe(0)
  })

  it('prices a play-gated round off the seat window its play tap opened', async () => {
    const anthem = { ...silhouette, _type: 'anthem-buzz-challenge' }
    const tappedAt = PLAY_STARTS_AT + 9_000
    const seat = { deadline: tappedAt + 20_000 }
    expect(
      await grade(anthem, { ranking: ['FR'] }, { at: tappedAt + TIMEOUT_SLACK_MS, seat })
    ).toBe(MAX)
    // Never tapped: no window is running, so nothing is early.
    expect(await grade(anthem, { ranking: ['FR'] }, { at: into(0) })).toBe(buzzScore(MAX, 0))
  })

  it('prices Stat Detective by the clues on screen', async () => {
    const detective = {
      _type: 'stat-detective-challenge',
      country: 'FR',
      clues: ['a', 'b', 'c', 'd'],
      secondsPerClue: 5,
      maximumPoints: MAX,
    }
    expect(
      await grade(detective, { ranking: ['FR'], clientScore: MAX }, { at: into(11_000) })
    ).toBe(buzzScore(MAX, statDetectiveRemainingFraction(detective as never, 3)))
  })

  it('prices a typed Ground Plan by the layers on screen', async () => {
    const plan = {
      _type: 'ground-plan-challenge',
      country: 'FR',
      layers: ['fabric', 'arterials', 'rail', 'bridges'],
      secondsPerLayer: 8,
      durationSeconds: 40,
      maximumPoints: MAX,
    }
    expect(await grade(plan, { ranking: ['FR'], clientScore: MAX }, { at: into(17_000) })).toBe(
      buzzScore(MAX, groundPlanRemainingFraction(plan as never, 3))
    )
  })

  it('pays an option board by the attempt its pick sequence landed on', async () => {
    const capital = {
      _type: 'capital-guess-challenge',
      country: 'FR',
      options: ['FR', 'DE', 'IT', 'ES'],
      maximumGuesses: 2,
      durationSeconds: 20,
      maximumPoints: MAX,
    }
    const at = into(15_000)
    expect(await grade(capital, { ranking: ['FR'] }, { at })).toBe(MAX)
    expect(await grade(capital, { ranking: ['DE', 'FR'], clientScore: MAX }, { at })).toBe(
      capitalGuessScore(2, 2, MAX)
    )
    expect(await grade(capital, { ranking: ['DE', 'IT', 'FR'] }, { at })).toBe(0)
  })

  it('pays Tongues off the clock for any speaker', async () => {
    const tongue = {
      _type: 'tongue-buzz-challenge',
      tongue: 'french',
      countries: ['FR', 'BE'],
      durationSeconds: 20,
      maximumPoints: MAX,
    }
    const seat = { deadline: PLAY_STARTS_AT + 20_000 }
    expect(
      await grade(tongue, { ranking: ['BE'], clientScore: 9999 }, { at: into(10_000), seat })
    ).toBe(buzzScore(MAX, 0.5))
  })

  it('docks the Two Truths 50/50 from the cursor, not the submit', async () => {
    const truths = {
      _type: 'two-truths-challenge',
      country: 'FR',
      durationSeconds: 20,
      maximumPoints: MAX,
    }
    const seat = { hints: ['fifty-fifty'] }
    expect(await grade(truths, { ranking: ['FR'] }, { at: into(0), seat })).toBe(
      hintDockedScore(MAX, MAX, 1)
    )
  })
})

describe('name-that-water pays its guess trail', () => {
  const water = {
    _type: 'name-water-challenge',
    featureId: 'baltic',
    featureName: 'Baltic Sea',
    countries: ['SE', 'FI'],
    maximumGuesses: 3,
    durationSeconds: 40,
    maximumPoints: MAX,
  }

  it('prices the attempt the feature was named on, ignoring a claim', async () => {
    const at = into(0)
    expect(await grade(water, { ranking: [], water: [{ guessedId: 'baltic' }] }, { at })).toBe(MAX)
    const third = [{ guessedId: 'north' }, { guessedId: 'red' }, { guessedName: 'the Baltic Sea' }]
    expect(
      await grade(water, { ranking: [], water: third, clientScore: MAX }, { at })
    ).toBeLessThan(MAX)
    const late = [...third.slice(0, 2), { guessedId: 'black' }, { guessedId: 'baltic' }]
    expect(await grade(water, { ranking: [], water: late }, { at })).toBe(0)
  })
})

describe('sketches are scored on the server', () => {
  const sketch = {
    _type: 'sketch-challenge',
    country: 'FR',
    durationSeconds: 40,
    maximumPoints: MAX,
  }
  const spokes: OutlinePoint[] = [
    [0, 0],
    [1, 0],
    [0, 0],
    [0, 1],
    [0, 0],
    [-1, 0],
    [0, 0],
    [0, -1],
    [0, 0],
    [0.7, 0.7],
    [0, 0],
    [-0.7, -0.7],
  ]

  it('ignores a claimed score and grades the drawing', async () => {
    const at = into(0)
    const traced = sketchSubmission((await sketchTarget('FR'))!)
    expect(await grade(sketch, { ranking: ['FR'], sketch: traced }, { at })).toBe(MAX)
    expect(
      await grade(
        sketch,
        { ranking: ['FR'], sketch: sketchSubmission(spokes), clientScore: MAX },
        {
          at,
        }
      )
    ).toBeLessThan(MAX * 0.2)
  })

  it('pays nothing for a malformed drawing, whatever it claims', async () => {
    const at = into(0)
    const short = sketchSubmission((await sketchTarget('FR'))!).slice(0, 20)
    expect(await grade(sketch, { ranking: ['FR'], sketch: short, clientScore: MAX }, { at })).toBe(
      0
    )
    expect(await grade(sketch, { ranking: ['FR'], clientScore: MAX }, { at })).toBe(0)
  })
})
