import { describe, expect, it } from 'vitest'
import { settleGroupRound } from './settle-group-round'
import { getCorrectRanking, scoreChallengeSubmission } from '~~/lib/challenges'
import type { Game, Round } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const ME = 'me'
const RIVAL = 'rival'
const DEALT: ISOCountryCode[] = ['FR', 'BR', 'JP', 'NG', 'SE']

const gameWith = (round: Round): Game =>
  ({
    id: 'settle-test',
    difficulty: 'normal',
    variant: 'world',
    tiles: [],
    rounds: [round],
    players: {
      [ME]: { id: ME, phase: 'group-challenge', currentPosition: 0, moves: [] },
      [RIVAL]: { id: RIVAL, phase: 'group-challenge', currentPosition: 0, moves: [] },
    },
  }) as unknown as Game

const rankingRound = (): Round =>
  ({
    groupChallenge: {
      _type: 'group-challenge',
      id: 'economics.gdpPerCapita',
      countriesPerPlayer: { [ME]: DEALT, [RIVAL]: DEALT },
    },
    groupAnswers: {},
    playerTurns: {},
  }) as unknown as Round

describe('settleGroupRound', () => {
  it('banks the same points the production scorer would', async () => {
    const round = rankingRound()
    const game = gameWith(round)
    const submitted: ISOCountryCode[] = ['SE', 'BR', 'JP', 'FR', 'NG']

    await settleGroupRound({ game, round, submission: { ranking: submitted }, meId: ME })

    expect(round.playerTurns[ME]!.points).toEqual(
      scoreChallengeSubmission({
        groupChallengeAccessorId: 'economics.gdpPerCapita',
        submittedRanking: submitted,
        dealtCountries: DEALT,
      })
    )
    expect(round.groupAnswers[ME]!.correct).toEqual(
      getCorrectRanking({ groupChallengeAccessorId: 'economics.gdpPerCapita', isoCodes: DEALT })
    )
  })

  it('grades every seat and flips the table to the scorecard', async () => {
    const round = rankingRound()
    const game = gameWith(round)

    await settleGroupRound({ game, round, submission: { ranking: DEALT }, meId: ME })

    expect(Object.keys(round.groupAnswers).sort()).toEqual([ME, RIVAL].sort())
    expect(Object.keys(round.playerTurns).sort()).toEqual([ME, RIVAL].sort())
    // A ranking round has no reveal hold, so the flip is synchronous.
    expect(game.players[ME]!.phase).toBe('group-scores')
    expect(game.players[RIVAL]!.phase).toBe('group-scores')
  })

  it('pays a dealt-in rival more than nothing, so the scorecard reads', async () => {
    const round = rankingRound()
    const game = gameWith(round)

    await settleGroupRound({ game, round, submission: { ranking: DEALT }, meId: ME })

    expect(round.playerTurns[RIVAL]!.points.scored).toBeGreaterThan(0)
  })

  it('settles once: a redelivered submit does not re-score', async () => {
    const round = rankingRound()
    const game = gameWith(round)

    await settleGroupRound({ game, round, submission: { ranking: DEALT }, meId: ME })
    const banked = round.playerTurns[ME]!.points.scored
    await settleGroupRound({ game, round, submission: { ranking: [] }, meId: ME })

    expect(round.playerTurns[ME]!.points.scored).toBe(banked)
  })
})
