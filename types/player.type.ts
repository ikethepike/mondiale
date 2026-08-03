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
  /** Walk generation: bumped whenever a fresh moveset is dealt
   *  (settleRoundScores). Movement continuations carry the seq they were armed
   *  under and die on a mismatch, so a stale timer (a watchdog tick from a
   *  previous round) can never start a second stepping chain. */
  walkSeq?: number
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
