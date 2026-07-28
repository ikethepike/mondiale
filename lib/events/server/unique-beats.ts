import type { Redis } from '@upstash/redis'
import {
  resolveUniqueCollisions,
  uniqueBoardComplete,
  uniqueEntryForAnswer,
  uniqueKey,
  uniqueRegisters,
  type UniqueAnswerSheet,
} from '~~/lib/unique-or-bust'
import { isChallengeOfType, latestChallengeOfType, latestRound } from '~~/lib/rounds'
import type { UniqueCategoryId, UniqueOrBustChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { setWithGameTtl, useServerSideEvents } from '../server-side'
import type { ChainContext } from './chain-turns'
import { BRIEFING_CAP_MS, FIRST_TURN_GRACE_MS } from './turn-timing'
import {
  scheduleDeadlineTask,
  scheduleEngineTask,
  scheduleRevealTask,
  settleRoundScores,
} from './round-engine'

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
 *  writing deadline. */
export const scheduleUniqueTimeout = (ctx: ChainContext, challenge: UniqueOrBustChallenge) => {
  if (challenge.state.briefing) {
    scheduleEngineTask(ctx, BRIEFING_CAP_MS, async game => {
      const current = currentUniqueOrBust(game)
      if (!current || current.state.finished || !current.state.briefing) return
      await beginBoard(ctx, game, current)
    })
    return
  }
  scheduleDeadlineTask(ctx, challenge.state.deadline, async game => {
    const current = currentUniqueOrBust(game)
    // An early all-locked resolve got there first — stale.
    if (!current || current.state.finished || current.state.briefing) return
    await resolveUniqueBoard(ctx, game, current)
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
  challenge.state.deadline =
    Date.now() + challenge.durationSeconds * 1000 + FIRST_TURN_GRACE_MS
  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'unique-updated', game }, ctx.eventTarget)
  scheduleUniqueTimeout(ctx, challenge)
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
  if (!uniqueEntryForAnswer(registers, category, challenge.letter, id)) return

  const sheet = await fetchAnswerSheet(ctx.redis, game.id, roundIndexOf(game))
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
  const { results, scores } = resolveUniqueCollisions(challenge, sheet, registers)

  state.results = results
  state.finished = true
  await server.updateGameState(game)
  server.emit({ event: 'unique-updated', game }, ctx.eventTarget)

  scheduleRevealTask(ctx, async (fresh, freshServer) => {
    const current = currentUniqueOrBust(fresh)
    if (!current?.state.finished) return

    const round = latestRound(fresh)
    // The reveal follow-up fires exactly once: scoring marks the round.
    if (!round || Object.keys(round.groupAnswers).length) return

    settleRoundScores({
      game: fresh,
      round,
      order: current.state.order,
      scores,
      maximumPoints: current.maximumPoints,
    })

    await freshServer.updateGameState(fresh)
    // Not 'group-challenge-scored': its client handler applies only the
    // target player's slice, and this scoring lands for the whole table.
    freshServer.emit({ event: 'unique-updated', game: fresh }, ctx.eventTarget)
    // The sheet has served its round; the words live on in `state.results`.
    await ctx.redis.del(uniqueKey(fresh.id, roundIndexOf(fresh)))
  })
}
