import { seatSubject } from '~~/lib/seat-transitions'
import type { FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { PlayerMove } from '~~/types/game.types'
import { drawLabel, setDrawSource } from './draws'
import type { Player } from '~~/types/player.type'
import type { SeatCursor, SeatStep } from '~~/types/seat.types'

/**
 * Test scaffolding only — never imported by runtime code. A seat posed on any
 * step with a well-formed cursor, the way the suites build tables without
 * playing them up to that point.
 */
export const testCursor = (
  step: SeatStep,
  extra: Partial<Omit<SeatCursor, 'step'>> = {}
): SeatCursor => {
  const roundIndex = 0
  const walk = extra.walk ?? 1
  const subjects: Record<SeatStep, string> = {
    lobby: seatSubject.lobby(),
    tutorial: seatSubject.tutorial(),
    round: seatSubject.round(roundIndex),
    'round-verdict': seatSubject.round(roundIndex),
    scores: seatSubject.scores(roundIndex),
    walk: seatSubject.walk(walk, 0),
    arrive: seatSubject.gate(walk, 0),
    gate: seatSubject.gate(walk, 0),
    'gate-verdict': seatSubject.gate(walk, 0),
    final: seatSubject.final(walk, 0),
    'final-verdict': seatSubject.final(walk, 0),
    settled: seatSubject.settled(roundIndex),
    victory: seatSubject.victory(),
    kicked: seatSubject.kicked(),
  }
  return {
    seq: 1,
    step,
    subject: subjects[step],
    enteredAt: Date.now(),
    cause: 'test',
    walk,
    leg: 0,
    ...extra,
  }
}

export const testSeat = (
  id: string,
  step: SeatStep = 'round',
  overrides: Partial<Player> = {}
): Player => ({
  id,
  name: id,
  ready: true,
  color: 'blue' as Player['color'],
  cursor: testCursor(step),
  moves: [],
  currentPosition: 0,
  ...overrides,
})

/**
 * Scripted draws for a suite: a seat's moveset, the next round, a gauntlet
 * replacement. A script that returns undefined lets the real dealer draw.
 */
export const scriptDraws = (script: {
  moves?: (seatId: string) => PlayerMove[] | undefined
  round?: () => RoundChallenge | undefined
  finalReplacement?: () => FinalChallengeItem | null | undefined
}) =>
  setDrawSource(label => {
    const value = label.startsWith('moves:')
      ? script.moves?.(label.slice('moves:'.length))
      : label === drawLabel.round()
        ? script.round?.()
        : label === drawLabel.finalReplacement()
          ? script.finalReplacement?.()
          : undefined
    return value === undefined ? undefined : { value }
  })
