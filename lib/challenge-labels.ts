import {
  CHALLENGE_GROUPS,
  CHALLENGE_GROUP_BY_KIND,
} from '~~/types/challenges/challenge-groups.type'
import type { ChallengeGroupId } from '~~/types/challenges/challenge-groups.type'
import type { RoundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import { KIND_LABELS } from '~~/lib/victory-stats'

/**
 * The sign over a round: "Round 4 — Drop a Pin". Every mode view used to spell
 * this out itself, which is how the kicker text drifted from KIND_LABELS in
 * fifteen places. A view passes its kind; the wording lives in one table.
 */
export const roundKicker = (kind: RoundChallengeKind, roundNumber: number): string =>
  `Round ${roundNumber} — ${KIND_LABELS[kind].title}`

/**
 * The category a round belongs to — the lobby's own toggle name, shown so a
 * player can tell which switch this round came out of. Core kinds (ranking,
 * two truths) answer undefined: they are the floor every table always plays,
 * so naming a category for them would point at a toggle that does not exist.
 */
export const challengeCategory = (
  kind: RoundChallengeKind
): { id: ChallengeGroupId; label: string } | undefined => {
  const group = CHALLENGE_GROUP_BY_KIND[kind]
  if (group === 'core') return undefined
  return { id: group, label: CHALLENGE_GROUPS[group].label }
}
