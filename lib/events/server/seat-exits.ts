import {
  WALK_LEAD_MS,
  WALK_RESUME_LEAD_MS,
  FINAL_QUESTION_CAP_MS,
  FINAL_REVEAL_HOLD_MS,
  GATE_RESULT_HOLD_MS,
  GROUP_SCORES_CAP_MS,
  INDIVIDUAL_GATE_CAP_MS,
  SERVER_CONTROLLED_CAPS,
  TUTORIAL_CAP_MS,
} from '~~/lib/round-beats'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { closeTutorialHandler } from './close-tutorial.handler'
import { scheduleMovementPhase } from './enter-movement-phase.handler'
import { scheduleEngineTask, type EngineContext } from './round-engine'
import { applyFinalMiss } from './submit-final-challenge-answer.handler'
import { forfeitGate } from './submit-individual-challenge-answer.handler'

/**
 * Server-owned exits for seats parked OUTSIDE a round's own clock. Every
 * phase a player can occupy must have one of these (or a round engine)
 * guaranteeing it ends — a seat only a click can move is a frozen room
 * waiting to happen. All of them are gated on SERVER_CONTROLLED_CAPS and
 * are safe to arm twice: each fires through a fresh fetch and dies on its
 * staleness token.
 */

/**
 * A seat on its scorecard owes the table a movement request that only a
 * click sends. Cap it: after the reading beat the server walks the seat
 * itself, through the one movement re-entry (`scheduleMovementPhase`).
 * Tokens: the seat must still be parked in 'group-scores' — a walking or
 * walked seat is a client-driven chain the cap must not double-step — and
 * on the same walk generation it was armed against.
 */
const armParkedWalks = (ctx: EngineContext, seats: Player[]) => {
  if (!SERVER_CONTROLLED_CAPS || !seats.length) return
  const walkSeqs = seats.map(seat => [seat.id, seat.walkSeq] as const)
  scheduleEngineTask(ctx, GROUP_SCORES_CAP_MS, async (fresh, server) => {
    // Announce the walk FIRST: flip the cohort to 'moving' in one save so
    // every client mounts its board, then start the steps after the mount
    // grace — otherwise the walk outruns the board and reads as a teleport,
    // with the challenge-tile arrival beat lost with it. The client's own
    // Close-Scores path needs none of this (its board is already up), and
    // its non-continuation entry still bounces off the 'moving' guard.
    const walkers: (readonly [string, number | undefined])[] = []
    for (const [playerId, walkSeq] of walkSeqs) {
      const parked = fresh.players[playerId]
      if (!parked || parked.phase !== 'group-scores') continue
      if (parked.walkSeq !== walkSeq) continue
      console.warn(`Scores cap walking parked seat ${playerId} in ${ctx.eventTarget.gameId}`)
      parked.phase = 'moving'
      walkers.push([playerId, walkSeq] as const)
    }
    if (!walkers.length) return
    await server.updateGameState(fresh)
    // Whole-cohort change → whole-snapshot event ('update' is a seat slice:
    // it would announce ONE walker and leave the rest parked client-side,
    // defeating the mount grace for exactly the seats it exists to serve).
    server.emit({ event: 'table-updated', game: fresh }, ctx.eventTarget)
    for (const [playerId, walkSeq] of walkers) {
      scheduleMovementPhase(
        WALK_LEAD_MS,
        { ...ctx, eventTarget: { gameId: ctx.eventTarget.gameId, playerId } },
        { continuation: true, walkSeq }
      )
    }
  })
}

export const armGroupScoresCap = (ctx: EngineContext, player: Player) =>
  armParkedWalks(ctx, [player])

/** The whole-cohort form every settle uses: ONE task per settle, walking
 *  whichever of the advanced seats are still parked when it fires. */
export const armGroupScoresCaps = (ctx: EngineContext, game: Game, playerIds: string[]) =>
  armParkedWalks(
    ctx,
    playerIds.flatMap(id => game.players[id] ?? [])
  )

/**
 * A round-1 rules card only a click closes. Cap it through the close
 * handler itself — the one place that owns the round-1 seams (the classic
 * clock's first-close stamp, the engine briefings). Token: still 'tutorial'.
 */
export const armTutorialCap = (ctx: EngineContext, playerId: string) => {
  if (!SERVER_CONTROLLED_CAPS) return
  scheduleEngineTask(ctx, TUTORIAL_CAP_MS, async fresh => {
    if (fresh.players[playerId]?.phase !== 'tutorial') return
    console.warn(`Tutorial cap closing rules card for ${playerId} in ${ctx.eventTarget.gameId}`)
    await closeTutorialHandler({
      io: ctx.io,
      redis: ctx.redis,
      socket: ctx.socket,
      eventTarget: { gameId: ctx.eventTarget.gameId, playerId },
      eventKey: 'close-tutorial',
      eventData: { event: 'close-tutorial' },
    })
  })
}

/**
 * A stop-tile gate only a submit resolves; the view's clock is client-owned.
 * Cap it as a forfeit through the same shape a wrong answer takes. Tokens:
 * same gate tile, still on the gate, no answer mid-flight.
 */
export const armIndividualGateCap = (ctx: EngineContext, player: Player) => {
  if (!SERVER_CONTROLLED_CAPS) return
  const { id: playerId, walkSeq } = player
  const gateTile = player.moves[0]?.endTile.position
  if (gateTile === undefined) return
  scheduleEngineTask(ctx, INDIVIDUAL_GATE_CAP_MS, async (fresh, server) => {
    const seat = fresh.players[playerId]
    if (!seat || seat.phase !== 'individual-challenge' || seat.resolving) return
    const currentMove = seat.moves[0]
    if (currentMove?.challenge?._type !== 'individual-challenge') return
    if (currentMove.endTile.position !== gateTile) return
    console.warn(`Gate cap forfeiting unanswered gate for ${playerId} in ${ctx.eventTarget.gameId}`)
    forfeitGate(fresh, seat, currentMove)
    await server.updateGameState(fresh)
    const eventTarget = { gameId: ctx.eventTarget.gameId, playerId }
    server.emit({ event: 'individual-challenge-checked', game: fresh }, eventTarget)
    scheduleMovementPhase(
      GATE_RESULT_HOLD_MS,
      { ...ctx, eventTarget },
      { continuation: true, walkSeq }
    )
  })
}

/**
 * The gauntlet's per-question cap: an unanswered final question burns its
 * miss through the SAME shape a wrong answer takes (applyFinalMiss), then
 * the next question's cap arms. Token: the gauntlet's turn counter.
 */
export const armFinalQuestionCap = (ctx: EngineContext, player: Player) => {
  if (!SERVER_CONTROLLED_CAPS) return
  const { id: playerId, walkSeq } = player
  const gauntlet = player.moves[0]?.challenge
  if (gauntlet?._type !== 'final-challenge') return
  const turn = gauntlet.turn ?? 0
  scheduleEngineTask(ctx, FINAL_QUESTION_CAP_MS, async (fresh, server) => {
    const seat = fresh.players[playerId]
    if (!seat || seat.phase !== 'final-challenge' || seat.resolving) return
    const liveGauntlet = seat.moves[0]?.challenge
    if (liveGauntlet?._type !== 'final-challenge') return
    if ((liveGauntlet.turn ?? 0) !== turn) return
    console.warn(
      `Final cap burning unanswered question for ${playerId} in ${ctx.eventTarget.gameId}`
    )
    const { survives } = await applyFinalMiss({ game: fresh, gauntlet: liveGauntlet, player: seat })
    const eventTarget = { gameId: ctx.eventTarget.gameId, playerId }
    if (!survives) seat.moves = []
    await server.updateGameState(fresh)
    server.emit({ event: 'final-challenge-checked', game: fresh }, eventTarget)
    if (!survives) {
      scheduleMovementPhase(
        GATE_RESULT_HOLD_MS,
        { ...ctx, eventTarget },
        { continuation: true, walkSeq }
      )
      return
    }
    armFinalQuestionCap(ctx, seat)
  })
}

/**
 * The gauntlet's post-answer follow-up: clear the `resolving` latch so the
 * next genuine answer lands, reveal the fresh state, and start the next
 * question's cap. ONE shape for the live result beat (the submit handler's
 * pause) and the rearm recovery — two private copies of this beat is how a
 * revived seat drifts from a live one.
 */
export const clearFinalResultBeat = async (ctx: EngineContext, player: Player) => {
  const playerId = player.id
  // Staleness token, like every other arm: the beat belongs to the gauntlet
  // turn it was armed on. A rejoin re-arms this routinely — untokenized, the
  // duplicate landed mid-way through the NEXT answer's hold and cut its
  // reveal short.
  const gauntlet = player.moves[0]?.challenge
  const armedTurn = gauntlet?._type === 'final-challenge' ? (gauntlet.turn ?? 0) : undefined
  // The longer hold: gauntlet reveals teach (rankings, the missed fact) and
  // outlast a gate's verdict pill. The next question lands on this emit.
  scheduleEngineTask(ctx, FINAL_REVEAL_HOLD_MS, async (fresh, server) => {
    const seat = fresh.players[playerId]
    if (!seat) return
    const liveGauntlet = seat.moves[0]?.challenge
    if (
      armedTurn !== undefined &&
      liveGauntlet?._type === 'final-challenge' &&
      (liveGauntlet.turn ?? 0) !== armedTurn
    ) {
      return
    }
    const eventTarget = { gameId: ctx.eventTarget.gameId, playerId }
    if (seat.phase === 'final-challenge' && seat.resolving) {
      seat.resolving = false
      await server.updateGameState(fresh)
    }
    server.emit({ event: 'final-challenge-checked', game: fresh }, eventTarget)
    if (seat.phase === 'final-challenge') armFinalQuestionCap(ctx, seat)
  })
}

/**
 * Restart recovery for every seat exit, the last call in rearmLiveRound:
 * every occupiable parked phase re-arms its cap, and — NOT gated by the cap
 * switch, it is a defect fix — a seat whose `resolving` latch outlived its
 * result-beat timer (deploy drain ate the follow-up) gets its walk resume /
 * latch clear back, instead of being locked out of submitting for the rest
 * of the game.
 */
export const rearmSeatExits = (ctx: EngineContext, game: Game) => {
  for (const seat of Object.values(game.players)) {
    const eventTarget = { gameId: ctx.eventTarget.gameId, playerId: seat.id }
    switch (seat.phase) {
      case 'group-scores':
        armGroupScoresCap(ctx, seat)
        break
      case 'tutorial':
        if (game.started) armTutorialCap(ctx, seat.id)
        break
      case 'moving':
        // A walk rides in-memory continuations only — a restart kills the
        // chain, and if the walker's own tab never returns, nobody else's
        // rejoin used to revive it: the one unwalkable seat froze the table
        // for good. Re-arming beside a surviving chain is safe (walkSeq +
        // the single-stepper latch dedupe). An intro walk gets the FULL
        // announce lead: the latch dedupes cadence, not the lead, and a
        // short-lead entrant during a live announce stepped under the
        // "On the move!" interstitial.
        scheduleMovementPhase(
          seat.walkIntro ? WALK_LEAD_MS : WALK_RESUME_LEAD_MS,
          { ...ctx, eventTarget },
          { continuation: true, walkSeq: seat.walkSeq }
        )
        break
      case 'individual-challenge':
        if (seat.resolving || seat.moves[0]?.challenge?._type !== 'individual-challenge') {
          // Result beat's continuation died: resume the walk (clears the
          // latch on re-entry) after the hold it was owed. The moves-empty
          // shape is the cap forfeit's hold (resolving stays false there) —
          // without this arm it had no exit at all.
          scheduleMovementPhase(
            GATE_RESULT_HOLD_MS,
            { ...ctx, eventTarget },
            { continuation: true, walkSeq: seat.walkSeq }
          )
        } else {
          armIndividualGateCap(ctx, seat)
        }
        break
      case 'final-challenge':
        if (seat.moves[0]?.challenge?._type !== 'final-challenge') {
          // The knockout hold (moves emptied, verdict pause): its movement
          // continuation died — the cap can't re-arm on a missing gauntlet,
          // so this was a frozen seat.
          scheduleMovementPhase(
            GATE_RESULT_HOLD_MS,
            { ...ctx, eventTarget },
            { continuation: true, walkSeq: seat.walkSeq }
          )
        } else if (seat.resolving) {
          // The latch-clear task died with the restart: re-run the beat.
          void clearFinalResultBeat(ctx, seat)
        } else {
          armFinalQuestionCap(ctx, seat)
        }
        break
    }
  }
}
