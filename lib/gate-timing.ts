import { clamp01 } from '~~/lib/number'
import {
  INDIVIDUAL_GATE_CAP_MS,
  INTERSTITIAL_TOTAL_MS,
  REVEAL_BEAT_MS,
  SERVER_CONTROLLED_CAPS,
} from '~~/lib/round-beats'
import type {
  IndividualChallenge,
  IndividualChallengeVariant,
} from '~~/types/challenges/individual-challenge.type'

/**
 * How long each timed gate gives you. The server stamps the gate's deadline
 * from these and the view counts the same window down through `useServerNow`,
 * so the clock a player sees is the one that forfeits them.
 *
 * The ceiling is the round barrier: the whole table waits for the slowest
 * walker, so a gate that outlives Border Detective's 40s stalls everyone.
 */
export const BORDER_DETECTIVE_SECONDS = 40
export const TRAJECTORY_MATCH_SECONDS = 40
export const OUTLINE_REVEAL_SECONDS = 25
export const ZOOM_OUT_SECONDS = 20
/** The last guess after the zoom has pulled all the way out. */
export const ZOOM_OUT_GUESS_GRACE_SECONDS = 6
export const ERRATA_SECONDS = 30
/** Rulers: five logos to read on a framed map. Longer than errata's name check
 *  — recognising a party's mark is slower than reading a country's name. */
export const RULERS_SECONDS = 35
export const ROSETTA_SECONDS = 30
/**
 * Logo Politics: one mark, one question. Shorter than Rulers, which asks the
 * same recognition of five logos at once.
 *
 * It shipped untimed, which was not a free pass but a BETTER tile: with no
 * clock to score against, `gateLeapSteps` pays the pot whole and skips the
 * buzz decay every timed sibling takes.
 */
export const LOGO_POLITICS_SECONDS = 25
// Several full names typed with no autocomplete — long, but under the ceiling.
export const ATLAS_SECONDS = 35
/**
 * A script you cannot read, answered by typing a country name with no option
 * table anywhere — and a three-rung hint ladder whose last rung opens at
 * HINT_UNLOCK_LAST_ELAPSED. At 25s that rung landed with five seconds left,
 * which is not long enough to read a country's name and type it, so the
 * bottom of the ladder was unspendable. Atlas's length, for the same reason:
 * typing is slower than pressing.
 */
export const SCRIPTORIUM_SECONDS = 35
// Four cards dragged into place — reading time, not typing time.
export const CHRONICLE_SECONDS = 35
export const FAR_FLUNG_SECONDS = 25
/** Outline Reveal holds its clock behind the first stroke of the outline. */
export const OUTLINE_REVEAL_CLOCK_HOLD_MS = 3000
/** Trend Duel's per-duel reveal: both sparklines flip before the next pair. */
export const TREND_DUEL_REVEAL_MS = 3200

export interface GateClock {
  seconds: number
  /** Time after the interstitial before the clock starts. */
  leadMs: number
  /** The leap decays with the clock. An unscored clock is only a window. */
  scored: boolean
}

const GATE_CLOCKS: Partial<Record<IndividualChallengeVariant, GateClock>> = {
  'border-detective': { seconds: BORDER_DETECTIVE_SECONDS, leadMs: 0, scored: true },
  'trajectory-match': { seconds: TRAJECTORY_MATCH_SECONDS, leadMs: 0, scored: true },
  'outline-reveal': {
    seconds: OUTLINE_REVEAL_SECONDS,
    leadMs: OUTLINE_REVEAL_CLOCK_HOLD_MS,
    scored: false,
  },
  'zoom-out': {
    seconds: ZOOM_OUT_SECONDS + ZOOM_OUT_GUESS_GRACE_SECONDS,
    leadMs: 0,
    scored: false,
  },
  errata: { seconds: ERRATA_SECONDS, leadMs: 0, scored: true },
  rulers: { seconds: RULERS_SECONDS, leadMs: 0, scored: true },
  rosetta: { seconds: ROSETTA_SECONDS, leadMs: 0, scored: true },
  'logo-politics': { seconds: LOGO_POLITICS_SECONDS, leadMs: 0, scored: true },
  atlas: { seconds: ATLAS_SECONDS, leadMs: 0, scored: true },
  scriptorium: { seconds: SCRIPTORIUM_SECONDS, leadMs: 0, scored: true },
  chronicle: { seconds: CHRONICLE_SECONDS, leadMs: 0, scored: true },
  'far-flung': { seconds: FAR_FLUNG_SECONDS, leadMs: 0, scored: true },
}

/**
 * Variants that paint their own verdict on the question (a wash, a flipped
 * pair) before the result card takes over. The answer is sent at once; the
 * shell shows the result card only once this lead has passed, and the
 * server's hold is longer by the same amount so the card keeps its full beat.
 */
const GATE_VERDICT_LEADS: Partial<Record<IndividualChallengeVariant, number>> = {
  'logo-politics': REVEAL_BEAT_MS,
  'trend-duel': TREND_DUEL_REVEAL_MS,
}

export const gateVerdictLeadMs = (variant: IndividualChallengeVariant | undefined): number =>
  (variant && GATE_VERDICT_LEADS[variant]) || 0

export const gateClockFor = (variant: IndividualChallengeVariant | undefined) =>
  variant ? GATE_CLOCKS[variant] : undefined

/**
 * The gate's answer window, stamped when the seat lands. A timed gate's clock
 * runs after the interstitial (and any lead); an untimed gate gets the cap.
 */
export const gateDeadline = (
  challenge: Pick<IndividualChallenge, 'variant'>,
  enteredAt: number
): number | undefined => {
  const clock = gateClockFor(challenge.variant)
  if (clock) return enteredAt + INTERSTITIAL_TOTAL_MS + clock.leadMs + clock.seconds * 1000
  return SERVER_CONTROLLED_CAPS ? enteredAt + INDIVIDUAL_GATE_CAP_MS : undefined
}

/**
 * Share of a timed gate's clock left at `now` — what the leap is scaled by.
 * Undefined on an untimed gate: no clock means the pot pays whole.
 */
export const gateRemainingFraction = (
  challenge: Pick<IndividualChallenge, 'variant'>,
  deadline: number | undefined,
  now: number
): number | undefined => {
  const clock = gateClockFor(challenge.variant)
  if (!clock?.scored || deadline === undefined) return undefined
  return clamp01((deadline - now) / (clock.seconds * 1000))
}

/** The window a seat's gate clock shows — scored or not. */
export const gateClockFraction = (
  challenge: Pick<IndividualChallenge, 'variant'>,
  deadline: number | undefined,
  now: number
): number => {
  const clock = gateClockFor(challenge.variant)
  if (!clock || deadline === undefined) return 1
  return clamp01((deadline - now) / (clock.seconds * 1000))
}
