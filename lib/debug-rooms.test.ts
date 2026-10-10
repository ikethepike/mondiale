import { describe, expect, it } from 'vitest'
import {
  DEBUG_JOURNAL_TAIL,
  debugAccess,
  describeRoom,
  exportRoom,
  LIVE_ROOM_WINDOW_MS,
  LIVE_ROOMS_KEY,
  liveRoomIds,
  presentedToken,
} from '~~/lib/debug-rooms'
import type { ArmedSeatTimer } from '~~/lib/seat-invariants'
import { seatSubject } from '~~/lib/seat-transitions'
import {
  recordCheckpoint,
  recordSeatEvent,
  recordSeatJournal,
  recordSeatRender,
} from '~~/lib/events/server/seat-journal'
import { testCursor, testSeat } from '~~/lib/events/server/test-seat'
import { fakeTableRedis, uniqueGameId } from '~~/lib/events/server/test-table'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import type { SeatJournalEntry } from '~~/types/seat.types'

const NOW = 1_800_000_000_000

/** The table fake plus the one sorted set the live-room index needs. */
const fakeRedis = () => {
  const redis = fakeTableRedis()
  const sorted = new Map<string, Map<string, number>>()
  return Object.assign(redis, {
    async zadd(key: string, entry: { score: number; member: string }) {
      const set = sorted.get(key) ?? new Map<string, number>()
      set.set(entry.member, entry.score)
      sorted.set(key, set)
      return 1
    },
    async zrange(key: string, min: number, max: number, options?: { byScore?: boolean }) {
      if (!options?.byScore) throw new Error('only byScore is faked')
      return [...(sorted.get(key) ?? new Map()).entries()]
        .filter(([, score]) => score >= min && score <= max)
        .sort(([, a], [, b]) => a - b)
        .map(([member]) => member)
    },
  })
}

const buildGame = (seats: Player[], extra: Partial<Game> = {}): Game =>
  ({
    id: uniqueGameId('debug'),
    host: seats[0]!.id,
    started: true,
    rev: 9,
    length: 'short',
    variant: 'world',
    difficulty: 'normal',
    tiles: [],
    players: Object.fromEntries(seats.map(seat => [seat.id, seat])),
    rounds: [
      { groupChallenge: { _type: 'two-truths-challenge' }, groupAnswers: {}, playerTurns: {} },
    ],
    ...extra,
  }) as unknown as Game

const journalLine = (game: string, seq: number, rev?: number): SeatJournalEntry => ({
  game,
  seat: 'p1',
  seq,
  from: 'walk',
  to: 'walk',
  subject: seatSubject.walk(1, 0),
  cause: 'timer:walk-step',
  at: NOW + seq,
  ...(rev !== undefined ? { rev } : {}),
})

describe('debugAccess', () => {
  it('is disabled without a configured token', () => {
    expect(debugAccess(undefined, 'anything')).toBe('disabled')
    expect(debugAccess('', 'anything')).toBe('disabled')
  })

  it('denies a missing token', () => {
    expect(debugAccess('secret', undefined)).toBe('denied')
    expect(debugAccess('secret', '')).toBe('denied')
  })

  it('denies a wrong token of the same length', () => {
    expect(debugAccess('secret', 'secreT')).toBe('denied')
  })

  it('denies a token of another length without throwing', () => {
    expect(debugAccess('secret', 'secre')).toBe('denied')
    expect(debugAccess('secret', 'secret-and-more')).toBe('denied')
    expect(debugAccess('sécret', 'secret')).toBe('denied')
  })

  it('admits the configured token', () => {
    expect(debugAccess('secret', 'secret')).toBe('ok')
  })
})

describe('presentedToken', () => {
  it('reads a bearer header, case-insensitively', () => {
    expect(presentedToken('Bearer abc', undefined)).toBe('abc')
    expect(presentedToken('bearer   abc', undefined)).toBe('abc')
  })

  it('reads the query token', () => {
    expect(presentedToken(undefined, 'abc')).toBe('abc')
  })

  it('prefers the header over the query', () => {
    expect(presentedToken('Bearer header', 'query')).toBe('header')
  })

  it('falls back to the query when the header carries no token', () => {
    expect(presentedToken('Bearer ', 'query')).toBe('query')
  })

  it('is undefined with neither', () => {
    expect(presentedToken(undefined, undefined)).toBeUndefined()
    expect(presentedToken('', '')).toBeUndefined()
  })
})

describe('describeRoom', () => {
  it('is undefined for a missing room', async () => {
    expect(await describeRoom({ redis: fakeRedis(), gameId: 'gone', armed: [], now: NOW })).toBe(
      undefined
    )
  })

  it('reports each seat, its render, its timer, the table timer, the journal tail and violations', async () => {
    const redis = fakeRedis()
    const walking = testSeat('p1', 'walk', {
      cursor: testCursor('walk', { seq: 7, enteredAt: NOW - 1500, holdUntil: NOW + 500 }),
    })
    const stuck = testSeat('p2', 'scores', {
      bot: true,
      cursor: testCursor('scores', { seq: 4, enteredAt: NOW - 90_000, deadline: NOW - 60_000 }),
    })
    const settled = testSeat('p3', 'settled', {
      autopilot: { sinceRound: 0 },
      cursor: testCursor('settled', { seq: 12, enteredAt: NOW - 3000 }),
    })
    const game = buildGame([walking, stuck, settled], { nextRoundAt: NOW + 4000 })
    await redis.set(game.id, game)

    await recordSeatRender(redis, game.id, {
      viewer: 'p1',
      seat: 'p1',
      seq: 6,
      step: 'walk',
      subject: walking.cursor.subject,
      view: 'board',
      at: NOW - 1200,
    })
    await recordSeatRender(redis, game.id, {
      viewer: 'watcher',
      seat: 'p2',
      seq: 4,
      step: 'scores',
      subject: stuck.cursor.subject,
      view: 'scores',
      at: NOW - 100,
    })
    await recordSeatJournal(
      redis,
      Array.from({ length: DEBUG_JOURNAL_TAIL + 10 }, (_, index) => journalLine(game.id, index + 1))
    )

    const armed: ArmedSeatTimer[] = [
      { seat: 'p1', seq: 7, kind: 'walk-step', fireAt: NOW + 500 },
      { seat: '@table', seq: 0, kind: 'next-round', fireAt: NOW + 4000 },
    ]
    const room = (await describeRoom({ redis, gameId: game.id, armed, now: NOW }))!

    expect(room).toMatchObject({
      id: game.id,
      rev: 9,
      started: true,
      rounds: 1,
      nextRoundAt: NOW + 4000,
      table: { kind: 'next-round', inMs: 4000 },
    })
    expect(room.seats).toEqual([
      {
        id: 'p1',
        name: 'p1',
        step: 'walk',
        subject: walking.cursor.subject,
        seq: 7,
        ageMs: 1500,
        holdUntil: NOW + 500,
        rendered: { seq: 6, step: 'walk', subject: walking.cursor.subject, ageMs: 1200 },
        armed: { kind: 'walk-step', seq: 7, inMs: 500 },
      },
      {
        id: 'p2',
        name: 'p2',
        bot: true,
        step: 'scores',
        subject: stuck.cursor.subject,
        seq: 4,
        ageMs: 90_000,
        deadline: NOW - 60_000,
      },
      {
        id: 'p3',
        name: 'p3',
        autopilot: true,
        step: 'settled',
        subject: settled.cursor.subject,
        seq: 12,
        ageMs: 3000,
      },
    ])

    expect(room.journal).toHaveLength(DEBUG_JOURNAL_TAIL)
    expect(room.journal[0]!.seq).toBe(11)
    expect(room.journal.at(-1)!.seq).toBe(DEBUG_JOURNAL_TAIL + 10)

    const faults = room.violations.map(violation => `${violation.kind}:${violation.seat ?? ''}`)
    expect(faults.sort()).toEqual(['overdue:p2', 'settled-unturned:p3', 'unarmed:p2'])
  })

  it('reports no table timer when none is armed', async () => {
    const redis = fakeRedis()
    const game = buildGame([testSeat('p1', 'round')])
    await redis.set(game.id, game)
    const room = (await describeRoom({ redis, gameId: game.id, armed: [], now: NOW }))!
    expect(room).not.toHaveProperty('table')
    expect(room).not.toHaveProperty('nextRoundAt')
    expect(room.journal).toEqual([])
    expect(room.seats[0]).not.toHaveProperty('rendered')
    expect(room.seats[0]).not.toHaveProperty('armed')
  })
})

describe('liveRoomIds', () => {
  it('lists rooms seen inside the window, oldest first', async () => {
    const redis = fakeRedis()
    await redis.zadd(LIVE_ROOMS_KEY, { score: NOW - LIVE_ROOM_WINDOW_MS - 1, member: 'stale' })
    await redis.zadd(LIVE_ROOMS_KEY, { score: NOW - LIVE_ROOM_WINDOW_MS, member: 'edge' })
    await redis.zadd(LIVE_ROOMS_KEY, { score: NOW - 1000, member: 'live' })
    expect(await liveRoomIds(redis, NOW)).toEqual(['edge', 'live'])
  })

  it('is empty when nothing was seen', async () => {
    expect(await liveRoomIds(fakeRedis(), NOW)).toEqual([])
  })
})

describe('exportRoom', () => {
  const seedRing = async () => {
    const redis = fakeRedis()
    const gameId = uniqueGameId('export')
    const at = (rev: number) => ({ id: gameId, rev })
    await redis.set(`${gameId}:manhunt`, { trail: ['SE'] })

    await recordSeatEvent(redis, gameId, {
      kind: 'event',
      at: 1,
      actor: 'p1',
      event: 'join',
      data: {},
    })
    await recordCheckpoint(redis, at(3), [`${gameId}:manhunt`, `${gameId}:missing`])
    await recordSeatEvent(redis, gameId, {
      kind: 'event',
      at: 2,
      actor: 'p1',
      event: 'submit',
      data: { answer: 'SE' },
    })
    await recordSeatEvent(redis, gameId, { kind: 'deal', at: 3, label: 'round', value: 'r2' })
    await recordCheckpoint(redis, at(7), [])
    await recordSeatEvent(redis, gameId, {
      kind: 'event',
      at: 4,
      actor: 'bot1',
      bot: true,
      event: 'submit',
      data: {},
    })
    await recordSeatJournal(redis, [
      journalLine(gameId, 1, 2),
      journalLine(gameId, 2, 4),
      journalLine(gameId, 3, 7),
      journalLine(gameId, 4, 8),
      journalLine(gameId, 5),
    ])
    return { redis, gameId }
  }

  it('exports from the latest checkpoint', async () => {
    const { redis, gameId } = await seedRing()
    const bundle = await exportRoom(redis, gameId)
    expect(bundle.checkpoint).toMatchObject({ game: { id: gameId, rev: 7 }, sides: {} })
    expect(bundle.events.map(record => record.at)).toEqual([4])
    expect(bundle.journal.map(entry => entry.rev)).toEqual([8])
  })

  it('exports from the earliest checkpoint the ring holds', async () => {
    const { redis, gameId } = await seedRing()
    const bundle = await exportRoom(redis, gameId, 'earliest')
    expect(bundle.checkpoint).toMatchObject({
      game: { id: gameId, rev: 3 },
      sides: { ':manhunt': { trail: ['SE'] } },
    })
    expect(bundle.events.map(record => [record.kind, record.at])).toEqual([
      ['event', 2],
      ['deal', 3],
      ['event', 4],
    ])
    expect(bundle.journal.map(entry => entry.rev)).toEqual([4, 7, 8])
  })

  it('exports nothing without a checkpoint', async () => {
    const redis = fakeRedis()
    const gameId = uniqueGameId('export')
    await recordSeatEvent(redis, gameId, { kind: 'deal', at: 1, label: 'round', value: 1 })
    await recordSeatJournal(redis, [journalLine(gameId, 1, 1)])
    expect(await exportRoom(redis, gameId)).toEqual({ id: gameId, journal: [], events: [] })
  })
})
