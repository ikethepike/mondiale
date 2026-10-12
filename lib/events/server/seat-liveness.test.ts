import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLASSIC_SETTLE_SLACK_MS, revealBudgetMsFor } from '~~/lib/round-beats'
import {
  ENGINE_STALL_MS,
  SEAT_OVERDUE_SLACK_MS,
  seatInvariantViolations,
  subjectStallMs,
} from '~~/lib/seat-invariants'
import { createPlayer } from '~~/lib/player'
import { latestRound } from '~~/lib/rounds'
import { generateTiles } from '~~/lib/tiles'
import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { seatFireAt } from '~~/lib/seat-transitions'
import { sweepGame } from './seat-auditor'
import { armSeat, armTable, dropArmedTimersForTests } from './seat-cursor'
import { testCursor, testSeat } from './test-seat'
import { createTestTable, type TestTable, uniqueGameId, warmDeferredModules } from './test-table'

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
    regions: [],
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

  it('is re-armed by the auditor’s sweep, and the seat moves on with no one rejoining', async () => {
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

    await sweepGame({ io: table.io, redis: table.redis as never }, await table.read(), [])
    await vi.advanceTimersByTimeAsync(10)
    expect((await table.read()).players.parked!.cursor.step).toBe('walk')
  })

  it('is healed by the sweep when its body threw part-way (the save failed)', async () => {
    const seat = testSeat('parked', 'scores', {
      cursor: testCursor('scores', { deadline: Date.now() + 1000 }),
    })
    const game = buildGame([seat])
    table = await createTestTable(game)
    armSeat(table.ctx(seat.id), game, seat)
    const set = table.redis.set.bind(table.redis)
    let failing = true
    table.redis.set = async (key: string, value: unknown) => {
      if (failing && key === game.id) throw new Error('upstash blip')
      return set(key, value)
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await vi.advanceTimersByTimeAsync(
      seatFireAt(seat.cursor)! - Date.now() + SEAT_OVERDUE_SLACK_MS + 10
    )
    failing = false
    expect((await table.read()).players.parked!.cursor.step).toBe('scores')

    await sweepGame({ io: table.io, redis: table.redis as never }, await table.read(), [])
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

  it("clocks a Government verdict hold by its own end, not the spent beat's deadline", () => {
    const seat = testSeat('waiting', 'round')
    const holdUntil = now + 40_000
    const engine = {
      _type: 'government-challenge',
      state: { deadline: now, turn: 1, beat: 'party', verdict: { holdUntil } },
    }
    const game = buildGame([seat], { groupChallenge: engine as unknown as RoundChallenge })
    expect(kinds(game, { now: now + ENGINE_STALL_MS + 1 })).toEqual([])
    expect(kinds(game, { now: holdUntil + ENGINE_STALL_MS })).toEqual([])
    expect(kinds(game, { now: holdUntil + ENGINE_STALL_MS + 1 })).toEqual(['round-overdue'])
  })
})

describe('the round stall bound', () => {
  beforeAll(warmDeferredModules, 60_000)
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    dropArmedTimersForTests()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('holds a four-seat timeline round that every seat sits out', async () => {
    vi.stubEnv('FORCE_ROUND_TYPE', 'timeline')
    const seats = [0, 1, 2, 3].map(index => ({
      ...createPlayer(`idle-${index}`),
      name: `Idle ${index}`,
      ready: true,
    }))
    const id = uniqueGameId('stall')
    const game = {
      id,
      host: seats[0]!.id,
      started: false,
      length: 'short',
      regions: [],
      difficulty: 'normal',
      liveGuesses: true,
      challengeOverrides: {},
      tiles: generateTiles('short', id),
      rounds: [],
      players: Object.fromEntries(seats.map(seat => [seat.id, seat])),
    } as unknown as Game
    const table = await createTestTable(game, {
      connected: seats.map(seat => seat.id),
      captureEmits: false,
    })
    await table.send(game.host, { event: 'start-game' })

    let enteredAt: number | undefined
    let challenge: RoundChallenge | undefined
    for (const until = Date.now() + 20 * 60_000; Date.now() < until;) {
      await vi.advanceTimersByTimeAsync(1000)
      const state = await table.read()
      const { step } = state.players[game.host]!.cursor
      if (step === 'round' && enteredAt === undefined) {
        enteredAt = Date.now()
        challenge = latestRound(state)?.groupChallenge
      }
      if (enteredAt !== undefined && step !== 'round') break
    }
    table.dispose()

    expect(challenge?._type).toBe('timeline-challenge')
    const held = Date.now() - enteredAt!
    expect(held).toBeGreaterThan(subjectStallMs('round')!)
    expect(held).toBeLessThanOrEqual(subjectStallMs('round', challenge)!)
  })
})
