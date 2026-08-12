import {
  BEAT_POINTS,
  BEAT_SECONDS,
  GOVERNMENT_BEATS,
  governmentKey,
  scoreBeat,
  type GovernmentAnswer,
  type GovernmentBeat,
  type GovernmentDeal,
} from '~~/lib/government'
import { isChallengeOfType, latestChallengeOfType, latestRound } from '~~/lib/rounds'
import { chainContenders } from '~~/lib/player'
import { BEAT_VERDICT_HOLD_MS } from '~~/lib/round-beats'
import type { GovernmentAnswers } from '~~/types/challenges/group-modes.type'
import type { GovernmentChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { setWithGameTtl, useServerSideEvents } from '../server-side'
import {
  scheduleDeadlineTask,
  scheduleEngineTask,
  settleRoundScores,
  type EngineContext,
  type RearmOptions,
} from './round-engine'
import { armGroupScoresCaps } from './seat-exits'

/**
 * The Government round's beat engine: three questions about one chamber, run
 * as a server-owned sequence.
 *
 * Modelled on manhunt-beats — the only other engine that alternates named
 * beats — and it borrows the discipline that makes that one safe:
 *
 *   * ONE `scheduleGovernmentTimeout` that branches on the live beat. Arming a
 *     timer per beat recreates the deadlock chain-engine documents: a submit
 *     slips through, bumps `turn`, stales the pending follow-up, and nothing
 *     re-arms — a permanently frozen room.
 *   * `state.turn` increments on EVERY transition, and is both the staleness
 *     token a fired task checks and the idempotency key a submit carries. The
 *     round index alone is not enough here: a stale beat-2 timer would happily
 *     resolve beat 3 inside the same round.
 *   * Every transition is mutate → save → emit → schedule. The timer is armed
 *     AFTER the save, because the fired task re-reads fresh state.
 *
 * The answers never ride the snapshot until the reveal. `Game` reaches every
 * socket in the room, so a client with the devtools open could read the
 * governing party off beat 1 otherwise.
 */

export const isGovernmentChallenge = (challenge: unknown): challenge is GovernmentChallenge =>
  isChallengeOfType(challenge, 'government-challenge')

export const currentGovernment = (game: Game): GovernmentChallenge | undefined =>
  latestChallengeOfType(game, 'government-challenge')

const beatIndex = (beat: GovernmentBeat) => GOVERNMENT_BEATS.indexOf(beat)

/** The beat after this one, or nothing when the round is out of questions. */
const nextBeat = (beat: GovernmentBeat): GovernmentBeat | undefined =>
  GOVERNMENT_BEATS[beatIndex(beat) + 1]

const stampDeadline = (challenge: GovernmentChallenge, beat: GovernmentBeat) => {
  challenge.state.deadline = Date.now() + BEAT_SECONDS[beat] * 1000
}

/**
 * Open the round on its first question. The deal already stamped the state;
 * this only starts the clock, so the caller saves and emits around it exactly
 * as the other engines do.
 */
export const startGovernment = async (
  ctx: EngineContext,
  game: Game,
  challenge: GovernmentChallenge
) => {
  // The dealer stamps the answers onto the state because it is synchronous;
  // this is the first place that can move them somewhere a client cannot read.
  // Idempotent: a second call must not wipe a key the round is already using.
  const roundIndex = roundIndexOf(game)
  const dealt = challenge.state.answers
  if (dealt) {
    await saveGovernmentAnswers(ctx.redis, game.id, roundIndex, dealt)
    delete challenge.state.answers
  }
  stampDeadline(challenge, challenge.state.beat)
}

/** Everyone the round is asking — absent seats score zero rather than stall it. */
const seatedPlayers = (game: Game): string[] => chainContenders(game)

/**
 * What a player has answered so far, in the shape the scorer grades. Reading it
 * back out of `state.picks` rather than threading it through the submit is what
 * lets a recovered settle score the same as a live one.
 */
const answerOf = (challenge: GovernmentChallenge, playerId: string): GovernmentAnswer => ({
  ...(challenge.state.picks.party[playerId] !== undefined
    ? { party: challenge.state.picks.party[playerId] }
    : {}),
  ...(challenge.state.picks.seats[playerId] !== undefined
    ? { seats: challenge.state.picks.seats[playerId] }
    : {}),
  ...(challenge.state.picks.sides[playerId] !== undefined
    ? { sides: challenge.state.picks.sides[playerId] }
    : {}),
})

const roundIndexOf = (game: Game): number => game.rounds.length - 1

/** The round's answers, from the side key they were dealt into. */
const fetchAnswers = async (
  redis: EngineContext['redis'],
  gameId: string,
  roundIndex: number
): Promise<GovernmentAnswers | undefined> =>
  (await redis.get<GovernmentAnswers>(governmentKey(gameId, roundIndex))) ?? undefined

export const saveGovernmentAnswers = async (
  redis: EngineContext['redis'],
  gameId: string,
  roundIndex: number,
  answers: GovernmentAnswers
): Promise<void> => {
  await setWithGameTtl(redis, governmentKey(gameId, roundIndex), answers)
}

/**
 * The deal, rebuilt from the challenge and its hidden answers — the shape
 * `scoreBeat` grades. Both ends of the wire score through the same function;
 * this is only the adapter that hands it what it expects.
 */
const dealOf = (
  challenge: GovernmentChallenge,
  answers: GovernmentAnswers | undefined
): GovernmentDeal | undefined => {
  if (!answers) return undefined
  return {
    country: challenge.country,
    ...(challenge.chamber ? { chamber: challenge.chamber } : {}),
    totalSeats: challenge.totalSeats,
    options: challenge.options,
    governingParty: answers.governingParty,
    blocks: challenge.blocks,
    governingSeats: answers.governingSeats,
    benches: challenge.benches.map(bench => ({
      ...bench,
      standing: answers.standings[bench.name] ?? 'opposition',
    })),
    sorted: challenge.sorted,
    ...(answers.status ? { status: answers.status } : {}),
    minority: answers.minority,
    ...(answers.backedSeats !== undefined ? { backedSeats: answers.backedSeats } : {}),
  }
}

/** What the beat's answer WAS, for the verdict a player reads before moving on. */
const truthOf = (beat: GovernmentBeat, deal: GovernmentDeal): string => {
  if (beat === 'party') return deal.governingParty
  if (beat === 'seats') return `${deal.governingSeats}`
  const withGovernment = deal.sorted.filter(
    name => deal.benches.find(bench => bench.name === name)?.standing !== 'opposition'
  )
  return withGovernment.length ? withGovernment.join(', ') : 'nobody'
}

/**
 * Bank one beat's points, then HOLD on the verdict before the next question.
 *
 * The score and the following beat used to land in one save, so a player saw
 * "+3 and now beat 2" together and never learned whether they were right. The
 * hold is a beat of its own: `state.verdict` names what the answer was and what
 * each seat scored, and `advanceBeat` clears it when the hold expires.
 */
const resolveBeat = async (ctx: EngineContext, game: Game, challenge: GovernmentChallenge) => {
  const { state } = challenge
  const answers = await fetchAnswers(ctx.redis, game.id, roundIndexOf(game))
  const deal = dealOf(challenge, answers)
  const beat = state.beat

  const scored: Record<string, number> = {}
  if (deal) {
    for (const playerId of seatedPlayers(game)) {
      const points = scoreBeat(beat, deal, answerOf(challenge, playerId))
      scored[playerId] = points
      state.scores[playerId] = (state.scores[playerId] ?? 0) + points
    }
  }

  // Beat 1 is graded, so the party stops being a secret: the later beats ask
  // about it by name rather than about an unnamed "it".
  if (deal && beat === 'party') state.subject = deal.governingParty
  if (deal) state.verdict = { beat, truth: truthOf(beat, deal), scored }

  // `turn` moves on EVERY transition, including into the verdict hold — that
  // is what stales a timer this resolve raced.
  state.turn += 1
  const turn = state.turn

  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'government-updated', game }, ctx.eventTarget)

  // The hold is server-owned and re-armable like every other beat: it re-reads
  // fresh state and dies on a stale turn, so arming it twice is safe.
  scheduleEngineTask(ctx, BEAT_VERDICT_HOLD_MS, async fresh => {
    const current = currentGovernment(fresh)
    if (!current || current.state.finished || current.state.turn !== turn) return
    await advanceBeat(ctx, fresh, current)
  })
}

/** The verdict has been read: clear it and open the next question, or settle. */
const advanceBeat = async (ctx: EngineContext, game: Game, challenge: GovernmentChallenge) => {
  const { state } = challenge
  const resolved = state.verdict?.beat ?? state.beat
  delete state.verdict

  const following = nextBeat(resolved)
  if (!following) return finishGovernment(ctx, game, challenge)

  state.beat = following
  state.turn += 1
  stampDeadline(challenge, following)
  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'government-updated', game }, ctx.eventTarget)
  scheduleGovernmentTimeout(ctx, challenge)
}

/**
 * The last beat is banked: reveal the answers and settle the table.
 *
 * `round.groupAnswers` is the once-only latch, so a duplicate call — a stale
 * timer that beat the save, a rearm racing a live resolve — is a no-op rather
 * than a double payout.
 */
export const finishGovernment = async (
  ctx: EngineContext,
  game: Game,
  challenge: GovernmentChallenge,
  known?: GovernmentAnswers
) => {
  const round = latestRound(game)
  if (!round || Object.keys(round.groupAnswers).length) return
  const { state } = challenge
  const answers = known ?? (await fetchAnswers(ctx.redis, game.id, roundIndexOf(game)))
  state.finished = true
  // The one moment the answers become public: the round is over, so the split
  // the reveal teaches can ride the snapshot now.
  if (answers) state.answers = answers

  const order = seatedPlayers(game)
  const scores = Object.fromEntries(
    order.map(playerId => [
      playerId,
      { scored: state.scores[playerId] ?? 0, maximum: challenge.maximumPoints },
    ])
  )

  const server = useServerSideEvents(ctx)
  const advanced = await settleRoundScores({
    game,
    round,
    order,
    scores,
    maximumPoints: challenge.maximumPoints,
    // The scorecard reads the round back per BEAT, because "3 of 10" says
    // nothing about which question a player actually knew. Party names and
    // seat counts are not ISO codes, so they cannot ride submitted/correct.
    answerFor: playerId => {
      const deal = dealOf(challenge, answers)
      const answer = answerOf(challenge, playerId)
      return {
        submitted: [],
        correct: [],
        ...(deal
          ? {
              governmentBeats: GOVERNMENT_BEATS.map(beat => ({
                beat,
                scored: scoreBeat(beat, deal, answer),
                maximum: BEAT_POINTS[beat],
              })),
            }
          : {}),
      }
    },
  })

  await server.updateGameState(game)
  server.emit({ event: 'government-updated', game }, ctx.eventTarget)
  armGroupScoresCaps(ctx, game, advanced)
}

/**
 * Arm the beat clock. Call AFTER the save — the fired task re-reads fresh
 * state and dies on a stale `turn`, which is what makes arming twice safe and
 * lets `rearmGovernment` revive the round after a restart.
 */
export const scheduleGovernmentTimeout = (ctx: EngineContext, challenge: GovernmentChallenge) => {
  const { turn, deadline } = challenge.state
  scheduleDeadlineTask(ctx, deadline, async game => {
    const current = currentGovernment(game)
    // A whole-table submit or the finish already moved the round on.
    if (!current || current.state.finished || current.state.turn !== turn) return
    await resolveBeat(ctx, game, current)
  })
}

/**
 * A player answered the live beat. The `turn` they answered against is the
 * idempotency key: a pick that arrives after the beat resolved is dropped
 * rather than applied to the NEXT question, which is the bug a bare
 * "is this the current beat" check would let through on a slow connection.
 *
 * When everyone has answered, the beat resolves early rather than waiting out
 * a clock nobody is using.
 */
export const applyGovernmentPick = async (
  ctx: EngineContext,
  game: Game,
  challenge: GovernmentChallenge,
  playerId: string,
  turn: number,
  pick: GovernmentAnswer
) => {
  const { state } = challenge
  if (state.finished || state.turn !== turn) return
  // The beat is over and its verdict is on screen — a pick arriving now is a
  // late tap on a question already graded.
  if (state.verdict) return

  if (state.beat === 'party' && pick.party !== undefined) {
    // A beat is answered ONCE. Letting a player revise turns the round into a
    // guessing game against the clock, which is the failure the old Parliament
    // had — every wrong drop bounced back and cost nothing.
    if (state.picks.party[playerId] !== undefined) return
    state.picks.party[playerId] = pick.party
  } else if (state.beat === 'seats' && pick.seats !== undefined) {
    if (state.picks.seats[playerId] !== undefined) return
    state.picks.seats[playerId] = pick.seats
  } else if (state.beat === 'sides' && pick.sides !== undefined) {
    if (state.picks.sides[playerId] !== undefined) return
    state.picks.sides[playerId] = pick.sides
  } else {
    return
  }

  const answered = state.picks[state.beat]
  if (seatedPlayers(game).every(seat => answered[seat] !== undefined)) {
    return resolveBeat(ctx, game, challenge)
  }

  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'government-updated', game }, ctx.eventTarget)
}

/**
 * Revive a live round's clock after a restart. Every beat is re-armable from
 * persisted state alone: the deadline is on the state and `turn` guards the
 * task, so re-arming one that never fired is harmless.
 */
export const rearmGovernment = (ctx: EngineContext, game: Game, _options: RearmOptions) => {
  const challenge = currentGovernment(game)
  if (!challenge || challenge.state.finished) return
  // A verdict hold that was in flight when the machine went away: re-arm the
  // advance rather than the beat clock, or the round freezes on the verdict.
  if (challenge.state.verdict) {
    const turn = challenge.state.turn
    scheduleEngineTask(ctx, BEAT_VERDICT_HOLD_MS, async fresh => {
      const current = currentGovernment(fresh)
      if (!current || current.state.finished || current.state.turn !== turn) return
      await advanceBeat(ctx, fresh, current)
    })
    return
  }
  // A deadline that already passed while the machine was down still resolves —
  // scheduleDeadlineTask floors its delay at zero, so the ordinary arm covers
  // the overdue case too rather than needing a second path.
  scheduleGovernmentTimeout(ctx, challenge)
}
