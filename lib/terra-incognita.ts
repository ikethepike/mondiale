import { BORDERS } from '~~/data/borders.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { MAP_BOUNDS, MAP_REGIONS } from '~~/data/map.gen'
import { weightedPick } from '~~/lib/arrays'
import { playableCountries } from '~~/lib/game-rules'
import { countryLatLng, haversineKm, isLabelableBox, labelBoxFor } from '~~/lib/geo'
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

/**
 * The theatre: how far from the round's centre a loss may sit.
 *
 * The mode is played CROPPED. At world framing a country is a few dozen pixels
 * of cream and noticing its absence is not a question of geography but of
 * eyesight — Turkmenistan disappearing off a whole-planet view is invisible
 * even to someone who knows exactly where it is. So the round takes one
 * neighbourhood of the atlas and fails it, and the camera holds that region for
 * the whole round (`terraTheatre` → `map.focus`).
 *
 * ~1800km is a region a player can hold in their head at once — the Balkans
 * into central Europe, Central Asia, the Horn — and lands the camera at roughly
 * the crop Neighbour Blitz frames a single country at.
 *
 * The number is bounded from BOTH sides, which is why it is not simply as tight
 * as possible. Tighter crops the map harder but starves the deal: inside a small
 * circle nearly every candidate borders another, and the no-adjacent-blanks
 * guard leaves almost no neighbourhood able to seat a deck (at 1200km only two
 * anchors on the whole easy board can). Wider seats decks easily but stops being
 * a crop — the camera pads and berths the region up by about 1.9x, so a theatre
 * much past this one asks for a view bigger than the world and gets clamped
 * straight back to the whole-planet shot the crop exists to escape.
 */
export const TERRA_THEATRE_KM = 1800

/**
 * Countries the atlas loses over a round, where the neighbourhood can seat them.
 *
 * Much smaller than the mode was first built with (6/8/10), and the crop is
 * why: inside one region almost every eligible country borders another, so the
 * no-adjacent-blanks guard caps a tight theatre near half a dozen. Five losses
 * a player can actually see beats ten they cannot.
 */
export const TERRA_VANISH_COUNT: { [difficulty in GameDifficulty]: number } = {
  easy: 4,
  normal: 5,
  hard: 6,
}

/**
 * The fewest losses that still make a round. Some neighbourhoods cannot seat a
 * full deck at all — the Southern Cone holds Uruguay and almost nothing else
 * that qualifies — so the deal steps the count down rather than refusing the
 * mode outright. Below four there is no rhythm to fall behind, and the deal
 * gives up so the mix can buy another kind.
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

/** Re-rolls a seating gets inside a neighbourhood already proven to hold the
 *  deck, before the deal steps the count down. */
const DEAL_ATTEMPTS = 6

/** Great-circle distance between two countries, or Infinity where either has
 *  no coordinates to place it by. */
const kmApart = (a: ISOCountryCode, b: ISOCountryCode): number => {
  const from = countryLatLng(a)
  const to = countryLatLng(b)
  return from && to ? haversineKm(from, to) : Infinity
}

/**
 * The countries of `pool` sharing `anchor`'s neighbourhood, most prominent
 * first — the anchor included, since it is one of the losses.
 */
const neighbourhoodOf = (anchor: ISOCountryCode, pool: ISOCountryCode[]): ISOCountryCode[] =>
  pool.filter(isoCode => isoCode === anchor || kmApart(anchor, isoCode) <= TERRA_THEATRE_KM)

/**
 * Greedily take non-adjacent countries out of a neighbourhood, in weighted
 * order. `probe` takes the same walk without the randomness, to ask how many a
 * neighbourhood could seat at best.
 */
const seatDeck = (
  neighbourhood: ISOCountryCode[],
  target: number,
  random?: () => number
): ISOCountryCode[] => {
  const picked: ISOCountryCode[] = []
  let pool = neighbourhood

  while (picked.length < target && pool.length) {
    const next = random ? weightedPick(leanedWeights(pool), random) : pool[0]
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
 * Deal the countries the atlas loses, in the order it loses them — all inside
 * one neighbourhood, because the round is played cropped to it.
 *
 * No two share a land border. Two adjacent blanks read as ONE larger blank —
 * the neighbour wash they melt into is each other's — so an adjacent pair asks
 * the table to perceive an absence the map does not actually show. Inside a
 * single region that guard is the binding constraint, and how tightly it binds
 * depends entirely on WHERE: Europe seats a dozen non-adjacent candidates, the
 * Southern Cone barely seats one.
 *
 * So the anchor is chosen for capacity, not hope. Every candidate is asked what
 * its neighbourhood could seat, the ones that cannot fill the deck are dropped,
 * and the anchor is drawn from the rest — still leaning overlooked. A blind
 * re-roll would spend most of its attempts on the empty half of the map.
 *
 * The count steps down toward `TERRA_MINIMUM_DECK` when no neighbourhood
 * anywhere can seat a full deck; below the floor it returns undefined and the
 * mix buys another kind.
 *
 * `random` is injectable so the guards are testable; production deals with
 * `Math.random` through `weightedPick`.
 */
export const pickVanishDeck = (
  rules: GameRules,
  random: () => number = Math.random
): ISOCountryCode[] | undefined => {
  const candidates = reachCandidates(terraField(rules), TERRA_REACH[rules.difficulty])

  for (let target = TERRA_VANISH_COUNT[rules.difficulty]; target >= TERRA_MINIMUM_DECK; target--) {
    const viable = candidates.filter(
      anchor => seatDeck(neighbourhoodOf(anchor, candidates), target).length >= target
    )
    if (!viable.length) continue

    // A viable anchor proves its neighbourhood CAN seat the deck; it does not
    // promise that a weighted walk through it will. An unlucky early pick can
    // knock out most of its own region, so the seating gets its own re-rolls —
    // without them the easy deck, whose count already sits on the floor, had
    // no lower target to fall back to and simply failed to deal.
    for (let attempt = 0; attempt < DEAL_ATTEMPTS; attempt++) {
      const anchor = weightedPick(leanedWeights(viable), random)
      if (!anchor) break
      const deck = seatDeck(neighbourhoodOf(anchor, candidates), target, random)
      if (deck.length >= target) return deck
    }
  }

  return undefined
}

/**
 * The region the camera holds for the whole round — every country sharing the
 * losses' neighbourhood, the losses included.
 *
 * Derived from the deck alone, so both ends and the booth frame the identical
 * shot with nothing extra on the wire. It is deliberately WIDER than the deck's
 * own bounding box: framing just the losses would draw a box whose every edge
 * is a country that is about to disappear, which is a free answer. Centred on
 * the deck's mean position rather than on any one loss for the same reason.
 *
 * `rules` scopes it to the board so a continental variant never frames past its
 * own map.
 */
export const terraTheatre = (
  challenge: Pick<TerraIncognitaChallenge, 'vanishings'>,
  rules: GameRules
): ISOCountryCode[] => {
  const points = challenge.vanishings.map(countryLatLng).filter(point => !!point)
  if (!points.length) return [...challenge.vanishings]

  // A plain mean is wrong across the antimeridian, but a deck is regional by
  // construction (TERRA_THEATRE_KM), so no deck can straddle it.
  const centre = {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
    lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
  }

  const near = playableCountries(rules).filter(isoCode => {
    const point = countryLatLng(isoCode)
    return !!point && haversineKm(centre, point) <= TERRA_THEATRE_KM
  })

  return [...new Set([...challenge.vanishings, ...near])]
}
