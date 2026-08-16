import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gateRevealDoneHandler } from './gate-reveal-done.handler'
import { handleTimelineRevealDone, rearmTimeline } from './timeline-turns'
import { ROUND_BEATS, TIMEOUT_SLACK_MS } from '~~/lib/round-beats'
import type { TimelineChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { Player, PlayerPhase } from '~~/types/player.type'
import type { ChainContext } from './chain-turns'

/**
 * The player-paced reveal exits: timeline's table settle (all-acked or the
 * browse cap) and the browsable gate's early resume. Both die on existing
 * latches — `groupAnswers` marks the settle, `resolving` marks the beat.
 */

const seat = (id: string, phase: PlayerPhase, extra: Partial<Player> = {}): Player =>
  ({
    id,
    name: id,
    phase,
    moves: [],
    currentPosition: 0,
    walkSeq: 1,
    ...extra,
  }) as unknown as Player

let gameSeq = 0

const timelineChallenge = (
  revealDone: string[] | undefined,
  order = ['a', 'b']
): TimelineChallenge =>
  ({
    _type: 'timeline-challenge',
    turnSeconds: 22,
    revealSeconds: 7,
    maximumPoints: 20,
    state: {
      deck: ['fall-of-the-berlin-wall', 'battle-of-marathon'],
      placed: ['fall-of-the-berlin-wall', 'battle-of-marathon'],
      card: 2,
      order,
      activeIndex: 0,
      turn: 2,
      deadline: Date.now() + (ROUND_BEATS.timeline.browseCapMs ?? 60000),
      placements: [],
      finished: true,
      ...(revealDone ? { revealDone } : {}),
    },
  }) as unknown as TimelineChallenge

const buildGame = (players: Player[], challenge: unknown): Game =>
  ({
    id: `reveal-game-${++gameSeq}`,
    host: players[0]?.id,
    tiles: [],
    variant: 'world',
    difficulty: 'normal',
    started: true,
    players: Object.fromEntries(players.map(entry => [entry.id, entry])),
    rounds: [{ groupChallenge: challenge, groupAnswers: {}, playerTurns: {} }],
  }) as unknown as Game

const store = new Map<string, Game>()
const emitted: { event: string; gameId: string }[] = []

const context = (game: Game, playerId = 'a'): ChainContext => {
  store.set(game.id, game)
  return {
    io: {
      in: () => ({
        emit: (event: string) => emitted.push({ event, gameId: game.id }),
      }),
    },
    redis: {
      get: async (key: string) => store.get(key),
      set: async (key: string, value: Game) => void store.set(key, value),
      expire: async () => 1,
    },
    socket: {},
    eventTarget: { gameId: game.id, playerId },
  } as unknown as ChainContext
}

const settled = (game: Game) => Object.keys(game.rounds[0].groupAnswers).length > 0

beforeEach(() => {
  vi.useFakeTimers()
  store.clear()
  emitted.length = 0
})

afterEach(() => vi.useRealTimers())

describe('handleTimelineRevealDone', () => {
  it('collects acks idempotently and ignores non-participants', async () => {
    const game = buildGame(
      [seat('a', 'group-challenge'), seat('b', 'group-challenge')],
      timelineChallenge([])
    )
    const ctx = context(game)

    await handleTimelineRevealDone(ctx, game, 'a')
    await handleTimelineRevealDone(ctx, game, 'a')
    await handleTimelineRevealDone(ctx, game, 'watcher')

    const fresh = store.get(game.id)!
    const challenge = fresh.rounds[0].groupChallenge as TimelineChallenge
    expect(challenge.state.revealDone).toEqual(['a'])
    expect(settled(fresh)).toBe(false)
  })

  it('settles the table the moment every seat has read on', async () => {
    const game = buildGame(
      [seat('a', 'group-challenge'), seat('b', 'group-challenge')],
      timelineChallenge([])
    )
    const ctx = context(game)

    await handleTimelineRevealDone(ctx, game, 'a')
    await handleTimelineRevealDone(ctx, store.get(game.id)!, 'b')
    await vi.runAllTicks()

    expect(settled(store.get(game.id)!)).toBe(true)
  })

  it('tolerates a round dealt before revealDone existed', async () => {
    const game = buildGame([seat('a', 'group-challenge')], timelineChallenge(undefined, ['a']))
    const ctx = context(game)

    await handleTimelineRevealDone(ctx, game, 'a')
    await vi.runAllTicks()

    // The lone seat's ack IS the whole table — straight to settle.
    expect(settled(store.get(game.id)!)).toBe(true)
  })

  it('drops an ack that lands after the settle marked the round', async () => {
    const game = buildGame(
      [seat('a', 'group-challenge'), seat('b', 'group-challenge')],
      timelineChallenge(['a', 'b'])
    )
    game.rounds[0].groupAnswers = { a: {} } as never
    const ctx = context(game)

    await handleTimelineRevealDone(ctx, game, 'b')

    const challenge = store.get(game.id)?.rounds[0].groupChallenge as TimelineChallenge | undefined
    // Nothing saved: the handler bailed before touching state.
    expect(challenge ?? null).not.toBeNull()
    expect(emitted.filter(entry => entry.gameId === game.id)).toEqual([])
  })

  it('settles a partially-read table when the browse cap fires', async () => {
    const game = buildGame(
      [seat('a', 'group-challenge'), seat('b', 'group-challenge')],
      timelineChallenge(['a'])
    )
    const ctx = context(game)

    // The rearm path arms the cap against the persisted deadline.
    rearmTimeline(ctx, game)
    await vi.advanceTimersByTimeAsync(
      (ROUND_BEATS.timeline.browseCapMs ?? 60000) + TIMEOUT_SLACK_MS + 100
    )
    await vi.runAllTicks()

    expect(settled(store.get(game.id)!)).toBe(true)
  })
})

describe('gateRevealDoneHandler', () => {
  const invoke = (ctx: ChainContext, gameId: string, playerId: string) =>
    gateRevealDoneHandler({
      io: (ctx as never as { io: unknown }).io,
      redis: (ctx as never as { redis: unknown }).redis,
      socket: {},
      eventKey: 'gate-reveal-done',
      eventTarget: { gameId, playerId },
      eventData: { event: 'gate-reveal-done' },
    } as never)

  it('refuses a send outside a result beat (no resolving latch)', async () => {
    const player = seat('a', 'individual-challenge', { resolving: false })
    const game = buildGame([player], undefined)
    const ctx = context(game)

    await invoke(ctx, game.id, 'a')
    await vi.runAllTicks()

    expect(store.get(game.id)!.players.a.phase).toBe('individual-challenge')
    expect(store.get(game.id)!.players.a.resolving).toBe(false)
  })

  it('resumes the walk early while the latch is up', async () => {
    const player = seat('a', 'individual-challenge', { resolving: true })
    const game = buildGame([player], undefined)
    const ctx = context(game)

    await invoke(ctx, game.id, 'a')
    await vi.advanceTimersByTimeAsync(100)
    await vi.runAllTicks()

    // The movement continuation cleared the beat latch — the reveal is over.
    expect(store.get(game.id)!.players.a.resolving).toBe(false)
  })
})
