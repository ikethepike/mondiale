import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOARD_TO_CHALLENGE_HOLD_MS,
  CLASSIC_SETTLE_SLACK_MS,
  GATE_RESULT_HOLD_MS,
  INDIVIDUAL_GATE_CAP_MS,
  NEW_ROUND_PAUSE_MS,
  revealBudgetMsFor,
  SEAT_DEADLINE_GRACE_MS,
  STEP_INTERVAL_MS,
  WALK_LEAD_MS,
} from '~~/lib/round-beats'
import { seatSubject } from '~~/lib/seat-transitions'
import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { ClientEventData } from '~~/types/events.types'
import type { Game, PlayerMove, Tile } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { unsentRevFor } from '../server-side'
import { scheduleClassicSettle } from './classic-rounds'
import { setDealReplay } from './moves'
import { dropArmedTimersForTests, rearmSeats } from './seat-cursor'
import {
  createClientMirror,
  createTestTable,
  uniqueGameId,
  type CapturedEmit,
  type TestTable,
} from './test-table'
import { testCursor, testSeat } from './test-seat'

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
  statements: [],
  lieIndex: 0,
  lieSource: 'NO',
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

const buildGame = (players: Player[], challenge: RoundChallenge): Game =>
  ({
    id: uniqueGameId('breadth'),
    host: players[0]!.id,
    started: true,
    variant: 'world',
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
}

const echo = async (table: TestTable, id: string) => {
  const { subject, seq } = (await table.read()).players[id]!.cursor
  return { subject, seq }
}

let tables: TestTable[] = []
const open = async (game: Game) => {
  const table = await createTestTable(game)
  tables.push(table)
  return { table, joined: await table.read() }
}

beforeEach(() => {
  vi.useFakeTimers()
  setDealReplay({
    moves: seatId => (seatId === 'a' ? [gate] : [{ endTile: TILES[2]! }]),
    round: () => TWO_TRUTHS,
    finalReplacement: () => null,
  })
})
afterEach(() => {
  setDealReplay(undefined)
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
      clientScore: 10,
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
      clientScore: 7,
      ...(await echo(table, 'a')),
    } as ClientEventData)
    expect(table.emits.map(emitted => emitted.event)).toEqual(['seat-advanced'])
    expect(expectConvergence(table, joined, 'b').players.a!.cursor.step).toBe('scores')
    await expectNothingUnsent(table)
  })

  it('a stale answer moves nothing but the resync', async () => {
    const { table, joined } = await open(
      buildGame([testSeat('a', 'scores'), testSeat('b', 'round')], TWO_TRUTHS)
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
        TWO_TRUTHS
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
    expect(client.rounds[0]!.playerTurns.a?.blocked).toBeUndefined()
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
        TWO_TRUTHS
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
