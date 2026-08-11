import { BORDERS } from '~~/data/borders.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { MAP_BOUNDS, MAP_REGIONS } from '~~/data/map.gen'
import { weightedPick } from '~~/lib/arrays'
import { playableCountries } from '~~/lib/game-rules'
import { isLabelableBox, labelBoxFor } from '~~/lib/geo'
import { clamp } from '~~/lib/number'
import type { TerraIncognitaChallenge } from '~~/types/challenges/group-modes.type'
import type { GameDifficulty, GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Terra Incognita's rules: which countries the failing atlas may swallow, how
 * fast it swallows them, and how much of the world may be missing at once
 * before it collapses.
 *
 * The mode asks the one question no other round asks — what *isn't* there —
 * so every rule here serves absence being perceivable and fair. The dealer in
 * lib/challenges.ts is a thin wrapper over `pickVanishDeck`; the view, the
 * server's grading and the scorecard all read the schedule back through
 * `terraVanishedBy` / `terraAnswers`, so the world the table watches fall
 * apart and the world the server scores are the same world.
 */

/** Countries the atlas loses over a round, where the board can seat them. */
export const TERRA_VANISH_COUNT: { [difficulty in GameDifficulty]: number } = {
  easy: 6,
  normal: 8,
  hard: 10,
}

/**
 * The fewest losses that still make a round. The no-adjacent-blanks guard is
 * expensive on a small board — the twelve labelable countries of the North
 * America variant form one long land chain, and no more than five of them can
 * vanish without merging — so the deal takes what the board can seat rather
 * than refusing the mode outright. Below four there is no rhythm to fall
 * behind, and the deal gives up so the mix can buy another kind.
 */
export const TERRA_MINIMUM_DECK = 4

/**
 * How long the atlas holds between losses. The mode's real difficulty lever:
 * the deck's obscurity decides whether you *can* name what's gone, the cadence
 * decides whether you can name it in time.
 */
export const TERRA_CADENCE_MS: { [difficulty in GameDifficulty]: number } = {
  easy: 9000,
  normal: 7000,
  hard: 5000,
}

/**
 * How many losses may stand unrestored at once before the world reads as
 * collapsing. Always well below the deck size, so the alarm is a verdict on
 * the player's pace rather than an arithmetic certainty of the deal — and see
 * `TerraIncognitaChallenge.collapseThreshold` for why crossing it costs dread
 * rather than the rest of the round.
 */
export const TERRA_COLLAPSE_THRESHOLD: { [difficulty in GameDifficulty]: number } = {
  easy: 4,
  normal: 4,
  hard: 3,
}

/**
 * The alarm line for a deck of `count`, which is not always the difficulty's
 * nominal size — a thin board deals short (`TERRA_MINIMUM_DECK`), and a
 * threshold of four against a deck of five is an alarm that cannot ring
 * before the round is effectively over. Kept two clear of the deck so the
 * world can always visibly destabilize while there is still time to save it.
 */
export const terraCollapseThreshold = (count: number, difficulty: GameDifficulty): number =>
  clamp(TERRA_COLLAPSE_THRESHOLD[difficulty], 2, Math.max(2, count - 2))

/** The world holds whole for this long at the open — the table needs to read
 *  the map it is about to lose pieces of before the first one goes. */
export const TERRA_OPENING_MS = 3000

/** Room after the last loss to still name it. Without a tail the final
 *  vanishing is dealt into a clock that is already out, which is a question
 *  nobody can answer and a point nobody can reach. */
export const TERRA_TAIL_MS = 6000

/**
 * The play window, derived from the deck and the cadence rather than fixed —
 * the Mother Tongue rule, so retuning either carries its own clock with it.
 */
export const terraSeconds = (count: number, cadenceMs: number): number =>
  Math.round((TERRA_OPENING_MS + count * cadenceMs + TERRA_TAIL_MS) / 1000)

/** When the `index`-th country goes, in ms from the round's start. */
export const terraVanishAt = (index: number, cadenceMs: number): number =>
  TERRA_OPENING_MS + index * cadenceMs

/**
 * How much of the deck has gone by `elapsedMs`. The ONE derivation of the
 * failing atlas's state: the view paints from it, the collapse gauge counts
 * from it, and the reveal replays from it, so no two surfaces can disagree
 * about whether a country had vanished yet.
 */
export const terraVanishedCount = (
  challenge: Pick<TerraIncognitaChallenge, 'vanishings' | 'cadenceMs'>,
  elapsedMs: number
): number =>
  clamp(
    Math.floor((elapsedMs - TERRA_OPENING_MS) / challenge.cadenceMs) + 1,
    0,
    challenge.vanishings.length
  )

/** The countries gone by `elapsedMs`, in the order the atlas lost them. */
export const terraVanishedBy = (
  challenge: Pick<TerraIncognitaChallenge, 'vanishings' | 'cadenceMs'>,
  elapsedMs: number
): ISOCountryCode[] => challenge.vanishings.slice(0, terraVanishedCount(challenge, elapsedMs))

/**
 * What the round grades — the whole deck, because the schedule is sized so
 * every dealt country actually goes (see `terraSeconds`). Both ends score
 * against this rather than the raw field, the Star Chart rule: an answer set
 * the clock never exposes is a pot the table cannot reach.
 */
export const terraAnswers = (challenge: TerraIncognitaChallenge): ISOCountryCode[] =>
  challenge.vanishings

// --- The deck ------------------------------------------------------------------

/**
 * How deep into the field a difficulty may reach, as `[from, to]` shares of it
 * — the field runs most prominent first, so a higher share is a deeper cut.
 *
 * This is the GATE. Inside it the deal still leans toward the overlooked end
 * (`TERRA_OVERLOOKED_LEAN`), the same shape the fame rule takes elsewhere: a
 * mode may lean within what its difficulty allows, never re-decide it. Easy
 * stays inside the household names — an easy table that cannot name a single
 * missing country learns nothing from watching the world end — and hard gives
 * up the very top, because its first loss should already be a thinker.
 */
export const TERRA_REACH: { [difficulty in GameDifficulty]: readonly [number, number] } = {
  easy: [0, 0.45],
  normal: [0, 0.8],
  hard: [0.15, 1],
}

/**
 * How hard the deal leans toward the overlooked end of its window, as the
 * weight multiple the last candidate carries over the first. At 1 the pick is
 * flat and the mode drills nothing in particular; the lean is what points it
 * at the blind spots players actually have.
 */
export const TERRA_OVERLOOKED_LEAN = 6

/**
 * Never slice a window thinner than this — a continental variant's field is
 * small, and a 45% window of 20 countries is nine candidates for a six-country
 * deck once the adjacency guard starts refusing them.
 */
const MINIMUM_WINDOW = 12

/**
 * Every country this game could take off the map, most prominent first.
 *
 * Prominence is population, the same posture the Star Chart takes with city
 * population: the best proxy the data carries for "would a player think of
 * this one unprompted". It is a proxy and not a truth — it reads Iceland as
 * obscure and Bangladesh as famous — but it captures both halves of the blind
 * spot the mode is aimed at, the small states AND the thinly-peopled giants
 * (Mongolia, Kazakhstan, Namibia) that a size-based measure would call
 * prominent.
 *
 * Two gates, both about whether an absence can be perceived at all:
 *
 * `isLabelableBox` — a country whose map box cannot carry its own name is one
 * nobody can miss at world zoom, and dealing it would be asking the table to
 * notice a few pixels of cream. The same gate the map's label builder and the
 * errata dealer draw from.
 *
 * A land neighbour — an erased country is painted out in the colour of the
 * land around it, which is how the borders its NEIGHBOURS drew disappear too.
 * An island has no neighbour to melt into: the sea keeps drawing its whole
 * outline, so Iceland or Sri Lanka would "vanish" while still sitting there in
 * plain sight. They are not hard questions, they are broken ones.
 */
export const terraField = (rules: GameRules): ISOCountryCode[] =>
  playableCountries(rules)
    .filter(isoCode => !!BORDERS[isoCode]?.length)
    .filter(isoCode => isLabelableBox(labelBoxFor(MAP_BOUNDS[isoCode], MAP_REGIONS[isoCode])))
    .sort(
      (a, b) =>
        (COUNTRIES[b]?.people?.population?.amount ?? 0) -
        (COUNTRIES[a]?.people?.population?.amount ?? 0)
    )

/** A difficulty's slice of the field, widened where the board is too thin to
 *  honour the fraction. */
const reachCandidates = (field: ISOCountryCode[], [from, to]: readonly [number, number]) => {
  const start = Math.floor(field.length * from)
  const end = Math.max(start + MINIMUM_WINDOW, Math.ceil(field.length * to))
  return field.slice(start, end)
}

/** Candidate weights: flat at the prominent end of the window, `LEAN` times
 *  heavier at the overlooked end, interpolated across it. */
const leanedWeights = (candidates: ISOCountryCode[]): [ISOCountryCode, number][] =>
  candidates.map((isoCode, index) => [
    isoCode,
    1 + (TERRA_OVERLOOKED_LEAN - 1) * (candidates.length > 1 ? index / (candidates.length - 1) : 0),
  ])

/** How many times a deal re-rolls before settling for its best attempt. The
 *  pick is weighted-random, so on a thin board an unlucky early choice can
 *  strand the deck below what the board could actually seat. */
const DEAL_ATTEMPTS = 6

/** One greedy pass: keep taking weighted picks, dropping each pick and
 *  everything it borders, until the target is met or the pool is exhausted. */
const dealOnce = (
  candidates: ISOCountryCode[],
  target: number,
  random: () => number
): ISOCountryCode[] => {
  const picked: ISOCountryCode[] = []
  let pool = candidates

  while (picked.length < target && pool.length) {
    const next = weightedPick(leanedWeights(pool), random)
    if (!next) break
    picked.push(next)
    // Drop the pick AND everything it borders: the survivors are exactly the
    // countries that can still vanish without merging into a neighbour's hole.
    const neighbours = new Set<string>(BORDERS[next] ?? [])
    pool = pool.filter(isoCode => isoCode !== next && !neighbours.has(isoCode))
  }

  return picked
}

/**
 * Deal the countries the atlas loses, in the order it loses them.
 *
 * No two share a land border. Two adjacent blanks read as ONE larger blank —
 * the neighbour wash they melt into is each other's — so an adjacent pair asks
 * the table to perceive an absence the map does not actually show. That guard,
 * not the pool size, is what limits a thin board: the twelve countries of the
 * North America variant are one long land chain, and five is all it can seat
 * however many candidates the reach allows.
 *
 * So the deal takes the difficulty's count where the board allows it and the
 * best it can manage where it does not, down to `TERRA_MINIMUM_DECK`. Below
 * that it returns undefined and the round mix buys another kind rather than
 * dealing a world with nothing to fall behind.
 *
 * `random` is injectable so the guards are testable; production deals with
 * `Math.random` through `weightedPick`.
 */
export const pickVanishDeck = (
  rules: GameRules,
  random: () => number = Math.random
): ISOCountryCode[] | undefined => {
  const target = TERRA_VANISH_COUNT[rules.difficulty]
  const candidates = reachCandidates(terraField(rules), TERRA_REACH[rules.difficulty])

  let best: ISOCountryCode[] = []
  for (let attempt = 0; attempt < DEAL_ATTEMPTS; attempt++) {
    const deck = dealOnce(candidates, target, random)
    if (deck.length === target) return deck
    if (deck.length > best.length) best = deck
  }

  return best.length >= TERRA_MINIMUM_DECK ? best : undefined
}
