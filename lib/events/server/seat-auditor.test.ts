import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'
import { STALE_RENDER_MS, SEAT_OVERDUE_SLACK_MS, type SeatViolation } from '~~/lib/seat-invariants'
import { seatSubject } from '~~/lib/seat-transitions'
import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import type { SeatRender, SeatVerdict } from '~~/types/seat.types'
import { auditGame, reportViolations } from './seat-auditor'
import { armSeat, dropArmedTimersForTests } from './seat-cursor'
import { recordSeatRender } from './seat-journal'
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

const buildGame = (seats: Player[]): Game =>
  ({
    id: uniqueGameId('audit'),
    host: seats[0]!.id,
    started: true,
    length: 'short',
    variant: 'world',
    difficulty: 'normal',
    tiles: [],
    players: Object.fromEntries(seats.map(seat => [seat.id, seat])),
    rounds: [
      {
        groupChallenge: TWO_TRUTHS,
        groupAnswers: {},
        playerTurns: {},
        playStartsAt: Date.now(),
        deadline: Date.now() + 60_000,
      },
    ],
  }) as unknown as Game

const renderOf = (seat: Player, at: number, subject = seat.cursor.subject): SeatRender => ({
  viewer: seat.id,
  seat: seat.id,
  seq: seat.cursor.seq,
  step: seat.cursor.step,
  subject,
  view: 'round',
  at,
})

type LogSpy = MockInstance<typeof console.log>

const auditLines = (spy: LogSpy): (SeatViolation & { game: string; at: number })[] =>
  spy.mock.calls
    .map(([line]) => String(line))
    .filter(line => line.startsWith('seat-audit '))
    .map(line => JSON.parse(line.slice('seat-audit '.length)))

describe('seat auditor', () => {
  let table: TestTable | undefined
  let log: LogSpy

  beforeEach(() => {
    vi.stubEnv('SEAT_JOURNAL_LOG', '1')
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    table?.dispose()
    table = undefined
    dropArmedTimersForTests()
    log.mockRestore()
    vi.unstubAllEnvs()
  })

  const open = async (seats: Player[]) => {
    const game = buildGame(seats)
    table = await createTestTable(game)
    return { game, table }
  }

  it('reports a connected seat that rendered another subject as stale-render, once', async () => {
    const now = Date.now()
    const entered = now - STALE_RENDER_MS - 2000
    const fresh = testSeat('fresh', 'round', {
      cursor: testCursor('round', { enteredAt: entered }),
    })
    const stale = testSeat('stale', 'round', {
      cursor: testCursor('round', { enteredAt: entered, subject: seatSubject.round(1) }),
    })
    const { game, table } = await open([fresh, stale])
    await recordSeatRender(table.redis, game.id, renderOf(fresh, now - 100))
    await recordSeatRender(table.redis, game.id, renderOf(stale, now - 100, seatSubject.round(0)))

    const violations = await auditGame(table.redis, game, ['fresh', 'stale'], now)
    expect(violations).toEqual([expect.objectContaining({ kind: 'stale-render', seat: 'stale' })])

    reportViolations(game.id, violations)
    const lines = auditLines(log)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ game: game.id, kind: 'stale-render', seat: 'stale' })
  })

  it('never blames a render on a seat with no live socket', async () => {
    const now = Date.now()
    const seat = testSeat('away', 'round', {
      cursor: testCursor('round', { enteredAt: now - 60_000 }),
    })
    const { game, table } = await open([seat])
    expect(await auditGame(table.redis, game, [], now)).toEqual([])
    expect((await auditGame(table.redis, game, ['away'], now)).map(entry => entry.kind)).toEqual([
      'stale-render',
    ])
  })

  it('gives a fresh step its render grace', async () => {
    const now = Date.now()
    const seat = testSeat('new', 'round', { cursor: testCursor('round', { enteredAt: now - 500 }) })
    const { game, table } = await open([seat])
    expect(await auditGame(table.redis, game, ['new'], now)).toEqual([])
  })

  it('reports an overdue hold, and an unarmed one', async () => {
    const now = Date.now()
    const subject = seatSubject.gate(1, 0)
    const verdict: SeatVerdict = {
      kind: 'gate',
      subject,
      correct: true,
      timedOut: false,
      steps: 1,
      browsable: false,
    }
    const seat = testSeat('late', 'gate-verdict', {
      cursor: testCursor('gate-verdict', {
        subject,
        verdict,
        enteredAt: now - 40_000,
        holdUntil: now - SEAT_OVERDUE_SLACK_MS - 10_000,
      }),
    })
    const { game, table } = await open([seat])
    const kinds = (await auditGame(table.redis, game, [], now)).map(entry => entry.kind).sort()
    expect(kinds).toEqual(['overdue', 'unarmed'])
  })

  it('reports a waiting seat with no timer as unarmed, and clears once it is armed', async () => {
    const now = Date.now()
    const seat = testSeat('idle', 'scores', {
      cursor: testCursor('scores', { enteredAt: now, deadline: now + 60_000 }),
    })
    const { game, table } = await open([seat])
    expect(await auditGame(table.redis, game, [], now)).toEqual([
      expect.objectContaining({ kind: 'unarmed', seat: 'idle' }),
    ])

    armSeat({ io: table.io, redis: table.ctx('idle').redis }, game, game.players.idle!)
    expect(table.armed()).toEqual([expect.objectContaining({ seat: 'idle', kind: 'scores-cap' })])
    expect(await auditGame(table.redis, game, [], now)).toEqual([])
  })

  it('logs a standing fault once across repeated sweeps', async () => {
    const start = Date.now()
    const seat = testSeat('stuck', 'walk', {
      cursor: testCursor('walk', { enteredAt: start - 60_000, holdUntil: start - 30_000 }),
    })
    const { game, table } = await open([seat])

    for (const tick of [0, 10_000, 20_000, 30_000]) {
      reportViolations(game.id, await auditGame(table.redis, game, ['stuck'], start + tick))
    }
    const lines = auditLines(log)
    expect(lines.map(line => line.kind).sort()).toEqual(['overdue', 'stale-render', 'unarmed'])
    expect(new Set(lines.map(line => line.game))).toEqual(new Set([game.id]))
  })

  it('logs the same fault again for another game', () => {
    const fault = { kind: 'unarmed' as const, seat: 'p1', detail: 'walk seq 3 has no timer' }
    reportViolations(uniqueGameId('audit'), [fault])
    reportViolations(uniqueGameId('audit'), [fault])
    expect(auditLines(log)).toHaveLength(2)
  })

  it('logs a new fault on a seat that already has one', () => {
    const gameId = uniqueGameId('audit')
    reportViolations(gameId, [{ kind: 'unarmed', seat: 'p1', detail: 'walk seq 3 has no timer' }])
    reportViolations(gameId, [{ kind: 'unarmed', seat: 'p1', detail: 'walk seq 4 has no timer' }])
    expect(auditLines(log)).toHaveLength(2)
  })

  it('stays quiet under the test runner unless asked to log', () => {
    vi.stubEnv('SEAT_JOURNAL_LOG', '')
    reportViolations(uniqueGameId('audit'), [{ kind: 'unarmed', detail: 'quiet' }])
    expect(auditLines(log)).toEqual([])
  })
})
