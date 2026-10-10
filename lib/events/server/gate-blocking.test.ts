import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOARD_TO_CHALLENGE_HOLD_MS,
  GATE_RESULT_HOLD_MS,
  STEP_INTERVAL_MS,
  WALK_RESUME_LEAD_MS,
} from '~~/lib/round-beats'
import { gateLeapSteps, gatePot } from '~~/lib/scoring'
import { seatSubject } from '~~/lib/seat-transitions'
import type { Game, PlayerMove, Tile } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { Player } from '~~/types/player.type'
import { dropArmedTimersForTests, rearmSeats } from './seat-cursor'
import { enterScores } from './seat-exits'
import { createTestTable, uniqueGameId, type TestTable } from './test-table'
import { testCursor, testSeat } from './test-seat'

/**
 * Regression cover for the `milk-major-pot` incident: a failed gate must leave
 * a visible, durable trace (the `blocked` turn record) and settle the pawn at
 * gate − 1 — and nothing that is not this gate's own subject may judge or move it.
 */

const tile = (position: number, type: Tile['type'] = 'normal'): Tile => ({ position, type })

const gateMove = (position: number, variant = 'find'): PlayerMove => ({
  endTile: tile(position, 'flag'),
  challenge: {
    _type: 'individual-challenge',
    id: 'flag',
    country: 'FI',
    variant,
  } as PlayerMove['challenge'],
})

const onGate = (position: number, overrides: Partial<Player> = {}): Player =>
  testSeat('a', 'gate', {
    currentPosition: position - 1,
    cursor: testCursor('gate', {
      subject: seatSubject.gate(1, position),
      deadline: Date.now() + 90_000,
    }),
    ...overrides,
  })

const buildGame = (players: Player[]): Game =>
  ({
    id: uniqueGameId('gate'),
    host: 'a',
    started: true,
    variant: 'world',
    difficulty: 'hard',
    tiles: Array.from({ length: 12 }, (_, index) =>
      index === 5 || index === 8 ? tile(index, 'flag') : tile(index)
    ),
    players: Object.fromEntries(players.map(player => [player.id, player])),
    rounds: [
      {
        groupChallenge: { _type: 'group-challenge' },
        groupAnswers: {},
        playerTurns: { a: { points: { scored: 6, maximum: 21 } } },
      },
    ],
  }) as unknown as Game

let tables: TestTable[] = []
const open = async (game: Game) => {
  const table = await createTestTable(game)
  tables.push(table)
  rearmSeats(table.ctx('a'), game)
  return table
}
const seatA = async (table: TestTable) => (await table.read()).players.a!
const answer = async (table: TestTable, isoCode: ISOCountryCode) => {
  const { subject, seq } = (await seatA(table)).cursor
  await table.send('a', { event: 'submit-individual-challenge-answer', isoCode, subject, seq })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  dropArmedTimersForTests()
  for (const table of tables) table.dispose()
  tables = []
  vi.useRealTimers()
})

describe('a failed gate blocks the walk', () => {
  // A second, round-bound seat keeps the table unsettled so no new round is owed.
  const failedGame = () =>
    buildGame([onGate(5, { moves: [gateMove(5), gateMove(8)] }), testSeat('b', 'round')])

  it('holds the verdict, then records the block, forfeits every banked step and settles at gate − 1', async () => {
    const table = await open(failedGame())
    await answer(table, 'NO')

    const judged = await seatA(table)
    expect(judged.cursor.step).toBe('gate-verdict')
    expect(judged.cursor.verdict).toMatchObject({
      correct: false,
      timedOut: false,
      submitted: 'NO',
    })
    // Nothing is forfeited while the verdict holds.
    expect(judged.moves).toHaveLength(2)

    await vi.advanceTimersByTimeAsync(GATE_RESULT_HOLD_MS + 10)
    const settled = await seatA(table)
    expect((await table.read()).rounds[0]!.playerTurns.a!.blocked).toEqual({
      atTile: 5,
      forfeitedSteps: 4,
    })
    expect(settled.moves).toEqual([])
    expect(settled.currentPosition).toBe(4)
    expect(settled.cursor.step).toBe('settled')
  })

  it('leaves no block on a correct answer and pays the leap when the verdict ends', async () => {
    const table = await open(failedGame())
    await answer(table, 'FI')
    expect((await seatA(table)).currentPosition).toBe(4)

    await vi.advanceTimersByTimeAsync(GATE_RESULT_HOLD_MS + 10)
    const resumed = await seatA(table)
    expect((await table.read()).rounds[0]!.playerTurns.a!.blocked).toBeUndefined()
    expect(resumed.currentPosition).toBe(
      Math.min(4 + gateLeapSteps(undefined, undefined, gatePot('find')), 7)
    )
    expect(resumed.cursor.step).toBe('walk')
    expect(resumed.cursor.leg).toBe(1)
  })

  it('lands a leap that covers the next gate on that gate as a fresh subject', async () => {
    const table = await open(
      buildGame([onGate(5, { moves: [gateMove(5), gateMove(6)] }), testSeat('b', 'round')])
    )
    await answer(table, 'FI')
    await vi.advanceTimersByTimeAsync(GATE_RESULT_HOLD_MS + 10)
    // Clamped to the next gate's stop tile: nothing to walk, but the walk still announces.
    expect((await seatA(table)).currentPosition).toBe(5)
    expect((await seatA(table)).cursor.step).toBe('walk')

    await vi.advanceTimersByTimeAsync(WALK_RESUME_LEAD_MS + 10)
    expect((await seatA(table)).cursor).toMatchObject({
      step: 'arrive',
      subject: seatSubject.gate(1, 6),
    })
    await vi.advanceTimersByTimeAsync(BOARD_TO_CHALLENGE_HOLD_MS + 10)
    expect((await seatA(table)).cursor).toMatchObject({
      step: 'gate',
      subject: seatSubject.gate(1, 6),
    })
  })

  it('drops an answer echoing any other subject — a resync, never a verdict', async () => {
    const table = await open(failedGame())
    await table.send('a', {
      event: 'submit-individual-challenge-answer',
      isoCode: 'FI',
      subject: seatSubject.gate(1, 8),
      seq: 1,
    })
    expect((await seatA(table)).cursor.step).toBe('gate')
    expect(table.emits.at(-1)?.event).toBe('update')
  })
})

describe('the walk counter', () => {
  it('opens a new walk on every fresh deal, so a re-landing is never the same subject', async () => {
    const game = buildGame([testSeat('a', 'round')])
    const seat = game.players.a!
    await enterScores(game, seat, 0, 'table:settle', { moves: [gateMove(5)] })
    const first = seat.cursor.walk
    seat.cursor = testCursor('round', { walk: first })
    await enterScores(game, seat, 0, 'table:settle', { moves: [gateMove(5)] })
    expect(seat.cursor.walk).toBe(first + 1)
    expect(seatSubject.gate(first, 5)).not.toBe(seatSubject.gate(seat.cursor.walk, 5))
  })

  it('kills a timer armed for an older seq the moment the seat moves on', async () => {
    const table = await open(
      buildGame([onGate(5, { moves: [gateMove(5)] }), testSeat('b', 'round')])
    )
    const stale = await table.read()
    await answer(table, 'NO')
    // A rejoin re-arming from a snapshot taken before the answer.
    rearmSeats(table.ctx('a'), stale)
    await vi.advanceTimersByTimeAsync(GATE_RESULT_HOLD_MS + 10)
    expect((await seatA(table)).cursor.step).toBe('settled')
    await vi.advanceTimersByTimeAsync(120_000 + STEP_INTERVAL_MS)
    // The stale gate cap had its turn and changed nothing.
    expect((await seatA(table)).cursor.step).toBe('settled')
    expect((await table.read()).rounds[0]!.playerTurns.a!.blocked?.atTile).toBe(5)
  })
})
