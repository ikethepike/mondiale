import {
  CHALLENGE_GROUP_BY_KIND,
  isKindEnabled,
  MINIMUM_TABLE_BY_KIND,
  type ChallengeGroupId,
  type ChallengeOverrides,
} from '~~/types/challenges/challenge-groups.type'
import {
  roundChallengeKind,
  type RoundChallenge,
  type RoundChallengeKind,
} from '~~/types/challenges/traversal-challenge.type'
import type { GameDifficulty } from '~~/types/game.types'
import { weightedPick } from './arrays'
import { clamp01 } from './number'

/**
 * Relative weights for the round mix (after the tutorial-friendly round 1).
 * These are the NOMINAL weights — `mixWeights` decays them against the rounds
 * already dealt, and decay can only ever push a weight DOWN, so the rarity
 * ordering below is preserved whatever the history.
 */
export const ROUND_WEIGHTS = {
  ranking: 0.2,
  traversal: 0.13,
  'border-chain': 0.09,
  atlas: 0.07,
  'heritage-hunt': 0.07,
  'neighbour-blitz': 0.1,
  silhouette: 0.09,
  // The only rounds that need sound: still shy of the visual staples so a
  // muted room or a bad connection never faces a run of them, but no longer
  // rare — they earned their slot.
  'anthem-buzz': 0.08,
  'tongue-buzz': 0.06,
  'hot-cold': 0.06,
  sketch: 0.07,
  'stat-detective': 0.06,
  'two-truths': 0.07,
  'river-run': 0.06,
  'shared-shores': 0.05,
  'name-that-water': 0.04,
  highlands: 0.08,
  'mother-tongue': 0.09,
  'flag-palette': 0.08,
  'capital-guess': 0.08,
  // Shy of its mirror on purpose: the dark map asks more of a player than a
  // skyline photo does, and two city rounds in a game is plenty.
  'star-chart': 0.06,
  composition: 0.06,
  // Rare on purpose. The cast is tiny — eight ghost states, and only six of
  // them obscure — so dealing these at a staple's rate burns through the whole
  // roster in a session or two. They should land like finding something odd on
  // the map, not like a rotation slot. At these weights a hard game sees one
  // roughly one time in five, and two almost never.
  'ghost-state': 0.018,
  'no-mans-land': 0.012,
  // Rare for a different reason: it's the game's heaviest subject, and it
  // must never read as a defining mode. A hard game sees one about one time
  // in eight — an occasional, sobering find.
  flashpoint: 0.02,
  'pin-landmark': 0.06,
  'trend-race': 0.08,
  timeline: 0.08,
  // A set-piece, dealt sparingly: two beats make it the longest single-player
  // round in the game, and each empire is one-shot learnable — a roster of a
  // few dozen at a staple's rate would repeat inside a fortnight of games.
  // At 0.05 a full game usually sees one, rarely two.
  empire: 0.05,
  // Another set-piece — a full pursuit spans up to eight two-beat turns —
  // and it needs four players to deal at all, so it self-rarifies further
  // at small tables.
  manhunt: 0.05,
  // Needs three players before duplicate-cancel scoring has teeth, so it
  // self-rarifies at duos the same way manhunt does.
  'unique-or-bust': 0.07,
} as const satisfies Record<RoundChallengeKind, number>

/**
 * How a round is PLAYED, independent of what it is about. Two rounds can sit
 * in different groups and still feel same-y back to back (three collect-a-sets
 * running), so the mix decays this axis too. Not a player-facing taxonomy —
 * the lobby renders groups, never mechanics — so it lives here rather than in
 * challenge-groups.type.
 */
export type RoundMechanic =
  'typed' | 'pin' | 'choice' | 'buzz' | 'collect' | 'turns' | 'draw' | 'order'

export const MECHANIC_BY_KIND = {
  // Type a name against live suggestions.
  traversal: 'typed',
  'border-chain': 'typed',
  atlas: 'typed',
  'neighbour-blitz': 'typed',
  silhouette: 'typed',
  'mother-tongue': 'typed',
  'capital-guess': 'typed',
  'star-chart': 'typed',
  composition: 'typed',
  'name-that-water': 'typed',
  'unique-or-bust': 'typed',
  // Tap the map until the set is complete.
  'heritage-hunt': 'pin',
  'river-run': 'collect',
  'shared-shores': 'collect',
  highlands: 'collect',
  // Drop a pin and live with the distance.
  'pin-landmark': 'pin',
  flashpoint: 'pin',
  'ghost-state': 'pin',
  'no-mans-land': 'collect',
  // Pick from a small table of options.
  'stat-detective': 'choice',
  'two-truths': 'choice',
  'flag-palette': 'choice',
  'trend-race': 'choice',
  // Beat the room to the answer while it plays out.
  'anthem-buzz': 'buzz',
  'tongue-buzz': 'buzz',
  empire: 'buzz',
  // Seat by seat, around the table.
  'hot-cold': 'turns',
  manhunt: 'turns',
  // Drag things into the right order.
  ranking: 'order',
  timeline: 'order',
  sketch: 'draw',
} as const satisfies Record<RoundChallengeKind, RoundMechanic>

/**
 * The mix's taste knobs. Decay is a MULTIPLIER on the nominal weight, never a
 * cooldown or a deck: a multiplier can only push a weight down (so deliberate
 * rarities are never promoted into staples) and can never empty the pool (so a
 * small table with most groups toggled off still deals).
 */
export const MIX_TUNING = {
  /** How far back the mix looks — a full board's worth of rounds. Coverage is
   *  what a short window costs: at 6 a twelve-round game forgets its own first
   *  half and re-deals into it (median 10 distinct kinds of 12 rounds; at 12,
   *  median 12). */
  window: 12,
  /** Bite: how much weight a round strips from its own kind. Near-total, and
   *  it fades slowly — across one board a kind already played is a last
   *  resort, not a coin flip. The floor keeps it a preference, never a ban. */
  kindBite: 0.99,
  kindHalfLife: 20,
  /** Gentler and much shorter-lived: three water rounds in six is the
   *  complaint, two is fine, and a theme should come back around. */
  groupBite: 0.6,
  groupHalfLife: 1.5,
  /** Weakest of the three — eight mechanics over 28 kinds means a hard bite
   *  would starve whole mechanics at a small table. */
  mechanicBite: 0.4,
  mechanicHalfLife: 1,
  /** No kind ever falls below this share of its nominal weight. A safety
   *  property, not a taste knob: it keeps the pool non-empty and stops a thin
   *  table (most groups toggled off) degenerating into strict alternation.
   *  Lower it and a long game starves; this is what makes the near-total
   *  kindBite above safe. */
  floor: 0.01,
} as const

/** The runtime kind list. Derived from the taxonomy that already compile-checks
 *  exhaustiveness — never a third hand-maintained list. */
export const ROUND_KINDS = Object.keys(CHALLENGE_GROUP_BY_KIND) as RoundChallengeKind[]

/** Cheap, synchronous "could this kind possibly deal at this table". Covers
 *  only what the picker can know without touching a dataset; data-availability
 *  misses are the deal loop's re-roll to handle. */
export const isKindFeasible = (kind: RoundChallengeKind, contenders: number): boolean =>
  contenders >= (MINIMUM_TABLE_BY_KIND[kind] ?? 0)

type MixGame = {
  difficulty: GameDifficulty
  challengeOverrides?: ChallengeOverrides
  rounds: { groupChallenge?: RoundChallenge }[]
}

export type MixArgs = {
  game: MixGame
  contenders: number
  /** Kinds already tried and found empty this staging — excluded outright so a
   *  re-roll never burns an attempt on the same kind twice. */
  exclude?: readonly RoundChallengeKind[]
}

/**
 * The kinds of the last `window` rounds, nearest first — index 0 is the round
 * just played. Reads through `roundChallengeKind`, the one mapping from a
 * persisted challenge to its kind.
 */
export const recentKinds = (game: MixGame, window: number): RoundChallengeKind[] =>
  game.rounds
    .slice(-window)
    .reverse()
    .map(round => roundChallengeKind(round.groupChallenge))

/** 1.0 for the round just played, halving every `halfLife` rounds back. */
const penalty = (halfLife: number, distance: number): number => 2 ** (-(distance - 1) / halfLife)

/**
 * How hard a recent history bites, on one axis. `max` over matching rounds
 * rather than a sum: summing would make a kind seen three times long ago look
 * worse than one seen last round, which inverts the intent. What sameness
 * actually means is "how recently did this axis last fire".
 */
const axisPenalty = (
  history: readonly RoundChallengeKind[],
  halfLife: number,
  matches: (kind: RoundChallengeKind) => boolean
): number => {
  let worst = 0
  history.forEach((kind, index) => {
    if (matches(kind)) worst = Math.max(worst, penalty(halfLife, index + 1))
  })
  return worst
}

const groupOf = (kind: RoundChallengeKind): ChallengeGroupId | 'core' =>
  CHALLENGE_GROUP_BY_KIND[kind]

/**
 * The nominal weights, decayed against what the table has already played and
 * filtered to what it can actually deal. Guaranteed: every returned weight is
 * <= its nominal weight, and the list is never empty while any kind is
 * enabled and feasible.
 */
export const mixWeights = ({
  game,
  contenders,
  exclude = [],
}: MixArgs): [RoundChallengeKind, number][] => {
  const history = recentKinds(game, MIX_TUNING.window)
  const excluded = new Set(exclude)

  return ROUND_KINDS.filter(
    kind => !excluded.has(kind) && isKindEnabled(game, kind) && isKindFeasible(kind, contenders)
  ).map(kind => {
    const kindHit = axisPenalty(history, MIX_TUNING.kindHalfLife, seen => seen === kind)
    const groupHit = axisPenalty(
      history,
      MIX_TUNING.groupHalfLife,
      seen => groupOf(seen) === groupOf(kind)
    )
    const mechanicHit = axisPenalty(
      history,
      MIX_TUNING.mechanicHalfLife,
      seen => MECHANIC_BY_KIND[seen] === MECHANIC_BY_KIND[kind]
    )

    const multiplier =
      clamp01(1 - MIX_TUNING.kindBite * kindHit) *
      clamp01(1 - MIX_TUNING.groupBite * groupHit) *
      clamp01(1 - MIX_TUNING.mechanicBite * mechanicHit)

    return [kind, ROUND_WEIGHTS[kind] * Math.max(multiplier, MIX_TUNING.floor)]
  })
}

/**
 * The round mix's one decision. Undefined when nothing is left to deal — the
 * caller owns the ranking floor, so the fallback lives in exactly one place.
 * Pass a seeded `random` for reproducible picks.
 */
export const pickRoundKind = (
  args: MixArgs,
  random: () => number = Math.random
): RoundChallengeKind | undefined => weightedPick(mixWeights(args), random)
