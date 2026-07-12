import type { GroupChallengeAccessorId } from './group-challenge.type'
import type { LatLng } from '~~/lib/geo'
import type { ISOCountryCode } from '../geography.types'

/**
 * The newer group round formats. Like ranking and traversal rounds, every
 * player gets the same prompt and the earned points convert into board steps.
 */

/** Name as many of a country's land neighbours as you can before time runs out. */
export interface NeighbourBlitzChallenge {
  _type: 'neighbour-blitz-challenge'
  country: ISOCountryCode
  neighbours: ISOCountryCode[]
  durationSeconds: number
  maximumPoints: number
}

/** A country's outline draws itself in — buzz early for more points. */
export interface SilhouetteChallenge {
  _type: 'silhouette-challenge'
  country: ISOCountryCode
  durationSeconds: number
  maximumPoints: number
  /** Non-hard mode helper: the country's region, revealed in the final stretch
   *  of the countdown. Absent in hard mode. */
  region?: string
}

/** A mystery country: every map click answers with distance and direction. */
export interface HotColdChallenge {
  _type: 'hot-cold-challenge'
  country: ISOCountryCode
  maximumGuesses: number
  maximumPoints: number
}

/** Draw the country's outline from memory; scored against the real shape. */
export interface SketchChallenge {
  _type: 'sketch-challenge'
  country: ISOCountryCode
  maximumPoints: number
}

/**
 * A mystery country's stats flip over one by one — buzz in early for more
 * points. Clue values are looked up client-side from the shared dataset;
 * the payload only names which accessors reveal, in which order.
 */
export interface StatDetectiveChallenge {
  _type: 'stat-detective-challenge'
  country: ISOCountryCode
  /** Accessor ids revealed in order, one per interval. */
  clues: GroupChallengeAccessorId[]
  secondsPerClue: number
  maximumPoints: number
  /** Non-hard mode helpers. `region` is shown from the start; `photo` (a capital
   *  skyline or landmark) reveals as the final visual clue. Absent in hard mode. */
  region?: string
  photo?: string
}

/**
 * Three stat claims about one country — one value secretly belongs to a
 * different country. Spot the lie in one shot.
 */
export interface TwoTruthsChallenge {
  _type: 'two-truths-challenge'
  country: ISOCountryCode
  statements: {
    accessorId: GroupChallengeAccessorId
    /** The claimed value (the lie carries the decoy country's value). */
    amount: number
    unit: string
  }[]
  /** Index into `statements` of the falsified claim. */
  lieIndex: number
  /** Where the lie's value really comes from — shown in the reveal. */
  lieSource: ISOCountryCode
  maximumPoints: number
}

/** Physical-geography flavours (mirror of data/water.gen's WaterKind). */
export type WaterFeatureKind = 'sea' | 'lake' | 'river' | 'range' | 'desert' | 'plateau'

/**
 * Name the countries a physical feature touches: rivers (river run), seas
 * and lakes (shared shores), ranges/deserts/plateaus (highlands, hard mode).
 * Geometry stays client-side in data/water.gen — only the id travels.
 */
export interface WaterBlitzChallenge {
  _type: 'water-blitz-challenge'
  featureId: string
  featureName: string
  kind: WaterFeatureKind
  /** The answers: playable countries the feature touches or crosses. */
  countries: ISOCountryCode[]
  durationSeconds: number
  maximumPoints: number
}

/** A capital-city photo is shown — name the country (live guesses). */
export interface CapitalGuessChallenge {
  _type: 'capital-guess-challenge'
  country: ISOCountryCode
  /** The capital skyline photo (public path). */
  image: string
  /** Multiple-choice options (includes `country`) — offered outside hard mode,
   *  where players free-type instead. */
  options?: ISOCountryCode[]
  /** Picks allowed before the round resolves. Set only for the option variants;
   *  hard mode free-types without a cap and scores on the clock instead. */
  maximumGuesses?: number
  durationSeconds: number
  maximumPoints: number
}

/** Only a flag's colour swatches are shown — name the country (live guesses). */
export interface FlagPaletteChallenge {
  _type: 'flag-palette-challenge'
  country: ISOCountryCode
  /** The flag's colours as hex swatches, shown WITHOUT the flag. */
  swatches: string[]
  durationSeconds: number
  maximumPoints: number
  /** Non-hard mode helper: the country's region, revealed in the final third
   *  of the countdown. Absent in hard mode. */
  region?: string
}

/** A language is named — tap every country that speaks it (all-that-apply). */
export interface MotherTongueChallenge {
  _type: 'mother-tongue-challenge'
  language: string
  /** The answers: playable countries with this as an official language. */
  countries: ISOCountryCode[]
  durationSeconds: number
  maximumPoints: number
}

/** A body of water lights up — name it (typed, with suggestions). */
export interface NameWaterChallenge {
  _type: 'name-water-challenge'
  featureId: string
  featureName: string
  kind: WaterFeatureKind
  /** Shore countries, shown in the reveal/scorecard. */
  countries: ISOCountryCode[]
  /** Names allowed before the round resolves; each wrong one costs points. */
  maximumGuesses: number
  durationSeconds: number
  maximumPoints: number
}

/**
 * A de facto state: a flag nobody at the table has seen, a government almost
 * nobody recognizes. Place it on the map.
 *
 * Geometry, the flag SVG, and the 33-government recognition matrix all stay
 * client-side in data/recognition.gen.ts — only the id travels the wire.
 */
export interface GhostStateChallenge {
  _type: 'ghost-state-challenge'
  /** Key into RECOGNITION_TERRITORIES. */
  territoryId: string
  /** The state that claims it, per NE's "Claimed by X". This is the answer. */
  parent: ISOCountryCode
  durationSeconds: number
  maximumPoints: number
}

/**
 * A rock, a reef, a sandbank. Tap every country that claims it.
 *
 * For Bir Tawil, which no country on Earth claims, the correct play is to tap
 * nothing at all — so `claimants` is empty and an empty answer scores full.
 */
export interface NoMansLandChallenge {
  _type: 'no-mans-land-challenge'
  /** Key into RECOGNITION_TERRITORIES. */
  territoryId: string
  /** Administrator ∪ claimants. Empty only for Bir Tawil. */
  claimants: ISOCountryCode[]
  durationSeconds: number
  maximumPoints: number
}

/**
 * A photo of a landmark. Drop a pin on the world map where you think it is —
 * scored on how close you land, not on naming the country.
 *
 * The challenge carries the slug, not the coordinates, and scoring happens
 * server-side from the slug. That isn't a secret (LANDMARKS is bundled into the
 * client anyway, so a determined player can always read the answer out of it —
 * as they could for every other mode's country). It's so the *score* is the
 * server's to decide, like hot-cold's, rather than a number the client reports.
 */
export interface PinLandmarkChallenge {
  _type: 'pin-landmark-challenge'
  /** Key into LANDMARKS — the *photo* is the prompt, so no name is sent. */
  slug: string
  /** Public path of the landmark photo. */
  image: string
  /** Full marks inside this radius; zero beyond `zeroDistanceKm`. */
  perfectDistanceKm: number
  zeroDistanceKm: number
  durationSeconds: number
  maximumPoints: number
}

/**
 * Turn-based elimination — the only group mode where players act one at a
 * time. Name a country connected to the chain head (land border or strait,
 * lib/chain) that hasn't been used this chain. A miss or an expired shot
 * clock is elimination (minus `strikes`); a head with no open connection
 * traps the player to move. Dead-end with two or more standing deals a fresh
 * chain. `state` is server-owned and rides the game snapshot — clients render
 * from it and never advance it themselves.
 */
export interface BorderChainChallenge {
  _type: 'border-chain-challenge'
  turnSeconds: number
  maximumPoints: number
  /** Misses a player survives before elimination. 0 = sudden death. */
  strikes: number
  state: BorderChainState
}

export type BorderChainOutcome = 'wrong' | 'timeout' | 'trapped' | 'won'

export interface BorderChainState {
  /** Every chain walked this round, oldest first; the last is live. Each is
   *  seed-first and its last entry is the head. */
  chains: ISOCountryCode[][]
  /** Player ids in play order, fixed at the deal. */
  order: string[]
  /** Index into `order` of the player on the clock. */
  activeIndex: number
  /** Monotonic turn counter — timeout token and submit idempotency key. */
  turn: number
  /** Epoch ms the active turn expires; the client shot clock renders from it. */
  deadline: number
  /** Countries each player added to a chain — link count and scorecard both. */
  named: { [playerId: string]: ISOCountryCode[] }
  /** Strikes left, by player. */
  strikesLeft: { [playerId: string]: number }
  /** Elimination order, first out first. The winner never appears here. */
  eliminated: string[]
  /** How each player's round ended, for the reveal. */
  outcomes: { [playerId: string]: BorderChainOutcome }
  /** Open moves at each player's fatal miss — the reveal's teaching beat. */
  missedOuts: { [playerId: string]: ISOCountryCode[] }
  /** Who made the most recent move; credits the trap-setter in the reveal. */
  lastMoverId?: string
  /** trapped player → the opponent whose move dead-ended them. */
  trappedBy?: { [playerId: string]: string }
  /** Set when the round resolves; freezes the clock and starts the reveal. */
  finished?: boolean
}

/**
 * Multi-beat pin-drop contest over the World Heritage register: one site
 * photo per beat, everyone pins every photo. Points are the pin-landmark
 * distance taper plus a smaller relative slice for out-pinning the table
 * that beat. Like Border Chain, `state` is server-owned and rides the game
 * snapshot.
 */
export interface HeritageHuntChallenge {
  _type: 'heritage-hunt-challenge'
  /** Keys into HERITAGE, one per beat, in play order. */
  slugs: string[]
  beatSeconds: number
  perfectDistanceKm: number
  zeroDistanceKm: number
  /** Ceiling across ALL beats; each beat pays up to an equal share. */
  maximumPoints: number
  state: HeritageHuntState
}

export interface HeritagePin {
  pin: LatLng
  /** Settled when the beat resolves — absent while the beat is live. */
  distanceKm?: number
  scored?: number
}

export interface HeritageHuntState {
  /** Index into `slugs` of the live (or just-resolved) beat. */
  beat: number
  /** Epoch ms the live beat closes. */
  deadline: number
  /** Participants at the deal. */
  order: string[]
  /** Per player, per beat. */
  pins: { [playerId: string]: { [beat: number]: HeritagePin } }
  /** The live beat has resolved — clients show distances during the hold. */
  revealing?: boolean
  finished?: boolean
}

export type GroupModeChallenge =
  | BorderChainChallenge
  | HeritageHuntChallenge
  | NeighbourBlitzChallenge
  | SilhouetteChallenge
  | HotColdChallenge
  | SketchChallenge
  | StatDetectiveChallenge
  | TwoTruthsChallenge
  | WaterBlitzChallenge
  | NameWaterChallenge
  | MotherTongueChallenge
  | FlagPaletteChallenge
  | CapitalGuessChallenge
  | GhostStateChallenge
  | NoMansLandChallenge
  | PinLandmarkChallenge
