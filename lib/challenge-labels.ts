import {
  autoEnabledKinds,
  CHALLENGE_GROUPS,
  CHALLENGE_GROUP_BY_KIND,
  isKindEnabled,
  MINIMUM_TABLE_BY_KIND,
  type ChallengeGroupId,
  type ChallengeSettings,
} from '~~/types/challenges/challenge-groups.type'
import type { RoundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import { isKindFeasible, ROUND_KINDS } from '~~/lib/round-mix'
import { KIND_LABELS } from '~~/lib/victory-stats'

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

/**
 * Why a mode is or isn't in this game's deck. The three ways out are distinct
 * decisions and the lobby must not blur them: 'off' is the host's, 'hard-only'
 * is the difficulty's (and lifts by forcing the group on), and 'short-table'
 * is arithmetic no setting can overrule — only more players can.
 */
export type ModeStatus = 'playing' | 'off' | 'hard-only' | 'short-table'

export type CategoryMode = {
  kind: RoundChallengeKind
  title: string
  status: ModeStatus
  /** Seats the mode needs — present only when that is what benched it. */
  minimumTable?: number
}

export type CategoryLineup = {
  modes: CategoryMode[]
  playing: number
  total: number
}

/**
 * What a category deals at this table, mode by mode. The lobby's accordion
 * renders it whole and its collapsed row shows `playing`/`total`; both ends
 * read this one function, so a count can never disagree with the list under it.
 */
export const categoryLineup = (
  group: ChallengeGroupId,
  settings: ChallengeSettings,
  contenders: number
): CategoryLineup => {
  const { enabled, total } = autoEnabledKinds(group, settings.difficulty)
  const override = settings.challengeOverrides?.[group]

  const modes = total.map((kind): CategoryMode => {
    const minimumTable = MINIMUM_TABLE_BY_KIND[kind]
    const title = KIND_LABELS[kind].title
    // The host's own switch answers first: a group they turned off should say
    // so, not blame the table size for a mode they never wanted.
    if (override === false) return { kind, title, status: 'off' }
    if (!isKindFeasible(kind, contenders)) {
      return { kind, title, status: 'short-table', minimumTable }
    }
    if (override === true || enabled.includes(kind)) return { kind, title, status: 'playing' }
    return { kind, title, status: 'hard-only' }
  })

  return {
    modes,
    playing: modes.filter(mode => mode.status === 'playing').length,
    total: total.length,
  }
}

/** The whole deck, for the settings header: how many modes this configuration
 *  can actually deal, out of every mode in the game. Counts the core kinds —
 *  they play whatever the toggles say, and the reader is asking what their
 *  game will draw from, not what they still have left to switch off. */
export const modesInPlay = (
  settings: ChallengeSettings,
  contenders: number
): { playing: number; total: number } => ({
  playing: ROUND_KINDS.filter(
    kind => isKindFeasible(kind, contenders) && isKindEnabled(settings, kind)
  ).length,
  total: ROUND_KINDS.length,
})
