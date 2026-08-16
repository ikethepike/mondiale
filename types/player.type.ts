import type { PlayerColor, PlayerMove } from './game.types'

export interface Player {
  id: string
  name?: string
  ready: boolean
  color: PlayerColor
  phase: PlayerPhase
  moves: PlayerMove[]
  currentPosition: number
  completedAtRound?: number
  /** Idempotency latch for challenge answers: set when an answer is accepted,
   *  cleared once the player leaves the result beat (walk resumes / next gate).
   *  Rejects a duplicate submitted during the 5s reveal pause so it can't be
   *  applied against a shifted move. See submit-*-challenge-answer handlers. */
  resolving?: boolean
  /** Epoch ms an INDIVIDUAL gate's result beat runs to — the beat's token.
   *  Stamped by the submit (the answered gate is shifted off `moves`, so the
   *  variant-aware hold length is unrecoverable from state without it) and
   *  cleared when the walk resumes. Recovery paths re-arm the REMAINING
   *  window instead of the flat bask; a hold continuation from a PRIOR beat
   *  dies on a live stamp; `gate-reveal-done` requires it, which keeps the
   *  final gauntlet's `resolving` latch out of reach. The gauntlet never
   *  stamps it — its beat is `clearFinalResultBeat`'s. */
  resultBeatUntil?: number
  /** Walk generation: bumped whenever a fresh moveset is dealt
   *  (settleRoundScores). Movement continuations carry the seq they were armed
   *  under and die on a mismatch, so a stale timer (a watchdog tick from a
   *  previous round) can never start a second stepping chain. */
  walkSeq?: number
  /** When this seat last stepped a tile (epoch ms) — the single-stepper
   *  latch. Duplicate walk continuations (a rejoin re-arming a resume beside
   *  the live timer) both carry a valid walkSeq; whichever ticks early gets
   *  dropped here, so a pawn can never step faster than the walk cadence. */
  lastStepAt?: number
  /** TRUE from the moveset deal (startWalk) until the walk's first step: this
   *  is a turn-OPENING walk, owed the long announce lead and the "On the
   *  move!" beat. Between-gates resumes carry false — their announcement is
   *  the gate verdict the player just watched. */
  walkIntro?: boolean
  /** A computer-controlled seat, added by the host in the lobby. Rides the
   *  snapshot on purpose (clients render the bot badge); the seat has no
   *  bearer secret and the join door refuses its id, so no socket can ever
   *  bind to it. The bot brain (bot-brain.ts) plays it server-side. */
  bot?: true
  /** The bot brain is covering this HUMAN seat while its player is away.
   *  Set by the AFK takeover (socket gone past the grace window mid-race),
   *  cleared by the player's rejoin. `sinceRound` bounds the catch-up
   *  summary the returning player is shown. */
  autopilot?: { sinceRound: number }
}

export type PlayerPhase =
  | 'naming'
  | 'waiting-for-game'
  | 'tutorial'
  | 'group-challenge'
  | 'individual-challenge'
  | 'group-scores'
  | 'moving'
  | 'movement-summary'
  | 'kicked'
  | 'final-challenge'
  | 'victory'

/** Phases where the player is parked on the 3D board. */
export const BOARD_PHASES: PlayerPhase[] = ['moving', 'movement-summary']
