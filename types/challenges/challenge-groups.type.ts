import type { GroupChallengeAccessorId } from './group-challenge.type'
import type { RoundChallengeKind } from './traversal-challenge.type'
import type { GameDifficulty } from '../game.types'

/**
 * The lobby's challenge toggles. Every group is a tri-state: absent from
 * `challengeOverrides` means AUTO (follow the difficulty's gates), `true`
 * force-enables the group below its gate (highlands on an easy game), `false`
 * switches it off anywhere (no conflict content at this table).
 *
 * Ranking and the stat modes are 'core' and never toggleable: ranking is the
 * tutorial opener and the universal dealer fallback, so the game stays
 * playable whatever the toggles say.
 */
export const CHALLENGE_GROUPS = {
  conflicts: { label: 'Conflicts & war' },
  navigation: { label: 'Borders & routes' },
  water: { label: 'Water & terrain' },
  flags: { label: 'Flags & shapes' },
  culture: { label: 'Culture & places' },
  disputed: { label: 'Disputed places' },
  trends: { label: 'Trends & history' },
} as const

export type ChallengeGroupId = keyof typeof CHALLENGE_GROUPS

export type ChallengeOverrides = Partial<Record<ChallengeGroupId, boolean>>

export const isValidChallengeGroupId = (value: unknown): value is ChallengeGroupId =>
  // Object.hasOwn, not `in` — `in` walks the prototype chain, so keys like
  // 'toString' would validate and be stored into game state.
  typeof value === 'string' && Object.hasOwn(CHALLENGE_GROUPS, value)

export const isValidChallengeOverrides = (value: unknown): value is ChallengeOverrides =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.entries(value).every(
    ([key, override]) => isValidChallengeGroupId(key) && typeof override === 'boolean'
  )

/** Every RoundChallengeKind MUST appear here — adding a kind without assigning
 *  it a group is a compile error. */
export const CHALLENGE_GROUP_BY_KIND = {
  ranking: 'core',
  'stat-detective': 'core',
  'two-truths': 'core',
  flashpoint: 'conflicts',
  traversal: 'navigation',
  'border-chain': 'navigation',
  'neighbour-blitz': 'navigation',
  'hot-cold': 'navigation',
  'river-run': 'water',
  'shared-shores': 'water',
  'name-that-water': 'water',
  highlands: 'water',
  sketch: 'flags',
  'flag-palette': 'flags',
  silhouette: 'flags',
  'heritage-hunt': 'culture',
  'mother-tongue': 'culture',
  'capital-guess': 'culture',
  'pin-landmark': 'culture',
  'ghost-state': 'disputed',
  'no-mans-land': 'disputed',
  'trend-race': 'trends',
} as const satisfies Record<RoundChallengeKind, ChallengeGroupId | 'core'>

/** Kinds reserved for hard games unless their group is force-enabled. Lives
 *  with the taxonomy (not the dealer) because the lobby renders it too. */
export const HARD_ONLY_ROUND_KINDS = new Set<RoundChallengeKind>([
  'highlands',
  'name-that-water',
  // Nobody meets Transnistria on their first game.
  'ghost-state',
  'no-mans-land',
  // Naming the country is one thing; placing it to within a few hundred km is
  // a different game entirely.
  'pin-landmark',
  // Conflict content is opt-in below hard — sober by default.
  'flashpoint',
])

/** Accessors pulled from the stat pool (ranking, stat detective, two truths,
 *  higher/lower) with their group. Keys are compile-checked against the real
 *  accessor union, so a renamed accessor fails loudly. */
export const CHALLENGE_GROUP_ACCESSORS = {
  conflicts: ['government.conflictsFought', 'government.yearsAtWar', 'government.recentConflicts'],
} as const satisfies Partial<Record<ChallengeGroupId, readonly GroupChallengeAccessorId[]>>

const groupAccessors: Partial<Record<ChallengeGroupId, readonly GroupChallengeAccessorId[]>> =
  CHALLENGE_GROUP_ACCESSORS

/** Every group-owned accessor. The opening (tutorial) ranking round skips
 *  these — a heavy topic must never be a player's first impression. */
export const GROUPED_ACCESSORS: ReadonlySet<GroupChallengeAccessorId> = new Set(
  Object.values(CHALLENGE_GROUP_ACCESSORS).flat()
)

type ChallengeSettings = {
  difficulty: GameDifficulty
  challengeOverrides?: ChallengeOverrides
}

/** The shared tri-state: explicit override → as set, otherwise the given
 *  AUTO gate. Kinds, accessors, and the trend gates all resolve through it. */
export const isGroupEnabled = (
  game: ChallengeSettings,
  group: ChallengeGroupId,
  autoEnabled = true
): boolean => {
  const override = game.challengeOverrides?.[group]
  if (override !== undefined) return override
  return autoEnabled
}

/** Core → always. Explicit override → as set. Auto → the difficulty gate. */
export const isKindEnabled = (game: ChallengeSettings, kind: RoundChallengeKind): boolean => {
  const group = CHALLENGE_GROUP_BY_KIND[kind]
  if (group === 'core') return true
  return isGroupEnabled(
    game,
    group,
    game.difficulty === 'hard' || !HARD_ONLY_ROUND_KINDS.has(kind)
  )
}

/** Grouped accessors ride their group's state. In auto they follow the
 *  group's strictest gate — conflict stats are hard-only, like flashpoint. */
export const isAccessorEnabled = (
  game: ChallengeSettings,
  accessor: GroupChallengeAccessorId
): boolean => {
  const owner = (Object.keys(groupAccessors) as ChallengeGroupId[]).find(group =>
    groupAccessors[group]?.includes(accessor)
  )
  if (!owner) return true
  return isGroupEnabled(game, owner, game.difficulty === 'hard')
}

/** The lobby caption for a group's AUTO state at a given difficulty. */
export const autoEnabledKinds = (
  group: ChallengeGroupId,
  difficulty: GameDifficulty
): { enabled: RoundChallengeKind[]; total: RoundChallengeKind[] } => {
  const total = (
    Object.entries(CHALLENGE_GROUP_BY_KIND) as [RoundChallengeKind, ChallengeGroupId | 'core'][]
  )
    .filter(([, owner]) => owner === group)
    .map(([kind]) => kind)
  const enabled = total.filter(
    kind => difficulty === 'hard' || !HARD_ONLY_ROUND_KINDS.has(kind)
  )
  return { enabled, total }
}
