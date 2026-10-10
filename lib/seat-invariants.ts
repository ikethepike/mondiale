import {
  briefingHolds,
  CLASSIC_SETTLE_SLACK_MS,
  isClassicGroupRound,
  revealBudgetMsFor,
} from '~~/lib/round-beats'
import { latestRound } from '~~/lib/rounds'
import {
  ROUND_SETTLE_STEPS,
  seatFireAt,
  stepRequirementGap,
  tableOwesNextRound,
} from '~~/lib/seat-transitions'
import type { Game } from '~~/types/game.types'
import type { SeatJournalEntry, SeatRender } from '~~/types/seat.types'

/**
 * The seat contract's invariants, as pure predicates over a game snapshot and
 * whatever evidence the caller holds. ONE set, run by the unit tests, the
 * emit-breadth harness, the playtest and the production auditor.
 */

export type SeatViolationKind =
  | 'missing-cursor'
  | 'requirement'
  | 'overdue'
  | 'unarmed'
  | 'stale-armed'
  | 'armed-without-exit'
  | 'banked-in-round'
  | 'settled-unturned'
  | 'table-unstamped'
  | 'table-overdue'
  | 'table-unarmed'
  | 'round-overdue'
  | 'round-unclocked'
  | 'seq-regressed'
  | 'journal-ahead'
  | 'stale-render'

export interface SeatViolation {
  kind: SeatViolationKind
  seat?: string
  detail: string
}

export interface ArmedSeatTimer {
  seat: string
  seq: number
  kind: string
  fireAt: number
}

export interface SeatEvidence {
  now: number
  capsOn?: boolean
  /** How late a due timer may be before it counts as overdue. */
  overdueSlackMs?: number
  /** In-process timers (only meaningful on the machine that owns the game). */
  armed?: readonly ArmedSeatTimer[]
  journal?: readonly SeatJournalEntry[]
  renders?: readonly SeatRender[]
  /** Seats whose own player has a live socket — the only seats a render can lag on. */
  connectedSeats?: readonly string[]
  staleRenderMs?: number
}

export const SEAT_OVERDUE_SLACK_MS = 5000
/** Past an engine's stamped deadline, longer than any engine holds a beat after it. */
export const ENGINE_STALL_MS = 30_000
export const STALE_RENDER_MS = 8000

export const seatInvariantViolations = (game: Game, evidence: SeatEvidence): SeatViolation[] => {
  const violations: SeatViolation[] = []
  const add = (kind: SeatViolationKind, detail: string, seat?: string) =>
    violations.push({ kind, detail, ...(seat ? { seat } : {}) })
  const { now } = evidence
  const slack = evidence.overdueSlackMs ?? SEAT_OVERDUE_SLACK_MS
  const round = latestRound(game)
  const seats = Object.values(game.players)

  for (const seat of seats) {
    const { cursor } = seat
    if (!cursor) {
      add('missing-cursor', 'seat has no cursor', seat.id)
      continue
    }
    const gap = stepRequirementGap(cursor, evidence.capsOn ?? true)
    if (gap) add('requirement', gap, seat.id)

    const fireAt = seatFireAt(cursor)
    if (fireAt !== undefined && now > fireAt + slack) {
      add('overdue', `${cursor.step} due ${now - fireAt}ms ago (seq ${cursor.seq})`, seat.id)
    }

    if (evidence.armed) {
      // An entry past its moment by more than the slack never ran its body.
      const armed = evidence.armed.filter(
        timer => timer.seat === seat.id && timer.fireAt + slack >= now
      )
      if (fireAt !== undefined) {
        if (!armed.length) add('unarmed', `${cursor.step} seq ${cursor.seq} has no timer`, seat.id)
        else if (armed.length > 1 || armed[0].seq !== cursor.seq) {
          add(
            'stale-armed',
            `armed ${armed.map(timer => timer.seq).join(',')} for seq ${cursor.seq}`,
            seat.id
          )
        }
      } else if (armed.length) {
        add('armed-without-exit', `${cursor.step} carries no timer exit`, seat.id)
      }
    }

    if (cursor.step === 'round' && round?.groupAnswers[seat.id]) {
      add('banked-in-round', 'answer banked but the seat is still on the question', seat.id)
    }
    if (cursor.step === 'settled' && round && !round.playerTurns[seat.id]) {
      add('settled-unturned', 'settled without a turn on the live round', seat.id)
    }

    if (evidence.journal) {
      const lines = evidence.journal.filter(entry => entry.seat === seat.id)
      for (let index = 1; index < lines.length; index++) {
        if (lines[index].seq <= lines[index - 1].seq) {
          add('seq-regressed', `journal seq ${lines[index - 1].seq} → ${lines[index].seq}`, seat.id)
        }
      }
      const last = lines.at(-1)
      if (last && last.seq > cursor.seq) {
        add('journal-ahead', `journal seq ${last.seq} past cursor ${cursor.seq}`, seat.id)
      }
    }

    if (evidence.renders && evidence.connectedSeats?.includes(seat.id)) {
      const age = now - cursor.enteredAt
      const render = evidence.renders.find(
        entry => entry.viewer === seat.id && entry.seat === seat.id
      )
      const current = render?.subject === cursor.subject && render.step === cursor.step
      if (!current && age > (evidence.staleRenderMs ?? STALE_RENDER_MS)) {
        add(
          'stale-render',
          `rendered ${render ? `${render.step} ${render.subject}` : 'nothing'}, cursor ${cursor.step} ${cursor.subject} for ${age}ms`,
          seat.id
        )
      }
    }
  }

  const steps = seats.flatMap(seat => (seat.cursor ? [seat.cursor.step] : []))
  if (game.started && tableOwesNextRound(steps) && game.nextRoundAt === undefined) {
    add('table-unstamped', 'every racer settled but no next round is stamped')
  }
  if (game.nextRoundAt !== undefined) {
    if (now > game.nextRoundAt + slack) {
      add('table-overdue', `next round due ${now - game.nextRoundAt}ms ago`)
    }
    const live = evidence.armed?.some(
      timer => timer.kind === 'next-round' && timer.fireAt + slack >= now
    )
    if (evidence.armed && !live) add('table-unarmed', 'a next round is stamped with no timer')
  }

  // The round's own clock is the table's exit for every seat on the question.
  const waiting = seats.filter(seat => ROUND_SETTLE_STEPS.includes(seat.cursor?.step))
  if (waiting.length && round && (evidence.capsOn ?? true)) {
    const challenge = round.groupChallenge
    const settleAt =
      isClassicGroupRound(challenge) && round.deadline !== undefined
        ? round.deadline + revealBudgetMsFor(challenge) + CLASSIC_SETTLE_SLACK_MS + slack
        : engineDeadline(challenge) !== undefined
          ? engineDeadline(challenge)! + ENGINE_STALL_MS
          : undefined
    if (settleAt !== undefined && now > settleAt) {
      add(
        'round-overdue',
        `${waiting.length} seat(s) still on round ${game.rounds.length - 1}, ${now - settleAt}ms past its clock`
      )
    }
  }

  // A classic round's exit is the table's settle backstop, which needs the
  // round's own clock — once the rules cards are down and no briefing holds.
  const playing = seats.some(seat => ['round', 'round-verdict'].includes(seat.cursor?.step ?? ''))
  const reading = seats.some(seat => seat.cursor?.step === 'tutorial')
  if (
    playing &&
    !reading &&
    round &&
    isClassicGroupRound(round.groupChallenge) &&
    !briefingHolds(round.groupChallenge) &&
    round.deadline === undefined &&
    (evidence.capsOn ?? true)
  ) {
    add('round-unclocked', 'a classic round is live with no deadline')
  }

  return violations
}

const engineDeadline = (challenge: unknown): number | undefined => {
  const state = (challenge as { state?: { deadline?: unknown; finished?: unknown } } | undefined)
    ?.state
  return state && !state.finished && typeof state.deadline === 'number' ? state.deadline : undefined
}
