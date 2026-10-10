import { randomBetween, randomInt, sample, sampleMany } from '~~/lib/arrays'
import {
  botShare,
  isBrainSeat,
  jitteredShare,
  GATE_REMAINING,
  HOT_COLD_MAX_WANDER,
  PIN_SCATTER_BAND,
  SWEEP_ACCURACY,
} from '~~/lib/bots'
import { empirePots } from '~~/lib/empires'
import { isCorrectIndividualAnswer } from '~~/lib/challenges'
import { playableWorldCountries } from '~~/lib/game-rules'
import { offsetKm, type LatLng } from '~~/lib/geo'
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
  BOT_FINAL_EXTRA_MS,
  BOT_MARKER_EXTRA_MS,
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
  remainingFractionOn,
} from '~~/lib/round-beats'
import { expectChallengeType, latestRound } from '~~/lib/rounds'
import { gateClockFor } from '~~/lib/gate-timing'
import { isTerminalStep, RETIREMENT_STEPS } from '~~/lib/seat-transitions'
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
import type { ClientEventData } from '~~/types/events.types'
import { enqueueGameTask, isDraining, useServerSideEvents } from '../server-side'
import { machineOwnsGame } from './game-ownership'
import { atlasOpenMoves, currentAtlasChain } from './atlas-turns'
import { borderChainOpenMoves, currentBorderChain } from './chain-turns'
import { scheduleGameTask } from './deferred-task'
import { ABSENT_SUBMISSION, gradeGroupAnswer, type GroupSubmission } from './grade-group-answer'
import { currentGovernment } from './government-beats'
import { currentHeritageHunt } from './heritage-beats'
import { currentManhunt, isManhuntParticipant } from './manhunt-beats'
import { SERVER_SIDE_EVENT_HANDLERS } from './registry'
import { scheduleEngineTask, type EngineContext } from './round-engine'
import { retireSeat } from './seat-exits'
import { recordSeatEvent } from './seat-journal'
import { currentCleanSweep } from './sweep-beats'
import { currentTerraIncognita } from './terra-beats'
import { currentTimeline, mayPlaceTimeline } from './timeline-turns'
import { currentUniqueOrBust } from './unique-beats'

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

/**
 * Per-process pump registry, ONE record per game so the pieces can never
 * fall out of lockstep: the chain token (a superseded chain's tick stops
 * instead of pumping in parallel), the last tick (arming is idempotent
 * while a chain runs, re-armable once it stales), and the rolled act-at
 * stamps (in-memory on purpose — a restart re-rolls, which just reads as a
 * slower bot).
 */
interface PumpRecord {
  token: symbol
  tickedAt: number
  acts: Map<string, number>
}
const pumps = new Map<string, PumpRecord>()

const PUMP_STALE_MS = BOT_PUMP_MS * 4
/** Dead-chain registry entries (ownership moved, fetch blew up) get swept
 *  opportunistically — the rearm-round map's own growth argument. */
const PUMP_SWEEP_MS = 3_600_000

const rollMs = (base: number, jitter: number) => randomBetween(base, base + jitter)

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
/** The replay harness plays recorded bot acts back itself; the brain must sit still. */
let brainEnabled = true
export const setBotBrainEnabled = (enabled: boolean) => {
  brainEnabled = enabled
}

export const armBotPump = (ctx: EngineContext, game: Game) => {
  if (!brainEnabled) return
  if (!game.started || !gameHasBrainSeats(game)) return
  const { gameId } = ctx.eventTarget
  const now = Date.now()
  for (const [staleId, record] of pumps) {
    if (now - record.tickedAt > PUMP_SWEEP_MS) pumps.delete(staleId)
  }
  const live = pumps.get(gameId)
  if (live && now - live.tickedAt < PUMP_STALE_MS) return
  // A fresh chain token retires any chain still limping for this game — a
  // queue backlog can outlive the stale window, and two immortal chains
  // double every fetch for the rest of the game.
  const record: PumpRecord = { token: Symbol('bot-pump'), tickedAt: now, acts: new Map() }
  pumps.set(gameId, record)
  scheduleTick({ ...ctx, socket: DETACHED_SOCKET }, record.token)
}

/**
 * The tick loop — deliberately NOT scheduleGameTask: that seam skips the
 * task body outright when the ownership check fails or throws, and a
 * reschedule living inside the body dies with it, killing every bot in the
 * game until a human rejoins. This loop makes the same ownership decision
 * itself, so a genuine ownership move stops the pump on purpose while a
 * transient Redis hiccup only skips one beat. The tick is READ-ONLY —
 * every write still re-enters the queue via the acts' scheduleEngineTask.
 */
const scheduleTick = (ctx: EngineContext, token: symbol) => {
  const { gameId } = ctx.eventTarget
  setTimeout(() => {
    void (async () => {
      const record = pumps.get(gameId)
      if (record?.token !== token) return
      if (isDraining()) return void pumps.delete(gameId)
      try {
        // Nobody is watching: an all-brain room (the last human went AFK and
        // the autopilot took the seat) would otherwise play itself to the end
        // in an empty theatre. Worse, the ownership check below RE-CLAIMS the
        // lease on every beat, so the pump alone kept a spectatorless room
        // pinned to this machine — exactly what the socket-gated heartbeat in
        // game-ownership.ts declines to do. Rejoining re-arms through
        // `rearmLiveRound`, so stopping here costs the room nothing.
        if (!(await ctx.io.in(gameId).fetchSockets()).length) return void pumps.delete(gameId)
        if (!(await machineOwnsGame(ctx.redis, gameId))) {
          // Another machine owns the room now — its own rejoin arms its pump.
          return void pumps.delete(gameId)
        }
        await enqueueGameTask(gameId, async () => {
          const server = useServerSideEvents(ctx)
          const game = await server.fetchGame(gameId)
          const playing =
            game?.started &&
            Object.values(game.players).some(
              seat =>
                isBrainSeat(seat) &&
                (!isTerminalStep(seat.cursor.step) || (seat.bot && seat.retiring))
            )
          if (!playing) return void pumps.delete(gameId)
          record.tickedAt = Date.now()
          pumpGame(ctx, game!, record)
        })
      } catch (error) {
        console.error(`Bot pump tick failed for ${gameId}`, error)
      }
      if (pumps.get(gameId)?.token === token) scheduleTick(ctx, token)
    })()
  }, BOT_PUMP_MS)
}

/**
 * One read-only pass: for every brain seat, find the beat it owes, roll an
 * act-at stamp the first time the beat is seen, and dispatch the act once the
 * stamp is due. The per-game stamp map is rebuilt each pass, so stamps for
 * beats that no longer exist fall away instead of accumulating.
 */
const pumpGame = (ctx: EngineContext, game: Game, record: PumpRecord) => {
  const { gameId } = ctx.eventTarget
  const previous = record.acts
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

    const { step, subject, seq } = seat.cursor
    // A host asked this bot to leave mid-race: it plays out any round it is
    // still bound to, and retires the moment it stands somewhere safe. The
    // reveal retires a settled one before dealing, so it never takes a seat
    // in a fresh round's turn order.
    if (seat.bot && seat.retiring && RETIREMENT_STEPS.includes(step)) {
      dispatchRetirement(actorCtx, seq)
      continue
    }
    // A bot that WON while retiring: nothing left to leave — consume the
    // latch quietly or the podium row reads "Leaving after this round"
    // forever (the remove handler refuses winners, but a mid-gauntlet
    // removal can finish victorious before a retirement phase arrives).
    if (seat.bot && seat.retiring && step === 'victory') {
      dispatchRetirementClear(actorCtx, seat.id)
      continue
    }

    // Seat beats key on the cursor's subject and act on its seq: an act whose
    // seq has moved on by the time it runs dies in its own task.
    switch (step) {
      case 'tutorial': {
        if (due(`${seat.id}:${subject}`, () => rollMs(BOT_TUTORIAL_MS, BOT_TUTORIAL_JITTER_MS))) {
          dispatchCloseTutorial(actorCtx, seq)
        }
        break
      }
      case 'round': {
        if (!round) break
        planGroupChallenge({ ctx: actorCtx, game, round, roundIndex, seat, due })
        break
      }
      case 'scores': {
        if (due(`${seat.id}:${subject}`, () => rollMs(BOT_SCORES_MS, BOT_SCORES_JITTER_MS))) {
          dispatchScoresExit(actorCtx, seq)
        }
        break
      }
      case 'gate': {
        if (due(`${seat.id}:${subject}`, () => gateActDelay(game, seat))) {
          dispatchGateAnswer(actorCtx, seq)
        }
        break
      }
      case 'final': {
        if (
          due(`${seat.id}:${subject}`, () =>
            rollMs(BOT_TURN_THINK_MS + BOT_FINAL_EXTRA_MS, BOT_TURN_JITTER_MS)
          )
        ) {
          dispatchFinalAnswer(actorCtx, seq)
        }
        break
      }
    }
  }

  record.acts = current
}

const dispatchRetirementClear = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async (fresh, server) => {
    const seat = fresh.players[playerId]
    if (!seat?.bot || !seat.retiring || seat.cursor.step !== 'victory') return
    delete seat.retiring
    await recordSeatEvent(ctx.redis, fresh.id, {
      kind: 'event',
      at: Date.now(),
      actor: 'server',
      event: 'retire-clear',
      data: { playerId },
    })
    await server.updateGameState(fresh)
    server.emit({ event: 'update', game: fresh }, ctx.eventTarget)
  })
}

const dispatchRetirement = (ctx: EngineContext, seq: number) => {
  const { playerId } = ctx.eventTarget
  scheduleEngineTask(ctx, 0, async (fresh, server) => {
    const seat = fresh.players[playerId]
    if (!seat?.bot || !seat.retiring || seat.cursor.seq !== seq) return
    console.warn(`Retiring bot ${playerId} in ${ctx.eventTarget.gameId}`)
    retireSeat(fresh, seat)
    await recordSeatEvent(ctx.redis, fresh.id, {
      kind: 'event',
      at: Date.now(),
      actor: 'server',
      event: 'retire',
      data: { playerId },
    })
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

  // Terra Incognita is a classic round behind a briefing: the ready ack comes
  // first, and the composed answer only once the world is actually failing.
  const terra = currentTerraIncognita(game)
  if (terra?.state.briefing) {
    if (!terra.state.order.includes(seat.id) || terra.state.ready.includes(seat.id)) return
    if (
      due(`terra-ready:${roundIndex}:${seat.id}`, () => rollMs(BOT_READY_MS, BOT_READY_JITTER_MS))
    ) {
      dispatchTerraReady(ctx, seat.id)
    }
    return
  }

  // Classic rounds: one composed answer, banked through the shared scorer.
  if (isClassicGroupRound(challenge)) {
    if (round.groupAnswers[seat.id]) return
    if (due(`${seat.id}:${seat.cursor.subject}`, () => classicAnswerDelay(round))) {
      dispatchClassicAnswer(ctx, seat.cursor.seq)
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
          rollMs(BOT_TURN_THINK_MS + BOT_MARKER_EXTRA_MS, BOT_TURN_JITTER_MS)
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
  return remaining * randomBetween(from, to)
}

/**
 * How much of the play window is still on the clock as the bot answers — the
 * buzz moment it reports, measured rather than guessed. The act was already
 * scheduled into `BOT_CLASSIC_WINDOW`, so this reads back what that wait
 * actually spent; an untimed kind has no window to be early in and buzzes at
 * the middle of the curve.
 */
const liveRemainingFraction = (round: Round): number => {
  const playSeconds = classicPlaySeconds(round.groupChallenge)
  // An untimed kind has no window to be early in — mid-curve, not full marks.
  if (!round.deadline || !playSeconds) return 0.5
  return remainingFractionOn(round.deadline, playSeconds, Date.now())
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
  const key = `${gameId}|${playerId}`
  // Delete-before-set: Map.set on an existing key keeps its old insertion
  // slot, so without this a REFRESHED stamp could be the next one evicted
  // while dead games' stamps lived on. Stamps mean nothing past the grace
  // window, so the sweep keeps the map near-empty on its own.
  seatPresenceAt.delete(key)
  const now = Date.now()
  for (const [staleKey, at] of seatPresenceAt) {
    if (now - at > AUTOPILOT_GRACE_MS * 2) seatPresenceAt.delete(staleKey)
    else break
  }
  seatPresenceAt.set(key, now)
}

export const armAfkTakeover = (ctx: EngineContext, disconnectedSocketId: string) => {
  if (!brainEnabled) return
  const { gameId, playerId } = ctx.eventTarget
  const armedAt = Date.now()
  scheduleGameTask({ redis: ctx.redis, gameId }, AUTOPILOT_GRACE_MS, async () => {
    const server = useServerSideEvents(ctx)
    const game = await server.fetchGame(gameId)
    if (!game?.started) return
    const seat = game.players[playerId]
    if (!seat || seat.bot || seat.autopilot) return
    if (isTerminalStep(seat.cursor.step)) return
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
    await recordSeatEvent(ctx.redis, gameId, {
      kind: 'event',
      at: Date.now(),
      actor: 'server',
      event: 'autopilot-engage',
      data: { playerId, autopilot: seat.autopilot },
    })
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
 * Restart/deploy recovery for pending takeovers, called from rearmLiveRound
 * (a rejoin is the recovery moment, as for every in-memory timer): any
 * non-bot, non-covered, non-terminal seat with NO live socket gets a fresh
 * grace window. Without this, a deploy — which disconnects every socket at
 * once with the drain guard deliberately arming nothing — left exactly the
 * seats the autopilot exists for uncovered for the rest of the game.
 */
export const rearmAfkTakeovers = (ctx: EngineContext, game: Game) => {
  if (!game.started) return
  void ctx.io
    .in(game.id)
    .fetchSockets()
    .then(sockets => {
      const seated = new Set(
        sockets.flatMap(socket => (socket.data.playerId ? [socket.data.playerId] : []))
      )
      for (const seat of Object.values(game.players)) {
        if (seat.bot || seat.autopilot || seated.has(seat.id)) continue
        if (isTerminalStep(seat.cursor.step)) continue
        armAfkTakeover(
          { ...ctx, eventTarget: { gameId: game.id, playerId: seat.id } },
          'rearm-sweep'
        )
      }
    })
    .catch(error => console.error(`AFK takeover rearm failed for ${game.id}`, error))
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
  // The table hears "back at the helm" either way — the notice renders only to
  // the OTHER seats, so a winner's return is still news to them.
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
  // Only the ceremony is suppressed: a catch-up card over the final standings
  // reads as an interruption, not a summary.
  if (seat.cursor.step === 'victory') return
  server.emit(
    { event: 'autopilot-summary', playerId: seat.id, rounds: covered.length, scored },
    ctx.eventTarget
  )
}

// --- Acts: each one is its own queued task with a fresh fetch, and every ---
// --- mutation re-validates the state it was planned against — including  ---
// --- that the seat is STILL brain-played: a human reclaiming their seat  ---
// --- between plan and act kills the pending action here.                 ---

/**
 * Every bot act goes through the real client handler — the same validation a
 * human's event meets — and is recorded like one, so a replay can play the
 * seat back without running the brain.
 */
const botAct = async (ctx: EngineContext, eventData: ClientEventData) => {
  const { gameId, playerId } = ctx.eventTarget
  await recordSeatEvent(ctx.redis, gameId, {
    kind: 'event',
    at: Date.now(),
    actor: playerId,
    bot: true,
    event: eventData.event,
    data: eventData,
  })
  await SERVER_SIDE_EVENT_HANDLERS[eventData.event].handler({
    ...ctx,
    eventKey: eventData.event,
    eventData,
  })
}

const brainSeat = (game: Game, playerId: string): Player | undefined => {
  const seat = game.players[playerId]
  return seat && isBrainSeat(seat) ? seat : undefined
}

const dispatchCloseTutorial = (ctx: EngineContext, seq: number) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    const seat = brainSeat(fresh, ctx.eventTarget.playerId)
    if (seat?.cursor.seq !== seq) return
    await botAct(ctx, { event: 'close-tutorial', subject: seat.cursor.subject, seq })
  })
}

const dispatchClassicAnswer = (ctx: EngineContext, seq: number) => {
  const { playerId } = ctx.eventTarget
  scheduleEngineTask(ctx, 0, async (fresh, server) => {
    const round = latestRound(fresh)
    const seat = brainSeat(fresh, playerId)
    if (!round || !seat || seat.cursor.seq !== seq) return
    const roundIndex = fresh.rounds.length - 1
    if (!isClassicGroupRound(round.groupChallenge) || round.groupAnswers[playerId]) return

    const submission = await composeClassicSubmission(fresh, round, playerId)
    if (!submission) return

    // Through the REAL submit handler, exactly like the gate and gauntlet
    // acts — the composer builds the answer, the wire handler owns the
    // protocol (subject guard, verdict hold, advance, every guard it grows
    // later). A private grade-and-advance copy here had already drifted once,
    // leaving a banked bot with no server-owned exit if the pump died.
    await botAct(ctx, {
      event: 'submit-group-challenge-answers',
      ...submission,
      subject: seat.cursor.subject,
      seq,
    })
    // The room's guess ticker: the seat audibly answered, nothing more —
    // and only if the handler actually BANKED it (a late submit its guards
    // refused must not put a phantom "answered" line beside an absent
    // scorecard). One re-fetch buys the honesty.
    const after = await server.fetchGame(ctx.eventTarget.gameId)
    if (!after?.rounds[roundIndex]?.groupAnswers[playerId]) return
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

const dispatchScoresExit = (ctx: EngineContext, seq: number) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    const seat = brainSeat(fresh, ctx.eventTarget.playerId)
    if (seat?.cursor.seq !== seq) return
    await botAct(ctx, { event: 'enter-movement-phase', subject: seat.cursor.subject, seq })
  })
}

const dispatchChainReady = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    if (currentBorderChain(fresh) || currentAtlasChain(fresh)) {
      await botAct(ctx, { event: 'chain-ready' })
    }
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
      return botAct(ctx, { event: 'submit-chain-move', isoCode, turn })
    }
    const atlas = currentAtlasChain(fresh)
    if (atlas) {
      const isoCode = pickChainIso(atlasOpenMoves(atlas, fresh), fresh, share)
      if (!isoCode) return
      return botAct(ctx, { event: 'submit-chain-move', isoCode, turn })
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

/**
 * When a bot answers its gate: a think beat, and on a timed gate no sooner
 * than the moment the clock reaches the share's mid-window fraction — the
 * server prices the leap off its own deadline, so the moment IS the leap.
 */
const gateActDelay = (game: Game, seat: Player): number => {
  const think = rollMs(BOT_TURN_THINK_MS, BOT_TURN_JITTER_MS)
  const challenge = seat.moves[0]?.challenge
  const clock = challenge?._type === 'individual-challenge' && gateClockFor(challenge.variant)
  const { deadline } = seat.cursor
  if (!clock || deadline === undefined) return think
  const share = botShare(game, seat.id)
  const remaining = GATE_REMAINING[0] + share * (GATE_REMAINING[1] - GATE_REMAINING[0])
  return Math.max(think, deadline - remaining * clock.seconds * 1000 - Date.now())
}

const dispatchGateAnswer = (ctx: EngineContext, seq: number) => {
  const { playerId } = ctx.eventTarget
  scheduleEngineTask(ctx, 0, async fresh => {
    // Composed INSIDE the task, from the fresh fetch — like every other act.
    const seat = brainSeat(fresh, playerId)
    const challenge = seat?.moves[0]?.challenge
    if (!seat || seat.cursor.seq !== seq || challenge?._type !== 'individual-challenge') return
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
      await botAct(ctx, {
        event: 'submit-individual-challenge-answer',
        isoCode,
        hintsUsed: 0,
        subject: seat.cursor.subject,
        seq,
      })
    } catch (error) {
      console.warn(`Bot gate answer rejected for ${playerId}`, error)
    }
  })
}

// --- Engine arms: each composes its move off the fresh fetch and plays it ---
// --- through the wire handler, which owns every guard a human meets.     ---

const dispatchTimelinePlacement = (ctx: EngineContext, playerId: string, turn: number) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    const challenge = currentTimeline(fresh)
    if (!challenge) return
    const { state } = challenge
    if (!mayPlaceTimeline(challenge, playerId, turn)) return
    const slug = drawnCard(state)
    const year = slug ? timelineEvent(slug)?.year : undefined
    if (year === undefined) return
    const { low, high } = correctSlotRange(placedYears(state.placed), year)
    const share = jitteredShare(botShare(fresh, playerId))
    const rightSlots = Array.from({ length: high - low + 1 }, (_, index) => low + index)
    const slot = Math.random() < share ? sample(rightSlots)! : low > 0 ? low - 1 : high + 1
    await botAct(ctx, {
      event: 'submit-timeline-placement',
      slot: Math.min(slot, state.placed.length),
      turn,
    })
  })
}

const dispatchTimelineAck = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    await botAct(ctx, { event: 'timeline-reveal-done' })
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
    await botAct(ctx, {
      event: 'submit-heritage-pin',
      beat: state.beat,
      pin: pinScatter(target, challenge, share),
    })
  })
}

const dispatchUniqueReady = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    if (currentUniqueOrBust(fresh)) await botAct(ctx, { event: 'unique-ready' })
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
    await botAct(ctx, { event: 'submit-unique-answer', category, id: entry.id })
  })
}

const dispatchTerraReady = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    if (currentTerraIncognita(fresh)) await botAct(ctx, { event: 'terra-ready' })
  })
}

const dispatchSweepReady = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    if (currentCleanSweep(fresh)) await botAct(ctx, { event: 'sweep-ready' })
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
      Math.random() < SWEEP_ACCURACY[0] + share * (SWEEP_ACCURACY[1] - SWEEP_ACCURACY[0])
        ? sample(free)
        : (wrongPick(fresh, [...challenge.members, ...(challenge.offBoard ?? [])]) ?? sample(free))
    if (!isoCode) return
    await botAct(ctx, { event: 'submit-sweep-claim', isoCode })
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
    if (pick) await botAct(ctx, { event: 'submit-government-pick', turn, pick })
  })
}

const dispatchManhuntReady = (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, 0, async fresh => {
    if (!brainSeat(fresh, playerId)) return
    if (currentManhunt(fresh)) await botAct(ctx, { event: 'manhunt-ready' })
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
    await botAct(ctx, { event: 'submit-manhunt-move', isoCode: move.isoCode, turn })
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
    await botAct(ctx, { event: 'submit-manhunt-marker', isoCode: marker, turn })
  })
}

const dispatchFinalAnswer = (ctx: EngineContext, seq: number) => {
  const { playerId } = ctx.eventTarget
  scheduleEngineTask(ctx, 0, async fresh => {
    // Composed INSIDE the task, from the fresh fetch — like every other act.
    const seat = brainSeat(fresh, playerId)
    const item = seat?.moves[0]?.challenge
    if (!seat || seat.cursor.seq !== seq || item?._type !== 'final-challenge') return
    const question = item.challenges[0]
    if (!question) return
    const share = jitteredShare(botShare(fresh, playerId))
    const submittedAnswer = await finalAnswerFor(question, share, fresh)
    if (!submittedAnswer) return
    try {
      await botAct(ctx, {
        event: 'submit-final-challenge-answer',
        submittedAnswer,
        subject: seat.cursor.subject,
        seq,
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
export const finalAnswerFor = async (
  question: FinalChallengeItem,
  share: number,
  game: Game
): Promise<FinalChallengeAnswer | undefined> => {
  // Deferred like the submit handler's own import (its comment is the rule):
  // the gauntlet library statically pulls the fat data chunks, and a static
  // edge from the socket middleware graph ballooned the server build past
  // the CI heap ceiling (the pawn-replay job's OOM).
  const {
    boundaryScene,
    bornAfter,
    changeAccepted,
    changeDecade,
    madeAcceptedCountries,
    nocturneDealtCities,
    weighScalesPicks,
    yearbookYear,
  } = await import('~~/lib/challenges/final-challenge')
  const { sunsetQuota } = await import('~~/lib/sunset-window')
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
      return {
        _type: question._type,
        namedCountries: quotaPicks(question.countries, sunsetQuota(question), wantCorrect),
      }
    }
    case 'city-nocturne-challenge': {
      return {
        _type: question._type,
        namedCities: quotaPicks([...nocturneDealtCities(question)], question.quota, wantCorrect),
      }
    }
    case 'born-challenge': {
      const qualifying = playableWorldCountries(game).filter(country =>
        bornAfter(country, question.year)
      )
      return {
        _type: question._type,
        isoCodes: quotaPicks(qualifying, question.quota, wantCorrect),
      }
    }
    case 'scales-challenge': {
      // Search the pool for a balancing set the same way a player eyeballs
      // one — bounded tries, judged by the verdict's own scale.
      if (wantCorrect) {
        const pool = playableWorldCountries(game).filter(country => country !== question.target)
        for (let attempt = 0; attempt < 120; attempt++) {
          const picks = sampleMany(pool, randomInt(1, question.maxPicks))
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
        ? Math.round(randomBetween(-question.tolerance, question.tolerance))
        : (question.tolerance + randomInt(1, Math.ceil(spread * 3))) *
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
  /** When the bot actually buzzed, off the round's own clock — the act was
   *  scheduled into `BOT_CLASSIC_WINDOW`, so reporting a share-derived guess
   *  instead would tax a right answer for being confident. Reveal-only. */
  const buzzAt = liveRemainingFraction(round)
  /**
   * The pot a landed buzz claims. The `hit` roll ALREADY spends the share, so
   * the claim must not spend it again — `share × anything` is what had hard
   * bots realizing half their dial. The buzz curve can't price it either: a
   * bot answers mid-window on purpose (never racing a human off the line), and
   * `buzzFraction` at that moment caps the pot near 0.66, so a hard seat could
   * not reach 0.65 of the round however well it played. A landed answer is
   * worth the round; the politeness beat is not a skill discount.
   */
  const claim = maximum

  switch (kind) {
    case 'silhouette':
    case 'anthem-buzz':
    case 'stat-detective':
    case 'two-truths':
    case 'flashpoint':
    case 'capital-guess':
    case 'ground-plan':
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
      // A probe trail: the colder the seat, the longer the wander. Every stray
      // is two points off the decay, so a cold seat wanders — but never so far
      // that finding the target stops being worth more than a warm seat's miss.
      const target = correct[0]
      if (!target) return { ranking: [] }
      const wander = Array.from({ length: Math.round((1 - share) * HOT_COLD_MAX_WANDER) }, () =>
        wrongPick(game, correct)
      ).filter((isoCode): isoCode is ISOCountryCode => !!isoCode)
      return { ranking: hit ? [...wander, target] : wander }
    }
    case 'ghost-state':
    case 'trend-race': {
      const target = correct[0]
      if (!target) return { ranking: [] }
      // Both scorers grade guess ZERO — a decoy in front of the answer throws
      // away the round the hit just won.
      if (hit) return { ranking: [target] }
      const miss = wrongPick(game, correct)
      return { ranking: miss ? [miss] : [] }
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
      return { ranking: [], pin: pinScatter(target, pin, share) }
    }
    case 'sketch': {
      // The one kind with NO correctness gate: `gradeGroupAnswer` clamps the
      // claim with `correct: true` always, because a sketch's similarity IS
      // its score. So the share has to ride the CLAIM here — the `hit` roll
      // never gets to spend it, and claiming the pot drew a flawless outline
      // at every difficulty.
      return { ranking: [], clientScore: Math.round(maximum * share) }
    }
    case 'traversal': {
      // The route is graded whole: `optimalPath` carries its endpoints, so a
      // share-sized PREFIX can never bridge them and scores a flat zero. A hit
      // names the interior.
      const interior = correct.slice(1, -1)
      if (!interior.length) return { ranking: [] }
      if (hit) return { ranking: interior }
      // A miss must genuinely NOT bridge: drop a link and offer a stray in its
      // place. `slice(0, length - 1)` on a single-country interior keeps that
      // country — half of every easy deal is a 2-hop route, so a floored slice
      // handed those misses the full route and ~0.9 of the pot.
      const stray = wrongPick(game, correct)
      const short = interior.slice(0, interior.length - 1)
      return { ranking: stray ? [...short, stray] : short }
    }
    default: {
      // Every collect-a-set and ordered kind: a share-sized slice of the
      // correct set, order preserved (a prefix of a ranking or a path is a
      // plausible partial answer; aligned slices keep pair-scored kinds fair).
      return { ranking: takeShare(correct, share) }
    }
  }
}

/** A quota-recall answer: the full quota on a hit, one short on a miss —
 *  the near-miss every list-recall final grades as a plain fail. */
const quotaPicks = <T>(pool: readonly T[], quota: number, wantCorrect: boolean): T[] =>
  sampleMany(pool, wantCorrect ? quota : Math.max(0, quota - 1))

const takeShare = (correct: readonly ISOCountryCode[], share: number): ISOCountryCode[] => {
  if (!correct.length) return []
  const take = Math.max(1, Math.round(correct.length * share))
  return correct.slice(0, take)
}

/**
 * A bot's pin throw — ONE inverse of the scorer's distance taper for both
 * pin surfaces (Heritage Hunt beats, the pin-landmark classic): the share
 * interpolates the miss radius between a bullseye and just inside the zero
 * ring, the bearing is anyone's guess, like a real pin.
 */
const pinScatter = (
  target: LatLng,
  ring: { perfectDistanceKm: number; zeroDistanceKm: number },
  share: number
): LatLng => {
  // The taper pays `1 − (d − perfect) / span`, so the radius that prices at
  // the share is exactly this — no fudge factor, or the throw is worth more
  // than the seat earned.
  const span = ring.zeroDistanceKm - ring.perfectDistanceKm
  const missKm = ring.perfectDistanceKm + (1 - share) * span
  // Scatter SYMMETRICALLY around it: drawing uniformly inside the radius (the
  // old `missKm * Math.random()`) lands most throws near the bullseye and had
  // easy seats pinning better than hard ones nominally could.
  const jitter = span * PIN_SCATTER_BAND
  const thrownKm = Math.max(0, randomBetween(missKm - jitter, missKm + jitter))
  return offsetKm(target, thrownKm, randomBetween(0, 360))
}
