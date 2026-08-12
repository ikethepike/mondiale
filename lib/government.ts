import {
  benchStandings,
  chambersWithCabinet,
  chamberName,
  chamberSeats,
  type Bench,
} from './parties'
import { playableCountries } from './game-rules'
import { sample, sampleMany, shuffleArray } from './arrays'
import { clampScore } from './scoring'
import type { GameDifficulty, GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The Government round's rules — one country asked three questions that build
 * on each other:
 *
 *   1. `party`  — which party governs? (logos, one is the answer)
 *   2. `seats`  — how large is it? (the chamber, colourless, drag to the block)
 *   3. `sides`  — who else is with them? (sort the rest into government/opposition)
 *
 * Both ends import this: the dealer builds the round from it, the view draws
 * from the dealt payload, and the server grades with the same scorer. A beat
 * whose answer the view re-derived would eventually disagree with the grade.
 */

/** A chamber under this many benches has no shape worth reading. */
export const MIN_BENCHES = 3

/**
 * Seats the arc draws. Real chambers run from 51 (Suriname) to 630 (Germany),
 * and drawing one dot per seat would be a wall of dots on a phone at the top
 * of that range. The arc is scaled to this and each dot stands for a share.
 */
export const MAX_SEAT_DOTS = 180

export const GOVERNMENT_BEATS = ['party', 'seats', 'sides'] as const
export type GovernmentBeat = (typeof GOVERNMENT_BEATS)[number]

/**
 * Logos offered in beat 1. The impostors are real parties from the SAME
 * chamber, so the question is "who governs here", never "which of these is a
 * party" — a wrong option that belongs to another country is a giveaway.
 */
export const PARTY_OPTIONS: { [difficulty in GameDifficulty]: number } = {
  easy: 3,
  normal: 4,
  hard: 5,
}

/**
 * Seat blocks offered in beat 2. The chamber is drawn colourless and split into
 * contiguous blocks; one holds the governing party's true share.
 */
export const SEAT_BLOCKS: { [difficulty in GameDifficulty]: number } = {
  easy: 3,
  normal: 4,
  hard: 5,
}

/**
 * Benches a player sorts in beat 3. Sorting a 12-bench chamber is data entry,
 * not a question, so the largest few carry it — they are also the ones whose
 * allegiance is worth knowing.
 */
export const SORTED_BENCHES: { [difficulty in GameDifficulty]: number } = {
  easy: 3,
  normal: 4,
  hard: 5,
}

/** Points a beat can pay. Beat 1 is the premise the other two rest on. */
export const BEAT_POINTS: { [beat in GovernmentBeat]: number } = {
  party: 3,
  seats: 3,
  sides: 4,
}

/** Seconds each beat runs for. */
export const BEAT_SECONDS: { [beat in GovernmentBeat]: number } = {
  party: 20,
  seats: 25,
  sides: 35,
}

export interface GovernmentOption {
  name: string
  logo?: string
  color?: string
  /** Its ideology, revealed after the answer — the teaching half of the beat. */
  ideology?: string
  /** Transnational family (EPP, Progressive Alliance), revealed with it. */
  grouping?: string
}

export interface GovernmentBench {
  name: string
  seats: number
  share: number
  color?: string
  logo?: string
  /** Where it truly stands — the answer to beat 3, never sent before reveal. */
  standing: 'government' | 'backing' | 'opposition'
}

export interface GovernmentDeal {
  country: ISOCountryCode
  /** The house the arc draws — "Sejm", "Bundestag". */
  chamber?: string
  totalSeats: number
  /** Beat 1's options, shuffled; exactly one matches `governingParty`. */
  options: GovernmentOption[]
  governingParty: string
  /** Beat 2's blocks, as seat counts; exactly one is the true share. */
  blocks: number[]
  governingSeats: number
  /** Every bench in seating order, left to right — the arc as drawn. */
  benches: GovernmentBench[]
  /** Beat 3's benches, by name — the ones the player sorts. */
  sorted: string[]
  /** `minority government` … as the cabinet phrases it; shown at the reveal. */
  status?: string
  /** True when the government needs its backers to hold a majority. */
  minority: boolean
}

const asOption = (bench: Bench): GovernmentOption => ({
  name: bench.name,
  ...(bench.party?.logo ? { logo: bench.party.logo } : {}),
  ...(bench.party?.colors?.[0] ? { color: `#${bench.party.colors[0]}` } : {}),
  ...(bench.party?.ideologies?.[0] ? { ideology: bench.party.ideologies[0] } : {}),
  ...(bench.groupings?.[0] ? { grouping: bench.groupings[0] } : {}),
})

/**
 * Beat 2's blocks, sorted ascending. The true share is one of them; the decoys
 * are proportional rather than absolute, because ±8 seats is a rounding error
 * in a 630-seat Bundestag and the whole question in a 60-seat chamber.
 *
 * How many decoys sit BELOW the truth is drawn per chamber rather than fixed.
 * A fixed spread put the answer third from the left in fifteen of sixteen
 * chambers, which is a rule a player can learn instead of the politics.
 */
const seatBlocks = (
  truth: number,
  total: number,
  count: number,
  random: () => number = Math.random
): number[] => {
  const below = Math.floor(random() * count)
  const blocks = new Set<number>([truth])
  const shrink = [0.75, 0.55, 0.35, 0.2]
  const grow = [1.35, 1.8, 2.4, 3.1]

  const add = (factor: number) => {
    const decoy = Math.max(1, Math.min(total, Math.round(truth * factor)))
    if (decoy !== truth) blocks.add(decoy)
  }
  for (let index = 0; index < below; index += 1) add(shrink[index] ?? 0.15)
  for (let index = 0; blocks.size < count && index < grow.length; index += 1) add(grow[index]!)
  // A tiny governing bloc collapses its proportional decoys onto the truth, and
  // a huge one runs out of room above; walk outward until the options are
  // distinct either way.
  for (let step = 1; blocks.size < count && step <= total; step += 1) {
    if (truth + step <= total) blocks.add(truth + step)
    if (blocks.size < count && truth - step >= 1) blocks.add(truth - step)
  }
  return [...blocks].sort((a, b) => a - b)
}

const buildDeal = (
  country: ISOCountryCode,
  difficulty: GameDifficulty
): GovernmentDeal | undefined => {
  const standings = benchStandings(country)
  const total = chamberSeats(country)
  if (!standings || !total) return undefined

  const everyBench = [...standings.government, ...standings.backing, ...standings.opposition]
  if (everyBench.length < MIN_BENCHES) return undefined

  // The government's LARGEST bench is the party a citizen would name — the
  // prime minister's own. A junior coalition partner is a different question.
  const leader = [...standings.government].sort((a, b) => b.seats - a.seats)[0]
  if (!leader?.party?.logo) return undefined

  // Impostors come from the same chamber and must be tellable apart: a bench
  // with no logo cannot stand beside one that has it without giving the answer
  // away by looking different. A chamber that cannot fill the row is not dealt
  // at all — a short row is a different, easier question than the one the
  // difficulty asked for.
  const rivals = everyBench.filter(bench => bench !== leader && bench.party?.logo)
  const wanted = PARTY_OPTIONS[difficulty] - 1
  if (rivals.length < wanted) return undefined
  const options = shuffleArray([leader, ...sampleMany(rivals, wanted)]).map(asOption)

  const governmentSeats = standings.government.reduce((sum, bench) => sum + bench.seats, 0)
  const withBackers =
    governmentSeats + standings.backing.reduce((sum, bench) => sum + bench.seats, 0)

  const standingOf = (bench: Bench): GovernmentBench['standing'] =>
    standings.government.includes(bench)
      ? 'government'
      : standings.backing.includes(bench)
        ? 'backing'
        : 'opposition'

  // Beat 3 sorts the largest benches, minus the one beat 1 already named.
  const sortable = everyBench
    .filter(bench => bench !== leader)
    .sort((a, b) => b.seats - a.seats)
    .slice(0, SORTED_BENCHES[difficulty])
  if (sortable.length < 2) return undefined

  return {
    country,
    ...(chamberName(country) ? { chamber: chamberName(country) } : {}),
    totalSeats: total,
    options,
    governingParty: leader.name,
    blocks: seatBlocks(leader.seats, total, SEAT_BLOCKS[difficulty]),
    governingSeats: leader.seats,
    benches: everyBench.map(bench => ({
      name: bench.name,
      seats: bench.seats,
      share: bench.share,
      ...(bench.party?.colors?.[0] ? { color: `#${bench.party.colors[0]}` } : {}),
      ...(bench.party?.logo ? { logo: bench.party.logo } : {}),
      standing: standingOf(bench),
    })),
    sorted: sortable.map(bench => bench.name),
    ...(standings.status ? { status: standings.status } : {}),
    // The teaching point: a government can hold power without holding half the
    // seats, which is exactly what the backers are for.
    minority: governmentSeats * 2 <= total && withBackers > governmentSeats,
  }
}

/**
 * Chambers this round can deal, at the hardest difficulty they might be asked
 * for. The pool asks the dealer rather than re-deriving its rules, so a country
 * that clears `chambersWithCabinet` but loses beat 1 to a missing logo is
 * absent from both.
 */
export const governmentPool = (
  rules: GameRules,
  difficulty: GameDifficulty = 'hard'
): ISOCountryCode[] => {
  const playable = new Set(playableCountries(rules))
  return chambersWithCabinet().filter(
    isoCode => playable.has(isoCode) && !!buildDeal(isoCode, difficulty)
  )
}

export const dealGovernment = (
  rules: GameRules,
  difficulty: GameDifficulty,
  isoCode?: ISOCountryCode
): GovernmentDeal | undefined => {
  const country = isoCode ?? sample(governmentPool(rules, difficulty))
  return country ? buildDeal(country, difficulty) : undefined
}

/** What a player answered, per beat. Absent means they never answered. */
export interface GovernmentAnswer {
  party?: string
  seats?: number
  /** Bench name → the side the player filed it under. */
  sides?: Record<string, 'government' | 'opposition'>
}

/**
 * One beat's score. Beats 1 and 2 are all-or-nothing — there is no partial
 * credit for naming the wrong government — while beat 3 pays per bench, since
 * sorting four benches is four judgements rather than one.
 *
 * Backers are graded as GOVERNMENT here: they keep it in power, and the beat
 * asks who is with the government rather than who holds ministries. The
 * distinction is the reveal's lesson, not a trap in the scoring.
 */
export const scoreBeat = (
  beat: GovernmentBeat,
  deal: GovernmentDeal,
  answer: GovernmentAnswer
): number => {
  const points = BEAT_POINTS[beat]
  if (beat === 'party') return answer.party === deal.governingParty ? points : 0
  if (beat === 'seats') return answer.seats === deal.governingSeats ? points : 0

  const filed = answer.sides ?? {}
  if (!deal.sorted.length) return 0
  const correct = deal.sorted.filter(name => {
    const truth = deal.benches.find(bench => bench.name === name)?.standing
    if (!truth) return false
    return filed[name] === (truth === 'opposition' ? 'opposition' : 'government')
  }).length
  return clampScore(Math.round((correct / deal.sorted.length) * points), points)
}

/** The whole round, summed — what the server settles on. */
export const scoreGovernment = (deal: GovernmentDeal, answer: GovernmentAnswer): number =>
  GOVERNMENT_BEATS.reduce((total, beat) => total + scoreBeat(beat, deal, answer), 0)
