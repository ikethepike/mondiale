import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTOPILOT_GRACE_MS } from '~~/lib/round-beats'
import type {
  NeighbourBlitzChallenge,
  TwoTruthsChallenge,
} from '~~/types/challenges/group-modes.type'
import type { Game, Round } from '~~/types/game.types'
import type { Player, PlayerPhase } from '~~/types/player.type'
import { gradeGroupAnswer } from './grade-group-answer'
import { armAfkTakeover, composeClassicSubmission, releaseAutopilot } from './bot-brain'
import type { EngineContext } from './round-engine'

const BLITZ: NeighbourBlitzChallenge = {
  _type: 'neighbour-blitz-challenge',
  country: 'DE',
  neighbours: ['FR', 'PL', 'CZ', 'AT', 'CH', 'DK'],
  durationSeconds: 45,
  maximumPoints: 10,
} as NeighbourBlitzChallenge

const BUZZ: TwoTruthsChallenge = {
  _type: 'two-truths-challenge',
  country: 'SE',
  durationSeconds: 25,
  maximumPoints: 10,
} as TwoTruthsChallenge

const seat = (id: string, phase: PlayerPhase, extra: Partial<Player> = {}): Player =>
  ({ id, name: id, phase, moves: [], currentPosition: 0, ...extra }) as unknown as Player

const buildGame = (challenge: object, players: Player[]): Game =>
  ({
    id: 'bot-test',
    host: 'human',
    tiles: [],
    variant: 'world',
    difficulty: 'normal',
    started: true,
    players: Object.fromEntries(players.map(player => [player.id, player])),
    rounds: [{ groupChallenge: { ...challenge }, groupAnswers: {}, playerTurns: {} }],
  }) as unknown as Game

const roundOf = (game: Game): Round => game.rounds[0]

describe('composeClassicSubmission', () => {
  it('composes a blitz answer sliced from the mode\'s own correct set', async () => {
    const game = buildGame(BLITZ, [seat('bot:x', 'group-challenge', { bot: true })])
    const submission = await composeClassicSubmission(game, roundOf(game), 'bot:x')
    expect(submission).toBeDefined()
    expect(submission!.ranking.length).toBeGreaterThanOrEqual(1)
    for (const isoCode of submission!.ranking) {
      expect(BLITZ.neighbours).toContain(isoCode)
    }
    // The composed answer grades through the REAL scorer to a real score.
    const { scoring } = await gradeGroupAnswer({
      game,
      round: roundOf(game),
      playerId: 'bot:x',
      submission: submission!,
    })
    expect(scoring.scored).toBeGreaterThan(0)
    expect(scoring.scored).toBeLessThanOrEqual(BLITZ.maximumPoints)
  })

  it('composes a single-pick buzz answer with a clamped claim', async () => {
    const game = buildGame(BUZZ, [seat('bot:x', 'group-challenge', { bot: true })])
    const submission = await composeClassicSubmission(game, roundOf(game), 'bot:x')
    expect(submission).toBeDefined()
    expect(submission!.ranking.length).toBeLessThanOrEqual(1)
    const { scoring } = await gradeGroupAnswer({
      game,
      round: roundOf(game),
      playerId: 'bot:x',
      submission: submission!,
    })
    expect(scoring.maximum).toBe(BUZZ.maximumPoints)
    expect(scoring.scored).toBeLessThanOrEqual(BUZZ.maximumPoints)
  })

  it('returns nothing for a seat the ranking round never dealt to', async () => {
    const game = buildGame(
      { countriesPerPlayer: {}, id: 'population', maximumPoints: 10 },
      [seat('bot:x', 'group-challenge', { bot: true })]
    )
    const submission = await composeClassicSubmission(game, roundOf(game), 'bot:x')
    expect(submission).toBeUndefined()
  })
})

describe('the AFK autopilot lifecycle', () => {
  const store = new Map<string, Game>()
  const emitted: { event: string; payload?: Record<string, unknown> }[] = []
  let roomSockets: { id: string; data: { playerId?: string } }[] = []

  const context = (game: Game, playerId: string): EngineContext => {
    store.set(game.id, game)
    return {
      io: {
        in: () => ({
          emit: (event: string, payload: Record<string, unknown>) =>
            emitted.push({ event, payload }),
          fetchSockets: async () => roomSockets,
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

  beforeEach(() => {
    vi.useFakeTimers()
    store.clear()
    emitted.length = 0
    roomSockets = []
  })

  afterEach(() => vi.useRealTimers())

  const elapseGrace = async () => {
    await vi.advanceTimersByTimeAsync(AUTOPILOT_GRACE_MS + 10)
    await vi.runAllTicks()
  }

  it('takes over a seat whose socket stayed gone past the grace window', async () => {
    const game = buildGame(BUZZ, [seat('human', 'group-challenge')])
    armAfkTakeover(context(game, 'human'), 'dead-socket')
    await elapseGrace()
    expect(store.get('bot-test')!.players['human'].autopilot).toEqual({ sinceRound: 0 })
    expect(emitted.map(entry => entry.event)).toContain('table-notice')
  })

  it('stands down when the player reconnected on a new socket', async () => {
    const game = buildGame(BUZZ, [seat('human', 'group-challenge')])
    roomSockets = [{ id: 'fresh-socket', data: { playerId: 'human' } }]
    armAfkTakeover(context(game, 'human'), 'dead-socket')
    await elapseGrace()
    expect(store.get('bot-test')!.players['human'].autopilot).toBeUndefined()
  })

  it('never touches bots, finished seats, or unstarted games', async () => {
    const lobby = buildGame(BUZZ, [seat('human', 'naming')])
    lobby.started = false
    armAfkTakeover(context(lobby, 'human'), 'dead-socket')
    await elapseGrace()
    expect(store.get('bot-test')!.players['human'].autopilot).toBeUndefined()

    const winner = buildGame(BUZZ, [seat('human', 'victory')])
    armAfkTakeover(context(winner, 'human'), 'dead-socket')
    await elapseGrace()
    expect(store.get('bot-test')!.players['human'].autopilot).toBeUndefined()
  })

  it('release clears the latch and reports the covered span', async () => {
    const covered = seat('human', 'group-scores', { autopilot: { sinceRound: 0 } })
    const game = buildGame(BUZZ, [covered])
    roundOf(game).playerTurns['human'] = { points: { scored: 7, maximum: 10 } }
    releaseAutopilot(context(game, 'human'), game, covered)
    expect(covered.autopilot).toBeUndefined()
    const summary = emitted.find(entry => entry.event === 'autopilot-summary')
    expect(summary?.payload).toMatchObject({ playerId: 'human', rounds: 1, scored: 7 })
    expect(
      emitted.find(entry => entry.event === 'table-notice')?.payload
    ).toMatchObject({ kind: 'autopilot-reclaimed' })
  })
})
