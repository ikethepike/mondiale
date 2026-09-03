import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyTerraReady,
  currentTerraIncognita,
  rearmTerraIncognita,
  scheduleTerraTimeout,
} from './terra-beats'
import { startClassicClock } from './classic-rounds'
import { BRIEFING_CAP_MS } from '~~/lib/round-beats'
import { terraCollapseThreshold, terraSeconds, TERRA_CADENCE_MS } from '~~/lib/terra-incognita'
import type { TerraIncognitaChallenge } from '~~/types/challenges/group-modes.type'
import type { Game, Round } from '~~/types/game.types'
import type { Player, PlayerPhase } from '~~/types/player.type'
import type { EngineContext } from './round-engine'

/**
 * The failing atlas behind its rules card. What matters is the one thing the
 * mode is built on: the world does not start failing under anyone's card, and
 * when it does fail it fails on ONE stamped clock for the whole table.
 */

const challengeFixture = (
  overrides: Partial<TerraIncognitaChallenge['state']> = {}
): TerraIncognitaChallenge => ({
  _type: 'terra-incognita-challenge',
  vanishings: ['AL', 'MD', 'SK', 'LT', 'BA'],
  cadenceMs: TERRA_CADENCE_MS.normal,
  collapseThreshold: terraCollapseThreshold(5, 'normal'),
  durationSeconds: terraSeconds(5, TERRA_CADENCE_MS.normal),
  maximumPoints: 20,
  state: { briefing: true, ready: [], order: ['ada', 'ben'], ...overrides },
})

const seat = (id: string, phase: PlayerPhase = 'group-challenge'): Player =>
  ({ id, name: id, phase, moves: [], currentPosition: 0 }) as unknown as Player

const buildGame = (challenge: TerraIncognitaChallenge): Game =>
  ({
    id: 'test-game',
    host: 'ada',
    tiles: [],
    variant: 'world',
    difficulty: 'normal',
    started: true,
    players: { ada: seat('ada'), ben: seat('ben') },
    rounds: [{ groupChallenge: challenge, groupAnswers: {}, playerTurns: {} }],
  }) as unknown as Game

const store = new Map<string, Game>()
const emitted: string[] = []

const context = (game: Game): EngineContext => {
  store.set(game.id, game)
  return {
    io: { in: () => ({ emit: (event: string) => emitted.push(event) }) },
    redis: {
      get: async (key: string) => store.get(key),
      set: async (key: string, value: Game) => void store.set(key, value),
      expire: async () => 1,
    },
    socket: {},
    eventTarget: { gameId: game.id, playerId: 'ada' },
  } as unknown as EngineContext
}

const liveRound = (gameId: string): Round => store.get(gameId)!.rounds[0]!

beforeEach(() => {
  vi.useFakeTimers()
  store.clear()
  emitted.length = 0
})

afterEach(() => vi.useRealTimers())

describe('the briefing gate', () => {
  it('refuses the classic clock while the card is up', () => {
    const round = buildGame(challengeFixture()).rounds[0]!
    startClassicClock(round)
    expect(round.deadline).toBeUndefined()
  })

  it('stamps the one clock only once the whole table is ready', async () => {
    const challenge = challengeFixture()
    const game = buildGame(challenge)
    const ctx = context(game)

    await applyTerraReady(ctx, game, challenge, 'ada')
    expect(challenge.state.ready).toEqual(['ada'])
    expect(challenge.state.briefing).toBe(true)
    expect(liveRound(game.id).deadline).toBeUndefined()
    // Short of the last ready is still a whole-table repaint.
    expect(emitted).toContain('table-updated')

    await applyTerraReady(ctx, game, challenge, 'ben')
    expect(challenge.state.briefing).toBe(false)
    expect(liveRound(game.id).deadline).toBeGreaterThan(Date.now())
  })

  it('ignores a ready from outside the round and a repeat', async () => {
    const challenge = challengeFixture()
    const game = buildGame(challenge)
    const ctx = context(game)

    await applyTerraReady(ctx, game, challenge, 'stranger')
    await applyTerraReady(ctx, game, challenge, 'ada')
    await applyTerraReady(ctx, game, challenge, 'ada')
    expect(challenge.state.ready).toEqual(['ada'])
    expect(challenge.state.briefing).toBe(true)
  })

  it('force-starts the table at the cap', async () => {
    const challenge = challengeFixture()
    const game = buildGame(challenge)
    const ctx = context(game)

    scheduleTerraTimeout(ctx, game, challenge)
    await vi.advanceTimersByTimeAsync(BRIEFING_CAP_MS + 50)

    const current = currentTerraIncognita(store.get(game.id)!)!
    expect(current.state.briefing).toBe(false)
    expect(liveRound(game.id).deadline).toBeGreaterThan(0)
  })

  it('re-arms the cap after a restart, unless rules cards are still up', async () => {
    const challenge = challengeFixture()
    const game = buildGame(challenge)
    const ctx = context(game)

    rearmTerraIncognita(ctx, game, { armBriefingCaps: false })
    await vi.advanceTimersByTimeAsync(BRIEFING_CAP_MS + 50)
    expect(currentTerraIncognita(store.get(game.id)!)!.state.briefing).toBe(true)

    rearmTerraIncognita(ctx, game)
    await vi.advanceTimersByTimeAsync(BRIEFING_CAP_MS + 50)
    expect(currentTerraIncognita(store.get(game.id)!)!.state.briefing).toBe(false)
  })

  it('leaves a briefed round alone', async () => {
    const challenge = challengeFixture({ briefing: false, ready: ['ada', 'ben'] })
    const game = buildGame(challenge)
    const ctx = context(game)
    game.rounds[0]!.deadline = Date.now() + 10_000

    rearmTerraIncognita(ctx, game)
    await applyTerraReady(ctx, game, challenge, 'ada')
    await vi.advanceTimersByTimeAsync(BRIEFING_CAP_MS + 50)
    expect(liveRound(game.id).deadline).toBe(game.rounds[0]!.deadline)
  })
})
