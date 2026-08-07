import type { Redis } from '@upstash/redis'
import {
  resolveUniqueCollisions,
  uniqueBoardComplete,
  uniqueEntryForAnswer,
  uniqueKey,
  uniqueNameKey,
  uniqueRegisters,
  uniqueScoresFromResults,
  uniqueUsedWordKeys,
  type UniqueAnswerSheet,
} from '~~/lib/unique-or-bust'
import { isChallengeOfType, latestChallengeOfType, latestRound } from '~~/lib/rounds'
import type { UniqueCategoryId, UniqueOrBustChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { setWithGameTtl, useServerSideEvents } from '../server-side'
import type { ChainContext } from './chain-turns'
import { BRIEFING_CAP_MS, FIRST_TURN_GRACE_MS } from '~~/lib/round-beats'
import {
  scheduleDeadlineTask,
  scheduleEngineTask,
  scheduleRevealTask,
  settleRoundScores,
  type RearmOptions,
} from './round-engine'
import { armGroupScoresCap } from './seat-exits'

/**
 * Unique or Bust's beat engine: manhunt's briefing gate (rules cards every
 * player dismisses, a cap for tables that never all click) in front of
 * heritage-beats' everyone-acts clock, collapsed to a single writing beat.
 * Same concurrency discipline as its siblings — every mutation inside the
 * per-game queue, timers outside it, (briefing, finished) as staleness tokens.
 *
 * The live answer sheet is a real secret while the clock runs: seeing a
 * rival's word is exactly what lets you dodge the duplicate. It lives in a
 * redis blob under uniqueKey — the manhunt pattern, a key that never rides a
 * broadcast. The snapshot carries WHO has locked WHICH slot (presence), and
 * the words surface exactly once, in `state.results` at the reveal.
 */

export const isUniqueOrBustChallenge = (challenge: unknown): challenge is UniqueOrBustChallenge =>
  isChallengeOfType(challenge, 'unique-or-bust-challenge')

/** The live round's unique-or-bust challenge, when the live round is one. */
export const currentUniqueOrBust = (game: Game): UniqueOrBustChallenge | undefined =>
  latestChallengeOfType(game, 'unique-or-bust-challenge')

const roundIndexOf = (game: Game): number => game.rounds.length - 1

const fetchAnswerSheet = async (
  redis: Redis,
  gameId: string,
  roundIndex: number
): Promise<UniqueAnswerSheet> =>
  (await redis.get<UniqueAnswerSheet>(uniqueKey(gameId, roundIndex))) ?? {}

/** Arm the round's clock (call AFTER the save — the fired task re-reads fresh
 *  state). During the briefing that clock is the reading cap; after it, the
 *  writing deadline. The armed round's index is the staleness token the
 *  sibling engines get from their turn counters — unique has a single beat,
 *  so without it a stale task could resolve a LATER unique round early. */
export const scheduleUniqueTimeout = (
  ctx: ChainContext,
  game: Game,
  challenge: UniqueOrBustChallenge
) => {
  const armedRound = roundIndexOf(game)
  if (challenge.state.briefing) {
    scheduleEngineTask(ctx, BRIEFING_CAP_MS, async fresh => {
      if (roundIndexOf(fresh) !== armedRound) return
      const current = currentUniqueOrBust(fresh)
      if (!current || current.state.finished || !current.state.briefing) return
      await beginBoard(ctx, fresh, current)
    })
    return
  }
  scheduleDeadlineTask(ctx, challenge.state.deadline, async fresh => {
    if (roundIndexOf(fresh) !== armedRound) return
    const current = currentUniqueOrBust(fresh)
    // An early all-locked resolve got there first — stale.
    if (!current || current.state.finished || current.state.briefing) return
    await resolveUniqueBoard(ctx, fresh, current)
  })
}

/** A player dismissed their briefing card. Idempotent; the last ready (or the
 *  cap) opens the writing window. */
export const applyUniqueReady = async (
  ctx: ChainContext,
  game: Game,
  challenge: UniqueOrBustChallenge,
  playerId: string
) => {
  const { state } = challenge
  if (!state.briefing || state.ready.includes(playerId)) return
  if (!state.order.includes(playerId)) return
  state.ready.push(playerId)

  if (state.order.every(id => state.ready.includes(id))) {
    return beginBoard(ctx, game, challenge)
  }
  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'unique-updated', game }, ctx.eventTarget)
}

/** Briefing over: the one writing clock starts for the whole table. */
const beginBoard = async (ctx: ChainContext, game: Game, challenge: UniqueOrBustChallenge) => {
  challenge.state.briefing = false
  challenge.state.deadline = Date.now() + challenge.durationSeconds * 1000 + FIRST_TURN_GRACE_MS
  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'unique-updated', game }, ctx.eventTarget)
  scheduleUniqueTimeout(ctx, game, challenge)
}

/**
 * A player locked a board slot. The pick is validated against the shared
 * register (unknown ids and wrong-letter names are a silent no-op — the client
 * only offers valid options), lands in the secret blob, and only presence
 * rides the snapshot. The last slot of a full table resolves early.
 */
export const applyUniqueAnswer = async (
  ctx: ChainContext,
  game: Game,
  challenge: UniqueOrBustChallenge,
  playerId: string,
  category: UniqueCategoryId,
  id: string
) => {
  const { state } = challenge
  if (state.briefing || state.finished) return
  if (!state.order.includes(playerId)) return
  if (!challenge.categories.includes(category)) return
  if (state.locked[playerId]?.includes(category)) return

  const registers = await uniqueRegisters(game)
  const entry = uniqueEntryForAnswer(registers, category, challenge.letter, id)
  if (!entry) return

  const sheet = await fetchAnswerSheet(ctx.redis, game.id, roundIndexOf(game))
  // One word never fills two blanks — the client bounces this with a hint;
  // here it's the same silent no-op as any other off-register pick.
  if (uniqueUsedWordKeys(registers, challenge, sheet[playerId]).has(uniqueNameKey(entry.name))) {
    return
  }
  ;(sheet[playerId] ??= {})[category] = id
  await setWithGameTtl(ctx.redis, uniqueKey(game.id, roundIndexOf(game)), sheet)

  state.locked[playerId] = [...(state.locked[playerId] ?? []), category]

  if (uniqueBoardComplete(challenge)) {
    return resolveUniqueBoard(ctx, game, challenge)
  }

  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'unique-updated', game }, ctx.eventTarget)
}

/**
 * Time (or the last lock): spring the collision grid. The words go public in
 * `state.results` — their first appearance in a snapshot — the reveal holds,
 * then the table settles through the shared ritual and the blob is deleted.
 */
const resolveUniqueBoard = async (
  ctx: ChainContext,
  game: Game,
  challenge: UniqueOrBustChallenge
) => {
  const { state } = challenge
  const server = useServerSideEvents(ctx)

  const sheet = await fetchAnswerSheet(ctx.redis, game.id, roundIndexOf(game))
  const registers = await uniqueRegisters(game)
  // The settle task re-derives the scores from these persisted results
  // (uniqueScoresFromResults) — the sheet is read exactly once, here.
  const { results } = resolveUniqueCollisions(challenge, sheet, registers)

  state.results = results
  state.finished = true
  await server.updateGameState(game)
  server.emit({ event: 'unique-updated', game }, ctx.eventTarget)

  scheduleUniqueSettle(ctx)
}

/** Arm the finished board's settle follow-up. The scores are re-derived from
 *  the reveal grid already on the snapshot (`state.results`) — never the
 *  redis sheet, whose TTL can lapse before a recovered settle runs — so
 *  re-arming (rejoin recovery) is safe: the settle is a pure function of the
 *  snapshot and the `groupAnswers` latch makes any duplicate a no-op. */
const scheduleUniqueSettle = (ctx: ChainContext) => {
  scheduleRevealTask(ctx, async (fresh, freshServer) => {
    const current = currentUniqueOrBust(fresh)
    if (!current?.state.finished) return

    const round = latestRound(fresh)
    // The reveal follow-up fires exactly once: scoring marks the round.
    if (!round || Object.keys(round.groupAnswers).length) return

    const advanced = await settleRoundScores({
      game: fresh,
      round,
      order: current.state.order,
      scores: uniqueScoresFromResults(current),
      maximumPoints: current.maximumPoints,
    })

    await freshServer.updateGameState(fresh)
    // Not 'group-challenge-scored': its client handler applies only the
    // target player's slice, and this scoring lands for the whole table.
    freshServer.emit({ event: 'unique-updated', game: fresh }, ctx.eventTarget)
    // Every advanced seat now owes the table a movement request only a
    // click sends — cap each so a dead tab can't freeze the room here.
    for (const playerId of advanced) {
      const seat = fresh.players[playerId]
      if (seat) armGroupScoresCap(ctx, seat)
    }
    // The sheet has served its round; the words live on in `state.results`.
    await ctx.redis.del(uniqueKey(fresh.id, roundIndexOf(fresh)))
  })
}

/**
 * Re-arm whatever follow-up the live unique round is waiting on after its
 * in-process timer was lost (restart, or a save that threw once the timer was
 * already spent). Called from the rejoin recovery path (rearm-round.ts); safe
 * alongside a live timer — every task dies on its round/briefing/finished
 * token or the settle latch.
 */
export const rearmUniqueOrBust = (
  ctx: ChainContext,
  game: Game,
  options: RearmOptions = { armBriefingCaps: true }
) => {
  const challenge = currentUniqueOrBust(game)
  if (!challenge) return
  // Finished but unsettled — the reveal hold died before banking the table.
  if (challenge.state.finished) return scheduleUniqueSettle(ctx)
  // The one shape a rearm may not touch: a briefing cap while the caller says
  // rules cards are still up (round-1 seam) — close-tutorial owns that arm.
  if (challenge.state.briefing && !options.armBriefingCaps) return
  // Briefing cap or the writing deadline, as the state dictates.
  scheduleUniqueTimeout(ctx, game, challenge)
}
