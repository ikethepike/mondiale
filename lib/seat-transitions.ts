import { SEAT_DEADLINE_GRACE_MS, SERVER_CONTROLLED_CAPS } from '~~/lib/round-beats'
import {
  SEAT_STEPS,
  type SeatCause,
  type SeatCursor,
  type SeatStep,
  type SeatVerdict,
} from '~~/types/seat.types'

/** The one follow-up a waiting seat's cursor arms. */
export const SEAT_TIMER_KINDS = [
  'tutorial-cap',
  'scores-cap',
  'walk-step',
  'landing',
  'gate-cap',
  'final-cap',
  'verdict-hold',
] as const
export type SeatTimerKind = (typeof SEAT_TIMER_KINDS)[number]

export type SeatViewFamily =
  'lobby' | 'tutorial' | 'round' | 'scores' | 'board' | 'gate' | 'final' | 'victory' | 'kicked'

export interface SeatStepSpec {
  /**
   * What guarantees the step ends. `timer`: the cursor arms `timer` from its
   * own stamps. `table`: the round engine's settle or the next-round reveal
   * owns the exit, never a seat timer. `pre-game` and `terminal` need none.
   */
  exit: 'timer' | 'table' | 'pre-game' | 'terminal'
  timer?: SeatTimerKind
  /** `cap` deadlines are only stamped while SERVER_CONTROLLED_CAPS is on. */
  requires: { holdUntil?: true; deadline?: 'cap'; verdict?: SeatVerdict['kind'] }
  family: SeatViewFamily
}

export const SEAT_STEP_SPECS: Record<SeatStep, SeatStepSpec> = {
  lobby: { exit: 'pre-game', requires: {}, family: 'lobby' },
  tutorial: {
    exit: 'timer',
    timer: 'tutorial-cap',
    requires: { deadline: 'cap' },
    family: 'tutorial',
  },
  round: { exit: 'table', requires: {}, family: 'round' },
  'round-verdict': {
    exit: 'timer',
    timer: 'verdict-hold',
    requires: { holdUntil: true, verdict: 'round' },
    family: 'round',
  },
  scores: { exit: 'timer', timer: 'scores-cap', requires: { deadline: 'cap' }, family: 'scores' },
  walk: { exit: 'timer', timer: 'walk-step', requires: { holdUntil: true }, family: 'board' },
  arrive: { exit: 'timer', timer: 'landing', requires: { holdUntil: true }, family: 'board' },
  gate: { exit: 'timer', timer: 'gate-cap', requires: { deadline: 'cap' }, family: 'gate' },
  'gate-verdict': {
    exit: 'timer',
    timer: 'verdict-hold',
    requires: { holdUntil: true, verdict: 'gate' },
    family: 'gate',
  },
  final: { exit: 'timer', timer: 'final-cap', requires: { deadline: 'cap' }, family: 'final' },
  'final-verdict': {
    exit: 'timer',
    timer: 'verdict-hold',
    requires: { holdUntil: true, verdict: 'final' },
    family: 'final',
  },
  settled: { exit: 'table', requires: {}, family: 'board' },
  victory: { exit: 'terminal', requires: {}, family: 'victory' },
  kicked: { exit: 'terminal', requires: {}, family: 'kicked' },
}

export interface SeatTransitionRule {
  from: SeatStep
  to: SeatStep
  /** Exact causes that may drive this move. */
  causes: readonly SeatCause[]
}

const rule = (from: SeatStep, to: SeatStep, ...causes: SeatCause[]): SeatTransitionRule => ({
  from,
  to,
  causes,
})

/** Every legal seat move. Anything else is rejected by `advanceSeat`. */
export const SEAT_TRANSITIONS: readonly SeatTransitionRule[] = [
  rule('lobby', 'tutorial', 'table:start-game'),
  rule('tutorial', 'round', 'event:close-tutorial', 'timer:tutorial-cap'),
  rule('tutorial', 'scores', 'table:settle'),
  rule('round', 'round', 'event:round-play'),
  rule('round', 'round-verdict', 'event:submit-group-challenge-answers'),
  rule('round', 'scores', 'event:submit-group-challenge-answers', 'table:settle'),
  rule('round-verdict', 'scores', 'timer:verdict-hold', 'table:settle', 'event:round-reveal-done'),
  rule('scores', 'walk', 'event:enter-movement-phase', 'timer:scores-cap'),
  rule('walk', 'walk', 'timer:walk-step'),
  rule('walk', 'arrive', 'timer:walk-step'),
  rule('walk', 'settled', 'timer:walk-step'),
  rule('arrive', 'gate', 'timer:landing'),
  rule('arrive', 'final', 'timer:landing'),
  rule('gate', 'gate-verdict', 'event:submit-individual-challenge-answer', 'timer:gate-cap'),
  rule('gate-verdict', 'walk', 'timer:verdict-hold', 'event:gate-reveal-done'),
  rule('gate-verdict', 'settled', 'timer:verdict-hold', 'event:gate-reveal-done'),
  rule('final', 'final-verdict', 'event:submit-final-challenge-answer', 'timer:final-cap'),
  rule('final-verdict', 'final', 'timer:verdict-hold'),
  rule('final-verdict', 'settled', 'timer:verdict-hold'),
  rule('final-verdict', 'victory', 'timer:verdict-hold'),
  rule('settled', 'round', 'table:reveal'),
  rule('scores', 'kicked', 'admin:retire'),
  rule('walk', 'kicked', 'admin:retire'),
  rule('arrive', 'kicked', 'admin:retire'),
  rule('settled', 'kicked', 'admin:retire'),
]

export const findSeatTransition = (
  from: SeatStep,
  to: SeatStep,
  cause: SeatCause
): SeatTransitionRule | undefined =>
  SEAT_TRANSITIONS.find(
    entry => entry.from === from && entry.to === to && entry.causes.includes(cause)
  )

/** Why a proposed cursor violates its target step's requirements, or undefined. */
export const stepRequirementGap = (
  next: {
    step: SeatStep
    subject: string
    holdUntil?: number
    deadline?: number
    verdict?: SeatVerdict
  },
  capsOn: boolean
): string | undefined => {
  const { requires } = SEAT_STEP_SPECS[next.step]
  if (requires.holdUntil && !next.holdUntil) return `${next.step} requires holdUntil`
  if (requires.deadline === 'cap' && capsOn && !next.deadline)
    return `${next.step} requires deadline`
  if (requires.verdict) {
    if (next.verdict?.kind !== requires.verdict)
      return `${next.step} requires a ${requires.verdict} verdict`
    if (next.verdict.subject !== next.subject)
      return `${next.step} verdict belongs to another subject`
  }
  if (!requires.verdict && next.verdict) return `${next.step} carries no verdict`
  return undefined
}

const stepsWhere = (test: (step: SeatStep) => boolean): readonly SeatStep[] =>
  SEAT_STEPS.filter(test)

/** Still inside the live round (or before the game) — never walkable. */
export const ROUND_BOUND_STEPS = stepsWhere(step =>
  ['lobby', 'tutorial', 'round', 'round-verdict'].includes(step)
)
/** Seats a round settle may force-grade and advance. */
export const ROUND_SETTLE_STEPS = stepsWhere(step =>
  ['tutorial', 'round', 'round-verdict'].includes(step)
)
/** Done with this round's movement: the table may stage the next one. */
export const SETTLED_STEPS = stepsWhere(step => ['settled', 'victory', 'kicked'].includes(step))
export const TERMINAL_STEPS = stepsWhere(step => SEAT_STEP_SPECS[step].exit === 'terminal')
/** Where a retiring bot may leave without owing the table a turn. */
export const RETIREMENT_STEPS = stepsWhere(step =>
  SEAT_TRANSITIONS.some(entry => entry.from === step && entry.to === 'kicked')
)
export const BOARD_STEPS = stepsWhere(step => SEAT_STEP_SPECS[step].family === 'board')
/** Steps that hold a verdict on screen for a subject. */
export const VERDICT_STEPS = stepsWhere(step => !!SEAT_STEP_SPECS[step].requires.verdict)

export const isSettledStep = (step: SeatStep): boolean => SETTLED_STEPS.includes(step)
export const isTerminalStep = (step: SeatStep): boolean => TERMINAL_STEPS.includes(step)

/** Every seat is done with the round's movement. */
export const tableIsSettled = (steps: readonly SeatStep[]): boolean => steps.every(isSettledStep)

/** The table is settled AND someone is still racing — the next round is owed. */
export const tableOwesNextRound = (steps: readonly SeatStep[]): boolean =>
  tableIsSettled(steps) && steps.includes('settled')

/** Subject builders — the one place subject strings are spelled. */
export const seatSubject = {
  lobby: () => 'lobby',
  tutorial: () => 'tutorial',
  round: (roundIndex: number) => `round:${roundIndex}`,
  scores: (roundIndex: number) => `scores:${roundIndex}`,
  walk: (walk: number, leg: number) => `walk:w${walk}:${leg}`,
  gate: (walk: number, tile: number) => `gate:w${walk}:t${tile}`,
  final: (walk: number, question: number) => `final:w${walk}:q${question}`,
  settled: (roundIndex: number) => `settled:${roundIndex}`,
  victory: () => 'victory',
  kicked: () => 'kicked',
}

/** Every seat starts in the lobby. */
export const initialSeatCursor = (now = Date.now()): SeatCursor => ({
  seq: 1,
  step: 'lobby',
  subject: seatSubject.lobby(),
  enteredAt: now,
  cause: 'event:join',
  walk: 0,
  leg: 0,
})

/** When a cursor's own stamps say its follow-up fires, or undefined (no timer exit, or caps off). */
export const seatFireAt = (cursor: SeatCursor): number | undefined => {
  if (SEAT_STEP_SPECS[cursor.step].exit !== 'timer') return undefined
  if (cursor.holdUntil !== undefined) return cursor.holdUntil
  if (cursor.deadline !== undefined) return cursor.deadline + SEAT_DEADLINE_GRACE_MS
  return undefined
}

export class IllegalTransition extends Error {}

export interface NextCursor {
  step: SeatStep
  subject: string
  holdUntil?: number
  deadline?: number
  verdict?: SeatVerdict
  walk?: number
  leg?: number
}

/**
 * THE cursor write: validate the move against the table and stamp the new
 * cursor, bumping `seq`. The server's `advanceSeat` journals around it; the
 * dev harness simulates the server through it. Nothing else assigns a cursor.
 */
export const applySeatMove = (
  seat: { cursor: SeatCursor },
  next: NextCursor,
  cause: SeatCause,
  now = Date.now()
): SeatCursor => {
  const previous = seat.cursor
  const gap = findSeatTransition(previous.step, next.step, cause)
    ? stepRequirementGap(next, SERVER_CONTROLLED_CAPS)
    : `no rule ${previous.step} → ${next.step} for ${cause}`
  if (gap) throw new IllegalTransition(gap)
  seat.cursor = {
    seq: previous.seq + 1,
    step: next.step,
    subject: next.subject,
    enteredAt: now,
    cause,
    walk: next.walk ?? previous.walk,
    leg: next.leg ?? previous.leg,
    ...(next.holdUntil !== undefined ? { holdUntil: next.holdUntil } : {}),
    ...(next.deadline !== undefined ? { deadline: next.deadline } : {}),
    ...(next.verdict ? { verdict: next.verdict } : {}),
  }
  return seat.cursor
}
