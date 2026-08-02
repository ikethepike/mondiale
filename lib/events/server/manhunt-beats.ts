import type { Redis } from '@upstash/redis'
import {
  answerManhuntSubpoena,
  initialManhuntCandidates,
  legalManhuntMoves,
  manhuntKey,
  pickManhuntClue,
  pickManhuntSeed,
  pruneManhuntCandidates,
  randomManhuntMove,
  scoreManhunt,
  stepManhuntCandidates,
  type ManhuntSecret,
  type ManhuntSubpoenaTopicId,
} from '~~/lib/manhunt'
import type { ManhuntChallenge, ManhuntMoveKind } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { setWithGameTtl, useServerSideEvents } from '../server-side'
import type { ChainContext } from './chain-turns'
import { BRIEFING_CAP_MS, FIRST_TURN_GRACE_MS } from './turn-timing'
import { isChallengeOfType, latestChallengeOfType, latestRound } from '~~/lib/rounds'
import {
  scheduleDeadlineTask,
  scheduleEngineTask,
  scheduleRevealTask,
  settleRoundScores,
  type RearmOptions,
} from './round-engine'

/**
 * Manhunt's beat engine: chain-turns' single-actor clock (the despot's move
 * beat) alternating with heritage-beats' everyone-acts clock (the detectives'
 * hunt beat). Same concurrency discipline as its siblings — every mutation
 * inside the per-game queue, timers outside it, `state.turn` as the staleness
 * token.
 *
 * What is NOT like its siblings: the despot's trail is a real secret. It
 * lives in a redis blob under manhuntKey — the player-secret pattern, a key
 * that never rides a broadcast — alongside the hunt beat's live markers and
 * the authoritative candidate set. The public challenge state carries clues,
 * presence, and RESOLVED beats' attributed markers only; the trail surfaces
 * in the snapshot exactly once, inside `state.outcome` at round end. The despot's own client
 * learns its position over a single-socket 'manhunt-position' emit.
 */

export const isManhuntChallenge = (challenge: unknown): challenge is ManhuntChallenge =>
  isChallengeOfType(challenge, 'manhunt-challenge')

/** The live round's manhunt challenge, when the live round is one. */
export const currentManhunt = (game: Game): ManhuntChallenge | undefined =>
  latestChallengeOfType(game, 'manhunt-challenge')

const roundIndexOf = (game: Game): number => game.rounds.length - 1

const fetchManhuntSecret = async (
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

const stampDeadline = (challenge: ManhuntChallenge, extraMs = 0) => {
  const seconds = challenge.state.beat === 'move' ? challenge.moveSeconds : challenge.huntSeconds
  challenge.state.deadline = Date.now() + seconds * 1000 + extraMs
}

/**
 * The despot's own position channel: a single-socket emit, never the room
 * broadcast. Tolerates the despot being offline — the reconnect path
 * (fetch-manhunt-position) covers them when they return.
 */
export const pushManhuntPosition = async (
  ctx: ChainContext,
  despotId: string,
  secret: ManhuntSecret,
  turn: number
) => {
  try {
    const sockets = await ctx.io.in(ctx.eventTarget.gameId).fetchSockets()
    for (const roomSocket of sockets) {
      if (roomSocket.data.playerId !== despotId) continue
      roomSocket.emit(
        'manhunt-position',
        { event: 'manhunt-position', trail: secret.trail, turn },
        ctx.eventTarget
      )
    }
  } catch (error) {
    console.error(`Manhunt position push failed for ${ctx.eventTarget.gameId}`, error)
  }
}

/**
 * Kick off the revealed round: seed the trail into the secret blob and stamp
 * the first move deadline. Async, unlike its siblings' start functions — the
 * secret write must land before the snapshot save so a fast despot can't act
 * against a blob that isn't there. Called BEFORE the caller saves/emits;
 * scheduleManhuntTimeout arms AFTER, as usual.
 */
export const startManhunt = async (ctx: ChainContext, game: Game, challenge: ManhuntChallenge) => {
  // Idempotent: the round-1 path calls this from EVERY tutorial close (the
  // briefing keeps deadline at 0, so the caller's guard can't distinguish
  // first from later closes) — a second run must never re-seed the trail.
  const existing = await fetchManhuntSecret(ctx.redis, game.id, roundIndexOf(game))
  if (existing) return
  const seed = pickManhuntSeed(game)
  if (!seed) {
    // The dealer verified the pool, so only drifted data lands here — run the
    // finish ritual (everyone scores zero, phases advance) rather than strand
    // the room on an unplayable hunt.
    return finishManhunt(ctx, game, challenge)
  }
  const secret: ManhuntSecret = {
    trail: [seed],
    candidates: initialManhuntCandidates(game),
    markers: {},
  }
  await saveManhuntSecret(ctx.redis, game.id, roundIndexOf(game), secret)
  // No clock yet: the round opens on the briefing, and the despot's first
  // move clock starts only when everyone is ready (or the cap forces it).
}

const briefingParticipants = (challenge: ManhuntChallenge): string[] => [
  challenge.despotId,
  ...challenge.state.detectives,
]

/** A player dismissed their briefing card. Idempotent; the last ready (or the
 *  cap) opens the pursuit. */
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
  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'manhunt-updated', game }, ctx.eventTarget)
}

/** Briefing over: the despot's first move clock starts for real. */
const beginPursuit = async (ctx: ChainContext, game: Game, challenge: ManhuntChallenge) => {
  challenge.state.briefing = false
  stampDeadline(challenge, FIRST_TURN_GRACE_MS)
  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'manhunt-updated', game }, ctx.eventTarget)
  scheduleManhuntTimeout(ctx, challenge)
}

/** Arm the beat clock (call AFTER the save — the fired task re-reads fresh state). */
export const scheduleManhuntTimeout = (ctx: ChainContext, challenge: ManhuntChallenge) => {
  // During the briefing there is no beat clock — arm the reading cap instead;
  // it force-starts the pursuit for a table that never all clicks ready.
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
    // A move, a full dragnet, or the finish advanced the state — stale.
    if (!current || current.state.finished || current.state.turn !== turn) return

    if (current.state.beat === 'move') {
      const secret = await fetchManhuntSecret(ctx.redis, game.id, roundIndexOf(game))
      // A vanished blob is unplayable — this task holds the round's only
      // timer, so bailing silently would strand the table. Run the finish
      // ritual (everyone scores zero, phases advance) like the no-seed path.
      if (!secret) {
        console.warn(`Manhunt secret missing for ${game.id} — finishing round`)
        return finishManhunt(ctx, game, current)
      }
      const from = secret.trail[secret.trail.length - 1]
      // The free hop: random, ground where possible — a charge burns only
      // when the despot idles somewhere ground can't leave.
      const move = randomManhuntMove(from, current.state.seaPassagesLeft, game)
      await commitManhuntMove(ctx, game, current, secret, move.isoCode, move.kind)
    } else {
      await resolveHuntBeat(ctx, game, current)
    }
  })
}

/** The despot chose a hop. Illegal picks are a silent no-op — the client
 *  greys them out, and the clock keeps running either way. */
export const applyManhuntMove = async (
  ctx: ChainContext,
  game: Game,
  challenge: ManhuntChallenge,
  isoCode: ISOCountryCode
) => {
  const secret = await fetchManhuntSecret(ctx.redis, game.id, roundIndexOf(game))
  if (!secret) return
  const from = secret.trail[secret.trail.length - 1]
  const { ground, sea } = legalManhuntMoves(from, challenge.state.seaPassagesLeft, game)
  // Ground first: a destination reachable both ways never wastes a charge.
  const kind: ManhuntMoveKind | undefined = ground.includes(isoCode)
    ? 'ground'
    : sea.includes(isoCode)
      ? 'sea'
      : undefined
  if (!kind) return
  await commitManhuntMove(ctx, game, challenge, secret, isoCode, kind)
}

/**
 * Land the hop and open the hunt: extend the trail, announce a sea passage,
 * step the candidate set by the announced movement kind, cut it with the
 * best true clue about the new hideout, and put every detective on the clock.
 */
const commitManhuntMove = async (
  ctx: ChainContext,
  game: Game,
  challenge: ManhuntChallenge,
  secret: ManhuntSecret,
  isoCode: ISOCountryCode,
  kind: ManhuntMoveKind
) => {
  const { state } = challenge

  secret.trail.push(isoCode)
  if (kind === 'sea') state.seaPassagesLeft = Math.max(0, state.seaPassagesLeft - 1)
  state.moves.push({ hop: state.hop, kind })

  const stepped = stepManhuntCandidates(secret.candidates, kind, game)
  const pick = pickManhuntClue(game, isoCode, stepped, state.hop, state.clues)
  secret.candidates = pick.matches
  secret.markers = {}
  await saveManhuntSecret(ctx.redis, game.id, roundIndexOf(game), secret)

  state.clues.push(pick.clue)
  state.candidates = challenge.showCandidates ? [...pick.matches] : []
  state.beat = 'hunt'
  state.committed = []
  state.turn++
  stampDeadline(challenge)

  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'manhunt-updated', game }, ctx.eventTarget)
  await pushManhuntPosition(ctx, challenge.despotId, secret, state.turn)
  scheduleManhuntTimeout(ctx, challenge)
}

/**
 * A detective spends a subpoena token mid hunt beat: the engine answers with
 * a true clue scoped to their chosen topic, the candidate set takes the cut
 * immediately, and the beat clock keeps running — `state.turn` is untouched,
 * so pending timeouts stay valid.
 */
export const applyManhuntSubpoena = async (
  ctx: ChainContext,
  game: Game,
  challenge: ManhuntChallenge,
  playerId: string,
  topicId: ManhuntSubpoenaTopicId
) => {
  const { state } = challenge
  if ((state.subpoenasLeft[playerId] ?? 0) < 1) return
  const secret = await fetchManhuntSecret(ctx.redis, game.id, roundIndexOf(game))
  if (!secret) return

  const despotAt = secret.trail[secret.trail.length - 1]
  const pick = answerManhuntSubpoena(
    game,
    despotAt,
    secret.candidates,
    state.hop,
    state.clues,
    topicId
  )
  secret.candidates = pick.matches
  await saveManhuntSecret(ctx.redis, game.id, roundIndexOf(game), secret)

  state.subpoenasLeft[playerId] = (state.subpoenasLeft[playerId] ?? 0) - 1
  state.clues.push({ ...pick.clue, askedBy: playerId })
  state.candidates = challenge.showCandidates ? [...pick.matches] : []

  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'manhunt-updated', game }, ctx.eventTarget)
}

/** A detective locked a marker. WHERE it landed goes to the secret blob; the
 *  snapshot only ever says WHO has committed. */
export const applyManhuntMarker = async (
  ctx: ChainContext,
  game: Game,
  challenge: ManhuntChallenge,
  playerId: string,
  isoCode: ISOCountryCode
) => {
  const { state } = challenge
  if (state.committed.includes(playerId)) return
  const secret = await fetchManhuntSecret(ctx.redis, game.id, roundIndexOf(game))
  if (!secret) return

  secret.markers[playerId] = isoCode
  await saveManhuntSecret(ctx.redis, game.id, roundIndexOf(game), secret)
  state.committed.push(playerId)

  if (state.committed.length >= state.detectives.length) {
    return resolveHuntBeat(ctx, game, challenge)
  }

  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'manhunt-updated', game }, ctx.eventTarget)
}

/**
 * Every marker is in (or the clock ran out): spring the dragnet. A marker on
 * the despot's country ends the hunt; otherwise the misses are confirmed
 * "not here"s, the aggregate goes public for the despot to study, and the
 * next move beat begins — the dragnet reveal IS the move beat, so no extra
 * hold is needed mid-round.
 */
const resolveHuntBeat = async (ctx: ChainContext, game: Game, challenge: ManhuntChallenge) => {
  const { state } = challenge
  const secret = await fetchManhuntSecret(ctx.redis, game.id, roundIndexOf(game))
  // See the move-beat timeout: a vanished blob must finish, never strand.
  if (!secret) {
    console.warn(`Manhunt secret missing for ${game.id} — finishing round`)
    return finishManhunt(ctx, game, challenge)
  }

  const despotAt = secret.trail[secret.trail.length - 1]
  state.dragnets.push({ hop: state.hop, markers: { ...secret.markers } })

  const capturerIds = state.detectives.filter(playerId => secret.markers[playerId] === despotAt)
  if (capturerIds.length) {
    state.outcome = {
      kind: 'captured',
      hop: state.hop,
      capturerIds,
      country: despotAt,
      trail: [...secret.trail],
    }
    return finishManhunt(ctx, game, challenge)
  }

  if (state.hop >= challenge.turnCount) {
    state.outcome = { kind: 'escaped', country: despotAt, trail: [...secret.trail] }
    return finishManhunt(ctx, game, challenge)
  }

  secret.candidates = pruneManhuntCandidates(secret.candidates, Object.values(secret.markers))
  secret.markers = {}
  await saveManhuntSecret(ctx.redis, game.id, roundIndexOf(game), secret)

  state.candidates = challenge.showCandidates ? [...secret.candidates] : []
  state.beat = 'move'
  state.hop++
  state.committed = []
  state.turn++
  stampDeadline(challenge)

  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'manhunt-updated', game }, ctx.eventTarget)
  scheduleManhuntTimeout(ctx, challenge)
}

/**
 * The pursuit is over: freeze the state (the trail goes public inside
 * `outcome` — its first and only appearance in a snapshot), hold for the
 * reveal, then score both sides and hand out board moves through the same
 * conversion the submit path uses.
 */
const finishManhunt = async (ctx: ChainContext, game: Game, challenge: ManhuntChallenge) => {
  const { state } = challenge
  const server = useServerSideEvents(ctx)

  state.finished = true
  await server.updateGameState(game)
  server.emit({ event: 'manhunt-updated', game }, ctx.eventTarget)

  scheduleManhuntSettle(ctx)
}

/** Arm the finished round's settle follow-up. Everything is re-derived from
 *  fresh state inside the task, so re-arming (rejoin recovery) is safe: the
 *  `groupAnswers` latch makes any duplicate a no-op. */
const scheduleManhuntSettle = (ctx: ChainContext) => {
  scheduleRevealTask(ctx, async (fresh, freshServer) => {
    // No outcome check: the degenerate no-seed finish scores zeros through
    // the same ritual (scoreManhunt returns {} without an outcome).
    const current = currentManhunt(fresh)
    if (!current?.state.finished) return

    const round = latestRound(fresh)
    // The reveal follow-up fires exactly once: scoring marks the round.
    if (!round || Object.keys(round.groupAnswers).length) return

    // The final beat's markers are still in the blob — they price proximity.
    const secret = await fetchManhuntSecret(ctx.redis, fresh.id, roundIndexOf(fresh))
    settleRoundScores({
      game: fresh,
      round,
      order: [...current.state.detectives, current.despotId],
      scores: scoreManhunt(current, secret?.markers ?? {}),
      maximumPoints: current.maximumPoints,
    })

    await freshServer.updateGameState(fresh)
    // Not 'group-challenge-scored': its client handler applies only the
    // target player's slice, and this scoring lands for the whole table.
    freshServer.emit({ event: 'manhunt-updated', game: fresh }, ctx.eventTarget)
    // The secret has served its round; the trail lives on in the outcome.
    await ctx.redis.del(manhuntKey(fresh.id, roundIndexOf(fresh)))
  })
}

/**
 * Re-arm whatever follow-up the live manhunt round is waiting on after its
 * in-process timer was lost (restart, or a save that threw once the timer was
 * already spent). Called from the rejoin recovery path (rearm-round.ts); safe
 * alongside a live timer — every task dies on its `turn` token, the briefing
 * flag, or the settle latch.
 */
export const rearmManhunt = (
  ctx: ChainContext,
  game: Game,
  options: RearmOptions = { armBriefingCaps: true }
) => {
  const challenge = currentManhunt(game)
  if (!challenge) return
  // Finished but unsettled — the reveal hold died before banking the table.
  if (challenge.state.finished) return scheduleManhuntSettle(ctx)
  // The one shape a rearm may not touch: a briefing cap while the caller says
  // rules cards are still up (round-1 seam) — close-tutorial owns that arm.
  if (challenge.state.briefing && !options.armBriefingCaps) return
  // Briefing cap or the live beat's clock, as the state dictates.
  scheduleManhuntTimeout(ctx, challenge)
}
