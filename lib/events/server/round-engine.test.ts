import { describe, expect, it } from 'vitest'
import { settleRoundScores } from './round-engine'
import { enterScores } from './seat-exits'
import { testSeat } from './test-seat'
import type { Game, Round } from '~~/types/game.types'
import type { SeatStep } from '~~/types/seat.types'

const buildGame = (steps: { [playerId: string]: SeatStep }): { game: Game; round: Round } => {
  const round: Round = { groupChallenge: {}, groupAnswers: {}, playerTurns: {} } as Round
  const game = {
    id: 'test-game',
    tiles: [],
    players: Object.fromEntries(
      Object.entries(steps).map(([id, step]) => [id, testSeat(id, step)])
    ),
    rounds: [round],
  } as unknown as Game
  return { game, round }
}

describe('settleRoundScores', () => {
  it('advances every round-bound seat, not just the ones in the round', async () => {
    // A seat that rejoined into 'tutorial' (the round-1 seam) is scored on
    // the round like everyone else — leaving it parked would hold
    // `tableIsSettled` false forever and freeze the table.
    const { game, round } = buildGame({ a: 'round', b: 'tutorial', c: 'round-verdict' })
    game.players.c.cursor.holdUntil = Date.now() + 1000
    game.players.c.cursor.verdict = {
      kind: 'round',
      subject: game.players.c.cursor.subject,
      scored: 1,
      maximum: 10,
    }
    await settleRoundScores({
      game,
      round,
      order: ['a', 'b', 'c'],
      scores: { a: { scored: 3, maximum: 10 } },
      maximumPoints: 10,
    })
    for (const id of ['a', 'b', 'c']) {
      expect(game.players[id].cursor.step).toBe('scores')
      expect(game.players[id].cursor.cause).toBe('table:settle')
      expect(game.players[id].cursor.deadline).toBeGreaterThan(Date.now())
    }
    expect(round.playerTurns.b.points).toEqual({ scored: 0, maximum: 10 })
  })

  it('never re-walks a seat that already banked and moved on', async () => {
    // 'walk' and 'scores' seats are mid-walk — re-walking one is the
    // mid-round ejection class the step partition exists to prevent.
    const { game, round } = buildGame({ a: 'round', b: 'walk', c: 'scores' })
    const before = { b: { ...game.players.b.cursor }, c: { ...game.players.c.cursor } }
    await settleRoundScores({
      game,
      round,
      order: ['a', 'b', 'c'],
      scores: {},
      maximumPoints: 10,
    })
    expect(game.players.a.cursor.step).toBe('scores')
    expect(game.players.b.cursor).toEqual(before.b)
    expect(game.players.c.cursor).toEqual(before.c)
  })

  it('still banks answers and points for seats it does not walk', async () => {
    const { game, round } = buildGame({ a: 'settled' })
    await settleRoundScores({ game, round, order: ['a'], scores: {}, maximumPoints: 10 })
    expect(round.groupAnswers.a).toEqual({ submitted: [], correct: [] })
    expect(round.playerTurns.a.points).toEqual({ scored: 0, maximum: 10 })
    expect(game.players.a.cursor.step).toBe('settled')
  })
})

describe('enterScores', () => {
  it('flips to the scorecard and bumps the walk generation', async () => {
    const { game } = buildGame({ a: 'round' })
    const player = game.players.a
    const { seq, walk } = player.cursor
    await enterScores(game, player, 2, 'table:settle')
    expect(player.cursor.step).toBe('scores')
    expect(player.cursor.walk).toBe(walk + 1)
    expect(player.cursor.leg).toBe(0)
    expect(player.cursor.seq).toBe(seq + 1)
    expect(player.cursor.deadline).toBeGreaterThan(Date.now())
  })
})
