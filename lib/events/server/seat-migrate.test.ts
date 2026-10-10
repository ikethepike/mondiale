import { describe, expect, it } from 'vitest'
import { NEW_ROUND_PAUSE_MS, SERVER_CONTROLLED_CAPS, WALK_RESUME_LEAD_MS } from '~~/lib/round-beats'
import { seatInvariantViolations } from '~~/lib/seat-invariants'
import { seatFireAt, seatSubject, stepRequirementGap } from '~~/lib/seat-transitions'
import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { Game, PlayerMove, Tile } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import type { SeatStep } from '~~/types/seat.types'
import { useServerSideEvents } from '../server-side'
import './seat-cursor'
import { legacyCursorFor, migrateLegacySeats } from './seat-migrate'
import { createTestTable } from './test-table'

const NOW = 1_800_000_000_000
const LEGACY_FIELDS = [
  'phase',
  'resolving',
  'resultBeatUntil',
  'walkSeq',
  'walkIntro',
  'lastStepAt',
]

const TWO_TRUTHS = {
  _type: 'two-truths-challenge',
  country: 'SE',
  statements: [],
  lieIndex: 0,
  lieSource: 'NO',
  durationSeconds: 25,
  maximumPoints: 10,
} as unknown as RoundChallenge

const tile = (position: number, type: Tile['type'] = 'normal'): Tile => ({ position, type })
const TILES: Tile[] = Array.from({ length: 20 }, (_, index) =>
  tile(index, index === 0 ? 'start' : index === 9 ? 'flag' : index === 19 ? 'final' : 'normal')
)

const gateMove = (position: number): PlayerMove => ({
  endTile: TILES[position]!,
  challenge: {
    _type: 'individual-challenge',
    id: 'flag',
    country: 'FI',
    variant: 'find',
  } as PlayerMove['challenge'],
})
const finalMove = (turn: number): PlayerMove => ({
  endTile: TILES[19]!,
  challenge: {
    _type: 'final-challenge',
    challenges: [],
    turn,
  } as unknown as PlayerMove['challenge'],
})
const plainMove = (position: number): PlayerMove => ({ endTile: TILES[position]! })

type LegacyShape = Record<string, unknown>

const legacySeat = (id: string, legacy: LegacyShape, moves: PlayerMove[] = []): Player =>
  ({
    id,
    name: id,
    ready: true,
    color: 'blue',
    moves,
    currentPosition: 4,
    ...legacy,
  }) as unknown as Player

const legacyGame = (
  seats: Player[],
  options: { rounds?: number; banked?: string[]; turned?: string[]; extra?: LegacyShape } = {}
): Game => {
  const rounds = options.rounds ?? 2
  return {
    id: 'legacy-room',
    host: seats[0]!.id,
    started: true,
    length: 'short',
    variant: 'world',
    difficulty: 'normal',
    tiles: TILES,
    players: Object.fromEntries(seats.map(seat => [seat.id, seat])),
    rounds: Array.from({ length: rounds }, () => ({
      groupChallenge: TWO_TRUTHS,
      groupAnswers: Object.fromEntries((options.banked ?? []).map(id => [id, ['SE']])),
      playerTurns: Object.fromEntries(
        (options.turned ?? []).map(id => [id, { points: { scored: 6, maximum: 10 } }])
      ),
      playStartsAt: NOW - 10_000,
      deadline: NOW + 30_000,
    })),
    ...options.extra,
  } as unknown as Game
}

interface Fixture {
  name: string
  legacy: LegacyShape
  moves?: PlayerMove[]
  banked?: boolean
  turned?: boolean
  expect: { step: SeatStep; subject: string; holdUntil?: number; walk?: number; leg?: number }
}

const LAST_ROUND = 1

const FIXTURES: Fixture[] = [
  { name: 'naming', legacy: { phase: 'naming' }, expect: { step: 'lobby', subject: 'lobby' } },
  {
    name: 'waiting-for-game',
    legacy: { phase: 'waiting-for-game' },
    expect: { step: 'lobby', subject: 'lobby' },
  },
  {
    name: 'no phase at all',
    legacy: {},
    expect: { step: 'lobby', subject: 'lobby' },
  },
  {
    name: 'tutorial',
    legacy: { phase: 'tutorial' },
    expect: { step: 'tutorial', subject: 'tutorial' },
  },
  {
    name: 'group-challenge, unanswered',
    legacy: { phase: 'group-challenge', walkSeq: 2 },
    expect: { step: 'round', subject: seatSubject.round(LAST_ROUND), walk: 2 },
  },
  {
    name: 'group-challenge, answer banked but phase advance lost',
    legacy: { phase: 'group-challenge', resolving: true, walkSeq: 2 },
    banked: true,
    turned: true,
    expect: { step: 'round-verdict', subject: seatSubject.round(LAST_ROUND), holdUntil: NOW },
  },
  {
    name: 'group-scores',
    legacy: { phase: 'group-scores', walkSeq: 2 },
    banked: true,
    turned: true,
    expect: { step: 'scores', subject: seatSubject.scores(LAST_ROUND) },
  },
  {
    name: 'moving, turn-opening walk',
    legacy: { phase: 'moving', walkSeq: 3, walkIntro: true, lastStepAt: NOW - 400 },
    moves: [plainMove(6)],
    turned: true,
    expect: {
      step: 'walk',
      subject: seatSubject.walk(3, 0),
      holdUntil: NOW + WALK_RESUME_LEAD_MS,
      walk: 3,
      leg: 0,
    },
  },
  {
    name: 'individual-challenge, gate open',
    legacy: { phase: 'individual-challenge', walkSeq: 3 },
    moves: [gateMove(9), plainMove(12)],
    turned: true,
    expect: { step: 'gate', subject: seatSubject.gate(3, 9), walk: 3 },
  },
  {
    name: 'individual-challenge, mid-hold (resolving + resultBeatUntil ahead)',
    legacy: {
      phase: 'individual-challenge',
      resolving: true,
      resultBeatUntil: NOW + 2500,
      walkSeq: 3,
    },
    moves: [plainMove(12)],
    turned: true,
    expect: { step: 'walk', subject: seatSubject.walk(3, 1), holdUntil: NOW + 2500, leg: 1 },
  },
  {
    name: 'individual-challenge, hold already spent (resultBeatUntil behind)',
    legacy: {
      phase: 'individual-challenge',
      resolving: true,
      resultBeatUntil: NOW - 60_000,
      walkSeq: 3,
    },
    moves: [plainMove(12)],
    turned: true,
    expect: { step: 'walk', subject: seatSubject.walk(3, 1), holdUntil: NOW, leg: 1 },
  },
  {
    name: 'individual-challenge, resolving without a beat stamp',
    legacy: { phase: 'individual-challenge', resolving: true, walkSeq: 3 },
    moves: [gateMove(9)],
    turned: true,
    expect: {
      step: 'walk',
      subject: seatSubject.walk(3, 1),
      holdUntil: NOW + WALK_RESUME_LEAD_MS,
      leg: 1,
    },
  },
  {
    name: 'individual-challenge, gate already shifted off',
    legacy: { phase: 'individual-challenge', walkSeq: 3 },
    moves: [],
    turned: true,
    expect: { step: 'walk', subject: seatSubject.walk(3, 1), leg: 1 },
  },
  {
    name: 'final-challenge, question open',
    legacy: { phase: 'final-challenge', walkSeq: 4 },
    moves: [finalMove(2)],
    turned: true,
    expect: { step: 'final', subject: seatSubject.final(4, 2), walk: 4 },
  },
  {
    name: 'final-challenge, mid-hold (resolving)',
    legacy: { phase: 'final-challenge', resolving: true, walkSeq: 4 },
    moves: [finalMove(3)],
    turned: true,
    expect: { step: 'final', subject: seatSubject.final(4, 3), walk: 4 },
  },
  {
    name: 'final-challenge, gauntlet already gone',
    legacy: { phase: 'final-challenge', resolving: true, walkSeq: 4 },
    moves: [],
    turned: true,
    expect: { step: 'walk', subject: seatSubject.walk(4, 1), leg: 1 },
  },
  {
    name: 'movement-summary',
    legacy: { phase: 'movement-summary', walkSeq: 4 },
    turned: true,
    expect: { step: 'settled', subject: seatSubject.settled(LAST_ROUND) },
  },
  {
    name: 'victory',
    legacy: { phase: 'victory', walkSeq: 9 },
    turned: true,
    expect: { step: 'victory', subject: 'victory' },
  },
  {
    name: 'kicked',
    legacy: { phase: 'kicked', resolving: true },
    expect: { step: 'kicked', subject: 'kicked' },
  },
]

const fixtureGame = (fixture: Fixture) =>
  legacyGame([legacySeat('p1', fixture.legacy, fixture.moves)], {
    banked: fixture.banked ? ['p1'] : [],
    turned: fixture.turned ? ['p1'] : [],
  })

const migrated = (fixture: Fixture) => {
  const game = fixtureGame(fixture)
  const changed = migrateLegacySeats(game, NOW)
  return { game, seat: game.players.p1!, changed }
}

describe('legacyCursorFor / migrateLegacySeats', () => {
  it.each(FIXTURES.map(fixture => [fixture.name, fixture] as const))('%s', (_, fixture) => {
    const { game, seat, changed } = migrated(fixture)
    expect(changed).toBe(true)

    const { cursor } = seat
    expect(cursor).toMatchObject({
      step: fixture.expect.step,
      subject: fixture.expect.subject,
      seq: 1,
      cause: 'migrate',
      enteredAt: NOW,
    })
    if (fixture.expect.holdUntil !== undefined)
      expect(cursor.holdUntil).toBe(fixture.expect.holdUntil)
    if (fixture.expect.walk !== undefined) expect(cursor.walk).toBe(fixture.expect.walk)
    if (fixture.expect.leg !== undefined) expect(cursor.leg).toBe(fixture.expect.leg)

    expect(stepRequirementGap(cursor, SERVER_CONTROLLED_CAPS)).toBeUndefined()
    const violations = seatInvariantViolations(game, { now: NOW, capsOn: SERVER_CONTROLLED_CAPS })
    expect(violations.filter(violation => violation.seat)).toEqual([])
    const fireAt = seatFireAt(cursor)
    if (fireAt !== undefined) expect(fireAt).toBeGreaterThanOrEqual(NOW)

    for (const field of LEGACY_FIELDS) expect(seat).not.toHaveProperty(field)
  })

  it('is idempotent: a second migration changes nothing', () => {
    for (const fixture of FIXTURES) {
      const { game } = migrated(fixture)
      const once = JSON.parse(JSON.stringify(game))
      expect(migrateLegacySeats(game, NOW + 60_000)).toBe(false)
      expect(game).toEqual(once)
    }
  })

  it('migrates every seat of a mixed table in one pass', () => {
    const seats = FIXTURES.map((fixture, index) =>
      legacySeat(`p${index}`, fixture.legacy, fixture.moves)
    )
    const game = legacyGame(seats, {
      banked: FIXTURES.flatMap((fixture, index) => (fixture.banked ? [`p${index}`] : [])),
      turned: FIXTURES.flatMap((fixture, index) => (fixture.turned ? [`p${index}`] : [])),
    })
    expect(migrateLegacySeats(game, NOW)).toBe(true)
    FIXTURES.forEach((fixture, index) => {
      expect(game.players[`p${index}`]!.cursor.step).toBe(fixture.expect.step)
    })
    const requirements = seatInvariantViolations(game, { now: NOW }).filter(
      violation => violation.kind === 'requirement'
    )
    expect(requirements).toEqual([])
  })

  it('leaves a seat that already has a cursor alone', () => {
    const fixture = FIXTURES.find(entry => entry.expect.step === 'gate')!
    const { game, seat } = migrated(fixture)
    const before = { ...seat.cursor }
    const stale = seat as unknown as LegacyShape
    stale.phase = 'moving'
    expect(migrateLegacySeats(game, NOW + 1000)).toBe(false)
    expect(seat.cursor).toEqual(before)
  })

  it('leaves an all-settled table for the load hook to stamp', () => {
    const { game } = migrated(FIXTURES.find(entry => entry.expect.step === 'settled')!)
    expect(game.nextRoundAt).toBeUndefined()
    expect(seatInvariantViolations(game, { now: NOW }).map(violation => violation.kind)).toEqual([
      'table-unstamped',
    ])
  })

  it('stamps an all-settled table the moment it is loaded', async () => {
    const fixture = FIXTURES.find(entry => entry.expect.step === 'settled')!
    const game = fixtureGame(fixture)
    const table = await createTestTable(game)
    const server = useServerSideEvents(table.ctx(game.host))
    const loaded = (await server.fetchGame(table.id))!
    try {
      expect(loaded.nextRoundAt).toBeGreaterThan(Date.now())
      expect(
        seatInvariantViolations(loaded, { now: Date.now() }).map(violation => violation.kind)
      ).toEqual([])
    } finally {
      table.dispose()
    }
  })

  it('drops a staged-but-unrevealed round and stamps the reveal', () => {
    const seat = legacySeat('p1', { phase: 'movement-summary', walkSeq: 2 })
    const game = legacyGame([seat], {
      rounds: 3,
      turned: ['p1'],
      extra: { pendingRoundStart: true },
    })
    expect(migrateLegacySeats(game, NOW)).toBe(true)
    expect(game.rounds).toHaveLength(2)
    expect(game).not.toHaveProperty('pendingRoundStart')
    expect(game.nextRoundAt).toBe(NOW + NEW_ROUND_PAUSE_MS)
    expect(game.players.p1!.cursor.subject).toBe(seatSubject.settled(1))
    expect(migrateLegacySeats(game, NOW + 1000)).toBe(false)
    expect(game.rounds).toHaveLength(2)
  })

  it('derives without mutating the seat', () => {
    const seat = legacySeat('p1', { phase: 'moving', walkSeq: 5, walkIntro: true })
    const game = legacyGame([seat])
    const cursor = legacyCursorFor(game, seat, NOW)
    expect(cursor.step).toBe('walk')
    expect(seat).toHaveProperty('walkSeq', 5)
    expect(seat).not.toHaveProperty('cursor')
  })

  it('stamps the round subject on round zero for a fresh game', () => {
    const seat = legacySeat('p1', { phase: 'group-challenge' })
    const game = legacyGame([seat], { rounds: 0 })
    expect(legacyCursorFor(game, seat, NOW).subject).toBe(seatSubject.round(0))
  })
})
