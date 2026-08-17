import { sample, sampleMany } from '~~/lib/arrays'
import {
  boundaryScene,
  bornAfter,
  changeAccepted,
  changeDecade,
  madeAcceptedCountries,
  nocturneDealtCities,
  sunsetQuota,
  weighScalesPicks,
  yearbookYear,
} from '~~/lib/challenges/final-challenge'
import { botShare, isBrainSeat, jitteredShare } from '~~/lib/bots'
import { empirePots } from '~~/lib/empires'
import { isCorrectIndividualAnswer } from '~~/lib/challenges'
import { playableWorldCountries } from '~~/lib/game-rules'
import { offsetKm } from '~~/lib/geo'
import { clamp01 } from '~~/lib/number'
import {
  AUTOPILOT_GRACE_MS,
  BOT_BROWSE_ACK_JITTER_MS,
  BOT_BROWSE_ACK_MS,
  BOT_CLASSIC_WINDOW,
  BOT_PUMP_MS,
  BOT_READY_JITTER_MS,
  BOT_READY_MS,
  BOT_SCORES_JITTER_MS,
  BOT_SCORES_MS,
  BOT_SWEEP_BASE_MS,
  BOT_SWEEP_JITTER_MS,
  BOT_SWEEP_SPREAD_MS,
  BOT_TURN_JITTER_MS,
  BOT_TURN_THINK_MS,
  BOT_TUTORIAL_JITTER_MS,
  BOT_TUTORIAL_MS,
  BOT_UNIQUE_BASE_MS,
  BOT_UNIQUE_JITTER_MS,
  BOT_UNIQUE_STAGGER_MS,
  BOT_UNTIMED_THINK_JITTER_MS,
  BOT_UNTIMED_THINK_MS,
  classicPlaySeconds,
  isClassicGroupRound,
  WALK_LEAD_MS,
} from '~~/lib/round-beats'
import { expectChallengeType, latestRound } from '~~/lib/rounds'
import { activePlayerId } from '~~/lib/chain'
import { speaksLanguage } from '~~/lib/language-rounds'
import { sweepUnclaimed } from '~~/lib/clean-sweep'
import { governmentKey, type GovernmentAnswer } from '~~/lib/government'
import { manhuntKey, randomManhuntMove, type ManhuntSecret } from '~~/lib/manhunt'
import {
  activeTimelinePlayerId,
  correctSlotRange,
  drawnCard,
  placedYears,
  timelineEvent,
} from '~~/lib/timeline'
import { uniqueEntriesForLetter, uniqueRegisters } from '~~/lib/unique-or-bust'
import { PLACES } from '~~/data/places.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import {
  oddOneOut,
  type FinalChallengeAnswer,
  type FinalChallengeItem,
} from '~~/types/challenges/final-challenge.type'
import type { GovernmentAnswers, UniqueCategoryId } from '~~/types/challenges/group-modes.type'
import type { Game, Round } from '~~/types/game.types'
import { worldRegions, type ISOCountryCode } from '~~/types/geography.types'
import type { Player } from '~~/types/player.type'
import { useServerSideEvents } from '../server-side'
import {
  atlasOpenMoves,
  currentAtlasChain,
  handleAtlasChainMove,
  handleAtlasChainReady,
} from './atlas-turns'
import {
  borderChainOpenMoves,
  currentBorderChain,
  handleBorderChainMove,
  handleBorderChainReady,
} from './chain-turns'
import { closeTutorialHandler } from './close-tutorial.handler'
import { scheduleGameTask } from './deferred-task'
import { scheduleMovementPhase } from './enter-movement-phase.handler'
import { ABSENT_SUBMISSION, gradeGroupAnswer, type GroupSubmission } from './grade-group-answer'
import { applyGovernmentPick, currentGovernment } from './government-beats'
import { applyHeritagePin, currentHeritageHunt } from './heritage-beats'
import {
  applyManhuntMarker,
  applyManhuntMove,
  applyManhuntReady,
  currentManhunt,
  isManhuntParticipant,
} from './manhunt-beats'
import { scheduleEngineTask, type EngineContext } from './round-engine'
import { submitFinalChallengeAnswerHandler } from './submit-final-challenge-answer.handler'
import { submitGroupChallengeAnswersHandler } from './submit-group-challenge-answers.handler'
import { submitIndividualChallengeAnswersHandler } from './submit-individual-challenge-answer.handler'
import { applySweepClaim, applySweepReady, currentCleanSweep } from './sweep-beats'
import {
  currentTimeline,
  handleTimelineRevealDone,
  mayPlaceTimeline,
  resolveTimelinePlacement,
} from './timeline-turns'
import { applyUniqueAnswer, applyUniqueReady, currentUniqueOrBust } from './unique-beats'

/**
 * The bot brain: one self-rescheduling pump per game plays every brain seat —
 * lobby bots and autopiloted AFK seats alike — by calling the same exported
 * functions the wire handlers call, with the seat's id as the actor. No
 * socket is involved anywhere; every mutation re-enters the per-game queue
 * with a fresh fetch and dies on the same staleness tokens the engines use.
 *
 * The pump tick is READ-ONLY: it fetches, decides which seats owe an action,
 * and dispatches each act as its own queued task — so two acts can never
 * clobber each other's saves, and a stale decision dies inside the act's own
 * re-validation.
 */

/** Per-process pump registry: last tick per game, so arming is idempotent
 *  while a live chain runs, yet a chain that died (ownership moved away and
 *  back, a fetch failure) can be re-armed by the next rejoin. */
const pumpTickedAt = new Map<string, number>()
/** Rolled act-at stamps, keyed per game — in-memory on purpose: a restart
 *  re-rolls the delay, which just reads as a slower bot. */
const pumpActs = new Map<string, Map<string, number>>()

const PUMP_STALE_MS = BOT_PUMP_MS * 4
/** Dead-chain registry entries (ownership moved, fetch blew up) get swept
 *  opportunistically — the rearm-round map's own growth argument. */
const PUMP_SWEEP_MS = 3_600_000

const rollMs = (base: number, jitter: number) => base + Math.random() * jitter

/**
 * The pump and its acts never speak to a client directly (every emit is a
 * room broadcast), but EngineContext requires a socket — and closing over a
 * LIVE one pins the whole disconnected Socket (handshake, engine.io refs)
 * for as long as the chain runs. Server-originated bot work carries this
 * inert stand-in instead; the four genuine socket uses (join binding, the
 * manhunt single-socket push, rate-limit buckets) are never on a bot path.
 */
const DETACHED_SOCKET = {} as EngineContext['socket']

export const gameHasBrainSeats = (game: Game): boolean =>
  Object.values(game.players).some(isBrainSeat)

/**
 * Arm the pump for a game with brain seats. Safe to call from every seam
 * (start-game, the rejoin rearm): a live chain refuses the duplicate.
 */
export const armBotPump = (ctx: EngineContext, game: Game) => {
  if (!game.started || !gameHasBrainSeats(game)) return
  const { gameId } = ctx.eventTarget
  const now = Date.now()
  for (const [staleId, at] of pumpTickedAt) {
    if (now - at > PUMP_SWEEP_MS) {
      pumpTickedAt.delete(staleId)
      pumpActs.delete(staleId)
    }
  }
  const last = pumpTickedAt.get(gameId)
  if (last !== undefined && now - last < PUMP_STALE_MS) return
  pumpTickedAt.set(gameId, now)
  // A fresh chain token retires any chain still limping for this game — a
  // queue backlog can outlive the stale window, and two immortal chains
  // double every fetch for the rest of the game.
  const token = Symbol('bot-pump')
  pumpChain.set(gameId, token)
  scheduleTick({ ...ctx, socket: DETACHED_SOCKET }, token)
}

/** The live chain's identity per game — a tick whose token was superseded
 *  by a newer armBotPump stops instead of pumping in parallel. */
const pumpChain = new Map<string, symbol>()

const stopPump = (gameId: string) => {
  pumpTickedAt.delete(gameId)
  pumpActs.delete(gameId)
  pumpChain.delete(gameId)
}

const scheduleTick = (ctx: EngineContext, token: symbol) => {
  const { gameId } = ctx.eventTarget
  scheduleGameTask({ redis: ctx.redis, gameId }, BOT_PUMP_MS, async () => {
    if (pumpChain.get(gameId) !== token) return
    // One transient fetch failure must not kill the chain for the rest of
    // the game (the only other revival is a rejoin) — reschedule on ANY
    // error and stop only on the explicit conditions.
    try {
      const server = useServerSideEvents(ctx)
      const game = await server.fetchGame(gameId)
      if (!game || !game.started || !gameHasBrainSeats(game)) return stopPump(gameId)
      const playing = Object.values(game.players).some(
        seat => isBrainSeat(seat) && !['victory', 'kicked'].includes(seat.phase)
      )
      if (!playing) return stopPump(gameId)
      pumpTickedAt.set(gameId, Date.now())
      pumpGame(ctx, game)
    } catch (error) {
      console.error(`Bot pump tick failed for ${gameId}`, error)
    }
    scheduleTick(ctx, token)
  })
}

/**
 * One read-only pass: for every brain seat, find the beat it owes, roll an
 * act-at stamp the first time the beat is seen, and dispatch the act once the
 * stamp is due. The per-game stamp map is rebuilt each pass, so stamps for
 * beats that no longer exist fall away instead of accumulating.
 */
const pumpGame = (ctx: EngineContext, game: Game) => {
  const { gameId } = ctx.eventTarget
  const previous = pumpActs.get(gameId) ?? new Map<string, number>()
  const current = new Map<string, number>()
  const now = Date.now()

  /** Register the seat's owed beat; returns true when its stamp is due. The
   *  delay is a thunk, rolled only the FIRST time the beat is seen — later
   *  ticks reuse the stamp and never pay for the roll. */
  const due = (key: string, delayMs: () => number): boolean => {
    const at = previous.get(key) ?? now + delayMs()
    if (at <= now) return true
    current.set(key, at)
    return false
  }

  const roundIndex = game.rounds.length - 1
  const round = latestRound(game)

  for (const seat of Object.values(game.players)) {
    if (!isBrainSeat(seat)) continue
    const actorCtx: EngineContext = { ...ctx, eventTarget: { gameId, playerId: seat.id } }

    // A host asked this bot to leave mid-race: it plays out any round it is
    // still bound to, and retires the moment it stands somewhere safe.
    if (seat.bot && seat.retiring && RETIREMENT_PHASES.includes(seat.phase)) {
      dispatchRetirement(actorCtx, seat.id)
      continue
    }

    switch (seat.phase) {
      case 'tutorial': {
        if (due(`tutorial:${seat.id}`, () => rollMs(BOT_TUTORIAL_MS, BOT_TUTORIAL_JITTER_MS))) {
          dispatchCloseTutorial(actorCtx)
        }
        break
      }
      case 'group-challenge': {
        if (!round || game.pendingRoundStart) break
        planGroupChallenge({ ctx: actorCtx, game, round, roundIndex, seat, due })
        break
      }
      case 'group-scores': {
        if (
          due(`scores:${roundIndex}:${seat.id}`, () => rollMs(BOT_SCORES_MS, BOT_SCORES_JITTER_MS))
        ) {
          dispatchScoresExit(actorCtx, seat.id, seat.walkSeq)
        }
        break
      }
      case 'individual-challenge': {
        const gate = seat.moves[0]
        if (seat.resolving || gate?.challenge?._type !== 'individual-challenge') break
        if (
          due(`gate:${seat.id}:${gate.endTile.position}`, () =>
            rollMs(BOT_TURN_THINK_MS, BOT_TURN_JITTER_MS)
          )
        ) {
          dispatchGateAnswer(actorCtx, gate.endTile.position)
        }
        break
      }
      case 'final-challenge': {
        const gauntlet = seat.moves[0]?.challenge
        if (seat.resolving || gauntlet?._type !== 'final-challenge') break
        if (
          due(`final:${seat.id}:${gauntlet.turn ?? 0}`, () =>
            rollMs(BOT_TURN_THINK_MS + 2000, BOT_TURN_JITTER_MS)
          )
        ) {
          dispatchFinalAnswer(actorCtx, gauntlet.turn ?? 0)
        }
        break
      }
    }
  }

  pumpActs.set(gameId, current)
}

/** Where a retiring bot may actually leave: past its round, not yet (or no
 *  longer) owing the table a turn. A walk it abandons mid-step is fine —
 *  'kicked' is a settled phase and the stale continuation dies on it. */
const RETIREMENT_PHASES: readonly Player['phase'][] = ['group-scores', 'moving', 'movement-summary']

const dispatchRetirement = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async (fresh, server) => {
    const seat = fresh.players[playerId]
    if (!seat?.bot || !seat.retiring || !RETIREMENT_PHASES.includes(seat.phase)) return
    console.warn(`Retiring bot ${playerId} in ${ctx.eventTarget.gameId}`)
    seat.phase = 'kicked'
    seat.moves = []
    delete seat.retiring
    await server.updateGameState(fresh)
    // Whole-snapshot: the seat leaves every panel and standings list at once.
    server.emit({ event: 'table-updated', game: fresh }, ctx.eventTarget)
    server.emit(
      {
        event: 'table-notice',
        kind: 'bot-removed',
        playerId,
        entryId: `bot-removed:${playerId}`,
        at: Date.now(),
      },
      ctx.eventTarget
    )
  })
}

/** The group-round beats a brain seat can owe, by round kind. */
const planGroupChallenge = ({
  ctx,
  game,
  round,
  roundIndex,
  seat,
  due,
}: {
  ctx: EngineContext
  game: Game
  round: Round
  roundIndex: number
  seat: Player
  due: (key: string, delayMs: () => number) => boolean
}) => {
  const challenge = round.groupChallenge

  // Classic rounds: one composed answer, banked through the shared scorer.
  if (isClassicGroupRound(challenge)) {
    if (round.groupAnswers[seat.id]) return
    if (due(`classic:${roundIndex}:${seat.id}`, () => classicAnswerDelay(round))) {
      dispatchClassicAnswer(ctx, roundIndex, seat.id)
    }
    return
  }

  const think = () => rollMs(BOT_TURN_THINK_MS, BOT_TURN_JITTER_MS)
  const readyBeat = () => rollMs(BOT_READY_MS, BOT_READY_JITTER_MS)

  // Turn-chain rounds (Border Chain, Atlas): dismiss the briefing, then play
  // the turn whenever the clock is the seat's.
  const chain = currentBorderChain(game) ?? currentAtlasChain(game)
  if (chain) {
    const { state } = chain
    if (state.finished || state.trap) return
    if (state.briefing) {
      if (!state.order.includes(seat.id) || state.ready.includes(seat.id)) return
      if (due(`chain-ready:${roundIndex}:${seat.id}`, readyBeat)) {
        dispatchChainReady(ctx, seat.id)
      }
      return
    }
    if (activePlayerId(state) !== seat.id) return
    if (due(`chain-move:${roundIndex}:${state.turn}`, think)) {
      dispatchChainMove(ctx, seat.id, state.turn)
    }
    return
  }

  const timeline = currentTimeline(game)
  if (timeline) {
    const { state } = timeline
    if (state.finished) {
      // The browsable chronicle: the seat "reads", then acks the reveal.
      if (state.order.includes(seat.id) && !(state.revealDone ?? []).includes(seat.id)) {
        if (
          due(`timeline-ack:${roundIndex}:${seat.id}`, () =>
            rollMs(BOT_BROWSE_ACK_MS, BOT_BROWSE_ACK_JITTER_MS)
          )
        ) {
          dispatchTimelineAck(ctx, seat.id)
        }
      }
      return
    }
    if (state.revealing || activeTimelinePlayerId(state) !== seat.id) return
    if (due(`timeline:${roundIndex}:${state.turn}`, think)) {
      dispatchTimelinePlacement(ctx, seat.id, state.turn)
    }
    return
  }

  const heritage = currentHeritageHunt(game)
  if (heritage) {
    const { state } = heritage
    if (state.finished || state.revealing) return
    if (!state.order.includes(seat.id) || state.pins[seat.id]?.[state.beat]) return
    if (due(`heritage:${roundIndex}:${state.beat}:${seat.id}`, think)) {
      dispatchHeritagePin(ctx, seat.id)
    }
    return
  }

  const unique = currentUniqueOrBust(game)
  if (unique) {
    const { state } = unique
    if (state.finished || !state.order.includes(seat.id)) return
    if (state.briefing) {
      if (state.ready.includes(seat.id)) return
      if (due(`unique-ready:${roundIndex}:${seat.id}`, readyBeat)) {
        dispatchUniqueReady(ctx, seat.id)
      }
      return
    }
    unique.categories.forEach((category, index) => {
      if (state.locked[seat.id]?.includes(category)) return
      if (
        due(`unique:${roundIndex}:${seat.id}:${category}`, () =>
          rollMs(BOT_UNIQUE_BASE_MS + index * BOT_UNIQUE_STAGGER_MS, BOT_UNIQUE_JITTER_MS)
        )
      ) {
        dispatchUniqueAnswer(ctx, seat.id, category)
      }
    })
    return
  }

  const sweep = currentCleanSweep(game)
  if (sweep) {
    const { state } = sweep
    if (state.finished || !state.order.includes(seat.id)) return
    if (state.briefing) {
      if (state.ready.includes(seat.id)) return
      if (due(`sweep-ready:${roundIndex}:${seat.id}`, readyBeat)) {
        dispatchSweepReady(ctx, seat.id)
      }
      return
    }
    if ((state.benched[seat.id] ?? 0) > Date.now()) return
    if (!sweepUnclaimed(sweep).length) return
    // The stamp is consumed on fire, so each claim re-rolls its own gap —
    // a quicker seat sweeps faster, exactly like a human on a roll.
    if (
      due(`sweep:${roundIndex}:${seat.id}`, () =>
        rollMs(
          BOT_SWEEP_BASE_MS + (1 - botShare(game, seat.id)) * BOT_SWEEP_SPREAD_MS,
          BOT_SWEEP_JITTER_MS
        )
      )
    ) {
      dispatchSweepClaim(ctx, seat.id)
    }
    return
  }

  const government = currentGovernment(game)
  if (government) {
    const { state } = government
    if (state.finished || state.verdict) return
    if (state.picks[state.beat][seat.id] !== undefined) return
    if (due(`government:${roundIndex}:${state.turn}:${seat.id}`, think)) {
      dispatchGovernmentPick(ctx, seat.id, state.turn)
    }
    return
  }

  const manhunt = currentManhunt(game)
  if (manhunt) {
    const { state } = manhunt
    if (state.finished) return
    if (!isManhuntParticipant(manhunt, seat.id)) return
    if (state.briefing) {
      if (state.ready.includes(seat.id)) return
      if (due(`manhunt-ready:${roundIndex}:${seat.id}`, readyBeat)) {
        dispatchManhuntReady(ctx, seat.id)
      }
      return
    }
    if (state.beat === 'move' && manhunt.despotId === seat.id) {
      if (due(`manhunt-move:${roundIndex}:${state.turn}`, think)) {
        dispatchManhuntMove(ctx, seat.id, state.turn)
      }
      return
    }
    if (state.beat === 'hunt' && state.detectives.includes(seat.id)) {
      if (state.committed.includes(seat.id)) return
      if (
        due(`manhunt-marker:${roundIndex}:${state.turn}:${seat.id}`, () =>
          rollMs(BOT_TURN_THINK_MS + 1500, BOT_TURN_JITTER_MS)
        )
      ) {
        dispatchManhuntMarker(ctx, seat.id, state.turn)
      }
    }
  }
}

/** Where in the classic play window this answer lands. Untimed kinds (a
 *  ranking being dragged, a sketch) carry the 3-minute AFK ceiling as their
 *  deadline, NOT a play window — a fraction of it read as bots stalling for
 *  a minute-plus on every ranking round (found live on the PR preview), so
 *  they get a flat human-ish think instead. */
const classicAnswerDelay = (round: Round): number => {
  if (!round.deadline || classicPlaySeconds(round.groupChallenge) === undefined) {
    return rollMs(BOT_UNTIMED_THINK_MS, BOT_UNTIMED_THINK_JITTER_MS)
  }
  const remaining = Math.max(0, round.deadline - Date.now())
  const [from, to] = BOT_CLASSIC_WINDOW
  return remaining * (from + Math.random() * (to - from))
}

// --- The AFK autopilot: the same brain, borrowed for a vacated human seat ---

/**
 * A player's socket dropped mid-race. After the grace window — long enough
 * that a refresh or a train tunnel never triggers it — the autopilot takes
 * the seat: the latch rides the snapshot (the table sees the badge), the
 * pump starts playing the seat, and the player's rejoin releases it.
 * Armed from the socket server's disconnect hook, drain-guarded there.
 */
/** When each seat's socket last (re)bound, keyed `${gameId}|${playerId}` —
 *  in-memory, stamped by join. A takeover armed by an OLD disconnect must
 *  die if the player reconnected inside the grace window, even when the
 *  fire-moment socket check catches them mid-refresh with no live socket. */
const seatPresenceAt = new Map<string, number>()

export const noteSeatPresence = (gameId: string, playerId: string) => {
  seatPresenceAt.set(`${gameId}|${playerId}`, Date.now())
  if (seatPresenceAt.size > 4096) {
    const oldest = seatPresenceAt.keys().next().value
    if (oldest) seatPresenceAt.delete(oldest)
  }
}

export const armAfkTakeover = (ctx: EngineContext, disconnectedSocketId: string) => {
  const { gameId, playerId } = ctx.eventTarget
  const armedAt = Date.now()
  scheduleGameTask({ redis: ctx.redis, gameId }, AUTOPILOT_GRACE_MS, async () => {
    const server = useServerSideEvents(ctx)
    const game = await server.fetchGame(gameId)
    if (!game?.started) return
    const seat = game.players[playerId]
    if (!seat || seat.bot || seat.autopilot) return
    if (['victory', 'kicked'].includes(seat.phase)) return
    // Reconnected at any point since this timer armed? Then the player was
    // never gone for the whole grace window — a rejoin mid-window followed
    // by an ordinary refresh at fire time must not read as AFK.
    if ((seatPresenceAt.get(`${gameId}|${playerId}`) ?? 0) > armedAt) return
    // Still gone? A reconnected tab holds a NEW socket bound to the same id.
    const sockets = await ctx.io.in(gameId).fetchSockets()
    const returned = sockets.some(
      other => other.data.playerId === playerId && other.id !== disconnectedSocketId
    )
    if (returned) return
    console.warn(`Autopilot taking over ${playerId} in ${gameId}`)
    // The covered span starts with the first round the BRAIN could earn:
    // crediting it with a round the human already answered — or a live
    // turn-engine round the human mostly played (those bank nothing until
    // settle, so "did they answer" is unknowable) — reads as a lie on the
    // catch-up card. Only a live classic the seat has NOT answered counts.
    const roundIndex = game.rounds.length - 1
    const live = latestRound(game)
    const creditable = isClassicGroupRound(live?.groupChallenge) && !live?.groupAnswers[playerId]
    seat.autopilot = { sinceRound: creditable ? Math.max(0, roundIndex) : game.rounds.length }
    await server.updateGameState(game)
    server.emit({ event: 'update', game }, ctx.eventTarget)
    server.emit(
      {
        event: 'table-notice',
        kind: 'autopilot-engaged',
        playerId,
        entryId: `autopilot:${playerId}:${Date.now()}`,
        at: Date.now(),
      },
      ctx.eventTarget
    )
    armBotPump(ctx, game)
  })
}

/**
 * The player is back (join is the ONE caller): clear the latch so every
 * pending bot act dies on its brain-seat guard, announce the return, and
 * hand the player their catch-up numbers. Mutates the join's own game copy —
 * the join's save carries it. Only rounds the brain actually BANKED count
 * (an in-flight round it never answered is not "played for you"), and a
 * winner checking their result gets no ceremony over the final standings.
 */
export const releaseAutopilot = (ctx: EngineContext, game: Game, seat: Player) => {
  if (!seat.autopilot) return
  const { sinceRound } = seat.autopilot
  delete seat.autopilot
  const covered = game.rounds.slice(sinceRound).filter(round => round.playerTurns[seat.id]?.points)
  const scored = covered.reduce(
    (sum, round) => sum + (round.playerTurns[seat.id]?.points?.scored ?? 0),
    0
  )
  const server = useServerSideEvents(ctx)
  console.warn(`Autopilot released for ${seat.id} in ${game.id} (${covered.length} rounds)`)
  if (seat.phase === 'victory') return
  server.emit(
    {
      event: 'table-notice',
      kind: 'autopilot-reclaimed',
      playerId: seat.id,
      entryId: `autopilot:${seat.id}:${Date.now()}`,
      at: Date.now(),
    },
    ctx.eventTarget
  )
  server.emit(
    { event: 'autopilot-summary', playerId: seat.id, rounds: covered.length, scored },
    ctx.eventTarget
  )
}

// --- Acts: each one is its own queued task with a fresh fetch, and every ---
// --- mutation re-validates the state it was planned against — including  ---
// --- that the seat is STILL brain-played: a human reclaiming their seat  ---
// --- between plan and act kills the pending action here.                 ---

const brainSeat = (game: Game, playerId: string): Player | undefined => {
  const seat = game.players[playerId]
  return seat && isBrainSeat(seat) ? seat : undefined
}

const dispatchCloseTutorial = (ctx: EngineContext) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    const seat = brainSeat(fresh, ctx.eventTarget.playerId)
    if (seat?.phase !== 'tutorial') return
    await closeTutorialHandler({
      io: ctx.io,
      redis: ctx.redis,
      socket: ctx.socket,
      eventTarget: ctx.eventTarget,
      eventKey: 'close-tutorial',
      eventData: { event: 'close-tutorial' },
    })
  })
}

const dispatchClassicAnswer = (ctx: EngineContext, roundIndex: number, playerId: string) => {
  scheduleEngineTask(ctx, 0, async (fresh, server) => {
    if (fresh.rounds.length - 1 !== roundIndex) return
    const round = latestRound(fresh)
    const seat = brainSeat(fresh, playerId)
    if (!round || !seat || seat.phase !== 'group-challenge') return
    if (!isClassicGroupRound(round.groupChallenge) || round.groupAnswers[playerId]) return

    const submission = await composeClassicSubmission(fresh, round, playerId)
    if (!submission) return

    // Through the REAL submit handler, exactly like the gate and gauntlet
    // acts — the composer builds the answer, the wire handler owns the
    // protocol (duplicate latch, reveal-hold flip, advance, the scorecard
    // cap, every guard it grows later). A private grade-and-advance copy
    // here had already drifted once: it skipped armGroupScoresCap, leaving
    // a banked bot with no server-owned exit if the pump died.
    await submitGroupChallengeAnswersHandler({
      io: ctx.io,
      redis: ctx.redis,
      socket: ctx.socket,
      eventTarget: ctx.eventTarget,
      eventKey: 'submit-group-challenge-answers',
      eventData: { event: 'submit-group-challenge-answers', ...submission, roundIndex },
    })
    // The room's guess ticker: the seat audibly answered, nothing more.
    server.emit(
      {
        event: 'player-guessing',
        playerId,
        kind: 'presence',
        entryId: `${playerId}:${round.deadline ?? roundIndex}`,
        at: Date.now(),
      },
      ctx.eventTarget
    )
  })
}

const dispatchScoresExit = (ctx: EngineContext, playerId: string, walkSeq: number | undefined) => {
  scheduleEngineTask(ctx, 0, async (fresh, server) => {
    const seat = brainSeat(fresh, playerId)
    if (!seat || seat.phase !== 'group-scores' || seat.walkSeq !== walkSeq) return
    // The scorecard cap's shape (seat-exits.ts), one seat, sooner.
    seat.phase = 'moving'
    await server.updateGameState(fresh)
    server.emit({ event: 'update', game: fresh }, ctx.eventTarget)
    scheduleMovementPhase(WALK_LEAD_MS, ctx, { continuation: true, walkSeq })
  })
}

const dispatchChainReady = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    const border = currentBorderChain(fresh)
    if (border) return handleBorderChainReady(ctx, fresh, playerId)
    const atlas = currentAtlasChain(fresh)
    if (atlas) return handleAtlasChainReady(ctx, fresh, playerId)
  })
}

const dispatchChainMove = (ctx: EngineContext, playerId: string, turn: number) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    const share = jitteredShare(botShare(fresh, playerId))
    const border = currentBorderChain(fresh)
    if (border) {
      const isoCode = pickChainIso(borderChainOpenMoves(border, fresh), fresh, share)
      if (!isoCode) return
      return handleBorderChainMove(ctx, fresh, { isoCode, turn }, playerId)
    }
    const atlas = currentAtlasChain(fresh)
    if (atlas) {
      const isoCode = pickChainIso(atlasOpenMoves(atlas, fresh), fresh, share)
      if (!isoCode) return
      return handleAtlasChainMove(ctx, fresh, { isoCode, turn }, playerId)
    }
  })
}

/** A legal extension at the seat's level, a plausible wrong name below it.
 *  The engine is the judge either way — a wrong pick burns a strike through
 *  the same path a human's wrong name does. */
const pickChainIso = (
  open: ISOCountryCode[],
  game: Game,
  share: number
): ISOCountryCode | undefined => {
  if (Math.random() < share) return sample(open) ?? wrongPick(game, open)
  return wrongPick(game, open) ?? sample(open)
}

const wrongPick = (game: Game, not: readonly ISOCountryCode[]): ISOCountryCode | undefined =>
  sample(playableWorldCountries(game).filter(isoCode => !not.includes(isoCode)))

const dispatchGateAnswer = (ctx: EngineContext, gateTile: number) => {
  const { playerId } = ctx.eventTarget
  scheduleEngineTask(ctx, 0, async fresh => {
    // Composed INSIDE the task, from the fresh fetch — like every other act.
    const seat = brainSeat(fresh, playerId)
    const challenge = seat?.moves[0]?.challenge
    if (!seat || challenge?._type !== 'individual-challenge') return
    if (seat.moves[0]?.endTile.position !== gateTile) return
    const share = jitteredShare(botShare(fresh, playerId))
    const hit = Math.random() < share
    // A MISS must actually miss: several variants accept more than one
    // country (a euro gate takes ~20, errata every culprit), so the miss
    // pool is filtered through the same verdict the grader uses — from the
    // dealt options where the gate has them, so the pick stays plausible.
    const missPool = (
      challenge.options?.length ? challenge.options : playableWorldCountries(fresh)
    ).filter(option => !isCorrectIndividualAnswer(challenge, option))
    const isoCode = hit ? challenge.country : (sample(missPool) ?? challenge.country)
    try {
      await submitIndividualChallengeAnswersHandler({
        io: ctx.io,
        redis: ctx.redis,
        socket: ctx.socket,
        eventTarget: ctx.eventTarget,
        eventKey: 'submit-individual-challenge-answer',
        eventData: {
          event: 'submit-individual-challenge-answer',
          isoCode,
          // A bot never races the gate clock: a mid-window fraction, no hints.
          remainingFraction: clamp01(0.3 + share * 0.4),
          hintsUsed: 0,
          gateTile,
        },
      })
    } catch (error) {
      console.warn(`Bot gate answer rejected for ${playerId}`, error)
    }
  })
}

// --- Engine arms: each replicates the wire handler's guards (the engines' ---
// --- apply* functions deliberately trust their callers) before acting.    ---

const dispatchTimelinePlacement = (ctx: EngineContext, playerId: string, turn: number) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    const challenge = currentTimeline(fresh)
    if (!challenge) return
    const { state } = challenge
    // The wire handler's guard, shared — resolveTimelinePlacement reads the
    // actor from state and checks nothing itself.
    if (!mayPlaceTimeline(challenge, playerId, turn)) return
    const slug = drawnCard(state)
    const year = slug ? timelineEvent(slug)?.year : undefined
    if (year === undefined) return
    const { low, high } = correctSlotRange(placedYears(state.placed), year)
    const share = jitteredShare(botShare(fresh, playerId))
    const rightSlots = Array.from({ length: high - low + 1 }, (_, index) => low + index)
    const slot = Math.random() < share ? sample(rightSlots)! : low > 0 ? low - 1 : high + 1
    await resolveTimelinePlacement(ctx, fresh, challenge, Math.min(slot, state.placed.length))
  })
}

const dispatchTimelineAck = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    await handleTimelineRevealDone(ctx, fresh, playerId)
  })
}

const dispatchHeritagePin = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    const challenge = currentHeritageHunt(fresh)
    if (!challenge) return
    const { state } = challenge
    if (state.finished || state.revealing) return
    const target = PLACES[challenge.slugs[state.beat]]?.coordinates
    if (!target) return
    const share = jitteredShare(botShare(fresh, playerId))
    const missKm =
      challenge.perfectDistanceKm +
      (1 - share) * (challenge.zeroDistanceKm - challenge.perfectDistanceKm) * 0.9
    // applyHeritagePin's own guards cover membership and the one-pin rule.
    await applyHeritagePin(
      ctx,
      fresh,
      challenge,
      playerId,
      offsetKm(target, missKm * Math.random(), Math.random() * 360)
    )
  })
}

const dispatchUniqueReady = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    const challenge = currentUniqueOrBust(fresh)
    if (challenge) await applyUniqueReady(ctx, fresh, challenge, playerId)
  })
}

const dispatchUniqueAnswer = (ctx: EngineContext, playerId: string, category: UniqueCategoryId) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    const challenge = currentUniqueOrBust(fresh)
    if (!challenge || challenge.state.briefing || challenge.state.finished) return
    if (challenge.state.locked[playerId]?.includes(category)) return
    const registers = await uniqueRegisters(fresh)
    const pool = uniqueEntriesForLetter(registers[category], challenge.letter)
    if (!pool.length) return
    // NEVER the answer-sheet side key: the sheet is hidden from rivals so
    // nobody can dodge a collision they cannot see, and a bot reading it
    // would win the mode's core gamble with information no human has. The
    // bot gambles like everyone else — a skilled seat leans away from the
    // head of the register (the obvious answers humans grab first), which
    // is exactly the human dodge, played on the same blind board.
    const share = jitteredShare(botShare(fresh, playerId))
    const deepCut = pool.slice(Math.min(pool.length - 1, Math.floor(pool.length / 3)))
    const entry = Math.random() < share ? (sample(deepCut) ?? sample(pool)) : sample(pool)
    if (!entry) return
    await applyUniqueAnswer(ctx, fresh, challenge, playerId, category, entry.id)
  })
}

const dispatchSweepReady = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    const challenge = currentCleanSweep(fresh)
    if (challenge) await applySweepReady(ctx, fresh, challenge, playerId)
  })
}

const dispatchSweepClaim = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    const challenge = currentCleanSweep(fresh)
    if (!challenge) return
    const free = sweepUnclaimed(challenge)
    if (!free.length) return
    const share = jitteredShare(botShare(fresh, playerId))
    // A rare stray (a non-member) benches the bot through the engine's own
    // path — the same cost a human's wrong tap pays.
    const isoCode =
      Math.random() < Math.min(0.95, 0.5 + share * 0.5)
        ? sample(free)
        : (wrongPick(fresh, [...challenge.members, ...(challenge.offBoard ?? [])]) ?? sample(free))
    if (!isoCode) return
    await applySweepClaim(ctx, fresh, challenge, playerId, isoCode)
  })
}

const dispatchGovernmentPick = (ctx: EngineContext, playerId: string, turn: number) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    const challenge = currentGovernment(fresh)
    if (!challenge) return
    const { state } = challenge
    if (state.finished || state.verdict || state.turn !== turn) return
    if (state.picks[state.beat][playerId] !== undefined) return
    const answers = await ctx.redis.get<GovernmentAnswers>(
      governmentKey(fresh.id, fresh.rounds.length - 1)
    )
    if (!answers) return
    const share = jitteredShare(botShare(fresh, playerId))
    const hit = Math.random() < share
    let pick: GovernmentAnswer | undefined
    switch (state.beat) {
      case 'party': {
        const names = challenge.options.map(option => option.name)
        pick = {
          party: hit
            ? answers.governingParty
            : (sample(names.filter(name => name !== answers.governingParty)) ??
              answers.governingParty),
        }
        break
      }
      case 'seats': {
        pick = {
          seats: hit
            ? answers.governingSeats
            : (sample(challenge.blocks.filter(block => block !== answers.governingSeats)) ??
              answers.governingSeats),
        }
        break
      }
      case 'sides': {
        // 'backing' grades as 'government' — the same fold scoreBeat applies.
        pick = {
          sides: Object.fromEntries(
            challenge.sorted.map(name => {
              const truth = answers.standings[name] === 'opposition' ? 'opposition' : 'government'
              const flip = truth === 'opposition' ? 'government' : 'opposition'
              return [name, Math.random() < share ? truth : flip]
            })
          ),
        }
        break
      }
    }
    if (pick) await applyGovernmentPick(ctx, fresh, challenge, playerId, turn, pick)
  })
}

const dispatchManhuntReady = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    const challenge = currentManhunt(fresh)
    if (!challenge) return
    // applyManhuntReady trusts its caller on participation — replicate the
    // wire handler's check or a stray ready stalls the briefing forever.
    const participant =
      challenge.despotId === playerId || challenge.state.detectives.includes(playerId)
    if (!participant) return
    await applyManhuntReady(ctx, fresh, challenge, playerId)
  })
}

const dispatchManhuntMove = (ctx: EngineContext, playerId: string, turn: number) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    const challenge = currentManhunt(fresh)
    if (!challenge || challenge.despotId !== playerId) return
    const { state } = challenge
    if (state.finished || state.briefing || state.beat !== 'move' || state.turn !== turn) return
    const secret = await ctx.redis.get<ManhuntSecret>(manhuntKey(fresh.id, fresh.rounds.length - 1))
    const from = secret?.trail[secret.trail.length - 1]
    if (!from) return
    const move = randomManhuntMove(from, state.seaPassagesLeft, fresh)
    // Cornered (an island hideout, no sea passages left): randomManhuntMove
    // hands back `from`, which applyManhuntMove refuses as illegal — only
    // the beat's own timeout commits the idle hop. Stand down and let it.
    if (move.isoCode === from) return
    await applyManhuntMove(ctx, fresh, challenge, move.isoCode)
  })
}

const dispatchManhuntMarker = (ctx: EngineContext, playerId: string, turn: number) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    const challenge = currentManhunt(fresh)
    if (!challenge || !challenge.state.detectives.includes(playerId)) return
    const { state } = challenge
    if (state.finished || state.briefing || state.beat !== 'hunt' || state.turn !== turn) return
    if (state.committed.includes(playerId)) return
    // Honest detective: sample the clue-consistent set — never the secret
    // trail itself. Hard mode hides the public snapshot's copy, so the side
    // key's authoritative set stands in (same information, engine-derived).
    let candidates = state.candidates
    if (!candidates.length) {
      const secret = await ctx.redis.get<ManhuntSecret>(
        manhuntKey(fresh.id, fresh.rounds.length - 1)
      )
      candidates = secret?.candidates ?? []
    }
    const marker = sample(candidates)
    if (!marker) return
    await applyManhuntMarker(ctx, fresh, challenge, playerId, marker)
  })
}

const dispatchFinalAnswer = (ctx: EngineContext, turn: number) => {
  const { playerId } = ctx.eventTarget
  scheduleEngineTask(ctx, 0, async fresh => {
    // Composed INSIDE the task, from the fresh fetch — like every other act.
    const seat = brainSeat(fresh, playerId)
    const item = seat?.moves[0]?.challenge
    if (item?._type !== 'final-challenge' || (item.turn ?? 0) !== turn) return
    const question = item.challenges[0]
    if (!question) return
    const share = jitteredShare(botShare(fresh, playerId))
    const submittedAnswer = finalAnswerFor(question, share, fresh)
    if (!submittedAnswer) return
    try {
      await submitFinalChallengeAnswerHandler({
        io: ctx.io,
        redis: ctx.redis,
        socket: ctx.socket,
        eventTarget: ctx.eventTarget,
        eventKey: 'submit-final-challenge-answer',
        eventData: { event: 'submit-final-challenge-answer', submittedAnswer, turn },
      })
    } catch (error) {
      console.warn(`Bot final answer rejected for ${playerId}`, error)
    }
  })
}

/**
 * A well-formed answer for EVERY gauntlet question kind — correct with the
 * share's probability, an honest miss otherwise. Misses stay INSIDE the
 * question's own frame (a lineup pick, a dealt-window country, a near-miss
 * year): the handler refuses out-of-frame answers before consuming the
 * question, and a refused miss re-rolled forever means a bot that never
 * burns a life. Correctness comes from the same helpers the verdict uses.
 */
export const finalAnswerFor = (
  question: FinalChallengeItem,
  share: number,
  game: Game
): FinalChallengeAnswer | undefined => {
  const wantCorrect = Math.random() < share
  const iso = (correctIso: ISOCountryCode | undefined, pool?: readonly ISOCountryCode[]) => {
    if (wantCorrect && correctIso) return correctIso
    const misses = (pool ?? playableWorldCountries(game)).filter(
      candidate => candidate !== correctIso
    )
    return sample(misses) ?? correctIso
  }
  switch (question._type) {
    case 'region-challenge': {
      const truth = COUNTRIES[question.country]?.region
      const region = wantCorrect && truth ? truth : sample(worldRegions)!
      return { _type: question._type, region }
    }
    case 'min-challenge':
    case 'max-challenge':
    case 'leadership-challenge': {
      const pick = iso(question.country)
      return pick ? { _type: question._type, isoCode: pick } : undefined
    }
    case 'language-challenge': {
      const speakers = playableWorldCountries(game).filter(country =>
        speaksLanguage(country, question.language)
      )
      const pick = iso(sample(speakers))
      return pick ? { _type: question._type, isoCode: pick } : undefined
    }
    case 'made-challenge': {
      const accepted = madeAcceptedCountries(question.commodity)
      const pick = iso(sample([...accepted]))
      return pick ? { _type: question._type, isoCode: pick } : undefined
    }
    case 'membership-challenge':
    case 'treaty-challenge': {
      // The miss comes from the LINEUP — anything else is refused unheard.
      const pick = iso(oddOneOut(question), question.lineup)
      return pick ? { _type: question._type, isoCode: pick } : undefined
    }
    case 'sunset-blitz-challenge': {
      const quota = sunsetQuota(question)
      const named = wantCorrect
        ? sampleMany(question.countries, quota)
        : sampleMany(question.countries, Math.max(0, quota - 1))
      return { _type: question._type, namedCountries: named }
    }
    case 'city-nocturne-challenge': {
      const dealt = [...nocturneDealtCities(question)]
      const named = wantCorrect
        ? sampleMany(dealt, question.quota)
        : sampleMany(dealt, Math.max(0, question.quota - 1))
      return { _type: question._type, namedCities: named }
    }
    case 'born-challenge': {
      const qualifying = playableWorldCountries(game).filter(country =>
        bornAfter(country, question.year)
      )
      const picks = wantCorrect
        ? sampleMany(qualifying, question.quota)
        : sampleMany(qualifying, Math.max(0, question.quota - 1))
      return { _type: question._type, isoCodes: picks }
    }
    case 'scales-challenge': {
      // Search the pool for a balancing set the same way a player eyeballs
      // one — bounded tries, judged by the verdict's own scale.
      if (wantCorrect) {
        const pool = playableWorldCountries(game).filter(country => country !== question.target)
        for (let attempt = 0; attempt < 120; attempt++) {
          const picks = sampleMany(pool, 1 + Math.floor(Math.random() * question.maxPicks))
          if (weighScalesPicks(question, picks)?.balanced) {
            return { _type: question._type, isoCodes: picks }
          }
        }
      }
      const miss = wrongPick(game, [question.target])
      return { _type: question._type, isoCodes: miss ? [miss] : [] }
    }
    case 'endonym-challenge': {
      // Positional: right beats where the roll says so, shuffled elsewhere.
      const picks = question.countries.map(country =>
        Math.random() < share ? country : (wrongPick(game, [country]) ?? country)
      )
      return { _type: question._type, isoCodes: wantCorrect ? [...question.countries] : picks }
    }
    case 'diaspora-challenge': {
      const picks = question.accepted.map(options =>
        wantCorrect || Math.random() < share
          ? (sample(options) ?? wrongPick(game, [])!)
          : (wrongPick(game, options) ?? sample(options)!)
      )
      return { _type: question._type, isoCodes: picks }
    }
    case 'yearbook-challenge': {
      const year = yearbookYear(question)
      if (year === undefined) return undefined
      const spread = Math.max(1, question.tolerance)
      const offset = wantCorrect
        ? Math.round((Math.random() * 2 - 1) * question.tolerance)
        : (question.tolerance + 1 + Math.floor(Math.random() * spread * 3)) *
          (Math.random() < 0.5 ? -1 : 1)
      return { _type: question._type, year: year + offset }
    }
    case 'boundary-challenge': {
      const scene = boundaryScene(question.countries)
      if (!scene) return undefined
      // A correct trace follows the real line; a miss walks a parallel
      // offset far enough outside the tolerance band to grade wrong.
      const drift = wantCorrect ? 0 : scene.span * question.tolerance * 3
      const drawn = scene.line.map(([x, y]) => [x + drift, y + drift] as [number, number])
      return { _type: question._type, drawn }
    }
    case 'change-challenge': {
      const accepted = changeAccepted(question)
      const pick = iso(sample(accepted))
      if (!pick) return undefined
      const decade = changeDecade(question)
      if (question.decadeTolerance === undefined || decade === undefined) {
        return { _type: question._type, isoCode: pick }
      }
      const decadeGuess = wantCorrect ? decade : decade + (question.decadeTolerance + 1) * 10
      return { _type: question._type, isoCode: pick, decade: decadeGuess }
    }
  }
  return undefined
}

// --- The classic submission composer: one probe grade surfaces the mode's ---
// --- correct set, then the seat's share decides how much of it lands.     ---

/**
 * Compose a skill-scaled submission for any classic kind. The probe grade
 * (absent, never banked) surfaces the same `correct` set the scorecard will
 * show, so the composed answer can never contain a subject the round never
 * had — the harness's rival trick (settle-group-round.ts), server-side.
 */
export const composeClassicSubmission = async (
  game: Game,
  round: Round,
  playerId: string
): Promise<GroupSubmission | undefined> => {
  let correct: ISOCountryCode[]
  try {
    const probe = await gradeGroupAnswer({
      game,
      round,
      playerId,
      submission: ABSENT_SUBMISSION,
      absent: true,
    })
    // A round that never dealt to this seat grades absent as a potless 0/0
    // (the late-joiner shape) — a REAL submission would throw, so compose
    // nothing and let the settle bank the absence.
    if (!probe.scoring.maximum && !(probe.answer.correct ?? []).length) return undefined
    correct = probe.answer.correct ?? []
  } catch {
    // Same seat, harder shape: the probe itself refused. Nothing to compose.
    return undefined
  }

  const share = jitteredShare(botShare(game, playerId))
  const hit = Math.random() < share
  const challenge = round.groupChallenge
  const kind = roundChallengeKind(challenge)
  const maximum = 'maximumPoints' in challenge ? (challenge.maximumPoints ?? 0) : 0
  /** A buzz-style claim: the share sets how sharp the (server-clamped) buzz
   *  was; the jitter keeps two bots from tying forever. */
  const claim = Math.round(maximum * share * (0.6 + Math.random() * 0.4))
  const buzzAt = clamp01(0.25 + share * 0.5)

  switch (kind) {
    case 'silhouette':
    case 'anthem-buzz':
    case 'stat-detective':
    case 'two-truths':
    case 'flashpoint':
    case 'capital-guess':
    case 'flag-palette':
    case 'composition': {
      const target = correct[0]
      if (!target) return { ranking: [] }
      const pick = hit ? target : (wrongPick(game, correct) ?? target)
      return { ranking: [pick], clientScore: hit ? claim : 0, buzzAt }
    }
    case 'tongue-buzz': {
      // Any speaker wins — the correct set is the whole membership.
      const pick = hit ? sample(correct) : wrongPick(game, correct)
      return pick ? { ranking: [pick], clientScore: hit ? claim : 0, buzzAt } : { ranking: [] }
    }
    case 'hot-cold': {
      // A probe trail: the colder the seat, the longer the wander.
      const target = correct[0]
      if (!target) return { ranking: [] }
      const wander = Array.from({ length: Math.round((1 - share) * 4) }, () =>
        wrongPick(game, correct)
      ).filter((isoCode): isoCode is ISOCountryCode => !!isoCode)
      return { ranking: hit ? [...wander, target] : wander }
    }
    case 'ghost-state':
    case 'trend-race': {
      const target = correct[0]
      if (!target) return { ranking: [] }
      const miss = wrongPick(game, correct)
      return {
        ranking: hit ? (miss && share < 0.5 ? [miss, target] : [target]) : miss ? [miss] : [],
      }
    }
    case 'empire': {
      const empire = expectChallengeType(challenge, 'empire-challenge')
      const members = takeShare(correct, share)
      const pots = empirePots(empire.maximumPoints)
      return {
        ranking: members,
        ...(hit
          ? {
              empire: {
                guessedId: empire.empireId,
                clientScore: Math.round(pots.name * (0.6 + share * 0.4)),
              },
            }
          : {}),
      }
    }
    case 'name-that-water': {
      const water = expectChallengeType(challenge, 'name-water-challenge')
      return hit
        ? { ranking: [], water: { guessedId: water.featureId }, clientScore: claim }
        : { ranking: [] }
    }
    case 'pin-landmark': {
      const pin = expectChallengeType(challenge, 'pin-landmark-challenge')
      const target = PLACES[pin.slug]?.coordinates
      if (!target) return { ranking: [] }
      // Share interpolates the miss radius between a bullseye and the zero
      // ring; the bearing is anyone's guess, like a real pin.
      const missKm =
        pin.perfectDistanceKm + (1 - share) * (pin.zeroDistanceKm - pin.perfectDistanceKm) * 0.9
      return { ranking: [], pin: offsetKm(target, missKm * Math.random(), Math.random() * 360) }
    }
    case 'sketch': {
      // The similarity IS the score, client-computed by design — the share
      // stands in for a drawing of that quality.
      return { ranking: [], clientScore: claim }
    }
    default: {
      // Every collect-a-set and ordered kind: a share-sized slice of the
      // correct set, order preserved (a prefix of a ranking or a path is a
      // plausible partial answer; aligned slices keep pair-scored kinds fair).
      return { ranking: takeShare(correct, share) }
    }
  }
}

const takeShare = (correct: readonly ISOCountryCode[], share: number): ISOCountryCode[] => {
  if (!correct.length) return []
  const take = Math.max(1, Math.round(correct.length * share))
  return correct.slice(0, take)
}
