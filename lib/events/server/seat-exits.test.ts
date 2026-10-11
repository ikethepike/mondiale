import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FINAL_QUESTION_CAP_MS,
  FINAL_REVEAL_HOLD_MS,
  GATE_RESULT_HOLD_MS,
  SEAT_DEADLINE_GRACE_MS,
} from '~~/lib/round-beats'
import { SEAT_STEP_SPECS, seatFireAt, seatSubject } from '~~/lib/seat-transitions'
import type { FinalChallenge, FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { SEAT_STEPS } from '~~/types/seat.types'
import { setDrawSource } from './draws'
import { armedTimersFor, dropArmedTimersForTests, rearmSeats } from './seat-cursor'
import { createTestTable, type TestTable, uniqueGameId, warmDeferredModules } from './test-table'
import { scriptDraws, testCursor, testSeat } from './test-seat'

/**
 * Every timer a seat can be waiting on comes from its cursor alone — armed
 * once, re-armed identically after a restart, and dead the moment the seat
 * moves on. A seat only a click could move is a frozen room waiting to happen.
 */

const question = (country: string): FinalChallengeItem =>
  ({ _type: 'region-challenge', country, region: 'europe' }) as unknown as FinalChallengeItem

const gauntlet = (lives: number, countries = ['FR', 'DE']): FinalChallenge => ({
  _type: 'final-challenge',
  difficulty: 'normal',
  challenges: countries.map(question),
  lives,
  totalCount: countries.length,
  answeredCorrect: 0,
})

const onFinal = (lives: number) =>
  testSeat('a', 'final', {
    currentPosition: 9,
    moves: [{ endTile: { position: 10, type: 'final' }, challenge: gauntlet(lives) }],
    cursor: testCursor('final', {
      subject: seatSubject.final(1, 0),
      deadline: Date.now() + FINAL_QUESTION_CAP_MS,
    }),
  })

const buildGame = (players: Player[]): Game =>
  ({
    id: uniqueGameId('exits'),
    host: 'a',
    started: true,
    variant: 'world',
    difficulty: 'normal',
    tiles: Array.from({ length: 11 }, (_, position) => ({
      position,
      type: position === 10 ? 'final' : 'normal',
    })),
    players: Object.fromEntries(players.map(player => [player.id, player])),
    rounds: [
      {
        groupChallenge: { _type: 'group-challenge' },
        groupAnswers: {},
        playerTurns: { a: { points: { scored: 3, maximum: 10 } } },
      },
    ],
  }) as unknown as Game

let tables: TestTable[] = []
const open = async (players: Player[]) => {
  const game = buildGame(players)
  const table = await createTestTable(game)
  tables.push(table)
  rearmSeats(table.ctx('a'), game)
  return table
}
const seatA = async (table: TestTable) => (await table.read()).players.a!

beforeAll(warmDeferredModules, 60_000)

beforeEach(() => {
  vi.useFakeTimers()
  scriptDraws({
    moves: () => undefined,
    round: () => undefined,
    finalReplacement: () => question('PL'),
  })
})
afterEach(() => {
  setDrawSource(undefined)
  dropArmedTimersForTests()
  for (const table of tables) table.dispose()
  tables = []
  vi.useRealTimers()
})

describe('the final question cap', () => {
  it('burns a miss for an unanswered question, then deals the next once the verdict holds', async () => {
    const table = await open([onFinal(1), testSeat('b', 'round')])
    await vi.advanceTimersByTimeAsync(FINAL_QUESTION_CAP_MS + SEAT_DEADLINE_GRACE_MS + 10)
    const burned = await seatA(table)
    expect(burned.cursor.step).toBe('final-verdict')
    expect(burned.cursor.verdict).toMatchObject({
      timedOut: true,
      correct: false,
      knockedOut: false,
    })
    expect((burned.moves[0]!.challenge as FinalChallenge).lives).toBe(0)

    await vi.advanceTimersByTimeAsync(FINAL_REVEAL_HOLD_MS + 10)
    expect((await seatA(table)).cursor).toMatchObject({
      step: 'final',
      subject: seatSubject.final(1, 1),
    })
  })

  it('knocks out a seat with no lives left, holding the shorter verdict', async () => {
    const table = await open([onFinal(0), testSeat('b', 'round')])
    await vi.advanceTimersByTimeAsync(FINAL_QUESTION_CAP_MS + SEAT_DEADLINE_GRACE_MS + 10)
    expect((await seatA(table)).cursor.verdict).toMatchObject({ knockedOut: true })
    await vi.advanceTimersByTimeAsync(GATE_RESULT_HOLD_MS + 10)
    expect((await seatA(table)).cursor.step).toBe('settled')
  })

  it('dies once the question was answered', async () => {
    const table = await open([onFinal(1), testSeat('b', 'round')])
    const { subject, seq } = (await seatA(table)).cursor
    await table.send('a', {
      event: 'submit-final-challenge-answer',
      submittedAnswer: { _type: 'region-challenge', region: 'europe' },
      subject,
      seq,
    })
    await vi.advanceTimersByTimeAsync(FINAL_REVEAL_HOLD_MS + 10)
    const next = await seatA(table)
    expect(next.cursor.subject).toBe(seatSubject.final(1, 1))
    // The first question's cap moment passes over the second question untouched.
    await vi.advanceTimersByTimeAsync(FINAL_QUESTION_CAP_MS - FINAL_REVEAL_HOLD_MS)
    expect((await seatA(table)).cursor.seq).toBe(next.cursor.seq)
  })
})

describe('uniform rearm', () => {
  const shapes = SEAT_STEPS.map(step => {
    const stamps = {
      ...(SEAT_STEP_SPECS[step].requires.holdUntil ? { holdUntil: Date.now() + 5000 } : {}),
      ...(SEAT_STEP_SPECS[step].requires.deadline ? { deadline: Date.now() + 5000 } : {}),
    }
    return { step, cursor: testCursor(step, stamps) }
  })

  it('arms exactly one timer for every step with a timer exit, and none otherwise', async () => {
    for (const { step, cursor } of shapes) {
      dropArmedTimersForTests()
      const game = buildGame([testSeat('a', step, { cursor })])
      const ctx = (await createTestTable(game)).ctx('a')
      rearmSeats(ctx, game)
      rearmSeats(ctx, game)
      const armed = armedTimersFor(game.id).filter(timer => timer.seat === 'a')
      if (seatFireAt(cursor) === undefined) {
        expect(armed, step).toEqual([])
      } else {
        expect(armed, step).toHaveLength(1)
        expect(armed[0]).toMatchObject({ seq: cursor.seq, kind: SEAT_STEP_SPECS[step].timer })
      }
    }
  })

  it('arms the table reveal from a stamped next round, and never twice', async () => {
    const game = { ...buildGame([testSeat('a', 'settled')]), nextRoundAt: Date.now() + 2000 }
    const ctx = (await createTestTable(game)).ctx('a')
    rearmSeats(ctx, game)
    rearmSeats(ctx, game)
    expect(armedTimersFor(game.id).filter(timer => timer.kind === 'next-round')).toHaveLength(1)
  })
})
