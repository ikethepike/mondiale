import { COUNTRIES } from '~~/data/countries.gen'
import { MARRIAGE_RIGHTS } from '~~/data/marriage-rights.gen'
import { TREATIES } from '~~/data/treaties.gen'
import { buzzFraction, clampScore } from './scoring'
import { clamp01 } from './number'
import { countriesSpending } from './currency'
import { isMemberOf } from './odd-one-out'
import { playableCountries } from './game-rules'
import { languagesAsked, speaksLanguage } from './language-rounds'
import { REGION_LABELS } from './variant'
import type { DataSetId } from './attribution'
import { isGroupEnabled, type ChallengeSettings } from '~~/types/challenges/challenge-groups.type'
import type { CleanSweepChallenge, SweepSetFamily } from '~~/types/challenges/group-modes.type'
import type { CurrencyCode } from '~~/types/currency.type'
import type { Game, GameDifficulty, GameRules } from '~~/types/game.types'
import type { ISOCountryCode, Region } from '~~/types/geography.types'
import type { TreatyId } from '~~/types/treaty.type'

/**
 * Clean Sweep's single source: the set register, the board's size band, and
 * the contested-pool scoring. The dealer, the server's beat engine and the
 * client's board all read the same functions — the two sides of the wire must
 * never grow separate ideas of what "the EU's 27" is at this table.
 *
 * Every resolver reads through an EXISTING single source (`isMemberOf`,
 * `countriesSpending`, the treaty table) and filters through
 * `playableCountries`. The mode adds no membership test and derives no pool of
 * its own — a continental variant gets a club's local wing for free, and
 * micro-nation gating is inherited rather than re-implemented.
 */

export interface SweepSetSpec {
  family: SweepSetFamily
  /** The prompt, as the round asks it. */
  prompt: string
  /** The board's short name, for the reveal headline and the round history. */
  label: string
  /** The reveal's teaching line: why these countries and not others. */
  qualifier: string
  /** The ⓘ's dataset — claimed by a DATASETS entry (attribution.test.ts). */
  dataset: DataSetId
  /** Reserved for hard games unless the group is force-enabled. */
  hardOnly?: boolean
  /** The language a speaker set asks about — off when the table switched languages off or already played it. */
  language?: string
  /** The set at this table, unordered. Windowing (for sets past the band) is
   *  the register's own job, so a prompt can never promise more than it deals. */
  members: (rules: GameRules) => ISOCountryCode[]
}

/** A club's roster on this board — the one membership test, one filter. */
const clubRoster =
  (organization: Parameters<typeof isMemberOf>[1]) =>
  (rules: GameRules): ISOCountryCode[] =>
    playableCountries(rules).filter(isoCode => isMemberOf(isoCode, organization))

/** Everyone bound by an instrument — 'party' only. Signatories signed and never
 *  ratified, so counting them would make the prompt's "bound by" a lie. */
const treatyParties =
  (treaty: TreatyId) =>
  (rules: GameRules): ISOCountryCode[] => {
    const statuses = TREATIES[treaty] ?? {}
    return playableCountries(rules).filter(isoCode => statuses[isoCode]?.standing === 'party')
  }

const currencyZone =
  (...codes: CurrencyCode[]) =>
  (rules: GameRules): ISOCountryCode[] => {
    const spenders = new Set(codes.flatMap(code => countriesSpending(code)))
    return playableCountries(rules).filter(isoCode => spenders.has(isoCode))
  }

const speakerSet = (language: string, qualifier: string): SweepSetSpec => ({
  family: 'language',
  prompt: `Name every country that speaks ${language}`,
  label: `${language} speakers`,
  qualifier,
  dataset: 'countries',
  language,
  members: rules => playableCountries(rules).filter(isoCode => speaksLanguage(isoCode, language)),
})

const regionRoster =
  (region: Region) =>
  (rules: GameRules): ISOCountryCode[] =>
    playableCountries(rules).filter(isoCode => COUNTRIES[isoCode].region === region)

/**
 * Countries that legalised same-sex marriage, earliest first — the ordering IS
 * the window. A register past the size band is cut by its own ordering, never
 * sampled, so "the first N to legalise it" stays a true sentence where "N of
 * the countries that did" would be a shrug.
 */
const marriageAdopters = (rules: GameRules): ISOCountryCode[] =>
  playableCountries(rules)
    .filter(isoCode => MARRIAGE_RIGHTS[isoCode]?.year !== undefined)
    .sort((a, b) => (MARRIAGE_RIGHTS[a]?.year ?? 0) - (MARRIAGE_RIGHTS[b]?.year ?? 0))

export const SWEEP_SETS: { [setId: string]: SweepSetSpec } = {
  eu: {
    family: 'club',
    prompt: 'Name every member of the European Union',
    label: 'the EU',
    qualifier:
      'The EU has had 27 members since the UK left in 2020. Norway and Switzerland trade with it and have never joined.',
    dataset: 'countries',
    members: clubRoster('eu'),
  },
  nato: {
    family: 'club',
    prompt: 'Name every member of NATO',
    label: 'NATO',
    qualifier:
      'A mutual-defence alliance — an attack on one is treated as an attack on all. Finland joined in 2023, Sweden in 2024.',
    dataset: 'countries',
    members: clubRoster('nato'),
  },
  opec: {
    family: 'club',
    prompt: 'Name every member of OPEC',
    label: 'OPEC',
    qualifier:
      'Oil exporters who coordinate production to steady the price of crude. Founded by five states in 1960; the roster has turned over ever since.',
    dataset: 'countries',
    members: clubRoster('opec'),
  },
  eurozone: {
    family: 'currency',
    prompt: 'Name every country that spends the euro',
    label: 'the euro',
    qualifier:
      'Not the same list as the EU: several members kept their own currency, and a few non-members use the euro anyway.',
    dataset: 'currencies',
    members: currencyZone('EUR'),
  },
  'cfa-franc': {
    family: 'currency',
    prompt: 'Name every country that spends a CFA franc',
    label: 'the CFA franc',
    qualifier:
      'Two currencies sharing one name — the West and Central African CFA francs, both pegged to the euro. Guinea-Bissau and Equatorial Guinea use them without ever having been French.',
    dataset: 'countries',
    hardOnly: true,
    members: currencyZone('XOF', 'XAF'),
  },
  schengen: {
    family: 'treaty',
    prompt: 'Name every country in the Schengen Area',
    label: 'Schengen',
    qualifier:
      'Passport-free travel across internal borders. Ireland opted out; Norway, Switzerland and Iceland opted in without joining the EU.',
    dataset: 'treaties',
    members: treatyParties('schengen'),
  },
  'south-america': {
    family: 'region',
    prompt: 'Name every country in South America',
    label: 'South America',
    qualifier:
      'Twelve sovereign states, plus French Guiana — which is part of France, not a country.',
    dataset: 'countries',
    members: regionRoster('south-america'),
  },
  'middle-east': {
    family: 'region',
    prompt: 'Name every country in the Middle East',
    label: 'the Middle East',
    qualifier: `Where the region's edges fall is a matter of definition — this board follows ${REGION_LABELS['middle-east']} as the dataset draws it.`,
    dataset: 'countries',
    members: regionRoster('middle-east'),
  },
  oceania: {
    family: 'region',
    prompt: 'Name every country in Oceania',
    label: 'Oceania',
    qualifier:
      'Mostly island states scattered across a third of the planet — the smallest of them hold a few thousand people.',
    dataset: 'countries',
    members: regionRoster('oceania'),
  },
  'marriage-equality': {
    family: 'rights',
    prompt: 'Name the countries that legalised same-sex marriage first',
    label: 'marriage equality',
    qualifier:
      'The Netherlands went first in 2001. The board holds the earliest adopters; the list has kept growing since.',
    dataset: 'marriage-rights',
    members: marriageAdopters,
  },
  spanish: speakerSet(
    'Spanish',
    'Spain, most of Latin America, and Equatorial Guinea — the one African state that speaks it. Brazil, the region’s giant, speaks Portuguese.'
  ),
  french: speakerSet(
    'French',
    'Spoken well beyond France — in the countries that made it official, and in many more where it is the language of schools, courts or commerce.'
  ),
  arabic: speakerSet(
    'Arabic',
    'Spoken from Morocco to Oman — and in Chad, Comoros and Djibouti too, where it shares official status with French.'
  ),
  portuguese: speakerSet(
    'Portuguese',
    'Brazil alone holds most of the world’s Portuguese speakers, and migration has carried the language to countries Portugal never ruled.'
  ),
  russian: speakerSet(
    'Russian',
    'The Soviet Union’s common tongue outlived it: Russian is still spoken across most of the states that left it.'
  ),
}

/**
 * The board's size band and clock. The floor rises with the table so six
 * players never clear a nine-slot board in fifteen seconds; on a board with no
 * set that big it relaxes, but never below `SWEEP_SLOTS_PER_SEAT` a contender.
 * The ceiling keeps the roster readable on a phone.
 */
export const SWEEP_TUNING: {
  [difficulty in GameDifficulty]: {
    minimumSlots: number
    maximumSlots: number
    /** Extra slots demanded per contender beyond the second. */
    slotsPerExtraSeat: number
    durationSeconds: number
  }
} = {
  easy: { minimumSlots: 8, maximumSlots: 20, slotsPerExtraSeat: 2, durationSeconds: 90 },
  normal: { minimumSlots: 8, maximumSlots: 27, slotsPerExtraSeat: 2, durationSeconds: 80 },
  hard: { minimumSlots: 10, maximumSlots: 30, slotsPerExtraSeat: 3, durationSeconds: 70 },
}

export const SWEEP_SLOTS_PER_SEAT = 2

/**
 * Slots left when the round enters its last call — the communal final gasp,
 * DERIVED from the snapshot rather than announced over the wire. A beat every
 * client can compute from state it already holds cannot drift, cannot be
 * spoofed, and costs nothing to deliver.
 */
export const SWEEP_LAST_CALL = 3

/** How many of the table's wrong names the reveal keeps. Capped so a
 *  determined typist can't grow the snapshot for the room. */
export const SWEEP_STRAY_CAP = 24

export const SWEEP_SMALLEST_BOARD = 8

/**
 * A region set on its own continental board would BE the board — every
 * playable country, and the round becomes "name the world". Any set that
 * swallows this share of the pool is not a question.
 */
const MAXIMUM_POOL_SHARE = 0.7

/** The table a set is dealt to: its board and difficulty, its group toggles, and the rounds it has played. */
export type SweepTable = GameRules &
  Pick<ChallengeSettings, 'challengeOverrides'> &
  Partial<Pick<Game, 'rounds'>>

const dealableSweepSets = (table: SweepTable): string[] => {
  const asked = languagesAsked({ rounds: table.rounds ?? [] })
  return Object.keys(SWEEP_SETS).filter(setId => {
    const { hardOnly, language } = SWEEP_SETS[setId]
    if (hardOnly && table.difficulty !== 'hard') return false
    return !language || (isGroupEnabled(table, 'language') && !asked.has(language))
  })
}

const sweepRoster = (setId: string, rules: GameRules): ISOCountryCode[] | undefined => {
  const spec = SWEEP_SETS[setId]
  if (!spec) return undefined
  const members = spec.members(rules)
  return members.length > playableCountries(rules).length * MAXIMUM_POOL_SHARE ? undefined : members
}

/**
 * The band this table plays in — the tuning's floor, raised by the seats. On a
 * board whose biggest dealable set falls short of that, the floor drops to that
 * set, but never below `SWEEP_SLOTS_PER_SEAT` a contender or
 * `SWEEP_SMALLEST_BOARD`; a board with nothing that big deals no sweep at all.
 */
export const sweepSlotBand = (
  table: SweepTable,
  contenders: number
): { minimum: number; maximum: number } => {
  const tuning = SWEEP_TUNING[table.difficulty]
  const seated = Math.min(
    tuning.maximumSlots,
    tuning.minimumSlots + Math.max(0, contenders - 2) * tuning.slotsPerExtraSeat
  )
  const largest = Math.max(
    0,
    ...dealableSweepSets(table).map(setId => sweepRoster(setId, table)?.length ?? 0)
  )
  return {
    minimum: Math.max(
      SWEEP_SMALLEST_BOARD,
      SWEEP_SLOTS_PER_SEAT * contenders,
      Math.min(seated, largest)
    ),
    maximum: tuning.maximumSlots,
  }
}

/**
 * The set as this table would play it: resolved, windowed to the band's
 * ceiling by the register's own ordering, or undefined when it can't field a
 * board here. The dealer and the tests both ask through this, so "viable" has
 * exactly one definition.
 */
export const sweepBoardFor = (
  setId: string,
  rules: GameRules,
  band: { minimum: number; maximum: number }
): ISOCountryCode[] | undefined => {
  const members = sweepRoster(setId, rules)
  if (!members || members.length < band.minimum) return undefined
  return members.slice(0, band.maximum)
}

/**
 * The set's real members that this board does NOT ask for — cut by the variant,
 * benched as micro-nations, or trimmed past the band's ceiling.
 *
 * The prompt says "name every member of NATO" while the board may hold thirty
 * of thirty-two, so naming the United States is knowing the answer rather than
 * missing it. The round refuses those claims without the bench that a stray
 * earns. Resolved against the WORLD roster, so it catches every axis of the
 * narrowing at once.
 */
export const sweepOffBoardFor = (
  setId: string,
  rules: GameRules,
  dealt: readonly ISOCountryCode[]
): ISOCountryCode[] => {
  const spec = SWEEP_SETS[setId]
  if (!spec) return []
  const everywhere = spec.members({ ...rules, regions: [], includeMicroNations: true })
  return everywhere.filter(isoCode => !dealt.includes(isoCode))
}

/** Every set that can field a board at this table, in register order. */
export const viableSweepSets = (
  table: SweepTable,
  band: { minimum: number; maximum: number }
): string[] =>
  dealableSweepSets(table).filter(setId => sweepBoardFor(setId, table, band) !== undefined)

// --- Reading the board ------------------------------------------------------

/** Slot → the seat holding it. The view, the reveal and the scorecard all read
 *  ownership through this rather than scanning `claims` themselves. */
export const sweepClaimedBy = (
  challenge: Pick<CleanSweepChallenge, 'state'>
): { [isoCode in ISOCountryCode]?: string } => {
  const held: { [isoCode in ISOCountryCode]?: string } = {}
  for (const claim of challenge.state.claims) held[claim.isoCode] ??= claim.playerId
  return held
}

/** Slots nobody took — empty while the round runs, and the reveal's payload
 *  once it doesn't. */
export const sweepUnclaimed = (
  challenge: Pick<CleanSweepChallenge, 'members' | 'state'>
): ISOCountryCode[] => {
  const held = sweepClaimedBy(challenge)
  return challenge.members.filter(isoCode => !held[isoCode])
}

/**
 * Every seat's claims, MOST FIRST. The descending order is a contract, not an
 * implementation detail: the live rail and the reveal's take strip both render
 * straight off this array, so "leader first" is decided once here rather than
 * re-sorted (and eventually re-sorted differently) by each surface.
 *
 * Ties hold deal order — `sort` is stable and the map is seeded from
 * `state.order` — so joint leaders never jitter between snapshots.
 */
export const sweepStandings = (
  challenge: Pick<CleanSweepChallenge, 'state'>
): { playerId: string; claimed: ISOCountryCode[] }[] => {
  const byPlayer = new Map<string, ISOCountryCode[]>(
    challenge.state.order.map(playerId => [playerId, []])
  )
  for (const claim of challenge.state.claims) {
    byPlayer.get(claim.playerId)?.push(claim.isoCode)
  }
  return [...byPlayer.entries()]
    .map(([playerId, claimed]) => ({ playerId, claimed }))
    .sort((a, b) => b.claimed.length - a.claimed.length)
}

/**
 * Who is actually out in front — joint leaders included, and EMPTY when
 * nobody is: a table level at nothing has no leader, and neither does one
 * level at six. Marking every seat in a full tie is the same as marking none,
 * except it also shouts.
 *
 * Lives here rather than in the rail because the reveal's take strip crowns
 * the same seats, and "who won this round" must not be two opinions.
 */
export const sweepLeaders = (challenge: Pick<CleanSweepChallenge, 'state'>): string[] => {
  const standings = sweepStandings(challenge)
  const top = standings[0]?.claimed.length ?? 0
  if (top === 0) return []
  const leaders = standings.filter(seat => seat.claimed.length === top)
  return leaders.length === standings.length ? [] : leaders.map(seat => seat.playerId)
}

/** The board is clear. */
export const sweepIsComplete = (
  challenge: Pick<CleanSweepChallenge, 'members' | 'state'>
): boolean => sweepUnclaimed(challenge).length === 0

/**
 * Seconds still on the clock when the board cleared — 0 when it never did.
 * The reveal's "cleared with Ns to spare" and the sweep bonus itself both read
 * the SAME stamped `remaining`, so the sentence can never quote a margin the
 * payout disagrees with.
 */
export const sweepSecondsToSpare = (
  challenge: Pick<CleanSweepChallenge, 'members' | 'state' | 'durationSeconds'>
): number => {
  if (!sweepIsComplete(challenge)) return 0
  const remaining = challenge.state.claims[challenge.state.claims.length - 1]?.remaining ?? 0
  return Math.round(remaining * challenge.durationSeconds)
}

/** The seat that took the last slot — the closer. Undefined unless the board
 *  actually cleared: nobody closes a board that was never closed. */
export const sweepCloserId = (
  challenge: Pick<CleanSweepChallenge, 'members' | 'state'>
): string | undefined =>
  sweepIsComplete(challenge)
    ? challenge.state.claims[challenge.state.claims.length - 1]?.playerId
    : undefined

// --- Scoring ----------------------------------------------------------------

/**
 * The pot, three ways. Claims are the bulk of it, the sweep bonus is the
 * table's shared stake in clearing the board, and the closer takes the final
 * gasp. Integer shares that sum EXACTLY to the pot (the remainder lands on the
 * closer) — the client sums these and the server clamps, and a rounded third
 * share would let the two disagree.
 */
export const SWEEP_POTS = { claims: 0.6, sweep: 0.3 } as const

export const sweepPots = (
  maximumPoints: number
): { claims: number; sweep: number; closer: number } => {
  const claims = Math.round(maximumPoints * SWEEP_POTS.claims)
  const sweep = Math.round(maximumPoints * SWEEP_POTS.sweep)
  return { claims, sweep, closer: Math.max(0, maximumPoints - claims - sweep) }
}

/** What claiming exactly your fair share of the board pays, as a fraction of
 *  the claim pot. Below 1 on purpose: the rest is what out-claiming the table
 *  is worth, and without the gap a six-way even split would pay like a sweep. */
export const FAIR_SHARE_PAY = 0.6

/**
 * A seat's slice of the claim pot. Piecewise around the fair share
 * (`poolSize / seats`): nothing → nothing, your share → `FAIR_SHARE_PAY`, the
 * whole board → all of it. That shape is what lets both halves of the mode's
 * brief be true at once — carrying the table pays well, and being carried is
 * not robbery, because the sweep bonus below is flat.
 */
export const sweepClaimFraction = (claimed: number, poolSize: number, seats: number): number => {
  if (poolSize <= 0) return 0
  const fair = poolSize / Math.max(1, seats)
  // A one-seat table has no share to beat — the fair share IS the whole board,
  // so the curve collapses to the plain ratio. Checked FIRST: below the
  // piecewise branch it is unreachable (every claim is `<= fair` there), and a
  // solo sweep would have paid FAIR_SHARE_PAY for taking everything.
  if (poolSize <= fair) return clamp01(claimed / poolSize)
  if (claimed <= fair) return clamp01((claimed / fair) * FAIR_SHARE_PAY)
  return clamp01(FAIR_SHARE_PAY + ((claimed - fair) / (poolSize - fair)) * (1 - FAIR_SHARE_PAY))
}

/**
 * The whole table's scores, derived purely from the claims already on the
 * snapshot. The settle task uses THIS: a pure function of persisted state
 * cannot drift from the board the reveal is showing, and re-running it is
 * always safe.
 */
export const sweepScoresFromClaims = (
  challenge: Pick<CleanSweepChallenge, 'members' | 'state' | 'maximumPoints'>
): { [playerId: string]: { scored: number; maximum: number } } => {
  const pots = sweepPots(challenge.maximumPoints)
  const { order, claims } = challenge.state
  const swept = sweepIsComplete(challenge)
  const closerId = sweepCloserId(challenge)
  // The clock still standing when the board cleared — stamped on the claim
  // that cleared it, never re-derived from a deadline afterwards.
  const sweepBonus = swept
    ? Math.round(pots.sweep * buzzFraction(claims[claims.length - 1]?.remaining ?? 0))
    : 0

  const counts: { [playerId: string]: number } = {}
  for (const claim of claims) counts[claim.playerId] = (counts[claim.playerId] ?? 0) + 1

  return Object.fromEntries(
    order.map(playerId => {
      const claimed = counts[playerId] ?? 0
      const banked =
        Math.round(
          pots.claims * sweepClaimFraction(claimed, challenge.members.length, order.length)
        ) +
        sweepBonus +
        (playerId === closerId ? pots.closer : 0)
      return [
        playerId,
        { scored: clampScore(banked, challenge.maximumPoints), maximum: challenge.maximumPoints },
      ]
    })
  )
}
