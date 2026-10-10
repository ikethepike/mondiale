import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLASSIC_SETTLE_SLACK_MS, revealBudgetMsFor } from '~~/lib/round-beats'
import {
  ENGINE_STALL_MS,
  SEAT_OVERDUE_SLACK_MS,
  seatInvariantViolations,
} from '~~/lib/seat-invariants'
import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { seatFireAt } from '~~/lib/seat-transitions'
import { armSeat, armTable, dropArmedTimersForTests, rearmSeats } from './seat-cursor'
import { testCursor, testSeat } from './test-seat'
import { createTestTable, type TestTable, uniqueGameId } from './test-table'

const TWO_TRUTHS = {
  _type: 'two-truths-challenge',
  country: 'SE',
  statements: [],
  lieIndex: 0,
  lieSource: 'NO',
  durationSeconds: 25,
  maximumPoints: 10,
} as unknown as RoundChallenge

const buildGame = (seats: Player[], round: Partial<Game['rounds'][number]> = {}): Game =>
  ({
    id: uniqueGameId('liveness'),
    host: seats[0]!.id,
    started: true,
    length: 'short',
    variant: 'world',
    difficulty: 'normal',
    tiles: [],
    players: Object.fromEntries(seats.map(seat => [seat.id, seat])),
    rounds: [{ groupChallenge: TWO_TRUTHS, groupAnswers: {}, playerTurns: {}, ...round }],
  }) as unknown as Game

const kinds = (game: Game, evidence: Parameters<typeof seatInvariantViolations>[1]) =>
  seatInvariantViolations(game, evidence).map(violation => violation.kind)

describe('a timer whose body never ran', () => {
  let table: TestTable | undefined

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    table?.dispose()
    table = undefined
    dropArmedTimersForTests()
    vi.useRealTimers()
  })

  /** The fire lands in a Redis blip: the fresh fetch throws, the body never runs. */
  const blipOnFire = (open: TestTable, gameId: string) => {
    const get = open.redis.get.bind(open.redis)
    const blip = { on: true }
    open.redis.get = async (key: string) => {
      if (blip.on && key === gameId) throw new Error('upstash blip')
      return get(key)
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    return blip
  }

  it('is re-armed by the next rearm, and the seat moves on', async () => {
    const seat = testSeat('parked', 'scores', {
      cursor: testCursor('scores', { deadline: Date.now() + 1000 }),
    })
    const game = buildGame([seat])
    table = await createTestTable(game)
    const ctx = table.ctx(seat.id)
    armSeat(ctx, game, seat)

    const blip = blipOnFire(table, game.id)
    await vi.advanceTimersByTimeAsync(seatFireAt(seat.cursor)! - Date.now() + 10)
    blip.on = false
    expect((await table.read()).players.parked!.cursor.step).toBe('scores')
    await vi.advanceTimersByTimeAsync(SEAT_OVERDUE_SLACK_MS + 10)
    expect(kinds(await table.read(), { now: Date.now(), armed: table.armed() })).toContain(
      'unarmed'
    )

    rearmSeats(ctx, await table.read())
    await vi.advanceTimersByTimeAsync(10)
    expect((await table.read()).players.parked!.cursor.step).toBe('walk')
  })

  it('never lets a spent table entry block the next arm of the same reveal', async () => {
    const seat = testSeat('done', 'settled')
    const game = buildGame([seat], { playerTurns: { done: {} } } as never)
    game.nextRoundAt = Date.now() + 1000
    table = await createTestTable(game)
    armTable(table.ctx(seat.id), game)
    blipOnFire(table, game.id)
    const get = table.redis.get
    let fetches = 0
    table.redis.get = async (key: string) => {
      if (key === game.id) fetches++
      return get(key)
    }
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetches).toBe(1)

    armTable(table.ctx(seat.id), game)
    await vi.advanceTimersByTimeAsync(10)
    expect(fetches).toBe(2)
  })
})

describe('the table never waits with no exit', () => {
  const now = 1_800_000_000_000

  it('flags a next round that is overdue or has no timer', () => {
    const seat = testSeat('done', 'settled')
    const game = buildGame([seat], { playerTurns: { done: {} } } as never)
    game.nextRoundAt = now + 1000
    expect(kinds(game, { now })).toEqual([])
    expect(kinds(game, { now, armed: [] })).toEqual(['table-unarmed'])
    expect(
      kinds(game, {
        now,
        armed: [{ seat: '@table', seq: 0, kind: 'next-round', fireAt: now + 1000 }],
      })
    ).toEqual([])
    expect(kinds(game, { now: now + 1000 + SEAT_OVERDUE_SLACK_MS + 1 })).toEqual(['table-overdue'])
  })

  it('flags a classic round whose settle never came', () => {
    const seat = testSeat('waiting', 'round')
    const game = buildGame([seat], { playStartsAt: now - 30_000, deadline: now })
    const settleAt = now + revealBudgetMsFor(TWO_TRUTHS) + CLASSIC_SETTLE_SLACK_MS
    expect(kinds(game, { now: settleAt })).toEqual([])
    expect(kinds(game, { now: settleAt + SEAT_OVERDUE_SLACK_MS + 1 })).toEqual(['round-overdue'])
  })

  it('flags an engine round whose clock died, never a finished one', () => {
    const seat = testSeat('waiting', 'round')
    const engine = { _type: 'border-chain-challenge', state: { deadline: now, turn: 3 } }
    const game = buildGame([seat], { groupChallenge: engine as unknown as RoundChallenge })
    expect(kinds(game, { now: now + ENGINE_STALL_MS })).toEqual([])
    expect(kinds(game, { now: now + ENGINE_STALL_MS + 1 })).toEqual(['round-overdue'])
    engine.state = { ...engine.state, finished: true } as never
    expect(kinds(game, { now: now + ENGINE_STALL_MS + 1 })).toEqual([])
  })
})
