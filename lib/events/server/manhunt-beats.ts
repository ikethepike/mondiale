import { drawLabel, recordedDraw } from './draws'
import type { Redis } from '@upstash/redis'
import {
  claimantOf,
  hasActed,
  huntCandidates,
  initialManhuntCandidates,
  isSheltered,
  manhuntBeatSettled,
  manhuntKey,
  manhuntLeakOptions,
  manhuntMoveKind,
  pickManhuntSeed,
  randomManhuntMove,
  scoreManhunt,
  sonarDistance,
  stepManhuntCandidates,
  subpoenaTopic,
  type ManhuntPlan,
  type ManhuntSecret,
  type ManhuntSubpoenaTopicId,
} from '~~/lib/manhunt'
import { isCountryPlayable } from '~~/lib/game-rules'
import type {
  ManhuntChallenge,
  ManhuntPosition,
  ManhuntReading,
} from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { setWithGameTtl, useServerSideEvents } from '../server-side'
import type { ChainContext } from './chain-turns'
import { BRIEFING_CAP_MS, FIRST_TURN_GRACE_MS } from '~~/lib/round-beats'
import { isChallengeOfType, latestChallengeOfType, latestRound } from '~~/lib/rounds'
import {
  scheduleDeadlineTask,
  scheduleEngineTask,
  scheduleRevealTask,
  settleRoundScores,
  type RearmOptions,
} from './round-engine'

/**
 * The Despot's beat engine: ONE simultaneous beat per hop — detectives ping or
 * stake out the current hideout while the despot plans the next hop and its
 * leak.
 * Same concurrency discipline as its siblings — every mutation inside the
 * per-game queue, timers outside it, `state.turn` as the staleness token.
 *
 * The trail, the despot's plan, the looted vaults and every sonar reading are
 * real secrets: they live in a redis blob under manhuntKey that never rides a
 * broadcast, and surface in the snapshot exactly once, inside `state.outcome`
 * at round end. The despot learns its position (and its plan's leak options)
 * over 'manhunt-position', each detective their readings over 'manhunt-sonar'.
 */

export const isManhuntChallenge = (challenge: unknown): challenge is ManhuntChallenge =>
  isChallengeOfType(challenge, 'manhunt-challenge')

export const currentManhunt = (game: Game): ManhuntChallenge | undefined =>
  latestChallengeOfType(game, 'manhunt-challenge')

const roundIndexOf = (game: Game): number => game.rounds.length - 1

export const fetchManhuntSecret = async (
  redis: Redis,
  gameId: string,
  roundIndex: number
): Promise<ManhuntSecret | undefined> =>
  (await redis.get<ManhuntSecret>(manhuntKey(gameId, roundIndex))) ?? undefined

const saveManhuntSecret = async (
  redis: Redis,
  gameId: string,
  roundIndex: number,
  secret: ManhuntSecret
): Promise<void> => {
  await setWithGameTtl(redis, manhuntKey(gameId, roundIndex), secret)
}

const stampBeat = (challenge: ManhuntChallenge, extraMs = 0) => {
  const now = Date.now()
  const beatMs = challenge.beatSeconds * 1000
  challenge.state.deadline = now + beatMs + extraMs
  challenge.state.analysisAt = now + extraMs + beatMs * challenge.analysisDelay
}

/** What the despot's socket is told: never a broadcast. */
export const manhuntPositionPayload = (
  secret: ManhuntSecret,
  turn: number
): { event: 'manhunt-position' } & ManhuntPosition => ({
  event: 'manhunt-position',
  trail: secret.trail,
  turn,
  looted: secret.looted,
  plan:
    secret.plan?.turn === turn
      ? { isoCode: secret.plan.isoCode, options: secret.plan.options, leak: secret.plan.leak }
      : undefined,
})

/** Tolerates the despot being offline — fetch-manhunt-intel covers them
 *  when they return. */
const pushManhuntPosition = async (
  ctx: ChainContext,
  despotId: string,
  secret: ManhuntSecret,
  turn: number
) => {
  try {
    const sockets = await ctx.io.in(ctx.eventTarget.gameId).fetchSockets()
    for (const roomSocket of sockets) {
      if (roomSocket.data.playerId !== despotId) continue
      roomSocket.emit('manhunt-position', manhuntPositionPayload(secret, turn), ctx.eventTarget)
    }
  } catch (error) {
    console.error(`Manhunt position push failed for ${ctx.eventTarget.gameId}`, error)
  }
}

export const manhuntSonarPayload = (
  secret: ManhuntSecret,
  playerId: string,
  turn: number
): { event: 'manhunt-sonar'; readings: ManhuntReading[]; turn: number } => ({
  event: 'manhunt-sonar',
  readings: secret.readings[playerId] ?? [],
  turn,
})

/** Every detective's own readings, each to their own socket only. */
const pushManhuntSonar = async (
  ctx: ChainContext,
  challenge: ManhuntChallenge,
  secret: ManhuntSecret
) => {
  try {
    const sockets = await ctx.io.in(ctx.eventTarget.gameId).fetchSockets()
    for (const roomSocket of sockets) {
      const playerId = roomSocket.data.playerId as string
      if (!challenge.state.detectives.includes(playerId)) continue
      roomSocket.emit(
        'manhunt-sonar',
        manhuntSonarPayload(secret, playerId, challenge.state.turn),
        ctx.eventTarget
      )
    }
  } catch (error) {
    console.error(`Manhunt sonar push failed for ${ctx.eventTarget.gameId}`, error)
  }
}

const broadcast = async (ctx: ChainContext, game: Game) => {
  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'manhunt-updated', game }, ctx.eventTarget)
}

/**
 * Seed the trail and deal the opening leak (the engine's own pick — the
 * despot has no say before the chase starts). Called BEFORE the caller
 * saves/emits; scheduleManhuntTimeout arms AFTER, as usual. Idempotent: the
 * round-1 path calls this from every tutorial close.
 */
export const startManhunt = async (ctx: ChainContext, game: Game, challenge: ManhuntChallenge) => {
  const existing = await fetchManhuntSecret(ctx.redis, game.id, roundIndexOf(game))
  if (existing) return
  const { state, vaults } = challenge
  const seed = recordedDraw(game, drawLabel.manhuntSeed(), () => pickManhuntSeed(game, vaults))
  if (!seed) return finishManhunt(ctx, game, challenge)
  const pool = recordedDraw(game, drawLabel.manhuntCandidates(), () =>
    initialManhuntCandidates(game, vaults)
  )
  const [opening] = recordedDraw(game, drawLabel.manhuntClue(), () =>
    manhuntLeakOptions(game, seed, pool, 1, [], challenge.claimsPerBeat)
  )
  state.clues = [opening.clue]
  await saveManhuntSecret(ctx.redis, game.id, roundIndexOf(game), {
    trail: [seed],
    looted: [],
    readings: {},
  })
}

export const isManhuntParticipant = (challenge: ManhuntChallenge, playerId: string): boolean =>
  playerId === challenge.despotId || challenge.state.detectives.includes(playerId)

const briefingParticipants = (challenge: ManhuntChallenge): string[] => [
  challenge.despotId,
  ...challenge.state.detectives,
]

/** Idempotent; the last ready (or the cap) opens the chase. */
export const applyManhuntReady = async (
  ctx: ChainContext,
  game: Game,
  challenge: ManhuntChallenge,
  playerId: string
) => {
  const { state } = challenge
  if (!state.briefing || state.ready.includes(playerId)) return
  state.ready.push(playerId)
  if (briefingParticipants(challenge).every(id => state.ready.includes(id))) {
    return beginPursuit(ctx, game, challenge)
  }
  await broadcast(ctx, game)
}

const beginPursuit = async (ctx: ChainContext, game: Game, challenge: ManhuntChallenge) => {
  challenge.state.briefing = false
  stampBeat(challenge, FIRST_TURN_GRACE_MS)
  await broadcast(ctx, game)
  scheduleManhuntTimeout(ctx, challenge)
}

/** Arm the beat clock (call AFTER the save — the fired task re-reads fresh state). */
export const scheduleManhuntTimeout = (ctx: ChainContext, challenge: ManhuntChallenge) => {
  if (challenge.state.briefing) {
    scheduleEngineTask(ctx, BRIEFING_CAP_MS, async game => {
      const current = currentManhunt(game)
      if (!current || current.state.finished || !current.state.briefing) return
      await beginPursuit(ctx, game, current)
    })
    return
  }
  const { turn, deadline } = challenge.state
  scheduleDeadlineTask(ctx, deadline, async game => {
    const current = currentManhunt(game)
    if (!current || current.state.finished || current.state.turn !== turn) return
    await resolveBeat(ctx, game, current)
  })
}

const isLive = (challenge: ManhuntChallenge): boolean =>
  !challenge.state.briefing && !challenge.state.finished

/** The despot's leak options for a destination, bound by any served
 *  subpoena, priced off the PUBLIC replay — what the whole hunt knows. The
 *  pre-dragnet set is a sound stand-in: the dragnet only ever removes
 *  countries, and the replay re-applies the leak through `clueAdmits`. */
const planFor = (
  game: Game,
  challenge: ManhuntChallenge,
  isoCode: ISOCountryCode,
  kind: ManhuntPlan['kind']
): ManhuntPlan => {
  const { state } = challenge
  const stepped = stepManhuntCandidates(huntCandidates(challenge, game), kind, game)
  const topic = subpoenaTopic(state.subpoena?.topic)?.id as ManhuntSubpoenaTopicId | undefined
  const options = recordedDraw(game, drawLabel.manhuntClue(), () =>
    manhuntLeakOptions(
      game,
      isoCode,
      stepped,
      state.hop + 1,
      state.clues,
      challenge.claimsPerBeat,
      topic
    )
  )
  return {
    turn: state.turn,
    isoCode,
    kind,
    options: options.map(option => option.clue),
    subpoenaBy: topic ? state.subpoena?.by : undefined,
  }
}

/** The despot picked (or re-picked) where to go next. Illegal picks are a
 *  silent no-op; the plan stays open until its leak is chosen. */
export const applyManhuntMove = async (
  ctx: ChainContext,
  game: Game,
  challenge: ManhuntChallenge,
  isoCode: ISOCountryCode
) => {
  const { state } = challenge
  if (!isLive(challenge) || state.hop >= challenge.turnCount || state.despotReady) return
  const secret = await fetchManhuntSecret(ctx.redis, game.id, roundIndexOf(game))
  if (!secret) return
  const from = secret.trail[secret.trail.length - 1]
  const kind = manhuntMoveKind(from, isoCode, state.favoursLeft, game)
  if (!kind) return
  secret.plan = planFor(game, challenge, isoCode, kind)
  await saveManhuntSecret(ctx.redis, game.id, roundIndexOf(game), secret)
  await pushManhuntPosition(ctx, challenge.despotId, secret, state.turn)
}

/** The despot chose which leak reaches the hunt — their beat is locked. */
export const applyManhuntLeak = async (
  ctx: ChainContext,
  game: Game,
  challenge: ManhuntChallenge,
  index: number
) => {
  const { state } = challenge
  if (!isLive(challenge) || state.despotReady) return
  const secret = await fetchManhuntSecret(ctx.redis, game.id, roundIndexOf(game))
  const plan = secret?.plan
  if (!secret || !plan || plan.turn !== state.turn) return
  if (!Number.isInteger(index) || index < 0 || index >= plan.options.length) return
  plan.leak = index
  state.despotReady = true
  await saveManhuntSecret(ctx.redis, game.id, roundIndexOf(game), secret)
  await pushManhuntPosition(ctx, challenge.despotId, secret, state.turn)
  if (manhuntBeatSettled(challenge)) return resolveBeat(ctx, game, challenge)
  await broadcast(ctx, game)
}

/** A detective stakes out a country — first come, one detective per
 *  country, and only as many stakeouts as the beat seats. */
export const applyManhuntClaim = async (
  ctx: ChainContext,
  game: Game,
  challenge: ManhuntChallenge,
  playerId: string,
  isoCode: ISOCountryCode
) => {
  const { state } = challenge
  if (!isLive(challenge) || !state.detectives.includes(playerId)) return
  if (hasActed(state, playerId) || claimantOf(state, isoCode)) return
  if (Object.keys(state.claims).length >= challenge.claimsPerBeat) return
  if (!isCountryPlayable(game, isoCode)) return
  state.claims[playerId] = isoCode
  if (manhuntBeatSettled(challenge)) return resolveBeat(ctx, game, challenge)
  await broadcast(ctx, game)
}

/** A detective pings a country: WHERE goes public at once, the reading comes
 *  back to them alone when the beat resolves. Pings never capture. */
export const applyManhuntPing = async (
  ctx: ChainContext,
  game: Game,
  challenge: ManhuntChallenge,
  playerId: string,
  isoCode: ISOCountryCode
) => {
  const { state } = challenge
  if (!isLive(challenge) || !state.detectives.includes(playerId)) return
  if (hasActed(state, playerId) || !isCountryPlayable(game, isoCode)) return
  state.pings[playerId] = isoCode
  if (manhuntBeatSettled(challenge)) return resolveBeat(ctx, game, challenge)
  await broadcast(ctx, game)
}

/** A detective serves a subpoena: the despot's next unchosen leak must come
 *  from this topic, and they lose the choice between two. */
export const applyManhuntSubpoena = async (
  ctx: ChainContext,
  game: Game,
  challenge: ManhuntChallenge,
  playerId: string,
  topicId: ManhuntSubpoenaTopicId
) => {
  const { state } = challenge
  if (!isLive(challenge) || state.subpoena) return
  // A subpoena needs a leak left to bind — none follows the last beat.
  const lastLeakLocked = state.hop === challenge.turnCount - 1 && state.despotReady
  if (state.hop >= challenge.turnCount || lastLeakLocked) return
  if ((state.subpoenasLeft[playerId] ?? 0) < 1) return
  state.subpoenasLeft[playerId] -= 1
  state.subpoena = { by: playerId, topic: topicId }

  const secret = await fetchManhuntSecret(ctx.redis, game.id, roundIndexOf(game))
  const plan = secret?.plan
  if (secret && plan && plan.turn === state.turn && plan.leak === undefined) {
    secret.plan = planFor(game, challenge, plan.isoCode, plan.kind)
    await saveManhuntSecret(ctx.redis, game.id, roundIndexOf(game), secret)
    await pushManhuntPosition(ctx, challenge.despotId, secret, state.turn)
  }
  await broadcast(ctx, game)
}

/**
 * The beat is over: spring the dragnet on the current hideout, then carry
 * out the despot's plan (or a random hop and the engine's leak if they never
 * locked one) and open the next beat.
 */
const resolveBeat = async (ctx: ChainContext, game: Game, challenge: ManhuntChallenge) => {
  const { state, vaults } = challenge
  const secret = await fetchManhuntSecret(ctx.redis, game.id, roundIndexOf(game))
  if (!secret) {
    console.warn(`Manhunt secret missing for ${game.id} — finishing round`)
    return finishManhunt(ctx, game, challenge)
  }

  const at = secret.trail[secret.trail.length - 1]
  const claims = { ...state.claims }
  const pings = { ...state.pings }
  state.dragnets.push({ hop: state.hop, claims, pings })
  for (const [playerId, isoCode] of Object.entries(pings)) {
    const reading = { hop: state.hop, isoCode, distance: sonarDistance(isoCode, at, game) }
    secret.readings[playerId] = [...(secret.readings[playerId] ?? []), reading]
  }
  const sheltered = isSheltered(at, vaults, secret.looted)
  if (sheltered) secret.looted.push(at)

  const capturerId = sheltered ? undefined : claimantOf(state, at)
  const ending = capturerId || state.hop >= challenge.turnCount
  if (ending) {
    const record = {
      country: at,
      trail: [...secret.trail],
      looted: [...secret.looted],
      readings: secret.readings,
    }
    state.outcome = capturerId
      ? { kind: 'captured', hop: state.hop, capturerId, ...record }
      : { kind: 'escaped', ...record }
    return finishManhunt(ctx, game, challenge)
  }

  const plan =
    secret.plan?.turn === state.turn
      ? secret.plan
      : (() => {
          const move = recordedDraw(game, drawLabel.manhuntMove(), () =>
            randomManhuntMove(at, state.favoursLeft, game)
          )
          return planFor(game, challenge, move.isoCode, move.kind)
        })()
  const leak = { ...plan.options[plan.leak ?? 0] }
  if (plan.subpoenaBy) {
    leak.askedBy = plan.subpoenaBy
    if (state.subpoena?.by === plan.subpoenaBy) delete state.subpoena
  }

  if (plan.kind === 'favour') state.favoursLeft = Math.max(0, state.favoursLeft - 1)
  secret.trail.push(plan.isoCode)
  delete secret.plan
  await saveManhuntSecret(ctx.redis, game.id, roundIndexOf(game), secret)

  state.moves.push({ hop: state.hop + 1, kind: plan.kind })
  state.clues.push(leak)
  state.hop++
  state.turn++
  state.claims = {}
  state.pings = {}
  state.despotReady = false
  stampBeat(challenge)

  await broadcast(ctx, game)
  await pushManhuntPosition(ctx, challenge.despotId, secret, state.turn)
  await pushManhuntSonar(ctx, challenge, secret)
  scheduleManhuntTimeout(ctx, challenge)
}

/** The chase is over: freeze the state (the trail goes public inside
 *  `outcome`), hold for the reveal, then score the table. */
const finishManhunt = async (ctx: ChainContext, game: Game, challenge: ManhuntChallenge) => {
  challenge.state.finished = true
  await broadcast(ctx, game)
  scheduleManhuntSettle(ctx)
}

/** Re-derives everything from fresh state, so re-arming (rejoin recovery) is
 *  safe: the `groupAnswers` latch makes any duplicate a no-op. */
const scheduleManhuntSettle = (ctx: ChainContext) => {
  scheduleRevealTask(ctx, async (fresh, freshServer) => {
    const current = currentManhunt(fresh)
    if (!current?.state.finished) return
    const round = latestRound(fresh)
    if (!round || Object.keys(round.groupAnswers).length) return

    await settleRoundScores({
      game: fresh,
      round,
      order: [...current.state.detectives, current.despotId],
      scores: scoreManhunt(current),
      maximumPoints: current.maximumPoints,
    })
    await freshServer.updateGameState(fresh)
    freshServer.emit({ event: 'manhunt-updated', game: fresh }, ctx.eventTarget)
    await ctx.redis.del(manhuntKey(fresh.id, roundIndexOf(fresh)))
  })
}

/**
 * Re-arm whatever follow-up the live round is waiting on after its timer was
 * lost (restart, or a save that threw once the timer was spent). Safe beside
 * a live timer — every task dies on its `turn` token, the briefing flag, or
 * the settle latch.
 */
export const rearmManhunt = (
  ctx: ChainContext,
  game: Game,
  options: RearmOptions = { armBriefingCaps: true }
) => {
  const challenge = currentManhunt(game)
  if (!challenge) return
  if (challenge.state.finished) return scheduleManhuntSettle(ctx)
  if (challenge.state.briefing && !options.armBriefingCaps) return
  scheduleManhuntTimeout(ctx, challenge)
}
