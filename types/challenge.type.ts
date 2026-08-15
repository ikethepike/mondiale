/**
 * This is available client side and does not get populated server side
 */
export type ChallengeTopic =
  | 'general knowledge'
  | 'economics'
  | 'geography'
  | 'unemployment'
  | 'infrastructure'
  | 'gender'
  | 'people'
  | 'education'
  | 'health'
  | 'religion'
  | 'environment'
  | 'energy'
  | 'human rights'
  | 'history'

export interface ChallengeConfiguration {
  topic: ChallengeTopic
  phrasing: string
  /**
   * A plain-words definition of what the stat measures, for stats whose
   * phrasing alone invites the wrong denominator (electricity vs total
   * energy, spending vs GDP share). Surfaces behind a ? next to the prompt.
   */
  definition?: string
  markers?: ChallengeMarkers
  /**
   * Fixed bounds for indices whose bare number is meaningless without its scale
   * (V-Dem 0–1, CPI 0–100, Gini). When present the value can be plotted on a
   * track with the `markers` as its poles. `invert` flips the plotted position
   * without touching the number — for CPI, where a HIGH score means LESS
   * corrupt, so the marker sits toward the "least corrupt" (right) pole.
   */
  scale?: ChallengeScale
}

export interface ChallengeMarkers {
  least: string
  most: string
}

export interface ChallengeScale {
  min: number
  max: number
  invert?: boolean
  /** How the track is painted — see `ScaleTone`. Defaults to `neutral`. */
  tone?: ScaleTone
}

/**
 * Whether the poles of a plotted scale carry a value judgement, and which way
 * round it runs. The track's colour is the only thing this decides:
 *
 * - `positive` — the "most" pole is the good end (democracy, HDI, happiness):
 *   the gradient warms from alert at the left to calm at the right.
 * - `inverted` — the "most" pole is the bad end (inequality, years at war):
 *   the same gradient, mirrored.
 * - `neutral` — the poles are just ends, not verdicts (average height, share
 *   aged 65+). A plain ink ramp: more to the right, no judgement.
 *
 * `neutral` is the default because claiming a verdict a stat doesn't carry is
 * the worse failure — an ageing population is not a red-to-green story.
 */
export type ScaleTone = 'positive' | 'inverted' | 'neutral'
