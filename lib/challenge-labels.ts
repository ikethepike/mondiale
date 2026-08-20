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

/**
 * What a category actually deals, named — the lobby's second line.
 *
 * It used to be a count ("3 of 4 modes at normal"), which said something while
 * `culture` held eleven kinds. Split into groups of one to three, nearly every
 * row collapsed to the word "on" and five in a row said nothing at all. The
 * mode names fit now that the groups are small, and they answer the question a
 * table actually has: what am I switching off?
 *
 * A difficulty that withholds part of a group still says so — that IS the
 * non-obvious part, and it is the one thing a name list cannot show.
 */
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
