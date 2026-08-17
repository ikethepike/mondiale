import { describe, expect, it } from 'vitest'
import { DIFFICULTY_SHARE } from '~~/lib/bots'
import { pickTraversal } from '~~/lib/traversal'
import type {
  GhostStateChallenge,
  NeighbourBlitzChallenge,
  TrendRaceChallenge,
  TwoTruthsChallenge,
} from '~~/types/challenges/group-modes.type'
import type { TraversalChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { Game, Round } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { gradeGroupAnswer } from './grade-group-answer'
import { composeClassicSubmission } from './bot-brain'

/**
 * The strength suite: `bot-brain.test.ts` pins the SHAPE of a composed answer,
 * which is why three kinds could ship scoring far under their dial — traversal
 * banked a flat zero, the buzz family spent its share twice, and the two
 * first-guess kinds graded their own decoy.
 *
 * Here every kind is composed many times at a fixed difficulty and graded
 * through the REAL scorer, then the mean realized fraction is held to a band
 * around the share the dial promised.
 */

const TRIALS = 400
/** Sampling noise on 400 trials is well inside this; a spent-share bug is not. */
const BAND = 0.12

const seat = (id: string, extra: Partial<Player> = {}): Player =>
  ({
    id,
    name: id,
    phase: 'group-challenge',
    moves: [],
    currentPosition: 0,
    ...extra,
  }) as unknown as Player

const buildGame = (challenge: object, difficulty: Game['difficulty']): Game =>
  ({
    id: 'bot-strength',
    host: 'human',
    tiles: [],
    variant: 'world',
    difficulty,
    includeMicroNations: false,
    started: true,
    players: { 'bot:x': seat('bot:x', { bot: true }) },
    rounds: [{ groupChallenge: { ...challenge }, groupAnswers: {}, playerTurns: {} }],
  }) as unknown as Game

/** Compose and grade one round `TRIALS` times; returns the mean scored/maximum. */
const realizedFraction = async (challenge: object, difficulty: Game['difficulty']) => {
  let total = 0
  for (let trial = 0; trial < TRIALS; trial++) {
    // A fresh game per trial: an empty `playerTurns` keeps every draw on the
    // difficulty dial rather than on the previous trial's mirror.
    const game = buildGame(challenge, difficulty)
    const round: Round = game.rounds[0]
    const submission = await composeClassicSubmission(game, round, 'bot:x')
    if (!submission) continue
    const { scoring } = await gradeGroupAnswer({ game, round, playerId: 'bot:x', submission })
    if (scoring.maximum) total += scoring.scored / scoring.maximum
  }
  return total / TRIALS
}

const BLITZ: NeighbourBlitzChallenge = {
  _type: 'neighbour-blitz-challenge',
  country: 'DE',
  neighbours: ['FR', 'PL', 'CZ', 'AT', 'CH', 'DK', 'NL', 'BE', 'LU'],
  durationSeconds: 45,
  maximumPoints: 12,
} as NeighbourBlitzChallenge

const BUZZ: TwoTruthsChallenge = {
  _type: 'two-truths-challenge',
  country: 'SE',
  durationSeconds: 25,
  maximumPoints: 10,
} as TwoTruthsChallenge

const GHOST: GhostStateChallenge = {
  _type: 'ghost-state-challenge',
  territoryId: 'somaliland',
  parent: 'SO',
  durationSeconds: 25,
  maximumPoints: 10,
} as GhostStateChallenge

const TREND: TrendRaceChallenge = {
  _type: 'trend-race-challenge',
  metric: 'population',
  direction: 'risen',
  options: ['CN', 'IN', 'US', 'ID', 'PK', 'BR'],
  standings: ['IN', 'CN', 'US', 'ID', 'PK', 'BR'],
  windowStartYear: 2000,
  durationSeconds: 25,
  maximumPoints: 10,
} as TrendRaceChallenge

describe('bot strength realizes the difficulty dial', () => {
  // The buzz family: one target, an all-or-nothing pick, a clamped claim. The
  // share must be spent ONCE (on the hit), never again on the claim.
  it.each(['easy', 'normal', 'hard'] as const)(
    'buzz rounds land near the %s share',
    async difficulty => {
      const realized = await realizedFraction(BUZZ, difficulty)
      expect(realized).toBeGreaterThan(DIFFICULTY_SHARE[difficulty] - BAND)
      expect(realized).toBeLessThan(DIFFICULTY_SHARE[difficulty] + BAND)
    }
  )

  it.each(['easy', 'normal', 'hard'] as const)(
    'collect-a-set rounds land near the %s share',
    async difficulty => {
      const realized = await realizedFraction(BLITZ, difficulty)
      expect(realized).toBeGreaterThan(DIFFICULTY_SHARE[difficulty] - BAND)
      expect(realized).toBeLessThan(DIFFICULTY_SHARE[difficulty] + BAND)
    }
  )

  // Both grade guess ZERO — a decoy submitted first throws away a won round.
  it.each(['easy', 'normal', 'hard'] as const)(
    'ghost-state grades the answer, not a decoy, at %s',
    async difficulty => {
      const realized = await realizedFraction(GHOST, difficulty)
      expect(realized).toBeGreaterThan(DIFFICULTY_SHARE[difficulty] - BAND)
    }
  )

  it.each(['easy', 'normal', 'hard'] as const)(
    'trend-race grades the answer, not a decoy, at %s',
    async difficulty => {
      const realized = await realizedFraction(TREND, difficulty)
      expect(realized).toBeGreaterThan(DIFFICULTY_SHARE[difficulty] - BAND)
    }
  )

  // The regression that scored a flat zero at every difficulty: a share-sized
  // PREFIX of `optimalPath` carries the start country and never bridges.
  it('completes a traversal route often enough to bank real points', async () => {
    const rules = {
      variant: 'world',
      difficulty: 'hard',
      includeMicroNations: false,
    } as unknown as Parameters<typeof pickTraversal>[0]
    const picked = pickTraversal(rules)
    expect(picked).toBeDefined()

    const challenge: TraversalChallenge = {
      _type: 'traversal-challenge',
      start: picked!.start,
      target: picked!.target,
      optimalHops: picked!.optimalHops,
      optimalPath: picked!.optimalPath,
      maximumClicks: 12,
      maximumPoints: 12,
    } as TraversalChallenge

    const realized = await realizedFraction(challenge, 'hard')
    expect(realized).toBeGreaterThan(0)
    expect(realized).toBeGreaterThan(DIFFICULTY_SHARE.hard - BAND)
  })
})
