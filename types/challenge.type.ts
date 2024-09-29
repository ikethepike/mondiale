/**
 * This is available client side and does not get populated server side
 */
export interface ChallengeConfiguration {
  topic:
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
    | 'human rights'
  phrasing: string
  markers?: ChallengeMarkers
}

export interface ChallengeMarkers {
  least: string
  most: string
}
