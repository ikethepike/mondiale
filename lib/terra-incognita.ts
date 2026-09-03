import { BORDERS } from '~~/data/borders.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { MAP_BOUNDS, MAP_PATHS, MAP_REGIONS } from '~~/data/map.gen'
import { weightedPick } from '~~/lib/arrays'
import { playableCountries } from '~~/lib/game-rules'
import {
  countryLatLng,
  haversineKm,
  isLabelableBox,
  labelBoxFor,
  mainlandBox,
  WORLD_BOX,
  type MapBox,
} from '~~/lib/geo'
import { clamp } from '~~/lib/number'
import { largestRing, parsePolygons, sharedBoundary } from '~~/lib/outline'
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
 * the whole round (`terraFrame` → `map.frame`).
 *
 * ~1800km is a region a player can hold in their head at once — the Balkans
 * into central Europe, Central Asia, the Horn.
 *
 * The number is bounded from BOTH sides, which is why it is not simply as tight
 * as possible. Tighter starves the deal: inside a small circle nearly every
 * candidate borders another, and the no-adjacent-blanks guard leaves almost no
 * neighbourhood able to seat a deck (at 1200km only two anchors on the whole
 * easy board can). Wider seats decks easily but spreads the losses past what
 * one crop can show at a size where an absence still reads.
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

/**
 * The hole a single guess restores, given the holes already restored: the
 * country itself if it is one of the losses, otherwise the first still-open
 * loss it swallowed. Undefined when the guess restores nothing.
 *
 * `open` is the set of losses still unrestored, so a guess can only ever claim
 * one — a country that absorbed two of them (Germany over both Austria and
 * Denmark, which happens in about a fifth of decks) restores the earlier one
 * on the first naming, and the answer to the second is its own name.
 */
export const terraRestoredBy = (
  challenge: Pick<TerraIncognitaChallenge, 'vanishings' | 'absorbedBy'>,
  guess: ISOCountryCode,
  open: ReadonlySet<ISOCountryCode>
): ISOCountryCode | undefined => {
  if (open.has(guess)) return guess
  // A round dealt before absorbers existed carries no map, and grades exactly
  // as it always did: the country's own name and nothing else.
  const absorbedBy = challenge.absorbedBy ?? {}
  return challenge.vanishings.find(isoCode => open.has(isoCode) && absorbedBy[isoCode] === guess)
}

/**
 * A guess list resolved to the holes it restored, in order — the ONE mapping
 * both ends grade through, so "name either country" means the same thing on
 * the client's ticker and in the server's score.
 *
 * Anything that restores nothing is passed through untouched, so a genuine
 * stray still reaches `blitzScore` as a stray and still costs. A guess that
 * restores a hole somebody already claimed resolves to nothing too, which is
 * what keeps naming one absorber twice from paying twice.
 *
 * `within` narrows the losses in play: the view passes only what has actually
 * vanished (a hole the clock has not opened yet cannot be restored, and
 * accepting its absorber early would leak that it is coming), the server
 * passes the whole deck.
 */
export const terraRestoredHoles = (
  challenge: Pick<TerraIncognitaChallenge, 'vanishings' | 'absorbedBy'>,
  guesses: readonly ISOCountryCode[],
  within: readonly ISOCountryCode[] = challenge.vanishings
): ISOCountryCode[] => {
  const open = new Set(within)
  return guesses.map(guess => {
    const hole = terraRestoredBy(challenge, guess, open)
    if (!hole) return guess
    open.delete(hole)
    return hole
  })
}

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
 * A land neighbour — a country vanishes by giving up the border it shares with
 * one, so the two pieces of land read as one (`longestSharedRun`). An island
 * shares no border with anything: there is nothing to give up, the sea keeps
 * drawing its whole outline, and Iceland or Sri Lanka would "vanish" while
 * still sitting there in plain sight. They are not hard questions, they are
 * broken ones.
 */
/**
 * The country a vanishing one dissolves INTO — the neighbour it shares its
 * longest border with, which is the border the map paints out.
 *
 * The mode's fiction is one country expanding over another, so this names the
 * expander. The deal stamps it on the challenge (`absorbedBy`) and the map
 * fuses the two outlines from that stamp, so the country the grader accepts
 * and the country the map merges into can never be two different neighbours.
 *
 * Pinned to SD `MAP_PATHS` on purpose. The map swaps to HD geometry as the
 * camera zooms, and two neighbours with near-equal borders could change places
 * between tiers — an accepted answer that depends on how far a player has
 * zoomed would be indefensible.
 *
 * Undefined where the geometry offers no partial border to give up: an enclave
 * whose host wraps the whole ring (Lesotho), or a country whose only neighbour
 * never meets its mainland ring (the United Kingdom). Those cannot visibly
 * vanish either — see `terraField`, which drops them for the same reason.
 */
const absorberCache = new Map<ISOCountryCode, ISOCountryCode | undefined>()

export const terraAbsorber = (isoCode: ISOCountryCode): ISOCountryCode | undefined => {
  // Memoised: this parses every neighbour's polygons, and `terraField` asks it
  // once per country on every deal. The answer is a property of the frozen map
  // geometry, so it can never change within a process.
  if (absorberCache.has(isoCode)) return absorberCache.get(isoCode)
  const resolved = resolveAbsorber(isoCode)
  absorberCache.set(isoCode, resolved)
  return resolved
}

const resolveAbsorber = (isoCode: ISOCountryCode): ISOCountryCode | undefined => {
  const own = MAP_PATHS[isoCode as keyof typeof MAP_PATHS]
  const ring = own ? largestRing(own) : undefined
  if (!ring) return undefined

  let best: { isoCode: ISOCountryCode; length: number } | undefined
  for (const neighbour of BORDERS[isoCode] ?? []) {
    const path = MAP_PATHS[neighbour as keyof typeof MAP_PATHS]
    if (!path) continue
    const run = sharedBoundary(ring, parsePolygons(path).flat())
    // A border to give up has to be PART of the ring: an enclave's host shares
    // the whole outline, and erasing that would take the country's every line.
    if (!run || run.length < 2 || run.length >= ring.length) continue
    if (!best || run.length > best.length) best = { isoCode: neighbour, length: run.length }
  }
  return best?.isoCode
}

export const terraField = (rules: GameRules): ISOCountryCode[] =>
  playableCountries(rules)
    .filter(isoCode => !!BORDERS[isoCode]?.length)
    .filter(isoCode => isLabelableBox(labelBoxFor(MAP_BOUNDS[isoCode], MAP_REGIONS[isoCode])))
    // A border to give up. Having a land neighbour is not enough: Lesotho's
    // host wraps its whole ring and the UK's only neighbour never touches its
    // mainland, so the map paints out nothing and the country "vanishes" while
    // sitting there fully outlined. That is an unanswerable question, not a
    // hard one — the same gate that names the absorber keeps them out.
    .filter(isoCode => !!terraAbsorber(isoCode))
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
 * the land each vanishes into is the other's — so an adjacent pair asks the
 * table to perceive an absence the map does not actually distinguish. Inside a
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
 * How much atlas the camera shows around the losses, per difficulty — the
 * mode's framing lever, and the one that makes the same deck a different
 * round at each setting.
 *
 * Tight on easy: each loss is a large piece of the screen and its absence is
 * hard to miss. Wide on hard: the same country is a sliver in a crowded region
 * and the player has to be scanning the right place. Both are in MAP UNITS
 * around the deck's own bounding box (`scale` is a share of its larger side,
 * `floor` the least margin in any case), never a list of countries: framing
 * by whole-country boxes let one big neighbour — Russia, Kazakhstan, Brazil —
 * blow a Balkan crop out to a whole-planet view. Modest on purpose: the
 * typed console's berth already scales the shot up by well over half, so
 * the frame is the CLEAR band's worth of atlas, not the viewport's.
 */
export const TERRA_FRAME_REACH: {
  [difficulty in GameDifficulty]: { scale: number; floor: number }
} = {
  easy: { scale: 0.15, floor: 18 },
  normal: { scale: 0.25, floor: 30 },
  hard: { scale: 0.4, floor: 45 },
}

/**
 * The map-space box the camera holds for the whole round: the deck's mainland
 * boxes, padded by the difficulty's reach and clipped to the world.
 *
 * Derived from the deck alone, so every seat and the booth frame the identical
 * shot with nothing extra on the wire. The padding is what keeps the frame
 * fair: it is symmetric about the deck, so the losses sit in the middle of the
 * shot rather than along its edges — a box whose every edge is a country about
 * to disappear is a free answer — and it never falls under `floor`, so no loss
 * is ever the first thing the frame cuts off. The camera adds its own aspect
 * correction and console berth on top (`frameForBoxes`).
 */
export const terraFrame = (
  challenge: Pick<TerraIncognitaChallenge, 'vanishings'>,
  difficulty: GameDifficulty
): MapBox => {
  const boxes = challenge.vanishings
    .map(isoCode => mainlandBox(MAP_REGIONS[isoCode], MAP_BOUNDS[isoCode]))
    .filter((box): box is MapBox => !!box)
  if (!boxes.length) return [WORLD_BOX.x, WORLD_BOX.y, WORLD_BOX.width, WORLD_BOX.height]

  const left = Math.min(...boxes.map(([x]) => x))
  const top = Math.min(...boxes.map(([, y]) => y))
  const right = Math.max(...boxes.map(([x, , width]) => x + width))
  const bottom = Math.max(...boxes.map(([, y, , height]) => y + height))

  const { scale, floor } = TERRA_FRAME_REACH[difficulty]
  const pad = Math.max((right - left) * scale, (bottom - top) * scale, floor)

  const x = Math.max(WORLD_BOX.x, left - pad)
  const y = Math.max(WORLD_BOX.y, top - pad)
  return [
    x,
    y,
    Math.min(WORLD_BOX.x + WORLD_BOX.width, right + pad) - x,
    Math.min(WORLD_BOX.y + WORLD_BOX.height, bottom + pad) - y,
  ]
}
