import {
  GATE_RESULT_HOLD_MS,
  GROUP_SCORES_CAP_MS,
  INDIVIDUAL_GATE_CAP_MS,
  FINAL_QUESTION_CAP_MS,
  NEW_ROUND_PAUSE_MS,
  SERVER_CONTROLLED_CAPS,
  TUTORIAL_CAP_MS,
  WALK_RESUME_LEAD_MS,
} from '~~/lib/round-beats'
import { seatSubject } from '~~/lib/seat-transitions'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import type { SeatCursor, SeatStep } from '~~/types/seat.types'

/**
 * One-shot converter for games saved before the seat cursor existed (a room
 * in flight across the deploy that introduced it). Each pre-cursor seat gets
 * a cursor derived from its legacy fields, the legacy tokens are stripped,
 * and a staged-but-unrevealed round is dropped so the reveal re-deals it.
 * Returns whether anything changed; the next save persists it.
 */

type LegacyPhase =
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

interface LegacySeat {
  phase?: LegacyPhase
  resolving?: boolean
  resultBeatUntil?: number
  walkSeq?: number
  walkIntro?: boolean
  lastStepAt?: number
}

interface LegacyGame {
  pendingRoundStart?: boolean
}

const LEGACY_SEAT_FIELDS = [
  'phase',
  'resolving',
  'resultBeatUntil',
  'walkSeq',
  'walkIntro',
  'lastStepAt',
] as const

const cap = (ms: number, now: number) => (SERVER_CONTROLLED_CAPS ? now + ms : undefined)

export const legacyCursorFor = (game: Game, seat: Player, now: number): SeatCursor => {
  const legacy = seat as unknown as LegacySeat
  const roundIndex = Math.max(0, game.rounds.length - 1)
  const walk = legacy.walkSeq ?? 0
  const base = { seq: 1, enteredAt: now, cause: 'migrate', walk, leg: 0 }
  const at = (step: SeatStep, subject: string, extra: Partial<SeatCursor> = {}): SeatCursor => ({
    ...base,
    step,
    subject,
    ...extra,
  })
  const move = seat.moves[0]
  const resumeAt = Math.max(now, legacy.resultBeatUntil ?? now + WALK_RESUME_LEAD_MS)
  switch (legacy.phase) {
    case 'tutorial':
      return at('tutorial', seatSubject.tutorial(), { deadline: cap(TUTORIAL_CAP_MS, now) })
    case 'group-challenge': {
      const banked = game.rounds[roundIndex]?.playerTurns[seat.id]?.points
      if (game.rounds[roundIndex]?.groupAnswers[seat.id] && banked) {
        const subject = seatSubject.round(roundIndex)
        return at('round-verdict', subject, {
          holdUntil: now,
          verdict: { kind: 'round', subject, scored: banked.scored, maximum: banked.maximum },
        })
      }
      return at('round', seatSubject.round(roundIndex))
    }
    case 'group-scores':
      return at('scores', seatSubject.scores(roundIndex), {
        deadline: cap(GROUP_SCORES_CAP_MS, now),
      })
    case 'moving':
      return at('walk', seatSubject.walk(walk, 0), { holdUntil: now + WALK_RESUME_LEAD_MS })
    case 'individual-challenge':
      if (legacy.resolving || move?.challenge?._type !== 'individual-challenge') {
        return at('walk', seatSubject.walk(walk, 1), { leg: 1, holdUntil: resumeAt })
      }
      return at('gate', seatSubject.gate(walk, move.endTile.position), {
        deadline: cap(INDIVIDUAL_GATE_CAP_MS, now),
      })
    case 'final-challenge':
      if (move?.challenge?._type !== 'final-challenge') {
        return at('walk', seatSubject.walk(walk, 1), {
          leg: 1,
          holdUntil: now + GATE_RESULT_HOLD_MS,
        })
      }
      return at('final', seatSubject.final(walk, move.challenge.turn ?? 0), {
        deadline: cap(FINAL_QUESTION_CAP_MS, now),
      })
    case 'movement-summary':
      return at('settled', seatSubject.settled(roundIndex))
    case 'victory':
      return at('victory', seatSubject.victory())
    case 'kicked':
      return at('kicked', seatSubject.kicked())
    default:
      return at('lobby', seatSubject.lobby())
  }
}

export const migrateLegacySeats = (game: Game, now = Date.now()): boolean => {
  const legacyGame = game as Game & LegacyGame
  let changed = false
  if (legacyGame.pendingRoundStart) {
    game.rounds.pop()
    delete legacyGame.pendingRoundStart
    game.nextRoundAt = now + NEW_ROUND_PAUSE_MS
    changed = true
  }
  for (const seat of Object.values(game.players)) {
    if (seat.cursor) continue
    seat.cursor = legacyCursorFor(game, seat, now)
    for (const field of LEGACY_SEAT_FIELDS) Reflect.deleteProperty(seat, field)
    changed = true
  }
  return changed
}
