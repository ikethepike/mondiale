import type { FinalChallengeAnswer } from './challenges/final-challenge.type'
import type { ISOCountryCode } from './geography.types'

/**
 * What a seat should be looking at. The server owns every step change
 * (`advanceSeat`); the client renders `(cursor, serverNow)` and never infers.
 */
export const SEAT_STEPS = [
  'lobby',
  'tutorial',
  'round',
  'round-verdict',
  'scores',
  'walk',
  'arrive',
  'gate',
  'gate-verdict',
  'final',
  'final-verdict',
  'settled',
  'victory',
  'kicked',
] as const
export type SeatStep = (typeof SEAT_STEPS)[number]

export type SeatVerdict =
  | { kind: 'round'; subject: string; scored: number; maximum: number }
  | {
      kind: 'gate'
      subject: string
      correct: boolean
      timedOut: boolean
      submitted?: ISOCountryCode
      /** Tiles the answer leaps on a correct verdict, paid out when the hold ends. */
      steps: number
      browsable: boolean
    }
  | {
      kind: 'final'
      subject: string
      correct: boolean
      timedOut: boolean
      submittedAnswer?: FinalChallengeAnswer
      knockedOut: boolean
      won: boolean
    }

/** `event:<client event>` · `timer:<SeatTimerKind>` · `table:<action>` · `admin:<action>` · `migrate` */
export type SeatCause = string

export interface SeatCursor {
  /** Bumps on every change — the ONLY staleness token a seat timer or a submit carries. */
  seq: number
  step: SeatStep
  /** Stable id of what is on screen: `round:7`, `gate:w12:t18`, `final:w12:q3`. */
  subject: string
  enteredAt: number
  /** Server-stamped end of a verdict, announce, step or landing beat. */
  holdUntil?: number
  /** Server-stamped answer window (or reading cap) for the step. */
  deadline?: number
  verdict?: SeatVerdict
  cause: SeatCause
  /** Movesets dealt to this seat so far — names walk subjects, never checked as a token. */
  walk: number
  /** Gates passed on the current walk; 0 is the turn-opening leg. */
  leg: number
}

/** One line of the append-only seat journal. */
export interface SeatJournalEntry {
  game: string
  seat: string
  seq: number
  from: SeatStep | null
  to: SeatStep
  subject: string
  cause: SeatCause
  at: number
  rev?: number
  /** Walk steps: journaled to the log, kept out of the ring and the render audit. */
  progress?: true
  actor?: 'bot' | 'autopilot'
}

/** What a viewer last finished rendering, per the `seat-rendered` ack. */
export interface SeatRender {
  viewer: string
  seat: string
  seq: number
  step: SeatStep
  subject: string
  view: string
  at: number
}
