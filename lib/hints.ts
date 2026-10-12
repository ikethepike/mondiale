import { SCRIPTORIUM_RUNGS } from './scriptorium'
import type { IndividualChallengeVariant } from '~~/types/challenges/individual-challenge.type'
import {
  roundChallengeKind,
  type RoundChallenge,
  type RoundChallengeKind,
} from '~~/types/challenges/traversal-challenge.type'
import type { SeatCursor } from '~~/types/seat.types'

/**
 * Every buyable hint, by the gate variant or round kind that sells it. A seat
 * buys one through `buy-hint`, which records it on the seat's cursor for that
 * subject; the leap and the round's pay are docked by that record alone — a
 * submit never reports what it bought.
 */
export const GATE_HINTS = {
  'border-detective': ['outline', 'iso'],
  'trajectory-match': ['strike'],
  errata: ['cull'],
  rosetta: ['relation'],
  atlas: ['continuation'],
  scriptorium: SCRIPTORIUM_RUNGS,
  chronicle: ['anchor'],
} as const satisfies Partial<Record<IndividualChallengeVariant, readonly string[]>>

export const ROUND_HINTS = {
  'two-truths': ['fifty-fifty'],
  'name-that-water': ['shores', 'initials'],
} as const satisfies Partial<Record<RoundChallengeKind, readonly string[]>>

export type GateHint<V extends keyof typeof GATE_HINTS> = (typeof GATE_HINTS)[V][number]
export type RoundHint<K extends keyof typeof ROUND_HINTS> = (typeof ROUND_HINTS)[K][number]

const GATE_SALES: Partial<Record<IndividualChallengeVariant, readonly string[]>> = GATE_HINTS
const ROUND_SALES: Partial<Record<RoundChallengeKind, readonly string[]>> = ROUND_HINTS

export const gateHintsOnSale = (
  variant: IndividualChallengeVariant | undefined
): readonly string[] => (variant && GATE_SALES[variant]) || []

export const roundHintsOnSale = (challenge: RoundChallenge | undefined): readonly string[] =>
  ROUND_SALES[roundChallengeKind(challenge)] ?? []

/** How many of the hints `onSale` the seat's cursor has recorded as bought. */
export const hintsBought = (
  cursor: Pick<SeatCursor, 'hints'> | undefined,
  onSale: readonly string[]
): number => (cursor?.hints ?? []).filter(hint => onSale.includes(hint)).length
