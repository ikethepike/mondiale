import { seatInvariantViolations } from '~~/lib/seat-invariants'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOARD_TO_CHALLENGE_HOLD_MS,
  CLASSIC_SETTLE_SLACK_MS,
  GATE_RESULT_HOLD_MS,
  GROUP_SCORES_CAP_MS,
  INDIVIDUAL_GATE_CAP_MS,
  NEW_ROUND_PAUSE_MS,
  revealBudgetMsFor,
  SEAT_DEADLINE_GRACE_MS,
  STEP_INTERVAL_MS,
  WALK_LEAD_MS,
} from '~~/lib/round-beats'
import { seatSubject } from '~~/lib/seat-transitions'
import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import { hasGame, type ClientEventData } from '~~/types/events.types'
import type { Game, PlayerMove, Tile } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { unsentRevFor } from '../server-side'
import { scheduleClassicSettle } from './classic-rounds'
import { setDrawSource } from './draws'
import { dropArmedTimersForTests, rearmSeats } from './seat-cursor'
import {
  createClientMirror,
  createTestTable,
  uniqueGameId,
  type CapturedEmit,
  type TestTable,
} from './test-table'
import { wireGame } from '~~/lib/wire-view'
import {
  FLAG_PICK_GATE,
  passingFinalAnswer,
  scriptDraws,
  testCursor,
  testGauntlet,
  testSeat,
  WITHHELD_FINALS,
  WITHHELD_GATES,
} from './test-seat'

/**
 * The protocol-convergence harness. A client rebuilds its game from the emit
 * stream through the REAL appliers behind the REAL dispatch gate; after EVERY
 * emit it must equal the server truth that emit carried, no seat's cursor may
 * ever step backwards, and nothing the server saved may stay off the wire.
 * A write wider than its event delivers fails here with the paths named.
 */

const TWO_TRUTHS = {
  _type: 'two-truths-challenge',
  country: 'SE',
  cards: [],
  durationSeconds: 25,
  maximumPoints: 10,
} as unknown as RoundChallenge
const CAPITAL_GUESS = {
  _type: 'capital-guess-challenge',
  country: 'SE',
  capital: 'Stockholm',
  options: [],
  durationSeconds: 20,
  maximumPoints: 10,
} as unknown as RoundChallenge

const tile = (position: number, type: Tile['type'] = 'normal'): Tile => ({ position, type })
const TILES = Array.from({ length: 14 }, (_, index) => tile(index, index === 6 ? 'flag' : 'normal'))
const gate: PlayerMove = {
  endTile: TILES[6]!,
  challenge: {
    _type: 'individual-challenge',
    id: 'flag',
    country: 'FI',
    variant: 'find',
  } as PlayerMove['challenge'],
}

const SCORED_TURN = {
  points: { scored: 1, maximum: 10 },
} as Game['rounds'][number]['playerTurns'][string]

const buildGame = (
  players: Player[],
  challenge: RoundChallenge,
  round: Partial<Game['rounds'][number]> = {}
): Game =>
  ({
    id: uniqueGameId('breadth'),
    host: players[0]!.id,
    started: true,
    regions: [],
    difficulty: 'normal',
    tiles: TILES,
    players: Object.fromEntries(players.map(player => [player.id, player])),
    rounds: [
      {
        groupChallenge: challenge,
        groupAnswers: {},
        playerTurns: {},
        playStartsAt: Date.now(),
        deadline: Date.now() + 25_000,
        ...round,
      },
    ],
  }) as unknown as Game

/** Deep-diff two values into dotted paths. */
const diffPaths = (a: unknown, b: unknown, path = ''): string[] => {
  if (a === b) return []
  if (typeof a !== typeof b || a === null || b === null) return [path || '(root)']
  if (typeof a !== 'object') return Object.is(a, b) ? [] : [path || '(root)']
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)])
  return [...keys].flatMap(key =>
    diffPaths(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      path ? `${path}.${key}` : key
    )
  )
}

/**
 * Replay the stream into a fresh client and hold it to server truth after
 * every emit, then replay it all again: every stale emit must be a no-op.
 */
const expectConvergence = (table: TestTable, joined: Game, viewer = 'a') => {
  const mirror = createClientMirror(viewer, joined)
  const seqs: Record<string, number> = {}
  table.emits.forEach((emitted: CapturedEmit, index) => {
    mirror.apply(emitted)
    if (!('game' in emitted.payload)) return
    const divergent = diffPaths(mirror.game(), emitted.payload.game)
    expect(
      divergent,
      `after emit #${index} ('${emitted.event}') the client diverges at: ${divergent.join(', ')}`
    ).toEqual([])
    expect(
      seatInvariantViolations(emitted.payload.game, {
        now: emitted.payload.serverNow ?? Date.now(),
      }),
      `the game emitted at #${index} ('${emitted.event}') breaks an invariant`
    ).toEqual([])
    for (const [id, seat] of Object.entries(mirror.game().players)) {
      expect(seat.cursor.seq, `${id} stepped backwards at emit #${index}`).toBeGreaterThanOrEqual(
        seqs[id] ?? 0
      )
      seqs[id] = seat.cursor.seq
    }
  })
  const settled = structuredClone(mirror.game())
  for (const emitted of table.emits) mirror.apply(emitted)
  expect(diffPaths(mirror.game(), settled), 'a replayed stream moved the client').toEqual([])
  return mirror.game()
}

/** What the server saved is on the wire: the last emit IS the stored game. */
const expectNothingUnsent = async (table: TestTable) => {
  expect(unsentRevFor(table.id)).toBeUndefined()
  const last = [...table.emits].reverse().find(emitted => 'game' in emitted.payload)
  const stored = await table.read()
  if (last && 'game' in last.payload) expect(last.payload.game.rev).toBe(stored.rev)
  expect(seatInvariantViolations(stored, { now: Date.now(), armed: table.armed() })).toEqual([])
}

const echo = async (table: TestTable, id: string) => {
  const { subject, seq } = (await table.read()).players[id]!.cursor
  return { subject, seq }
}

let tables: TestTable[] = []
const open = async (game: Game) => {
  const table = await createTestTable(game)
  tables.push(table)
  return { table, joined: wireGame(await table.read()) }
}

beforeEach(() => {
  vi.useFakeTimers()
  scriptDraws({
    moves: seatId => (seatId === 'a' ? [gate] : [{ endTile: TILES[2]! }]),
    round: () => TWO_TRUTHS,
    finalReplacement: () => null,
  })
})
afterEach(() => {
  setDrawSource(undefined)
  dropArmedTimersForTests()
  for (const table of tables) table.dispose()
  tables = []
  vi.useRealTimers()
})

describe('every emit leaves the client equal to server truth', () => {
  it('a verdict hold, its end, and the settle sweeping an absentee', async () => {
    const { table, joined } = await open(
      buildGame([testSeat('a', 'round'), testSeat('b', 'round')], TWO_TRUTHS)
    )
    scheduleClassicSettle(table.ctx('a'), await table.read())
    await table.send('a', {
      event: 'submit-group-challenge-answers',
      ranking: ['SE'],
      ...(await echo(table, 'a')),
    } as ClientEventData)
    expect(table.emits.at(-1)?.event).toBe('seat-advanced')
    await vi.advanceTimersByTimeAsync(revealBudgetMsFor(TWO_TRUTHS) + 10)
    await expectNothingUnsent(table)
    await vi.advanceTimersByTimeAsync(
      25_000 + revealBudgetMsFor(TWO_TRUTHS) + CLASSIC_SETTLE_SLACK_MS
    )
    const client = expectConvergence(table, joined, 'b')
    expect(client.players.b!.cursor.step).toBe('scores')
    expect(client.rounds[0]!.groupAnswers.b).toBeDefined()
    await expectNothingUnsent(table)
  })

  it('a hold-0 answer rides one seat slice straight to the scorecard', async () => {
    const { table, joined } = await open(
      buildGame([testSeat('a', 'round'), testSeat('b', 'round')], CAPITAL_GUESS)
    )
    await table.send('a', {
      event: 'submit-group-challenge-answers',
      ranking: [],
      ...(await echo(table, 'a')),
    } as ClientEventData)
    expect(table.emits.map(emitted => emitted.event)).toEqual(['seat-advanced'])
    expect(expectConvergence(table, joined, 'b').players.a!.cursor.step).toBe('scores')
    await expectNothingUnsent(table)
  })

  it('a stale answer moves nothing but the resync', async () => {
    const { table, joined } = await open(
      buildGame(
        [
          testSeat('a', 'scores', {
            cursor: testCursor('scores', { deadline: Date.now() + GROUP_SCORES_CAP_MS }),
          }),
          testSeat('b', 'round'),
        ],
        TWO_TRUTHS
      )
    )
    await table.send('a', {
      event: 'submit-group-challenge-answers',
      ranking: ['SE'],
      subject: seatSubject.round(0),
      seq: 1,
    } as ClientEventData)
    expect(table.emits.map(emitted => emitted.event)).toEqual(['update'])
    expect((await table.read()).rounds[0]!.groupAnswers.a).toBeUndefined()
    expectConvergence(table, joined)
  })

  it('a walk, a landing, a gate cap and its blocked record all reach every client', async () => {
    const { table, joined } = await open(
      buildGame(
        [
          testSeat('a', 'scores', {
            moves: [gate, { endTile: TILES[9]! }],
            cursor: testCursor('scores', { deadline: Date.now() + 90_000 }),
          }),
          testSeat('b', 'round'),
        ],
        TWO_TRUTHS,
        // The bystander's round outlasts the whole walk.
        { deadline: Date.now() + 10 * 60_000, playerTurns: { a: SCORED_TURN } }
      )
    )
    await table.send('a', { event: 'enter-movement-phase', ...(await echo(table, 'a')) })
    await vi.advanceTimersByTimeAsync(
      WALK_LEAD_MS + 6 * STEP_INTERVAL_MS + BOARD_TO_CHALLENGE_HOLD_MS
    )
    expect((await table.read()).players.a!.cursor.step).toBe('gate')
    await vi.advanceTimersByTimeAsync(
      INDIVIDUAL_GATE_CAP_MS + SEAT_DEADLINE_GRACE_MS + GATE_RESULT_HOLD_MS + 100
    )

    const client = expectConvergence(table, joined, 'b')
    expect(client.players.a!.cursor.step).toBe('settled')
    expect(client.rounds[0]!.playerTurns.a?.blocked).toEqual({ atTile: 6, forfeitedSteps: 4 })
    // The pawn's position only ever climbed on the watcher's screen.
    const positions = table.emits
      .filter(emitted => 'game' in emitted.payload)
      .map(emitted =>
        'game' in emitted.payload ? emitted.payload.game.players.a!.currentPosition : 0
      )
    expect(positions).toEqual([...positions].sort((x, y) => x - y))
    await expectNothingUnsent(table)
  })

  it('the next round is dealt, saved and revealed in one emit', async () => {
    const { table, joined } = await open(
      buildGame(
        [
          testSeat('a', 'walk', {
            moves: [{ endTile: TILES[1]! }],
            cursor: testCursor('walk', { holdUntil: Date.now() + 100 }),
          }),
          testSeat('b', 'settled'),
        ],
        TWO_TRUTHS,
        { playerTurns: { a: SCORED_TURN, b: SCORED_TURN } }
      )
    )
    rearmSeats(table.ctx('a'), await table.read())
    await vi.advanceTimersByTimeAsync(100 + 2 * STEP_INTERVAL_MS)
    const owed = await table.read()
    expect(owed.nextRoundAt).toBeDefined()
    expect(owed.rounds).toHaveLength(1)
    await expectNothingUnsent(table)

    await vi.advanceTimersByTimeAsync(NEW_ROUND_PAUSE_MS + 10)
    const reveal = table.emits.at(-1)!
    expect(reveal.event).toBe('new-round')
    const client = expectConvergence(table, joined, 'b')
    expect(client.rounds).toHaveLength(2)
    expect(client.players.b!.cursor).toMatchObject({ step: 'round', subject: seatSubject.round(1) })
    await expectNothingUnsent(table)
  })
})

describe('the wire carries the question a seat is on, and its answer only with the verdict', () => {
  beforeAll(() => import('~~/lib/challenges/final-challenge'))

  const SEALED = { _type: 'sealed-challenge' }
  const BEHIND: PlayerMove = { ...FLAG_PICK_GATE, endTile: tile(10, 'flag') }
  /** The seat answers once on a stale subject (the resync) and once for real. */
  const seatOnWire = (table: TestTable) => {
    expect(table.emits.map(emitted => emitted.event)).toEqual(['update', 'seat-advanced'])
    return table.emits.map(({ payload }) => (hasGame(payload) ? payload.game.players.a! : null!))
  }

  it.each(WITHHELD_GATES)('$name gate', async ({ move, keys, answer }) => {
    const { table } = await open(
      buildGame(
        [
          testSeat('a', 'gate', {
            moves: [move, BEHIND],
            cursor: testCursor('gate', { deadline: Date.now() + INDIVIDUAL_GATE_CAP_MS }),
          }),
          testSeat('b', 'round'),
        ],
        TWO_TRUTHS
      )
    )
    const stale = { subject: seatSubject.gate(1, 99), seq: 1 }
    await table.send('a', {
      event: 'submit-individual-challenge-answer',
      isoCode: answer,
      ...stale,
    })
    await table.send('a', {
      event: 'submit-individual-challenge-answer',
      isoCode: answer,
      ...(await echo(table, 'a')),
    })

    const [asked, judged] = seatOnWire(table)
    for (const key of keys) expect(asked!.moves[0]!.challenge).not.toHaveProperty(key)
    expect(judged!.cursor.verdict).toMatchObject({ kind: 'gate', correct: true })
    expect(judged!.moves[0]!.challenge).toEqual(move.challenge)
    for (const seat of [asked, judged]) expect(seat!.moves[1]!.challenge).toEqual(SEALED)
  })

  it('a clock run out on screen forfeits at once, and the verdict brings the answer', async () => {
    const [{ move }] = WITHHELD_GATES
    const { table } = await open(
      buildGame(
        [
          testSeat('a', 'gate', {
            moves: [move],
            cursor: testCursor('gate', { deadline: Date.now() + INDIVIDUAL_GATE_CAP_MS }),
          }),
          testSeat('b', 'round'),
        ],
        TWO_TRUTHS
      )
    )
    await table.send('a', {
      event: 'submit-individual-challenge-answer',
      timedOut: true,
      ...(await echo(table, 'a')),
    })
    const [forfeited] = table.emits.map(({ payload }) => (hasGame(payload) ? payload.game : null!))
    expect(forfeited!.players.a!.cursor.verdict).toMatchObject({
      kind: 'gate',
      correct: false,
      timedOut: true,
      steps: 0,
    })
    expect(forfeited!.players.a!.moves[0]!.challenge).toEqual(move.challenge)
  })

  it.each(WITHHELD_FINALS)('$name gauntlet question', async ({ item, keys }) => {
    const { table } = await open(
      buildGame(
        [
          testSeat('a', 'final', {
            moves: [testGauntlet([item, WITHHELD_FINALS[0].item])],
            cursor: testCursor('final', { deadline: Date.now() + 60_000 }),
          }),
          testSeat('b', 'round'),
        ],
        TWO_TRUTHS
      )
    )
    const submittedAnswer = passingFinalAnswer(item)
    const stale = { subject: seatSubject.final(1, 9), seq: 1 }
    await table.send('a', { event: 'submit-final-challenge-answer', submittedAnswer, ...stale })
    await table.send('a', {
      event: 'submit-final-challenge-answer',
      submittedAnswer,
      ...(await echo(table, 'a')),
    })

    const [asked, judged] = seatOnWire(table).map(seat => {
      const gauntlet = seat!.moves[0]!.challenge
      return { seat, questions: gauntlet?._type === 'final-challenge' ? gauntlet.challenges : [] }
    })
    expect(asked!.questions).toHaveLength(1)
    for (const key of keys) expect(asked!.questions[0]).not.toHaveProperty(key)
    expect(judged!.seat!.cursor.verdict).toMatchObject({ kind: 'final', correct: true })
    expect(judged!.questions).toEqual([item])
  })
})
