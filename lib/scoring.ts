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
 * `GATE_HINT_BITE_STEPS` off the pot, so a mode whose hint is meant to be a
 * TRADE rather than a surrender needs a pot deeper than the bite — at
 * `GATE_LEAP_STEPS` there is nothing left to stake and the hint can only ever
 * buy safety.
 */
const GATE_POTS: Partial<Record<IndividualChallengeVariant, number>> = {
  // All four carry a buyable hint worth taking: errata's half-lineup cull,
  // rosetta's named relation, atlas's one-that-works and chronicle's anchored
  // earliest card still leave something on the table.
  errata: 4,
  rosetta: 4,
  atlas: 4,
  chronicle: 4,
  // Scriptorium stakes deepest, for two reasons. Its ladder is THREE rungs,
  // and at pot 4 rungs two and three both stake nothing — the graded ladder
  // collapses back into the one-surrender shape the deep pots exist to undo.
  // And it is the hardest typed gate in the set: no option table at any
  // difficulty, and a script most players cannot read at all.
  scriptorium: 5,
}

/** The full-pot leap for a gate variant. Both ends of the wire read the pot
 *  through this, so a mode's stakes can never differ client to server. */
export const gatePot = (variant?: IndividualChallengeVariant): number =>
  (variant && GATE_POTS[variant]) ?? GATE_LEAP_STEPS

/**
 * Steps a correct gate answer moves the pawn. Hints come off the POT, then the
 * buzz curve scales what's left; untimed gates report no clock and pay the
 * remaining pot whole. Hostile or buggy payloads can't help themselves: a
 * non-finite fraction falls back to the pot, and a negative or non-finite hint
 * count bites nothing rather than paying extra.
 *
 * The order is the whole point. Biting AFTER the curve subtracts a flat 2 from
 * an already-decayed number, so on a 30s gate at pot 4 the hint paid 1 step for
 * seven seconds and zero for the rest of the clock — the surrender this pot was
 * raised to prevent, and worst exactly when errata's cull is most wanted, late.
 * Biting first leaves a floor: `(4 - 2) * BUZZ_FLOOR` still rounds to 1 at the
 * buzzer. It changes nothing at the standard pot, where `(2 - 2)` is zero at
 * every clock reading, same as before.
 */
export const gateLeapSteps = (
  remainingFraction: number | undefined,
  hintsUsed: number | undefined,
  // Required, with no default: `gatePot` exists so a mode's stakes can't
  // differ client to server, and a defaulted pot would let a call site quietly
  // pay the standard leap for a deep-pot gate instead of failing to compile.
  pot: number
): number => {
  const bought = Number.isFinite(hintsUsed) ? Math.max(0, Math.floor(hintsUsed ?? 0)) : 0
  const staked = Math.max(0, pot - bought * GATE_HINT_BITE_STEPS)
  return remainingFraction !== undefined && Number.isFinite(remainingFraction)
    ? Math.max(0, Math.round(staked * buzzFraction(remainingFraction)))
    : staked
}

/** Each bought point-mode hint bites this fraction of the pot. */
export const HINT_BITE_FRACTION = 0.2

/**
 * Buyable hints unlock in waves: the opener a third of the clock in, the
 * second at two thirds, and — for a ladder long enough to need it — a last
 * resort at four fifths.
 *
 * The last wave is deliberately NOT nine tenths. A rung that opens with two
 * seconds left is decoration: the player still has to read it and type an
 * answer, and a hint they cannot spend is the same dead end as no hint at all.
 */
export const HINT_UNLOCK_FIRST_ELAPSED = 1 / 3
export const HINT_UNLOCK_SECOND_ELAPSED = 2 / 3
export const HINT_UNLOCK_LAST_ELAPSED = 4 / 5

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

/**
 * Share of a one-to-one matching the player got right: `guess[i]` is what they
 * put in slot i, `truth[i]` is what belongs there.
 *
 * Deliberately NOT `jaccardFraction`. In a bijective match the player submits
 * exactly as many pairs as there are truths, so the union is `2n − k` and
 * Jaccard collapses to `k / (2n − k)` — three of four right would pay 0.6
 * instead of 0.75. Set overlap is the wrong measure when the two sets always
 * hold the same members and only the ORDER carries the claim.
 */
export const pairFraction = (guess: readonly string[], truth: readonly string[]): number => {
  if (!truth.length) return 1
  let correct = 0
  for (let index = 0; index < truth.length; index++) {
    if (guess[index] && guess[index] === truth[index]) correct++
  }
  return correct / truth.length
}
