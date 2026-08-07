import { describe, expect, it } from 'vitest'
import { advanceScoredSeat, settleRoundScores } from './round-engine'
import type { Game, Round } from '~~/types/game.types'
import type { Player, PlayerPhase } from '~~/types/player.type'

const seat = (id: string, phase: PlayerPhase): Player =>
  ({
    id,
    name: id,
    phase,
    moves: [],
    currentPosition: 0,
  }) as unknown as Player

const buildGame = (phases: { [playerId: string]: PlayerPhase }): { game: Game; round: Round } => {
  const round: Round = { groupChallenge: {}, groupAnswers: {}, playerTurns: {} } as Round
  const game = {
    id: 'test-game',
    tiles: [],
    players: Object.fromEntries(
      Object.entries(phases).map(([id, phase]) => [id, seat(id, phase)])
    ),
    rounds: [round],
  } as unknown as Game
  return { game, round }
}

describe('settleRoundScores', () => {
  it('advances every round-bound seat, not just group-challenge', async () => {
    // A seat that rejoined into 'tutorial' (the round-1 seam) is scored on
    // the round like everyone else — leaving it parked would hold
    // `tableIsSettled` false forever and freeze the table.
    const { game, round } = buildGame({ a: 'group-challenge', b: 'tutorial' })
    const advanced = await settleRoundScores({
      game,
      round,
      order: ['a', 'b'],
      scores: { a: { scored: 3, maximum: 10 } },
      maximumPoints: 10,
    })
    expect(advanced.sort()).toEqual(['a', 'b'])
    expect(game.players.a.phase).toBe('group-scores')
    expect(game.players.b.phase).toBe('group-scores')
    expect(round.playerTurns.b.points).toEqual({ scored: 0, maximum: 10 })
  })

  it('never re-walks a seat that already banked and moved on', async () => {
    // 'moving' and 'group-scores' seats are mid-walk — re-walking one is the
    // mid-round ejection class the phase partition exists to prevent.
    const { game, round } = buildGame({ a: 'group-challenge', b: 'moving', c: 'group-scores' })
    const advanced = await settleRoundScores({
      game,
      round,
      order: ['a', 'b', 'c'],
      scores: {},
      maximumPoints: 10,
    })
    expect(advanced).toEqual(['a'])
    expect(game.players.b.phase).toBe('moving')
    expect(game.players.c.phase).toBe('group-scores')
  })

  it('still banks answers and points for seats it does not walk', async () => {
    const { game, round } = buildGame({ a: 'movement-summary' })
    await settleRoundScores({ game, round, order: ['a'], scores: {}, maximumPoints: 10 })
    expect(round.groupAnswers.a).toEqual({ submitted: [], correct: [] })
    expect(round.playerTurns.a.points).toEqual({ scored: 0, maximum: 10 })
    expect(game.players.a.phase).toBe('movement-summary')
  })
})

describe('advanceScoredSeat', () => {
  it('flips to the scorecard and bumps the walk generation', async () => {
    const { game } = buildGame({ a: 'group-challenge' })
    const player = game.players.a
    await advanceScoredSeat(game, player, 2)
    expect(player.phase).toBe('group-scores')
    expect(player.walkSeq).toBe(1)
  })
})
