import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleClassicSettle, startClassicClock } from './classic-rounds'
import { submitGroupChallengeAnswersHandler } from './submit-group-challenge-answers.handler'
import { armGroupScoresCaps, armIndividualGateCap } from './seat-exits'
import {
  CLASSIC_SETTLE_SLACK_MS,
  GROUP_SCORES_CAP_MS,
  INDIVIDUAL_GATE_CAP_MS,
  revealBudgetMsFor,
  revealHoldMsFor,
  TIMEOUT_SLACK_MS,
} from '~~/lib/round-beats'
import type { Game } from '~~/types/game.types'
import type { ServerEventData } from '~~/types/events.types'
import type { Player, PlayerPhase } from '~~/types/player.type'
import type { EngineContext } from './round-engine'

/**
 * The protocol-convergence harness. The whole "briefly shows views it
 * shouldn't" class was one thing: a client reconstructing state from the
 * emit stream diverging from server truth, because a write's BREADTH did
 * not match its event's client-side applier (seat slice vs full replace).
 *
 * So test exactly that, mechanically: run the REAL handlers, capture every
 * emit, replay the stream through the REAL applier semantics, and after
 * EVERY emit assert the simulated client equals the server's game — modulo
 * the one deliberate deferral (a staged-but-unrevealed round travels only
 * on 'new-round'; `currentRound` hides it meanwhile). A handler that
 * mutates wider than its event delivers fails here with the diverging
 * paths named, before any room ever renders the divergence.
 */

/** Client applier semantics, mirrored from plugins/socket.client.ts. */
const SEAT_SLICE_EVENTS = new Set(['update'])
const SEAT_ROUND_SLICE_EVENTS = new Set([
  'group-challenge-scored',
  'individual-challenge-checked',
  'final-challenge-checked',
])

type Emit = { event: string; game: Game; targetId: string }

/** Apply one emit the way the client's handlers would. */
const applyToClient = (client: Game, { event, game, targetId }: Emit): Game => {
  if (SEAT_SLICE_EVENTS.has(event)) {
    client.players[targetId] = game.players[targetId]
    return client
  }
  if (SEAT_ROUND_SLICE_EVENTS.has(event)) {
    // groupChallengeScoredEvent: full-replace when the round counts disagree.
    if (client.rounds.length !== game.rounds.length) return structuredClone(game)
    client.players[targetId] = game.players[targetId]
    const index = client.rounds.length - 1
    client.rounds[index].groupAnswers[targetId] = game.rounds[index].groupAnswers[targetId]
    client.rounds[index].playerTurns[targetId] = game.rounds[index].playerTurns[targetId]
    return client
  }
  // Everything else carrying a game is a full replace (genericUpdateEvent).
  return structuredClone(game)
}

/** Deep-diff two values into dotted paths (arrays included). */
const diffPaths = (a: unknown, b: unknown, path = ''): string[] => {
  if (a === b) return []
  if (typeof a !== typeof b || a === null || b === null) return [path || '(root)']
  if (typeof a !== 'object') return Object.is(a, b) ? [] : [path || '(root)']
  const keys = new Set([
    ...Object.keys(a as Record<string, unknown>),
    ...Object.keys(b as Record<string, unknown>),
  ])
  const out: string[] = []
  for (const key of keys) {
    out.push(
      ...diffPaths(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key
      )
    )
  }
  return out
}

/** Divergences the protocol DEFERS on purpose: a staged round (and its
 *  latch) are delivered atomically by the next 'new-round'. */
const deferredByStaging = (path: string, clientRounds: number): boolean =>
  path === 'pendingRoundStart' || new RegExp(`^rounds\\.(?:[${clientRounds}-9]|\\d{2,})`).test(path)

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
const buildGame = (players: Player[], challenge: object): Game =>
  ({
    id: `breadth-game-${++gameSeq}`,
    host: players[0]?.id,
    tiles: [],
    variant: 'world',
    difficulty: 'normal',
    started: true,
    players: Object.fromEntries(players.map(entry => [entry.id, entry])),
    rounds: [{ groupChallenge: challenge, groupAnswers: {}, playerTurns: {} }],
  }) as unknown as Game

const store = new Map<string, Game>()
let emits: Emit[] = []
/** The scenario's pre-mutation state — the simulated client's join snapshot.
 *  Snapshotted at context() time: the store holds the LIVE object. */
let baseline: Game

const context = (game: Game, playerId = 'a'): EngineContext => {
  store.set(game.id, game)
  baseline = structuredClone(game)
  return {
    io: {
      in: () => ({
        emit: (_event: string, payload: ServerEventData) => {
          if ('game' in payload && payload.game) {
            emits.push({
              event: payload.event,
              game: structuredClone(payload.game),
              targetId: playerId,
            })
          }
        },
      }),
    },
    redis: {
      get: async (key: string) => store.get(key),
      set: async (key: string, value: Game) => void store.set(key, value),
      expire: async () => 1,
    },
    socket: {},
    eventTarget: { gameId: game.id, playerId },
  } as unknown as EngineContext
}

/** Replay the emit stream through the client appliers and assert convergence
 *  with server truth after EVERY emit. */
const expectClientConvergence = () => {
  let client = structuredClone(baseline)
  for (const [index, emitted] of emits.entries()) {
    client = applyToClient(client, emitted)
    const divergent = diffPaths(client, emitted.game).filter(
      path => !deferredByStaging(path, client.rounds.length)
    )
    expect(
      divergent,
      `after emit #${index} ('${emitted.event}') the client diverges at: ${divergent.join(', ')}`
    ).toEqual([])
  }
  return client
}

const TWO_TRUTHS = {
  _type: 'two-truths-challenge',
  country: 'SE',
  durationSeconds: 25,
  maximumPoints: 10,
}
// Hold 0: the flip is inline with the submit.
const CAPITAL_GUESS = {
  _type: 'capital-guess-challenge',
  country: 'SE',
  capital: 'Stockholm',
  options: [],
  durationSeconds: 20,
  maximumPoints: 10,
}

const submit = async (ctx: EngineContext, game: Game, playerId: string) =>
  submitGroupChallengeAnswersHandler({
    io: ctx.io,
    redis: ctx.redis,
    socket: ctx.socket,
    eventKey: 'submit-group-challenge-answers',
    eventTarget: { gameId: game.id, playerId },
    eventData: { event: 'submit-group-challenge-answers', ranking: ['SE'], clientScore: 5 },
  })

beforeEach(() => {
  vi.useFakeTimers()
  store.clear()
  emits = []
})

afterEach(() => vi.useRealTimers())

describe('every emit leaves the simulated client equal to server truth', () => {
  it('reveal-hold flow: submit banks, flip advances, settle sweeps the absentee', async () => {
    const initial = buildGame(
      [seat('a', 'group-challenge'), seat('b', 'group-challenge')],
      TWO_TRUTHS
    )
    const round = initial.rounds[0]
    startClassicClock(round)
    const ctx = context(initial, 'a')

    await submit(ctx, initial, 'a')
    // The per-player reveal flip…
    await vi.advanceTimersByTimeAsync(revealHoldMsFor(round.groupChallenge) + 100)
    // …then the round settle banks the dead seat and advances it.
    scheduleClassicSettle(ctx, store.get(initial.id)!)
    await vi.advanceTimersByTimeAsync(
      revealBudgetMsFor(round.groupChallenge) + CLASSIC_SETTLE_SLACK_MS + TIMEOUT_SLACK_MS + 30_000
    )
    await vi.runAllTicks()

    expect(emits.length).toBeGreaterThanOrEqual(3)
    const client = expectClientConvergence()
    expect(client.players.a.phase).toBe('group-scores')
    expect(client.players.b.phase).toBe('group-scores')
    expect(client.rounds[0].playerTurns.b.points.scored).toBe(0)
  })

  it('hold-0 flow: the inline flip rides one seat+round slice', async () => {
    const initial = buildGame([seat('a', 'group-challenge')], CAPITAL_GUESS)
    const ctx = context(initial, 'a')

    await submit(ctx, initial, 'a')

    expect(emits.map(entry => entry.event)).toEqual(['group-challenge-scored'])
    const client = expectClientConvergence()
    expect(client.players.a.phase).toBe('group-scores')
  })

  it('cohort cap: announcing several walkers reaches every seat', async () => {
    const initial = buildGame([seat('a', 'group-scores'), seat('b', 'group-scores')], TWO_TRUTHS)
    const ctx = context(initial, 'a')
    armGroupScoresCaps(ctx, initial, ['a', 'b'])

    await vi.advanceTimersByTimeAsync(GROUP_SCORES_CAP_MS + 100)
    await vi.runAllTicks()

    const announce = emits.find(entry => entry.event === 'table-updated')
    expect(announce, 'the cohort announce must be a full-replace event').toBeDefined()
    const client = expectClientConvergence()
    expect(client.players.a.phase).not.toBe('group-scores')
    expect(client.players.b.phase).not.toBe('group-scores')
  })

  it('gate cap: the forfeit and its blocked record reach the client', async () => {
    const gateMove = {
      endTile: { position: 5 },
      challenge: { _type: 'individual-challenge', id: 'isoCode', country: 'FI', variant: 'flag' },
    } as unknown as Player['moves'][number]
    const initial = buildGame(
      [seat('a', 'individual-challenge', { moves: [gateMove] })],
      TWO_TRUTHS
    )
    initial.rounds[0].playerTurns.a = { points: { scored: 3, maximum: 10 } } as never
    const ctx = context(initial, 'a')
    armIndividualGateCap(ctx, initial.players.a)

    await vi.advanceTimersByTimeAsync(INDIVIDUAL_GATE_CAP_MS + 100)
    await vi.runAllTicks()

    const client = expectClientConvergence()
    expect(client.players.a.moves).toEqual([])
    expect(client.rounds[0].playerTurns.a.blocked).toEqual({ atTile: 5, forfeitedSteps: 5 })
  })
})
