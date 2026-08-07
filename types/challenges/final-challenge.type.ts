import type { GameDifficulty } from '../game.types'
import type { ISOCountryCode, Region } from '../geography.types'
import type { OrganizationVector } from '../organization.type'
import type { TreatyId, TreatyStanding } from '../treaty.type'
import type { GroupChallengeAccessorId } from './group-challenge.type'

/** Gauntlet questions dealt per difficulty. Lives here (not the dealer) so
 *  the 3D board can size the final mountain's climb without pulling the
 *  dealer's endgame data into the scene bundle. */
export const GAUNTLET_LENGTH: { [difficulty in GameDifficulty]: number } = {
  easy: 2,
  normal: 3,
  hard: 5,
}

export interface FinalChallenge {
  _type: 'final-challenge'
  /** Monotonic question counter — the staleness token for the gauntlet's
   *  server-owned question cap. Bumps on every consumed answer or cap miss;
   *  absent on older persisted gauntlets (treated as 0). */
  turn?: number
  difficulty: GameDifficulty
  /** Remaining questions; the head is the live one. Redeals may replace it. */
  challenges: FinalChallengeItem[]
  /** Misses the run can still absorb (burn-and-advance). */
  lives: number
  /** Questions dealt at the start — the progress denominator. */
  totalCount: number
  /** Correct answers so far — the progress numerator. */
  answeredCorrect: number
}

export type FinalChallengeItem =
  | RegionChallenge
  | MinChallenge
  | MaxChallenge
  | LanguageChallenge
  | MembershipChallenge
  | TreatyChallenge
  | LeadershipChallenge
  | SunsetBlitzChallenge
  | ScalesChallenge
  | BornChallenge
  | MadeChallenge
  | CityNocturneChallenge
  | BoundaryChallenge
  | EndonymChallenge
  | DiasporaChallenge
  | YearbookChallenge
  | ChangeChallenge

/**
 * What the client submits per question type — verdicts come from the shared
 * `isCorrectFinalAnswer` (lib/challenges/final-challenge.ts) on both sides.
 */
export type FinalChallengeAnswer =
  | { _type: 'region-challenge'; region: Region }
  | { _type: 'min-challenge'; isoCode: ISOCountryCode }
  | { _type: 'max-challenge'; isoCode: ISOCountryCode }
  | { _type: 'leadership-challenge'; isoCode: ISOCountryCode }
  | { _type: 'language-challenge'; isoCode: ISOCountryCode }
  | { _type: 'membership-challenge'; isoCode: ISOCountryCode }
  | { _type: 'treaty-challenge'; isoCode: ISOCountryCode }
  /** Client-trust (like higher-lower): the countries named in time. */
  | { _type: 'sunset-blitz-challenge'; namedCountries: ISOCountryCode[] }
  | { _type: 'scales-challenge'; isoCodes: ISOCountryCode[] }
  | { _type: 'born-challenge'; isoCodes: ISOCountryCode[] }
  | { _type: 'made-challenge'; isoCode: ISOCountryCode }
  /** Client-trust: canonical CITY_LIGHTS names lit in time. */
  | { _type: 'city-nocturne-challenge'; namedCities: string[] }
  /** The drawn line, in map-space coordinates. */
  | { _type: 'boundary-challenge'; drawn: [number, number][] }
  /** Positional: pick i answers beat i of `countries`. */
  | { _type: 'endonym-challenge'; isoCodes: ISOCountryCode[] }
  /** Positional: pick i answers beat i of `origins`. */
  | { _type: 'diaspora-challenge'; isoCodes: ISOCountryCode[] }
  /** The dialed year — verdict is |year − yearbookYear| ≤ tolerance. */
  | { _type: 'yearbook-challenge'; year: number }
  /** The tapped country, plus the dialed decade where the difficulty asks for
   *  one — hard must land both. */
  | { _type: 'change-challenge'; isoCode: ISOCountryCode; decade?: number }

export interface RegionChallenge {
  _type: 'region-challenge'
  country: ISOCountryCode
}

export type MinMaxAccessorKeys = Extract<
  GroupChallengeAccessorId,
  | 'economics.gdpPerCapita'
  | 'economics.militarySpending'
  | 'gender.womenInParliament'
  | 'people.population'
  | 'health.alcoholConsumption'
  | 'humanRights.refugees'
  | 'health.obesity'
>

export interface MaxChallenge {
  _type: 'max-challenge'
  accessorId: MinMaxAccessorKeys
  country: ISOCountryCode
  hints: ISOCountryCode[]
}

export interface MinChallenge {
  _type: 'min-challenge'
  accessorId: MinMaxAccessorKeys
  country: ISOCountryCode
  hints: ISOCountryCode[]
}

export interface MembershipChallenge {
  _type: 'membership-challenge'
  exception: ISOCountryCode
  organization: keyof typeof OrganizationVector
  /** The countries on offer, exception included — see `lineup` below. */
  lineup: ISOCountryCode[]
}

/**
 * The mirror of a membership question, asked of an instrument rather than a
 * club: everyone lit is bound by it except one. `standing` is why that one
 * isn't — it drives the reveal, so the dealer and the lesson can't drift.
 */
export interface TreatyChallenge {
  _type: 'treaty-challenge'
  treaty: TreatyId
  /** The country to tap: the one not bound by it. */
  holdout: ISOCountryCode
  /** How it isn't bound — signed and stalled, walked out, or never came. */
  standing: Exclude<TreatyStanding, 'party'> | 'absent'
  /** The countries on offer, holdout included — see `lineup` below. */
  lineup: ISOCountryCode[]
}

/**
 * The lit set for an odd-one-out question, decided ONCE by the dealer.
 *
 * It rides the challenge because it is part of the question, not a rendering
 * detail. The roster is sampled (191 CRC parties don't fit on a phone) and the
 * answer surface is gated to it, so a lineup re-derived per client would give
 * two players different questions — and re-deriving on remount would reshuffle
 * one mid-round. It carries no secret: every entry is on the map already, and
 * the odd one out is sorted in among them.
 */
export type OddOneOutChallenge = MembershipChallenge | TreatyChallenge

/** The country that does not belong, whichever question is being asked. */
export const oddOneOut = (challenge: OddOneOutChallenge): ISOCountryCode =>
  challenge._type === 'membership-challenge' ? challenge.exception : challenge.holdout

export interface LeadershipChallenge {
  _type: 'leadership-challenge'
  country: ISOCountryCode
}

export interface LanguageChallenge {
  _type: 'language-challenge'
  language: string
}

/**
 * The finale: night sweeps the framed window east→west; type each country's
 * name before the dark takes it. Client-trust graded like higher-lower gates —
 * the client runs the sweep and submits the named set once.
 */
export interface SunsetBlitzChallenge {
  _type: 'sunset-blitz-challenge'
  /** The night window's countries, ordered east→west (darkening order). */
  countries: ISOCountryCode[]
  /**
   * Share of the countries in play that must be named. The absolute quota is
   * computed against what the player's screen actually shows (window ∪
   * visible), with the window itself as the floor.
   */
  quotaRatio: number
  durationSeconds: number
}

/** Click `quota` distinct countries that gained independence after `year` —
 *  one wrong pick ends the round. */
export interface BornChallenge {
  _type: 'born-challenge'
  year: number
  quota: number
}

/** Click a top exporter of `commodity` — a global top exporter (BACI trade
 *  values) or a country with it in its own top-5 list both count. */
export interface MadeChallenge {
  _type: 'made-challenge'
  commodity: string
}

/**
 * Night map, one ghost outline: type the target's biggest cities and each
 * lights up in place. Only ISO code + count travel the wire — both sides read
 * the city list from CITY_LIGHTS. Client-trust graded, like sunset.
 */
export interface CityNocturneChallenge {
  _type: 'city-nocturne-challenge'
  country: ISOCountryCode
  /** The top N of CITY_LIGHTS[country] in play. */
  cityCount: number
  quota: number
  durationSeconds: number
}

/**
 * The Boundary Commission: two neighbours render as one merged blob — the
 * shared border erased — and the player draws where it runs. Only the pair
 * travels the wire; both sides resolve the true line through `boundaryScene`
 * (lib/challenges/final-challenge.ts), so the snapshot never carries the
 * answer geometry.
 */
export interface BoundaryChallenge {
  _type: 'boundary-challenge'
  countries: [ISOCountryCode, ISOCountryCode]
  /** Max blended deviation from the true line that still passes, as a
   *  fraction of the merged pair's frame span. Scales by difficulty. */
  tolerance: number
}

/**
 * Tap the countries by their own names, one endonym per beat — a quota of
 * hits passes. Beat i asks for countries[i]; both sides derive the endonym
 * via countryEndonym() (lib/country.ts).
 */
export interface EndonymChallenge {
  _type: 'endonym-challenge'
  countries: ISOCountryCode[]
  quota: number
}

/**
 * Where the world's people went: each beat names a country of birth and the
 * player taps where most of those people now live. Beat i asks for
 * origins[i]; accepted[i] is that beat's answer key, widened by difficulty
 * (the leading destination on hard, the top two or three below it).
 *
 * The data counts the FOREIGN-BORN, never descent — see lib/migration.ts.
 * Both sides resolve corridors through that module.
 */
export interface DiasporaChallenge {
  _type: 'diaspora-challenge'
  origins: ISOCountryCode[]
  /** Destinations that answer each beat, leading one first. */
  accepted: ISOCountryCode[][]
  quota: number
}

/**
 * The Yearbook: a newspaper front page assembles — headlines from ONE year
 * land one at a time — and the player dials in the year. The answer never
 * rides the wire: both sides resolve it from the headline slugs through
 * `yearbookYear` (lib/challenges/final-challenge.ts).
 */
export interface YearbookChallenge {
  _type: 'yearbook-challenge'
  /** Event slugs sharing one year, shuffled so the famous anchor isn't always first. */
  headlines: string[]
  /** |guess − year| the verdict still accepts. */
  tolerance: number
  /** Drip cadence — one headline per interval; the tail interval is the commit window. */
  secondsPerHeadline: number
}

/**
 * World of Change: two satellite frames of one place decades apart crossfade,
 * and the player taps where on earth it is happening.
 *
 * The snapshot ships the STORY KEY and its frames, never the answer: the
 * accepted countries and the start decade are re-derived from `CHANGES[slug]`
 * by `changeAccepted`/`changeDecade`, which the dealer, the verdict and the
 * reveal all share. A `countries` field here would reach every socket in the
 * room and hand over the round.
 */
export interface ChangeChallenge {
  _type: 'change-challenge'
  slug: string
  /** Public paths of the two frames, earlier first. */
  frames: [string, string]
  /** Seconds one frame holds before crossfading to the other. */
  crossfadeSeconds: number
  /** Frame years, shown only where the difficulty allows the hint. */
  frameYears?: [number, number]
  /** Set when the difficulty also asks for the decade; absent = tap only. */
  decadeTolerance?: number
  /** Easy widens the accept set to the subject's land neighbours. Dealt rather
   *  than re-derived from difficulty, so the verdict needs no extra argument
   *  and both sides of the wire read the same flag. */
  acceptNeighbours?: boolean
}

export type ScalesAccessorKey = Extract<
  GroupChallengeAccessorId,
  'people.population' | 'economics.gdpTotal'
>

/**
 * Balance the scales: pick up to `maxPicks` countries whose combined stat
 * lands within ±`tolerance` of the target's — overshooting loses too.
 */
export interface ScalesChallenge {
  _type: 'scales-challenge'
  accessorId: ScalesAccessorKey
  target: ISOCountryCode
  maxPicks: number
  /** Allowed deviation as a fraction of the target (0.2 = within 20%). */
  tolerance: number
}
