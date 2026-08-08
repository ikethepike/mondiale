import {
  FINAL_QUESTION_CAP_MS,
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
  scheduleEngineTask(ctx, GROUP_SCORES_CAP_MS, async fresh => {
    for (const [playerId, walkSeq] of walkSeqs) {
      const parked = fresh.players[playerId]
      if (!parked || parked.phase !== 'group-scores') continue
      if (parked.walkSeq !== walkSeq) continue
      console.warn(`Scores cap walking parked seat ${playerId} in ${ctx.eventTarget.gameId}`)
      scheduleMovementPhase(
        0,
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
    const { survives } = await applyFinalMiss({ game: fresh, gauntlet: liveGauntlet })
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
export const clearFinalResultBeat = async (ctx: EngineContext, playerId: string) => {
  scheduleEngineTask(ctx, GATE_RESULT_HOLD_MS, async (fresh, server) => {
    const seat = fresh.players[playerId]
    if (!seat) return
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
      case 'individual-challenge':
        if (seat.resolving) {
          // Result beat's continuation died: resume the walk (clears the
          // latch on re-entry) after the hold it was owed.
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
        if (seat.resolving) {
          // The latch-clear task died with the restart: re-run the beat.
          void clearFinalResultBeat(ctx, seat.id)
        } else {
          armFinalQuestionCap(ctx, seat)
        }
        break
    }
  }
}
