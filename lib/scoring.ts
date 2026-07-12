/**
 * Scoring shapes shared by more than one mode. Client-safe: nothing here
 * imports the generated geometry, which must stay out of the client bundle.
 */

/** A correct-but-late answer still pays this fraction of the pot. */
export const BUZZ_FLOOR = 0.35

/** Earlier answer, bigger score. */
export const buzzFraction = (remainingFraction: number): number =>
  BUZZ_FLOOR + (1 - BUZZ_FLOOR) * Math.max(0, Math.min(1, remainingFraction))

/** Points for buzzing in with `remainingFraction` of the clock left. */
export const buzzScore = (maximumPoints: number, remainingFraction: number): number =>
  Math.round(maximumPoints * buzzFraction(remainingFraction))

/** A gate's full-pot leap in board steps — what an untimed gate always pays. */
export const GATE_LEAP_STEPS = 2

/** Each bought gate hint bites this many steps off the leap. */
export const GATE_HINT_BITE_STEPS = 2

/**
 * Steps a correct gate answer moves the pawn. Timed gates report the clock
 * fraction left and the buzz curve scales the leap; every bought hint bites
 * `GATE_HINT_BITE_STEPS`, never below zero. Untimed gates report nothing and
 * pay the whole pot. Hostile or buggy payloads can't help themselves: a
 * non-finite fraction falls back to the pot, and a negative or non-finite
 * hint count bites nothing rather than paying extra.
 */
export const gateLeapSteps = (remainingFraction?: number, hintsUsed = 0): number => {
  const pot =
    remainingFraction !== undefined && Number.isFinite(remainingFraction)
      ? Math.round(GATE_LEAP_STEPS * buzzFraction(remainingFraction))
      : GATE_LEAP_STEPS
  const bought = Number.isFinite(hintsUsed) ? Math.max(0, Math.floor(hintsUsed)) : 0
  return Math.max(0, pot - bought * GATE_HINT_BITE_STEPS)
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
  return { scored: Math.max(0, Math.min(raw, maximumPoints)), maximum: maximumPoints }
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
  return Math.max(0, Math.min(scored, maximumPoints))
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
