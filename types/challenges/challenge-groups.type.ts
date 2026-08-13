import type { GroupChallengeAccessorId } from './group-challenge.type'
import type { RoundChallengeKind } from './traversal-challenge.type'
import type { GameDifficulty } from '../game.types'

/**
 * The lobby's challenge toggles. Every group is a tri-state: absent from
 * `challengeOverrides` means AUTO (follow the difficulty's gates), `true`
 * force-enables the group below its gate (highlands on an easy game), `false`
 * switches it off anywhere (no conflict content at this table).
 *
 * Ranking and two truths are 'core' and never toggleable: ranking is the
 * tutorial opener and the universal dealer fallback, so the game stays
 * playable whatever the toggles say.
 *
 * `statGate: 'hard-only'` marks a heavy group: its accessors deal only on
 * hard in AUTO, and the tutorial opener never picks them. Groups without it
 * deal their accessors on every difficulty.
 *
 * `hidden` groups own accessors but no lobby row yet — the gates work, the
 * toggle ships later by deleting the flag.
 */
export type ChallengeGroup = {
  label: string
  hidden?: boolean
  statGate?: 'hard-only'
}

export const CHALLENGE_GROUPS = {
  conflicts: { label: 'Conflicts & war', statGate: 'hard-only' },
  navigation: { label: 'Borders & routes' },
  water: { label: 'Water & terrain' },
  flags: { label: 'Flags & shapes' },
  culture: { label: 'Culture & places' },
  disputed: { label: 'Disputed places' },
  // Parties, parliaments and who governs. Visible on purpose: politics is the
  // one topic a table may want switched off outright, which a hidden group
  // could never offer. It owns no stat accessors — its rounds deal from the
  // party roster and the chambers, not the ranking pool.
  politics: { label: 'Politics & power' },
  trends: { label: 'Trends & history' },
  empires: { label: 'Empires & colonies' },
  economy: { label: 'Economy & work', hidden: true },
  society: { label: 'People & society', hidden: true },
  health: { label: 'Health & lifestyle', hidden: true },
  nature: { label: 'Nature & environment', hidden: true },
} as const satisfies Record<string, ChallengeGroup>

export type ChallengeGroupId = keyof typeof CHALLENGE_GROUPS

/** Widened view for property reads — the const's entries have narrowed shapes. */
const GROUPS: Record<ChallengeGroupId, ChallengeGroup> = CHALLENGE_GROUPS

export type ChallengeOverrides = Partial<Record<ChallengeGroupId, boolean>>

const isValidChallengeGroupId = (value: unknown): value is ChallengeGroupId =>
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
  'two-truths': 'core',
  flashpoint: 'conflicts',
  traversal: 'navigation',
  'border-chain': 'navigation',
  atlas: 'culture',
  'neighbour-blitz': 'navigation',
  'hot-cold': 'navigation',
  manhunt: 'navigation',
  'river-run': 'water',
  'shared-shores': 'water',
  // Deals on every difficulty — the pool scales in-dealer (famous seas on
  // easy, major lakes join on normal, the whole atlas on hard). Highlands
  // scales the same way: famous ranges and deserts first (HIGHLANDS_TIERS).
  'name-that-water': 'water',
  highlands: 'water',
  sketch: 'flags',
  'flag-palette': 'flags',
  silhouette: 'flags',
  'heritage-hunt': 'culture',
  'mother-tongue': 'culture',
  // The audio pair: an anthem, and a language spoken aloud.
  'anthem-buzz': 'culture',
  'tongue-buzz': 'culture',
  // Countries, capitals, rivers and megacities in one board — places at large.
  'unique-or-bust': 'culture',
  // Clubs, currency zones, treaty rosters and regions — who belongs to what.
  // The accurate homes ('economy', 'society') are hidden groups, so a kind
  // filed there could never be switched off; culture is the visible home.
  'clean-sweep': 'culture',
  'capital-guess': 'culture',
  // Capital-guess's mirror: the same cities, read off the map instead of a
  // photo, so it shares the toggle a table that wants city content flips.
  'star-chart': 'culture',
  // The chamber round: who governs, how large they are, and who is with them.
  government: 'politics',
  // 'society' would read closer, but its group is hidden — hidden groups
  // classify stat accessors and can't be toggled, so a round kind filed there
  // could never be switched off. Culture is the visible home for the people.
  composition: 'culture',
  // Deals on every difficulty — icon landmarks and wider scoring bands below
  // hard (PIN_LANDMARK_TIERS).
  'pin-landmark': 'culture',
  'ghost-state': 'disputed',
  'no-mans-land': 'disputed',
  'trend-race': 'trends',
  timeline: 'trends',
  // Draws clues from every stat topic, so no single accessor group owns it
  // (and those groups are hidden — a kind filed there could never be toggled
  // off). Trends is the visible home for the data-pool rounds.
  'stat-detective': 'trends',
  // Its own toggle, not under conflicts: imperial content is its own consent
  // axis, and the mode deals on every difficulty (deep cuts gate in-dealer).
  empire: 'empires',
  // Where a country sits, asked backwards. Its siblings under this toggle are
  // the other pure map-position modes (traversal, the chains, hot & cold) —
  // nothing about it is cultural, and its subject is the country itself
  // rather than an outline held up out of context the way silhouette's is.
  'terra-incognita': 'navigation',
} as const satisfies Record<RoundChallengeKind, ChallengeGroupId | 'core'>

/**
 * How a round's answer list reads, for the scorecard's reveal. A 'set' has no
 * meaningful order, so the reveal sorts both the player's answers and the
 * truth by name — that shared order is what makes the two directly
 * comparable — and pipes wrong names to the tail. A 'sequence' IS its order
 * (a route, a probe trail, a chronology): the reveal marks it in place and
 * never reorders, because piping a stray out of a route destroys the route.
 *
 * Single-answer kinds are 'set': the sort is a no-op on one country, and the
 * marking is the whole point. Every RoundChallengeKind MUST appear here.
 */
export const ANSWER_SHAPE_BY_KIND = {
  // Collect-a-set: name everything that qualifies, in any order.
  'neighbour-blitz': 'set',
  'river-run': 'set',
  'shared-shores': 'set',
  highlands: 'set',
  'mother-tongue': 'set',
  'no-mans-land': 'set',
  // The night's stars, in any order — the answers are cities, but each one
  // scores as the country it belongs to, so the ledger shape is a plain set.
  'star-chart': 'set',
  // Three beats, each with its own answer; the ledger reads them as a set.
  government: 'set',
  // The countries the atlas swallowed, in any order. The DEAL order carries
  // the lesson, so the scorecard replaces the generic ledger with its own
  // chronological reveal — but the answer itself is a plain set.
  'terra-incognita': 'set',
  empire: 'set',
  // A contested set: the seat's claims against the whole board. The ledger
  // marks a rival's claim as taken rather than missed (AnswerLedger's
  // `claimedBy`), so the rows stay honest about what was never available.
  'clean-sweep': 'set',
  // One buzz against a set of acceptable answers.
  'tongue-buzz': 'set',
  'name-that-water': 'set',
  // Single answer — sorting is a no-op, marking is not.
  silhouette: 'set',
  'anthem-buzz': 'set',
  'capital-guess': 'set',
  flashpoint: 'set',
  'flag-palette': 'set',
  'stat-detective': 'set',
  'two-truths': 'set',
  'ghost-state': 'set',
  composition: 'set',
  'trend-race': 'set',
  // The order is the answer.
  traversal: 'sequence',
  'hot-cold': 'sequence',
  timeline: 'sequence',
  'border-chain': 'sequence',
  atlas: 'sequence',
  // Never reach the answer rows: ranking has its own ledger (RankingReveal),
  // sketch its overlay, and these four bank empty lists.
  ranking: 'sequence',
  sketch: 'sequence',
  'pin-landmark': 'sequence',
  'heritage-hunt': 'sequence',
  'unique-or-bust': 'sequence',
  manhunt: 'sequence',
} as const satisfies Record<RoundChallengeKind, 'set' | 'sequence'>

/**
 * Kinds whose scorer literally subtracts a point per wrong name — the blitz
 * family, via `blitzScore`'s `- wrong`. Only these may show the cost in the
 * scorecard's tally: no-man's-land and empire score by set overlap
 * (`jaccardFraction`) and tongue-buzz by membership, so a "−2" would be a lie.
 */
export const WRONG_COSTS_A_POINT = new Set<RoundChallengeKind>([
  'neighbour-blitz',
  'river-run',
  'shared-shores',
  'highlands',
  'mother-tongue',
  'star-chart',
])

/** Kinds reserved for hard games unless their group is force-enabled. Lives
 *  with the taxonomy (not the dealer) because the lobby renders it too. */
export const HARD_ONLY_ROUND_KINDS = new Set<RoundChallengeKind>([
  // Nobody meets Transnistria on their first game.
  'ghost-state',
  'no-mans-land',
  // Conflict content is opt-in below hard — sober by default.
  'flashpoint',
])

/**
 * Kinds that only deal at tables of at least this many contenders. Lives with
 * the taxonomy (like HARD_ONLY_ROUND_KINDS) because it's a property of the
 * mode, not of any one dealer: manhunt's rivalry collapses below four, and
 * unique-or-bust's duplicate-cancel scoring loses its teeth below three.
 */
export const MINIMUM_TABLE_BY_KIND: Partial<Record<RoundChallengeKind, number>> = {
  manhunt: 4,
  'unique-or-bust': 3,
  // Solo, an exclusive claim is exclusive against nobody and the round
  // degenerates into a plain blitz — which the roster already has six of.
  'clean-sweep': 2,
}

/** Accessors pulled from the stat pool (ranking, stat detective, two truths,
 *  higher/lower) with their group. Keys are compile-checked against the real
 *  accessor union, so a renamed accessor fails loudly. Every accessor is
 *  sorted here; a new accessor without a topic is a compile error via
 *  `SORTED_ACCESSOR` below. */
export const CHALLENGE_GROUP_ACCESSORS = {
  conflicts: [
    'government.conflictsFought',
    'government.yearsAtWar',
    'government.recentConflicts',
    'government.amountOfMilitaryConflicts',
  ],
  economy: [
    'economics.gdpPerCapita',
    'economics.gdpTotal',
    'economics.gdpGrowth',
    'economics.inflation',
    'economics.publicDebt',
    'economics.militarySpending',
    'economics.populationBelowPovertyLine',
    'economics.equality',
    'unemployment.youth',
    'unemployment.total',
    'infrastructure.rail',
    'infrastructure.internetAccess',
    'infrastructure.mobileSubscriptions',
    'infrastructure.airports',
    'economics.touristArrivals',
    'economics.workingHours',
  ],
  society: [
    'people.population',
    'people.populationGrowthRate',
    'people.medianAge',
    'people.lifeExpectancy',
    'people.childrenPerWoman',
    'people.birthRate',
    'people.netMigration',
    'people.urbanization',
    'people.deathRate',
    'people.density',
    'people.share65Plus',
    'people.sexRatio',
    'gender.womenInParliament',
    'gender.motherMeanAgeAtBirth',
    'religion.atheism',
    'religion.believers',
    'humanRights.gayMarriageLegalized',
    'humanRights.refugees',
    'education.literacy',
    'education.averageYearsOfStudy',
    'government.democracyIndex',
    'government.corruptionIndex',
    'government.humanDevelopmentIndex',
    'government.happiness',
  ],
  health: [
    'health.obesity',
    'health.doctors',
    'health.hospitalBeds',
    'health.accessToContraceptives',
    'health.tobaccoUse',
    'health.alcoholConsumption',
    'health.meatConsumption',
    'health.maleHeight',
    'health.roadDeaths',
  ],
  nature: [
    'geography.area.land',
    'geography.area.water',
    'geography.area.total',
    'geography.area.arable',
    'geography.area.forested',
    'geography.highestPeak',
    'environment.CO2Emissions',
    'environment.methaneEmissions',
    'environment.renewables',
    'environment.airPollution',
    'environment.redListIndex',
    'environment.threatenedMammals',
    'environment.protectedLand',
    'environment.freshwaterPerCapita',
    'environment.evSalesShare',
    'energy.electricityAccess',
    'energy.fossilFuels',
    'energy.consumptionPerCapita',
  ],
} as const satisfies Partial<Record<ChallengeGroupId, readonly GroupChallengeAccessorId[]>>

const groupAccessors: Partial<Record<ChallengeGroupId, readonly GroupChallengeAccessorId[]>> =
  CHALLENGE_GROUP_ACCESSORS

/** Compile guard: an accessor missing from the sort above turns this alias
 *  into a narrower union than GroupChallengeAccessorId and the assignment
 *  below fails. */
type SortedAccessor =
  (typeof CHALLENGE_GROUP_ACCESSORS)[keyof typeof CHALLENGE_GROUP_ACCESSORS][number]
const _everyAccessorIsSorted: SortedAccessor extends GroupChallengeAccessorId
  ? GroupChallengeAccessorId extends SortedAccessor
    ? true
    : never
  : never = true
void _everyAccessorIsSorted

/** Accessors of heavy (`statGate: 'hard-only'`) groups. The opening
 *  (tutorial) ranking round skips these — a heavy topic must never be a
 *  player's first impression. */
export const HEAVY_ACCESSORS: ReadonlySet<GroupChallengeAccessorId> = new Set(
  (Object.keys(groupAccessors) as ChallengeGroupId[])
    .filter(group => GROUPS[group].statGate === 'hard-only')
    .flatMap(group => [...(groupAccessors[group] ?? [])])
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
  return isGroupEnabled(game, group, game.difficulty === 'hard' || !HARD_ONLY_ROUND_KINDS.has(kind))
}

/** Grouped accessors ride their group's state. In auto, heavy groups
 *  (`statGate: 'hard-only'`) deal only on hard — conflict stats, like
 *  flashpoint — while every other group's stats deal on all difficulties. */
export const isAccessorEnabled = (
  game: ChallengeSettings,
  accessor: GroupChallengeAccessorId
): boolean => {
  const owner = (Object.keys(groupAccessors) as ChallengeGroupId[]).find(group =>
    groupAccessors[group]?.includes(accessor)
  )
  if (!owner) return true
  const autoEnabled = GROUPS[owner].statGate !== 'hard-only' || game.difficulty === 'hard'
  return isGroupEnabled(game, owner, autoEnabled)
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
  const enabled = total.filter(kind => difficulty === 'hard' || !HARD_ONLY_ROUND_KINDS.has(kind))
  return { enabled, total }
}
