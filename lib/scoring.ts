/**
 * Scoring shapes shared by more than one mode. Client-safe: nothing here
 * imports the generated geometry, which must stay out of the client bundle.
 */
import type { IndividualChallengeVariant } from '~~/types/challenges/individual-challenge.type'
import { clamp01 } from './number'

/** A score folded into 0..maximum — the one guard between a scorer and the wire. */
export const clampScore = (scored: number, maximum: number): number =>
  Math.max(0, Math.min(Math.round(scored), maximum))

/**
 * Set-overlap fraction (Jaccard): |guess ∩ truth| / |guess ∪ truth|, with the
 * both-empty case counting as a perfect match. Extent taps, claimant picks —
 * every "tap the right set" mode scores through this.
 */
export const jaccardFraction = (guess: ReadonlySet<string>, truth: ReadonlySet<string>): number => {
  if (guess.size === 0 && truth.size === 0) return 1
  const intersection = [...guess].filter(member => truth.has(member)).length
  const union = new Set([...guess, ...truth]).size
  return union ? intersection / union : 0
}

/** A correct-but-late answer still pays this fraction of the pot. */
export const BUZZ_FLOOR = 0.35

/** Earlier answer, bigger score. */
export const buzzFraction = (remainingFraction: number): number =>
  BUZZ_FLOOR + (1 - BUZZ_FLOOR) * clamp01(remainingFraction)

/** Points for buzzing in with `remainingFraction` of the clock left. */
export const buzzScore = (maximumPoints: number, remainingFraction: number): number =>
  Math.round(maximumPoints * buzzFraction(remainingFraction))

/** A gate's full-pot leap in board steps — what an untimed gate always pays. */
export const GATE_LEAP_STEPS = 2

/** Each bought gate hint bites this many steps off the leap. */
export const GATE_HINT_BITE_STEPS = 2

/**
 * Variants that pay more than the standard pot. A hint bites
 * `GATE_HINT_BITE_STEPS`, so a mode whose hint is meant to be a TRADE rather
 * than a surrender needs a pot deeper than the bite — at `GATE_LEAP_STEPS` a
 * single hint zeroes the leap outright and can only ever buy safety.
 */
const GATE_POTS: Partial<Record<IndividualChallengeVariant, number>> = {
  // Both carry a buyable hint worth taking: errata's half-lineup cull and
  // rosetta's named relation still leave something on the table.
  errata: 4,
  rosetta: 4,
}

/** The full-pot leap for a gate variant. Both ends of the wire read the pot
 *  through this, so a mode's stakes can never differ client to server. */
export const gatePot = (variant?: IndividualChallengeVariant): number =>
  (variant && GATE_POTS[variant]) ?? GATE_LEAP_STEPS

/**
 * Steps a correct gate answer moves the pawn. Timed gates report the clock
 * fraction left and the buzz curve scales the leap; every bought hint bites
 * `GATE_HINT_BITE_STEPS`, never below zero. Untimed gates report nothing and
 * pay the whole pot. Hostile or buggy payloads can't help themselves: a
 * non-finite fraction falls back to the pot, and a negative or non-finite
 * hint count bites nothing rather than paying extra.
 */
export const gateLeapSteps = (
  remainingFraction?: number,
  hintsUsed = 0,
  pot: number = GATE_LEAP_STEPS
): number => {
  const earned =
    remainingFraction !== undefined && Number.isFinite(remainingFraction)
      ? Math.round(pot * buzzFraction(remainingFraction))
      : pot
  const bought = Number.isFinite(hintsUsed) ? Math.max(0, Math.floor(hintsUsed)) : 0
  return Math.max(0, earned - bought * GATE_HINT_BITE_STEPS)
}

/** Each bought point-mode hint bites this fraction of the pot. */
export const HINT_BITE_FRACTION = 0.2

/** Buyable hints unlock in waves: the opener a third of the clock in, the
 *  last resort at two thirds. */
export const HINT_UNLOCK_FIRST_ELAPSED = 1 / 3
export const HINT_UNLOCK_SECOND_ELAPSED = 2 / 3

/** The flat slice one bought hint takes off the pot. */
export const hintBitePoints = (maximumPoints: number): number =>
  Math.round(maximumPoints * HINT_BITE_FRACTION)

/**
 * A correct answer's points after paying for bought hints: each bites
 * `HINT_BITE_FRACTION` of the pot, never below zero. Same posture as
 * `gateLeapSteps` on hostile counts — a negative or non-finite hint count
 * bites nothing rather than paying extra.
 */
export const hintDockedScore = (scored: number, maximumPoints: number, hintsUsed = 0): number => {
  const bought = Number.isFinite(hintsUsed) ? Math.max(0, Math.floor(hintsUsed)) : 0
  return Math.max(0, scored - bought * hintBitePoints(maximumPoints))
}

/**
 * Blitz-family scoring (water modes, mother-tongue, neighbour-blitz): the
 * found ratio scales the pot, every wrong guess bites one point. Duplicate
 * guesses count once.
 */
export const blitzScore = (
  answers: readonly string[],
  submittedGuesses: readonly string[],
  maximumPoints: number
): { scored: number; maximum: number } => {
  const answerSet = new Set(answers)
  const unique = [...new Set(submittedGuesses)]
  const correct = unique.filter(guess => answerSet.has(guess)).length
  const wrong = unique.length - correct

  const raw = answerSet.size ? Math.round((maximumPoints * correct) / answerSet.size) - wrong : 0
  return { scored: clampScore(raw, maximumPoints), maximum: maximumPoints }
}

/**
 * Pin-drop taper (pin-landmark, heritage-hunt): full marks anywhere
 * inside `perfectDistanceKm`, tapering linearly to nothing at `zeroDistanceKm`.
 * Never partially credits a wrong hemisphere.
 */
export const scorePinDistance = ({
  distanceKm,
  perfectDistanceKm,
  zeroDistanceKm,
  maximumPoints,
}: {
  distanceKm: number
  perfectDistanceKm: number
  zeroDistanceKm: number
  maximumPoints: number
}): number => {
  if (distanceKm <= perfectDistanceKm) return maximumPoints
  if (distanceKm >= zeroDistanceKm) return 0
  const span = zeroDistanceKm - perfectDistanceKm
  const missed = distanceKm - perfectDistanceKm
  const scored = Math.round(maximumPoints * (1 - missed / span))
  return clampScore(scored, maximumPoints)
}

/** A found answer worth `maximum`, docked per wasted attempt, never below `floor`. */
export const attemptDecayScore = (wasted: number, maximum: number, step = 2, floor = 2): number =>
  Math.max(floor, maximum - Math.max(0, wasted) * step)

/**
 * Found it on attempt `attempt` of `attempts`: full marks first try, tapering
 * to `lastAttemptFraction` on the last. Derived from the cap rather than a
 * fixed rate, so raising the cap can never drive a correct answer to nothing.
 */
export const attemptFraction = (
  attempt: number,
  attempts: number,
  lastAttemptFraction = 0.4
): number => {
  if (attempts <= 1 || attempt <= 1) return 1
  const spent = Math.min(attempt, attempts) - 1
  return 1 - (spent / (attempts - 1)) * (1 - lastAttemptFraction)
}
