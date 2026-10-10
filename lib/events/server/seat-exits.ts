import { finalQuestionDeadline } from '~~/lib/final-timing'
import { gateDeadline } from '~~/lib/gate-timing'
import { moveStopTile } from '~~/lib/player-status'
import {
  BOARD_TO_CHALLENGE_HOLD_MS,
  FINAL_REVEAL_HOLD_MS,
  GATE_RESULT_HOLD_MS,
  GROUP_SCORES_CAP_MS,
  STEP_INTERVAL_MS,
  WALK_LEAD_MS,
  WALK_RESUME_LEAD_MS,
} from '~~/lib/round-beats'
import { isChallengeOfType, latestRound } from '~~/lib/rounds'
import { seatSubject, tableOwesNextRound, type SeatTimerKind } from '~~/lib/seat-transitions'
import type { FinalChallenge, FinalChallengeAnswer } from '~~/types/challenges/final-challenge.type'
import type { Game, PlayerMove } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { Player } from '~~/types/player.type'
import type { SeatCause } from '~~/types/seat.types'
import { isAtlasChallenge, scheduleAtlasTimeout, startAtlasClock } from './atlas-turns'
import { isBorderChainChallenge, scheduleChainTimeout, startChainClock } from './chain-turns'
import { scheduleClassicSettle, startClassicClock } from './classic-rounds'
import { closeTutorial } from './close-tutorial.handler'
import {
  isGovernmentChallenge,
  scheduleGovernmentTimeout,
  startGovernment,
} from './government-beats'
import {
  isHeritageHuntChallenge,
  scheduleHeritageTimeout,
  startHeritageClock,
} from './heritage-beats'
import { isManhuntChallenge, scheduleManhuntTimeout, startManhunt } from './manhunt-beats'
import { dealFinalReplacement, dealMoves, dealRound } from './moves'
import type { EngineContext, ServerSide } from './round-engine'
import { governmentKey } from '~~/lib/government'
import { manhuntKey } from '~~/lib/manhunt'
import { uniqueKey } from '~~/lib/unique-or-bust'
import { advanceSeat, capDeadline } from './seat-cursor'
import { recordCheckpoint } from './seat-journal'
import { isCleanSweepChallenge, scheduleSweepTimeout } from './sweep-beats'
import { scheduleTerraTimeout } from './terra-beats'
import { isTimelineChallenge, scheduleTimelineTimeout, startTimelineClock } from './timeline-turns'
import { isUniqueOrBustChallenge, scheduleUniqueTimeout } from './unique-beats'

/**
 * The seat moves every path shares (a handler, a bot act, a seat timer), and
 * the executor each seat timer runs when its cursor's stamp comes due. The
 * moves only mutate and `advanceSeat`; the caller saves and emits.
 */

const roundIndexOf = (game: Game) => Math.max(0, game.rounds.length - 1)

/**
 * Save one seat's move and send it: the seat plus its slice of the live round.
 * The move that settles the last racer also stamps the table's next round in
 * the same save, and a seat slice would drop it — that one goes out whole.
 */
export const commitSeat = async (server: ServerSide, game: Game, seat: Player) => {
  const nextRoundAt = game.nextRoundAt
  await server.updateGameState(game)
  server.emit(
    { event: game.nextRoundAt === nextRoundAt ? 'seat-advanced' : 'table-updated', game },
    { gameId: game.id, playerId: seat.id }
  )
}

/** Into the scorecard with a fresh moveset: the steps the score bought. */
export const enterScores = async (
  game: Game,
  seat: Player,
  scored: number,
  cause: SeatCause,
  options: { moves?: PlayerMove[] } = {}
) => {
  seat.moves = await dealMoves({ game, player: seat, scored, moves: options.moves })
  advanceSeat(
    game,
    seat,
    {
      step: 'scores',
      subject: seatSubject.scores(roundIndexOf(game)),
      deadline: capDeadline(GROUP_SCORES_CAP_MS),
      walk: seat.cursor.walk + 1,
      leg: 0,
    },
    cause
  )
}

/** The scorecard closes: the turn-opening walk announces itself. */
export const walkOut = (game: Game, seat: Player, cause: SeatCause) =>
  advanceSeat(
    game,
    seat,
    {
      step: 'walk',
      subject: seatSubject.walk(seat.cursor.walk, 0),
      holdUntil: Date.now() + WALK_LEAD_MS,
      leg: 0,
    },
    cause
  )

const challengeSubject = (seat: Player, move: PlayerMove): string =>
  move.challenge?._type === 'final-challenge'
    ? seatSubject.final(seat.cursor.walk, move.challenge.turn ?? 0)
    : seatSubject.gate(seat.cursor.walk, move.endTile.position)

/** One pawn step, the landing onto a challenge, or the walk's end. */
export const stepWalk = (game: Game, seat: Player) => {
  const move = seat.moves[0]
  const now = Date.now()
  if (move && seat.currentPosition < moveStopTile(move)) {
    seat.currentPosition++
    advanceSeat(
      game,
      seat,
      { step: 'walk', subject: seat.cursor.subject, holdUntil: now + STEP_INTERVAL_MS },
      'timer:walk-step',
      { progress: true }
    )
    return
  }
  if (move?.challenge) {
    advanceSeat(
      game,
      seat,
      {
        step: 'arrive',
        subject: challengeSubject(seat, move),
        holdUntil: now + BOARD_TO_CHALLENGE_HOLD_MS,
      },
      'timer:walk-step'
    )
    return
  }
  seat.moves = []
  advanceSeat(
    game,
    seat,
    { step: 'settled', subject: seatSubject.settled(roundIndexOf(game)) },
    'timer:walk-step'
  )
}

/** The landing beat ends: the gate (or gauntlet question) opens with its window. */
export const land = (game: Game, seat: Player) => {
  const move = seat.moves[0]
  const now = Date.now()
  const challenge = move?.challenge
  if (challenge?._type === 'final-challenge') {
    const turn = challenge.turn ?? 0
    advanceSeat(
      game,
      seat,
      {
        step: 'final',
        subject: seatSubject.final(seat.cursor.walk, turn),
        deadline: finalQuestionDeadline(challenge.challenges[0], game.difficulty, now, turn === 0),
      },
      'timer:landing'
    )
    return
  }
  if (challenge?._type === 'individual-challenge') {
    advanceSeat(
      game,
      seat,
      {
        step: 'gate',
        subject: seatSubject.gate(seat.cursor.walk, move!.endTile.position),
        deadline: gateDeadline(challenge, now),
      },
      'timer:landing'
    )
  }
}

/** The gate's verdict, held on its own subject until `holdUntil`. */
export const gateVerdict = (
  game: Game,
  seat: Player,
  verdict: { correct: boolean; timedOut: boolean; submitted?: ISOCountryCode; steps: number },
  holdMs: number,
  browsable: boolean,
  cause: SeatCause
) => {
  const { subject } = seat.cursor
  advanceSeat(
    game,
    seat,
    {
      step: 'gate-verdict',
      subject,
      holdUntil: Date.now() + holdMs,
      verdict: {
        kind: 'gate',
        subject,
        correct: verdict.correct,
        timedOut: verdict.timedOut,
        steps: verdict.steps,
        browsable,
        ...(verdict.submitted ? { submitted: verdict.submitted } : {}),
      },
    },
    cause
  )
}

/**
 * A blocked gate: the record lands before the moves are forfeited — without
 * it a blocked walk is indistinguishable from a clean one, on the board and
 * in the round history.
 */
export const forfeitGate = (game: Game, seat: Player, gate: PlayerMove) => {
  const turn = latestRound(game)?.playerTurns[seat.id]
  const lastMove = seat.moves[seat.moves.length - 1]
  if (turn && lastMove) {
    turn.blocked = {
      atTile: gate.endTile.position,
      forfeitedSteps: lastMove.endTile.position - seat.currentPosition,
    }
  }
  seat.moves = []
}

/** The gate verdict's hold ends: pay the leap (or the forfeit), then walk on. */
export const resolveGateVerdict = (game: Game, seat: Player, cause: SeatCause) => {
  const verdict = seat.cursor.verdict
  const gate = seat.moves[0]
  if (verdict?.kind === 'gate' && verdict.correct && gate) {
    seat.currentPosition += verdict.steps
    seat.moves.shift()
    // A deep-pot leap can overshoot the NEXT gate's stop tile: clamp to it, or
    // the seat stands past a gate it never answered.
    const next = seat.moves[0]
    if (next?.challenge) seat.currentPosition = Math.min(seat.currentPosition, moveStopTile(next))
  } else if (gate) {
    forfeitGate(game, seat, gate)
  }
  if (seat.moves.length) {
    const leg = seat.cursor.leg + 1
    advanceSeat(
      game,
      seat,
      {
        step: 'walk',
        subject: seatSubject.walk(seat.cursor.walk, leg),
        holdUntil: Date.now() + WALK_RESUME_LEAD_MS,
        leg,
      },
      cause
    )
    return
  }
  advanceSeat(
    game,
    seat,
    { step: 'settled', subject: seatSubject.settled(roundIndexOf(game)) },
    cause
  )
}

/**
 * Grade one gauntlet answer into the run's tallies. The life and the
 * replacement for a missed LAST question land now, with the verdict; the
 * question itself is only consumed when the hold ends.
 */
const gradeGauntlet = async (
  game: Game,
  gauntlet: FinalChallenge,
  correct: boolean
): Promise<{ knockedOut: boolean; won: boolean }> => {
  if (correct) {
    gauntlet.answeredCorrect += 1
    return { knockedOut: false, won: gauntlet.challenges.length === 1 }
  }
  if (gauntlet.lives <= 0) return { knockedOut: true, won: false }
  gauntlet.lives -= 1
  if (gauntlet.challenges.length === 1) {
    const replacement = await dealFinalReplacement(game, [gauntlet.challenges[0]._type])
    if (!replacement) return { knockedOut: true, won: false }
    gauntlet.challenges.push(replacement)
  }
  return { knockedOut: false, won: false }
}

export const finalVerdict = async (
  game: Game,
  seat: Player,
  answer: { correct: boolean; timedOut: boolean; submittedAnswer?: FinalChallengeAnswer },
  cause: SeatCause
) => {
  const gauntlet = seat.moves[0]?.challenge
  if (gauntlet?._type !== 'final-challenge') return
  const outcome = await gradeGauntlet(game, gauntlet, answer.correct)
  const { subject } = seat.cursor
  advanceSeat(
    game,
    seat,
    {
      step: 'final-verdict',
      subject,
      holdUntil: Date.now() + (outcome.knockedOut ? GATE_RESULT_HOLD_MS : FINAL_REVEAL_HOLD_MS),
      verdict: {
        kind: 'final',
        subject,
        correct: answer.correct,
        timedOut: answer.timedOut,
        ...outcome,
        ...(answer.submittedAnswer ? { submittedAnswer: answer.submittedAnswer } : {}),
      },
    },
    cause
  )
}

/** The gauntlet verdict's hold ends: the next question, the knockout, or the win. */
const resolveFinalVerdict = (game: Game, seat: Player) => {
  const verdict = seat.cursor.verdict
  const gauntlet = seat.moves[0]?.challenge
  if (verdict?.kind !== 'final' || gauntlet?._type !== 'final-challenge') return
  if (verdict.knockedOut) {
    // The knockout's durable trace: it licenses the board's retreat off the
    // mountain and marks the run's end in the round history.
    const turn = latestRound(game)?.playerTurns[seat.id]
    if (turn) turn.blocked = { atTile: game.tiles.length - 1, forfeitedSteps: 0 }
    seat.moves = []
    advanceSeat(
      game,
      seat,
      { step: 'settled', subject: seatSubject.settled(roundIndexOf(game)) },
      'timer:verdict-hold'
    )
    return
  }
  gauntlet.challenges.shift()
  gauntlet.turn = (gauntlet.turn ?? 0) + 1
  if (verdict.won) {
    seat.completedAtRound = game.rounds.length
    advanceSeat(
      game,
      seat,
      { step: 'victory', subject: seatSubject.victory() },
      'timer:verdict-hold'
    )
    return
  }
  advanceSeat(
    game,
    seat,
    {
      step: 'final',
      subject: seatSubject.final(seat.cursor.walk, gauntlet.turn),
      deadline: finalQuestionDeadline(gauntlet.challenges[0], game.difficulty, Date.now(), false),
    },
    'timer:verdict-hold'
  )
}

/** A bot the host asked to leave goes the moment it owes the table nothing. */
export const retireSeat = (game: Game, seat: Player) => {
  seat.moves = []
  delete seat.retiring
  advanceSeat(game, seat, { step: 'kicked', subject: seatSubject.kicked() }, 'admin:retire')
}

export interface SeatExit {
  ctx: EngineContext
  game: Game
  server: ServerSide
  seat: Player
}

/** What each seat timer does when its cursor's stamp comes due. */
export const SEAT_TIMER_EXITS: Record<SeatTimerKind, (exit: SeatExit) => Promise<void>> = {
  'tutorial-cap': async ({ ctx, game, server, seat }) => {
    console.warn(`Tutorial cap closing rules card for ${seat.id} in ${game.id}`)
    await closeTutorial({ ctx, server, game, player: seat, cause: 'timer:tutorial-cap' })
  },
  'scores-cap': async ({ game, server, seat }) => {
    console.warn(`Scores cap walking parked seat ${seat.id} in ${game.id}`)
    walkOut(game, seat, 'timer:scores-cap')
    await commitSeat(server, game, seat)
  },
  'walk-step': async ({ game, server, seat }) => {
    stepWalk(game, seat)
    await commitSeat(server, game, seat)
  },
  landing: async ({ game, server, seat }) => {
    land(game, seat)
    await commitSeat(server, game, seat)
  },
  'gate-cap': async ({ game, server, seat }) => {
    console.warn(`Gate cap forfeiting unanswered gate for ${seat.id} in ${game.id}`)
    gateVerdict(
      game,
      seat,
      { correct: false, timedOut: true, steps: 0 },
      GATE_RESULT_HOLD_MS,
      false,
      'timer:gate-cap'
    )
    await commitSeat(server, game, seat)
  },
  'final-cap': async ({ game, server, seat }) => {
    console.warn(`Final cap burning unanswered question for ${seat.id} in ${game.id}`)
    await finalVerdict(game, seat, { correct: false, timedOut: true }, 'timer:final-cap')
    await commitSeat(server, game, seat)
  },
  'verdict-hold': async ({ game, server, seat }) => {
    switch (seat.cursor.step) {
      case 'round-verdict': {
        const verdict = seat.cursor.verdict
        await enterScores(
          game,
          seat,
          verdict?.kind === 'round' ? verdict.scored : 0,
          'timer:verdict-hold'
        )
        break
      }
      case 'gate-verdict':
        resolveGateVerdict(game, seat, 'timer:verdict-hold')
        break
      case 'final-verdict':
        resolveFinalVerdict(game, seat)
        break
      default:
        return
    }
    await commitSeat(server, game, seat)
  },
}

/** The live round's secret side keys — what a replay checkpoint must carry. */
export const roundSideKeys = (game: Game): string[] => {
  const roundIndex = roundIndexOf(game)
  return [
    manhuntKey(game.id, roundIndex),
    governmentKey(game.id, roundIndex),
    uniqueKey(game.id, roundIndex),
  ]
}

/**
 * `nextRoundAt` came due: deal the round, seat every settled racer in it and
 * reveal it — one task, one save, one emit. Nothing is dealt before this, so
 * no saved round is ever withheld from the wire.
 */
export const revealNextRound = async (ctx: EngineContext, game: Game, server: ServerSide) => {
  for (const seat of Object.values(game.players)) {
    if (seat.bot && seat.retiring && seat.cursor.step === 'settled') retireSeat(game, seat)
  }
  if (!tableOwesNextRound(Object.values(game.players).map(seat => seat.cursor.step))) {
    await server.updateGameState(game)
    server.emit({ event: 'table-updated', game }, ctx.eventTarget)
    return
  }
  const groupChallenge = await dealRound(game)
  game.rounds.push({ groupChallenge, groupAnswers: {}, playerTurns: {} })
  delete game.nextRoundAt
  const roundIndex = game.rounds.length - 1
  for (const seat of Object.values(game.players)) {
    if (seat.cursor.step !== 'settled') continue
    advanceSeat(
      game,
      seat,
      { step: 'round', subject: seatSubject.round(roundIndex) },
      'table:reveal'
    )
  }

  // The clocked rounds stamp their first deadline into the snapshot being
  // revealed; every other kind is a classic round and stamps the round itself.
  const revealedRound = latestRound(game)!
  const revealed = revealedRound.groupChallenge
  if (isBorderChainChallenge(revealed)) startChainClock(revealed)
  if (isAtlasChallenge(revealed)) startAtlasClock(revealed)
  if (isHeritageHuntChallenge(revealed)) startHeritageClock(revealed)
  if (isTimelineChallenge(revealed)) startTimelineClock(revealed)
  startClassicClock(revealedRound)
  // Manhunt and government seed their secrets into side keys before the
  // reveal saves, so the answers never ride a broadcast.
  if (isManhuntChallenge(revealed)) await startManhunt(ctx, game, revealed)
  if (isGovernmentChallenge(revealed)) await startGovernment(ctx, game, revealed)

  await server.updateGameState(game)
  server.emit({ event: 'new-round', game }, ctx.eventTarget)
  await recordCheckpoint(ctx.redis, game, roundSideKeys(game))

  if (isBorderChainChallenge(revealed)) scheduleChainTimeout(ctx, revealed)
  if (isAtlasChallenge(revealed)) scheduleAtlasTimeout(ctx, revealed)
  if (isHeritageHuntChallenge(revealed)) scheduleHeritageTimeout(ctx, revealed)
  if (isTimelineChallenge(revealed)) scheduleTimelineTimeout(ctx, revealed)
  if (isManhuntChallenge(revealed) && !revealed.state.finished) {
    scheduleManhuntTimeout(ctx, revealed)
  }
  if (isGovernmentChallenge(revealed) && !revealed.state.finished) {
    scheduleGovernmentTimeout(ctx, revealed)
  }
  // The briefed kinds open on their rules card: these arm the reading caps.
  if (isUniqueOrBustChallenge(revealed)) scheduleUniqueTimeout(ctx, game, revealed)
  if (isCleanSweepChallenge(revealed)) scheduleSweepTimeout(ctx, game, revealed)
  if (isChallengeOfType(revealed, 'terra-incognita-challenge')) {
    scheduleTerraTimeout(ctx, game, revealed)
  }
  scheduleClassicSettle(ctx, game)
}
