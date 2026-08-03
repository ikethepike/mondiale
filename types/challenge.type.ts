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
}
