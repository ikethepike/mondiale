import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyGovernmentPick,
  currentGovernment,
  rearmGovernment,
  scheduleGovernmentTimeout,
  startGovernment,
} from './government-beats'
import { BEAT_POINTS, BEAT_SECONDS } from '~~/lib/government'
import { BEAT_VERDICT_HOLD_MS } from '~~/lib/round-beats'
import { TIMEOUT_SLACK_MS } from '~~/lib/round-beats'
import type { GovernmentChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { Player, PlayerPhase } from '~~/types/player.type'
import type { EngineContext } from './round-engine'

/**
 * The Government engine, on the same fake-timer rig as its siblings.
 *
 * What is worth pinning here is what a three-beat round can get wrong and a
 * one-beat round cannot: a timer from an earlier beat resolving a later one,
 * a pick landing against the wrong question, and a settle that pays twice.
 */

const challengeFixture = (
  overrides: Partial<GovernmentChallenge['state']> = {}
): GovernmentChallenge => ({
  _type: 'government-challenge',
  country: 'SE',
  chamber: 'Riksdag',
  totalSeats: 349,
  options: [{ name: 'Moderate Party' }, { name: 'Left Party' }, { name: 'Centre Party' }],
  blocks: [40, 68, 92],
  benches: [
    { name: 'Moderate Party', seats: 68, share: 0.19 },
    { name: 'Sweden Democrats', seats: 73, share: 0.21 },
    { name: 'Left Party', seats: 24, share: 0.07 },
  ],
  sorted: ['Sweden Democrats', 'Left Party'],
  maximumPoints: 10,
  state: {
    beat: 'party',
    turn: 0,
    deadline: 0,
    picks: { party: {}, seats: {}, sides: {} },
    scores: {},
    answers: {
      governingParty: 'Moderate Party',
      governingSeats: 68,
      standings: {
        'Moderate Party': 'government',
        'Sweden Democrats': 'backing',
        'Left Party': 'opposition',
      },
      minority: true,
    },
    ...overrides,
  },
})

const seat = (id: string, phase: PlayerPhase = 'group-challenge'): Player =>
  ({ id, name: id, phase, moves: [], currentPosition: 0 }) as unknown as Player

const buildGame = (challenge: GovernmentChallenge): Game =>
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

// One store for the game snapshot AND the answers side key — they are
// different keys in the same redis, which is exactly the point of the fix.
const store = new Map<string, unknown>()
const emitted: string[] = []

const context = (game: Game): EngineContext => {
  store.set(game.id, game)
  return {
    io: { in: () => ({ emit: (event: string) => emitted.push(event) }) },
    redis: {
      get: async (key: string) => store.get(key),
      set: async (key: string, value: unknown) => void store.set(key, value),
      expire: async () => 1,
    },
    socket: {},
    eventTarget: { gameId: game.id, playerId: 'ada' },
  } as unknown as EngineContext
}

const live = (gameId: string): GovernmentChallenge => currentGovernment(store.get(gameId) as Game)!

/** A round with beat 1 running, its answers already in the side key. */
const openRound = async () => {
  const challenge = challengeFixture()
  const game = buildGame(challenge)
  const ctx = context(game)
  await startGovernment(ctx, game, challenge)
  return { challenge, game, ctx }
}

/** Every beat now ends on a verdict the table reads before the next question. */
const rideVerdict = async () => {
  await vi.advanceTimersByTimeAsync(BEAT_VERDICT_HOLD_MS + 20)
}

beforeEach(() => {
  vi.useFakeTimers()
  store.clear()
  emitted.length = 0
})

afterEach(() => vi.useRealTimers())

describe('the beat sequence', () => {
  it('opens on the first question with its own clock', async () => {
    const { challenge } = await openRound()
    expect(challenge.state.beat).toBe('party')
    expect(challenge.state.deadline).toBe(Date.now() + BEAT_SECONDS.party * 1000)
  })

  it('moves to the next beat once the whole table has answered', async () => {
    const { challenge, game, ctx } = await openRound()
    await applyGovernmentPick(ctx, game, challenge, 'ada', 0, { party: 'Moderate Party' })
    expect(challenge.state.beat, 'one seat is not the table').toBe('party')

    await applyGovernmentPick(ctx, game, challenge, 'ben', 0, { party: 'Left Party' })
    // The beat resolves onto its VERDICT first — the score and the next
    // question no longer land together.
    expect(challenge.state.verdict?.beat).toBe('party')
    expect(challenge.state.verdict?.truth).toBe('Moderate Party')
    expect(challenge.state.beat).toBe('party')

    await rideVerdict()
    expect(live(game.id).state.beat).toBe('seats')
    expect(live(game.id).state.verdict).toBeUndefined()
  })

  it('banks each beat as it resolves', async () => {
    const { challenge, game, ctx } = await openRound()
    await applyGovernmentPick(ctx, game, challenge, 'ada', 0, { party: 'Moderate Party' })
    await applyGovernmentPick(ctx, game, challenge, 'ben', 0, { party: 'Left Party' })
    expect(challenge.state.scores.ada).toBe(BEAT_POINTS.party)
    expect(challenge.state.scores.ben).toBe(0)
  })

  it('runs the clock out when nobody answers, and still advances', async () => {
    const { challenge, game, ctx } = await openRound()
    scheduleGovernmentTimeout(ctx, challenge)
    await vi.advanceTimersByTimeAsync(BEAT_SECONDS.party * 1000 + TIMEOUT_SLACK_MS + 10)
    await rideVerdict()
    expect(live(game.id).state.beat).toBe('seats')
    expect(live(game.id).state.scores.ada).toBe(0)
  })

  it('settles the table after the last beat', async () => {
    const { challenge, game, ctx } = await openRound()
    challenge.state.beat = 'sides'
    challenge.state.turn = 2
    await applyGovernmentPick(ctx, game, challenge, 'ada', 2, {
      sides: { 'Sweden Democrats': 'government', 'Left Party': 'opposition' },
    })
    await applyGovernmentPick(ctx, game, challenge, 'ben', 2, {
      sides: { 'Sweden Democrats': 'opposition', 'Left Party': 'opposition' },
    })
    // The last beat holds on its verdict too, then settles.
    await rideVerdict()

    const round = (store.get(game.id) as Game).rounds[0]!
    expect(live(game.id).state.finished).toBe(true)
    expect(Object.keys(round.groupAnswers)).toEqual(['ada', 'ben'])
    // A backer filed WITH the government is right: the beat asks who keeps it
    // in power, not who holds ministries.
    expect(round.playerTurns.ada!.points.scored).toBe(BEAT_POINTS.sides)
    expect(round.playerTurns.ben!.points.scored).toBeLessThan(BEAT_POINTS.sides)
  })
})

describe('the answers', () => {
  // Everything on Game reaches every socket in the room. An answer left on the
  // challenge is readable in the devtools during beat 1, which wins the round
  // three times over.
  it('never rides the snapshot while the round is live', async () => {
    const { challenge, game } = await openRound()
    expect(challenge.state.answers).toBeUndefined()
    expect(JSON.stringify(store.get(game.id))).not.toContain('governingParty')
  })

  it('comes back on the state once the round is over', async () => {
    const { challenge, game, ctx } = await openRound()
    challenge.state.beat = 'sides'
    challenge.state.turn = 2
    await applyGovernmentPick(ctx, game, challenge, 'ada', 2, {
      sides: { 'Sweden Democrats': 'government', 'Left Party': 'opposition' },
    })
    await applyGovernmentPick(ctx, game, challenge, 'ben', 2, {
      sides: { 'Sweden Democrats': 'government', 'Left Party': 'opposition' },
    })
    await rideVerdict()
    expect(live(game.id).state.answers?.governingParty).toBe('Moderate Party')
    expect(live(game.id).state.answers?.standings['Sweden Democrats']).toBe('backing')
  })

  // Scoring reads the side key, so a round whose answers expired must not
  // silently pay everyone zero and call it a grade.
  it('still advances the beats when the side key has gone', async () => {
    const { challenge, game, ctx } = await openRound()
    store.delete(`${game.id}:government:0`)
    await applyGovernmentPick(ctx, game, challenge, 'ada', 0, { party: 'Moderate Party' })
    await applyGovernmentPick(ctx, game, challenge, 'ben', 0, { party: 'Moderate Party' })
    await rideVerdict()
    expect(live(game.id).state.beat).toBe('seats')
  })
})

describe('the beat verdict', () => {
  // The score and the next question used to land in ONE save, so a player saw
  // "+3 and now beat 2" together and never learned whether they were right.
  it('holds on what the answer was, per player', async () => {
    const { challenge, game, ctx } = await openRound()
    await applyGovernmentPick(ctx, game, challenge, 'ada', 0, { party: 'Moderate Party' })
    await applyGovernmentPick(ctx, game, challenge, 'ben', 0, { party: 'Left Party' })

    const verdict = live(game.id).state.verdict
    expect(verdict?.beat).toBe('party')
    expect(verdict?.truth).toBe('Moderate Party')
    expect(verdict?.scored.ada).toBe(BEAT_POINTS.party)
    expect(verdict?.scored.ben).toBe(0)
    // The question it grades is still on screen behind it.
    expect(live(game.id).state.beat).toBe('party')
  })

  it('clears the verdict when the hold expires', async () => {
    const { challenge, game, ctx } = await openRound()
    await applyGovernmentPick(ctx, game, challenge, 'ada', 0, { party: 'Moderate Party' })
    await applyGovernmentPick(ctx, game, challenge, 'ben', 0, { party: 'Moderate Party' })
    await rideVerdict()
    expect(live(game.id).state.verdict).toBeUndefined()
    expect(live(game.id).state.beat).toBe('seats')
  })

  // A tap landing while the verdict is up is a late answer to a graded beat.
  it('ignores a pick sent during the hold', async () => {
    const { challenge, game, ctx } = await openRound()
    await applyGovernmentPick(ctx, game, challenge, 'ada', 0, { party: 'Moderate Party' })
    await applyGovernmentPick(ctx, game, challenge, 'ben', 0, { party: 'Left Party' })
    const turn = live(game.id).state.turn
    await applyGovernmentPick(ctx, game, challenge, 'ben', turn, { seats: 68 })
    expect(live(game.id).state.picks.seats.ben).toBeUndefined()
  })

  // A hold in flight when the machine went away must not freeze the round.
  it('survives a restart mid-verdict', async () => {
    const { challenge, game, ctx } = await openRound()
    await applyGovernmentPick(ctx, game, challenge, 'ada', 0, { party: 'Moderate Party' })
    await applyGovernmentPick(ctx, game, challenge, 'ben', 0, { party: 'Moderate Party' })
    expect(live(game.id).state.verdict).toBeDefined()

    // Nothing armed: the timer died with the machine.
    rearmGovernment(ctx, game, { armBriefingCaps: true })
    await rideVerdict()
    expect(live(game.id).state.beat).toBe('seats')
  })
})

describe('staleness', () => {
  // The bug a single-beat round cannot have: beat 2's timer fires late and
  // resolves beat 3, skipping a question the table never saw.
  it('ignores a timer armed for a beat that already resolved', async () => {
    const { challenge, game, ctx } = await openRound()
    scheduleGovernmentTimeout(ctx, challenge)

    // The table answers early — beat 1 resolves and `turn` moves.
    await applyGovernmentPick(ctx, game, challenge, 'ada', 0, { party: 'Moderate Party' })
    await applyGovernmentPick(ctx, game, challenge, 'ben', 0, { party: 'Moderate Party' })
    await rideVerdict()
    expect(live(game.id).state.beat).toBe('seats')

    // The beat-1 timer now fires. It must die rather than resolve beat 2.
    await vi.advanceTimersByTimeAsync(BEAT_SECONDS.party * 1000 + TIMEOUT_SLACK_MS + 10)
    expect(live(game.id).state.beat).toBe('seats')
  })

  it('drops a pick that answers a question the round has moved past', async () => {
    const { challenge, game, ctx } = await openRound()
    await applyGovernmentPick(ctx, game, challenge, 'ada', 0, { party: 'Moderate Party' })
    await applyGovernmentPick(ctx, game, challenge, 'ben', 0, { party: 'Moderate Party' })
    await rideVerdict()

    // A retried beat-1 send, arriving during beat 2.
    await applyGovernmentPick(ctx, game, challenge, 'ada', 0, { party: 'Left Party' })
    expect(challenge.state.picks.party.ada).toBe('Moderate Party')
    expect(challenge.state.picks.seats.ada).toBeUndefined()
  })

  // A beat is answered ONCE — the failure the old Parliament round had was
  // that a wrong drop bounced back and cost nothing.
  it('refuses a second answer to the same beat', async () => {
    const { challenge, game, ctx } = await openRound()
    await applyGovernmentPick(ctx, game, challenge, 'ada', 0, { party: 'Left Party' })
    await applyGovernmentPick(ctx, game, challenge, 'ada', 0, { party: 'Moderate Party' })
    expect(challenge.state.picks.party.ada).toBe('Left Party')
  })

  it('never pays a settled round twice', async () => {
    const { challenge, game, ctx } = await openRound()
    challenge.state.beat = 'sides'
    challenge.state.turn = 2
    challenge.state.scores = { ada: 6, ben: 0 }
    await applyGovernmentPick(ctx, game, challenge, 'ada', 2, {
      sides: { 'Sweden Democrats': 'government', 'Left Party': 'opposition' },
    })
    await applyGovernmentPick(ctx, game, challenge, 'ben', 2, {
      sides: { 'Sweden Democrats': 'government', 'Left Party': 'opposition' },
    })
    await rideVerdict()
    const banked = (store.get(game.id) as Game).rounds[0]!.playerTurns.ada!.points.scored

    // Anything that runs the finish again lands on the groupAnswers latch.
    await applyGovernmentPick(ctx, game, challenge, 'ada', 3, {
      sides: { 'Left Party': 'government' },
    })
    expect((store.get(game.id) as Game).rounds[0]!.playerTurns.ada!.points.scored).toBe(banked)
  })
})

describe('rearm', () => {
  it('revives a live beat after a restart', async () => {
    const { challenge, game, ctx } = await openRound()
    // No timer armed: the machine that held it went away.
    rearmGovernment(ctx, game, { armBriefingCaps: true })
    await vi.advanceTimersByTimeAsync(BEAT_SECONDS.party * 1000 + TIMEOUT_SLACK_MS + 10)
    await rideVerdict()
    expect(live(game.id).state.beat).toBe('seats')
  })

  // A deadline that expired while the machine was down must resolve at once
  // rather than leaving the table on a clock that will never ring.
  it('resolves a beat whose deadline passed while the room was unowned', async () => {
    const challenge = challengeFixture({ deadline: Date.now() - 5_000 })
    const game = buildGame(challenge)
    const ctx = context(game)
    rearmGovernment(ctx, game, { armBriefingCaps: true })
    await vi.advanceTimersByTimeAsync(TIMEOUT_SLACK_MS + 10)
    await rideVerdict()
    expect(live(game.id).state.beat).toBe('seats')
  })

  it('leaves a finished round alone', async () => {
    const challenge = challengeFixture({ finished: true, beat: 'sides' })
    const game = buildGame(challenge)
    const ctx = context(game)
    rearmGovernment(ctx, game, { armBriefingCaps: true })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(live(game.id).state.beat).toBe('sides')
  })
})
