import {
  autoEnabledKinds,
  CHALLENGE_GROUPS,
  CHALLENGE_GROUP_BY_KIND,
} from '~~/types/challenges/challenge-groups.type'
import type { ChallengeGroupId } from '~~/types/challenges/challenge-groups.type'
import type { RoundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import { KIND_LABELS } from '~~/lib/victory-stats'
import { listJoin } from '~~/lib/strings'
import type { GameDifficulty } from '~~/types/game.types'

/** The sign over a round: "Round 4 — Drop a Pin". */
export const roundKicker = (kind: RoundChallengeKind, roundNumber: number): string =>
  `Round ${roundNumber} — ${KIND_LABELS[kind].title}`

/** The lobby toggle a round came out of. Core kinds answer undefined —
 *  they are the floor every table plays, and name no toggle. */
export const challengeCategory = (
  kind: RoundChallengeKind
): { id: ChallengeGroupId; label: string } | undefined => {
  const group = CHALLENGE_GROUP_BY_KIND[kind]
  if (group === 'core') return undefined
  return { id: group, label: CHALLENGE_GROUPS[group].label }
}

/** What a category deals, named — the lobby's second line. A difficulty
 *  withholding part of a group says so; a name list alone cannot show it. */
export const categoryModes = (group: ChallengeGroupId, difficulty: GameDifficulty): string => {
  const { enabled, total } = autoEnabledKinds(group, difficulty)
  const names = total.map(kind => KIND_LABELS[kind].title)
  if (enabled.length === 0) return `${listJoin(names)} — hard games only`
  if (enabled.length < total.length) {
    const held = total.filter(kind => !enabled.includes(kind)).map(kind => KIND_LABELS[kind].title)
    return `${listJoin(names)} — ${listJoin(held)} on hard only`
  }
  return listJoin(names)
}
