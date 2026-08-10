import type { GroupChallengeAccessorId } from './group-challenge.type'
import type { LatLng } from '~~/lib/geo'
import type { TrendMetricId } from '~~/lib/trends'
import type { ISOCountryCode } from '../geography.types'

/**
 * The newer group round formats. Like ranking and traversal rounds, every
 * player gets the same prompt and the earned points convert into board steps.
 */

/** A shipped audio clip, in both encodings the round serves. Opus covers
 *  Chrome/Firefox/Android; AAC covers Safari. */
export interface AudioClip {
  webm: string
  m4a: string
}

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

/** An anthem plays from the top — buzz early with the country for more points.
 *  Hints unlock as the clip runs, on every difficulty: a cold clip gives the
 *  ear nothing to reason from, so hard mode keeps the same ladder as the rest
 *  (Tongues too). Optional because a country may ship no lyric wall. */
export interface AnthemBuzzChallenge {
  _type: 'anthem-buzz-challenge'
  country: ISOCountryCode
  clip: AudioClip
  durationSeconds: number
  maximumPoints: number
  /** The country's region. */
  region?: string
  /** The flag's named colours, from `identity.simplifiedColors`. */
  swatches?: string[]
  /** First letter of the country's English name. */
  initial?: string
  /** Where the curated lyric wall lives, when this anthem has one. Fetched by
   *  the view rather than inlined — verses are long and most rounds never
   *  reach the beat that shows them. */
  lyricsUrl?: string
}

/** One line of a lyric wall, already split on its blanked spans: `text` shows,
 *  `blanked` masks until the reveal. Parsed from the file's `[[…]]` markup. */
export interface LyricSpan {
  text: string
  blanked?: boolean
}

/** A curated anthem lyric wall — see public/anthems/lyrics/readme-anthems.md. */
export interface AnthemLyrics {
  isoCode: ISOCountryCode
  title: string
  language: { code: string; name: string; script: string }
  sources: {
    local: { author?: string; year?: number; licence: string; note?: string }
    english: { author?: string; licence: string; note?: string }
  }
  verses: { local: string[]; english: string[] }[]
}

/** A speech clip plays — name a country where that language is official.
 *  Every country in `countries` is a correct answer, not just one. */
export interface TongueBuzzChallenge {
  _type: 'tongue-buzz-challenge'
  language: string
  /** Every sample the language has (up to three Common Voice voices), played
   *  in sequence with a breath between — three voices are more evidence than
   *  one, and the clips are seconds long where the round runs twenty. */
  clips: AudioClip[]
  /** The answers: playable countries with this as an official language.
   *  English is official in 55 of them, so the answer is a set by design. */
  countries: ISOCountryCode[]
  durationSeconds: number
  maximumPoints: number
  /** The region one speaker country sits in. Unlocks on the clock at every
   *  difficulty; absent only when the round has no speaker country. */
  region?: string
  /** How many playable countries have it official — "official in 8" narrows
   *  the field hard without naming any of them. */
  speakerCount?: number
  /** A couple of lines of the language WRITTEN, with its script named. Seeing
   *  Devanagari or Tamil narrows the field hard while naming nobody. `code` is
   *  the BCP-47 tag for the `lang` attribute — a display name is not valid
   *  there, and browsers pick fonts from it. */
  sample?: { code: string; script: string; lines: string[] }
  /** First letter of one speaker country's name, the last-stretch nudge. */
  initial?: string
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
  /** Non-hard helper: the country's region, shown from the start. Absent in
   *  hard mode. */
  region?: string
  /** A capital skyline or landmark, revealed as the final visual clue on every
   *  difficulty — absent only when the country has no photo. */
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
  durationSeconds: number
  maximumPoints: number
}

/** Physical-geography flavours (mirror of data/water.gen's WaterKind). */
export type WaterFeatureKind = 'ocean' | 'sea' | 'lake' | 'river' | 'range' | 'desert' | 'plateau'

/**
 * Name the countries a physical feature touches: rivers (river run), seas
 * and lakes (shared shores), ranges/deserts/plateaus (highlands).
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

/**
 * The flashpoint hint ladder, vague → sharp. Every rung is built from UCDP
 * fields that cannot name the answer: `type`, `incompatibility`, `episodes`
 * and the country-level metrics. The fields that DO name it — `name` (the
 * location string), `sideA` ("Government of <answer>") and `territory`
 * (Kashmir, Chechnya, Basque…) — are never read, so the copy is owner-free by
 * construction rather than by scrubbing.
 */
export type FlashpointHintKind = 'onset' | 'shape' | 'tempo' | 'scale' | 'bounds'

export interface FlashpointHint {
  kind: FlashpointHintKind
  /** Rendered copy. Absent on `bounds` — the view draws that one. */
  text?: string
  /** `bounds` only: the neighbours whose outlines sketch in around the dots.
   *  Never the answer's own shape — that would end the round. */
  neighbours?: ISOCountryCode[]
}

/**
 * A country's recorded conflict history draws itself onto the blanked map as
 * dots, era by era (UCDP GED). Name the country — the earlier, the more it's
 * worth. Dot geometry stays client-side in data/conflict-events.gen; only the
 * iso code travels (same accepted caveat as pin-landmark).
 */
export interface FlashpointChallenge {
  _type: 'flashpoint-challenge'
  country: ISOCountryCode
  /** Indices into CONFLICT_ERAS that will draw, oldest first. */
  eras: number[]
  secondsPerEra: number
  /** Multiple-choice options (includes `country`) — offered outside hard mode,
   *  where players free-type instead. */
  options?: ISOCountryCode[]
  /** Picks allowed before the round resolves. Set only with `options`. */
  maximumGuesses?: number
  /** The ladder, in reveal order, unlocking one per `secondsPerHint` once the
   *  last wave has landed. Hard mode — the only difficulty that deals this
   *  kind in auto — gets the full set; the opt-in option variants get just the
   *  vague rungs, since the flag table already narrows for them. Entries the
   *  data can't support are dropped, so a short list is normal. */
  hints?: FlashpointHint[]
  secondsPerHint: number
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

/**
 * The Star Chart — capital-guess's mirror, at map scale. The world goes
 * nocturne-dark and a few stars pulse at their capitals' TRUE coordinates:
 * type which city each one is. Capital-guess asks *which country owns this
 * skyline*; this asks *which city sits at this spot* — map-reading rather
 * than map-writing, and the one mode that tests name↔place.
 *
 * Only the ISO codes travel: both ends resolve the city, its spellings and
 * its coordinates through `capitalStar` (lib/capitals.ts), so the dealer's
 * geometry and the view's dots can never disagree. Ordered by obscurity —
 * star 1 is the gimme, the last one is the deep cut.
 */
export interface StarChartChallenge {
  _type: 'star-chart-challenge'
  stars: ISOCountryCode[]
  /** Non-hard aid: each star's capital initial, in `stars` order. Absent in
   *  hard mode, where the dark sky gives nothing but position. */
  initials?: string[]
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
/**
 * A country's foreign-born population, broken into the places those people
 * were born — the bar is the question, and the largest slice is the answer.
 *
 * The figures count residents born abroad, NOT ancestry: a country's largest
 * recognised minority is frequently home-born and invisible here (Sweden's
 * Finns, Tornedalians and Sámi all are). Copy says "born in", never
 * "minority" or "ethnic" — see lib/migration.ts.
 */
export interface CompositionChallenge {
  _type: 'composition-challenge'
  country: ISOCountryCode
  /** Origin shares of the whole foreign-born population, largest first. The
   *  head is the answer; the listed slices never sum to 1 — the remainder is
   *  the long tail of smaller origins. */
  slices: { isoCode: ISOCountryCode; share: number }[]
  /** Multiple choice outside hard mode, where players free-type instead. */
  options?: ISOCountryCode[]
  durationSeconds: number
  maximumPoints: number
}

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

export type ChainTurnOutcome = 'wrong' | 'timeout' | 'trapped' | 'won'
export type BorderChainOutcome = ChainTurnOutcome

/**
 * The turn-chain rounds' common contract: what the shared engine
 * (lib/events/server/chain-engine) advances, regardless of the link rule.
 * Border Chain and Atlas both satisfy it structurally.
 */
export interface ChainTurnChallenge<Trap = unknown> {
  turnSeconds: number
  maximumPoints: number
  strikes: number
  state: ChainTurnState<Trap>
}

export interface ChainTurnState<Trap = unknown> {
  /** The round opens on a briefing: a rules card each player must explicitly
   *  dismiss. No shot clock runs until everyone is ready (or the cap forces it). */
  briefing?: boolean
  /** Players who dismissed their briefing card. */
  ready: string[]
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
  outcomes: { [playerId: string]: ChainTurnOutcome }
  /** Open moves at each player's fatal miss — the reveal's teaching beat. */
  missedOuts: { [playerId: string]: ISOCountryCode[] }
  /** Who made the most recent move; credits the trap-setter in the reveal. */
  lastMoverId?: string
  /** trapped player → the opponent whose move dead-ended them. */
  trappedBy?: { [playerId: string]: string }
  /** The dead-end pause: the whole table holds on the trap before the fresh
   *  chain is dealt. Transient — set when the trap springs, cleared when the
   *  hold elapses. The durable record stays in `outcomes`/`trappedBy`. The
   *  payload is the mode's own proof shape. */
  trap?: Trap
  /** Set when the round resolves; freezes the clock and starts the reveal. */
  finished?: boolean
}

export type BorderChainState = ChainTurnState<BorderChainTrap>

/**
 * Atlas — Border Chain's letter-rule sibling (lib/atlas-chain): name a
 * country whose name starts where the head's ended. Same engine, same state,
 * different link rule; on hard any shared ending chains (`overlaps`) and
 * scoring is placement-only.
 */
export interface AtlasChallenge {
  _type: 'atlas-challenge'
  turnSeconds: number
  maximumPoints: number
  /** Misses a player survives before elimination. 0 = sudden death. */
  strikes: number
  /** Hard's rule: any k-letter shared ending chains, not just the tail. */
  overlaps: boolean
  state: ChainTurnState<AtlasTrap>
}

/** The letter dead-end's proof: what sealed the trapped player's turn. */
export interface AtlasTrap {
  /** The player who never got a move. */
  playerId: string
  /** The head whose ending nothing could chain from. */
  head: ISOCountryCode
  /** Who closed it — absent when they walked into their own dead end. */
  byPlayerId?: string
  /** The head's required opening letter. */
  letter: string
  /** Countries that would have chained, all already walked. */
  spent: ISOCountryCode[]
}

/** Why a connection of the dead head was shut. */
export type ClosedDoorReason = 'walked' | 'off-board'

export interface ClosedDoor {
  isoCode: ISOCountryCode
  reason: ClosedDoorReason
  /** 1-based step in the live chain the country was walked at; `walked` only. */
  step?: number
}

export interface BorderChainTrap {
  /** The player who never got a move. */
  playerId: string
  /** The head that had no way out. */
  head: ISOCountryCode
  /** Who closed it — absent when they walked into their own dead end. */
  byPlayerId?: string
  /** Every connection of `head`, with why it was shut. The proof. */
  doors: ClosedDoor[]
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

/**
 * Trend race: which of these countries' stat has risen/fallen the most since
 * `windowStartYear`? Everyone picks one card before the countdown ends; the
 * reveal flips every card to its sparkline, ranked.
 */
export interface TrendRaceChallenge {
  _type: 'trend-race-challenge'
  metric: TrendMetricId
  direction: 'risen' | 'fallen'
  /** Display order (shuffled once at deal, same for every player). */
  options: ISOCountryCode[]
  /** Options by |change| over the shared window, steepest first — standings[0]
   *  is the answer. Pinned at deal so scoring survives a data regeneration
   *  mid-game. */
  standings: ISOCountryCode[]
  /** Every option's series is compared from this year on. */
  windowStartYear: number
  durationSeconds: number
  maximumPoints: number
}

/**
 * Timeline: curated historical events (data/events.gen) are inserted one at a
 * time into a shared chronological line. Turn-based like Border Chain — the
 * active player slots the drawn card BETWEEN the cards already placed, never
 * naming a year. A correct slot banks points scaled by how crowded the line
 * already was; a wrong slot snaps the card to where it belongs, for everyone
 * to learn from. Every card ends up on the line either way, so placements get
 * genuinely harder all round. `state` is server-owned and rides the game
 * snapshot — clients render from it and never advance it themselves.
 */
export interface TimelineChallenge {
  _type: 'timeline-challenge'
  turnSeconds: number
  /** Seconds the post-placement story card holds before the next turn. */
  revealSeconds: number
  /** Ceiling across the round; each card pays a density-scaled share. */
  maximumPoints: number
  state: TimelineState
}

export interface TimelinePlacement {
  playerId: string
  /** EVENTS key of the card that was placed. */
  slug: string
  /** Slot index the player chose (0 = before the line's earliest card). */
  chosenSlot: number
  /** Where the card actually landed on the line they saw. */
  correctSlot: number
  correct: boolean
  /**
   * Slots the line offered when this card was played — how crowded the call
   * was. Stamped at placement because the line keeps growing after it; the
   * round-end scorer weighs a seat's own cards by it.
   */
  slotCount: number
  /** 'timeout' placements were never chosen — the card filed itself. */
  kind: 'placed' | 'timeout'
}

export interface TimelineState {
  /** EVENTS keys dealt this round: [0] opens the line, the rest draw in order. */
  deck: string[]
  /** Cards locked into the line so far, in chronological order. */
  placed: string[]
  /** Index into `deck` of the card being placed; deck.length = exhausted. */
  card: number
  /** Player ids in play order, fixed at the deal. */
  order: string[]
  /** Index into `order` of the player on the clock. */
  activeIndex: number
  /** Monotonic turn counter — timeout token and submit idempotency key. */
  turn: number
  /** Epoch ms the active turn (or the reveal hold) expires. */
  deadline: number
  /** Every resolved placement, oldest first — the round's teaching record. */
  placements: TimelinePlacement[]
  /** A placement just resolved — clients hold on its story card. */
  revealing?: boolean
  /** Set when the deck runs out; freezes the clock and starts the reveal. */
  finished?: boolean
}

/**
 * Ghosts of empires, in two beats. Beat 1: a dead polity's extent sweeps the
 * blanked map through its keyframe years — buzz early with its name for more.
 * Beat 2: the sweep freezes at `peakYear` and the overlay lifts — tap the
 * modern countries whose heartlands it held. Reveal: extent over modern
 * borders, capitals starred, partial holdings confessed.
 *
 * Keyframe geometry stays client-side (lazy import keyed by `empireId`); only
 * ids, years and member lists travel. Members are pinned at the deal so a
 * data regeneration mid-game can't shift the answers. `empireId` is openly
 * the beat-1 answer — the silhouette caveat: the client UI is trusted with
 * the answer, the SCORE is not (beat 1 is clamped, beat 2 derived server-side).
 */
export interface EmpireChallenge {
  _type: 'empire-challenge'
  /** Key into EMPIRES (data/empires.gen). */
  empireId: string
  /** Years the extent animates through, oldest first, subsampled per
   *  difficulty; spans the full arc rise → peak → decline. Always includes
   *  `peakYear`, which usually sits mid-arc. */
  keyframeYears: number[]
  /** Beat 2 freezes here — the greatest extent. */
  peakYear: number
  /** Beat 1's clock: the sweep plus the buzz window. Named durationSeconds so
   *  useGroupChallenge's shared countdown picks it up. */
  durationSeconds: number
  /** Beat 2's clock: tapping the modern countries inside the extent. */
  tapSeconds: number
  /** Beat 2's answers: modern countries whose core lay inside the peak
   *  extent. Partial holdings are deliberately not here. */
  members: ISOCountryCode[]
  /** Countries the empire only partly held — excluded from play, confessed
   *  at the reveal, forgiven (never scored either way) if tapped. */
  partialMembers: ISOCountryCode[]
  /** Multiple-choice empire ids (includes `empireId`) — offered outside hard
   *  mode with each option's own historical flag; hard mode free-types
   *  against the full register instead. */
  options?: string[]
  maximumPoints: number
}

/**
 * Manhunt: one player is the Despot, secretly fleeing country-to-country;
 * everyone knows WHO, not WHERE. Each turn has two beats — the despot makes a
 * forced hop (ground = border/strait, or a limited announced sea passage
 * across a shared named sea), then every detective drops one marker after a
 * server-picked clue that bisects the live candidate set. A marker on the
 * despot's country captures them.
 *
 * Unlike every other mode, the answer must NOT ride the game snapshot: the
 * trail, live markers and authoritative candidate set live in a separate
 * redis blob (lib/manhunt manhuntKey) that never enters a broadcast. `state`
 * carries only what the whole table may see; the trail goes public only in
 * `outcome` at round end. The despot's own client learns its position over a
 * targeted socket emit ('manhunt-position').
 */
export interface ManhuntChallenge {
  _type: 'manhunt-challenge'
  /** Hops the despot must survive to escape. */
  turnCount: number
  moveSeconds: number
  huntSeconds: number
  maximumPoints: number
  /** WHO the despot is, is public by design — only WHERE is hidden. */
  despotId: string
  /** Sea passage charges the despot starts with. */
  seaPassages: number
  /** Subpoena tokens each detective starts with: spending one forces a true
   *  engine-graded clue onto a topic of THEIR choosing, mid hunt beat. */
  subpoenas: number
  /** Easy/normal paint the candidate set on the map; hard shows clue text
   *  only. A difficulty gate, not a security boundary — the set is derivable
   *  from the public clues and the graph. */
  showCandidates: boolean
  state: ManhuntState
}

export type ManhuntMoveKind = 'ground' | 'sea'

export interface ManhuntClue {
  /** 1-based hop the clue was emitted on. */
  hop: number
  kind: 'threshold' | 'region' | 'language' | 'membership' | 'flag-colors'
  /** Server-composed, render-ready intel line. */
  text: string
  /** Threshold clues name their accessor — the intel card wears the stat's
   *  own emblem (StatTopicIcon), like Stat Detective's dossier. */
  accessorId?: GroupChallengeAccessorId
  /** Categorical clues name a glyph key instead (topic/relations/department). */
  topic?: string
  /** Threshold clues carry their cut, structured — the intel card plots the
   *  field with the rule drawn where the clue slices it. */
  threshold?: number
  /** Which side of the cut survives. */
  above?: boolean
  /** Set when a detective subpoenaed this clue rather than the engine
   *  dealing it — credits the asker in the rail and the reveal. */
  askedBy?: string
}

export interface ManhuntState {
  /** The round opens on a briefing: role cards each player must explicitly
   *  dismiss. No clock runs until everyone is ready (or the cap forces it). */
  briefing?: boolean
  /** Players who dismissed their briefing card. */
  ready: string[]
  /** Monotonic beat counter — timeout token and submit idempotency key.
   *  Increments on EVERY beat transition, mirroring border chain's `turn`. */
  turn: number
  /** 1..turnCount — which budgeted hop we're in. */
  hop: number
  beat: 'move' | 'hunt'
  /** Epoch ms the live beat expires; client shot clocks render from it. */
  deadline: number
  /** Everyone but the despot, fixed at the deal. */
  detectives: string[]
  /** Public clue history, oldest first. */
  clues: ManhuntClue[]
  /** Movement-kind log — sea passages are announced, ground hops are not. */
  moves: { hop: number; kind: ManhuntMoveKind }[]
  seaPassagesLeft: number
  /** Subpoena tokens remaining, by detective. */
  subpoenasLeft: { [playerId: string]: number }
  /** Clue-consistent set snapshot for the live hunt beat; [] on hard. */
  candidates: ISOCountryCode[]
  /** RESOLVED turns' markers, attributed — public only once the beat is
   *  over and the information is spent. Live markers stay in the secret. */
  dragnets: { hop: number; markers: { [playerId: string]: ISOCountryCode } }[]
  /** Detectives who locked a marker this hunt beat — presence, never where. */
  committed: string[]
  /** The trail becomes public ONLY here, at round end. */
  outcome?:
    | {
        kind: 'captured'
        hop: number
        capturerIds: string[]
        country: ISOCountryCode
        trail: ISOCountryCode[]
      }
    | { kind: 'escaped'; country: ISOCountryCode; trail: ISOCountryCode[] }
  /** Set when the round resolves; freezes the clock and starts the reveal. */
  finished?: boolean
}

/** Unique or Bust's category board — each id names a register in lib/unique-or-bust. */
export type UniqueCategoryId = 'country' | 'capital' | 'river' | 'megacity'

/**
 * Unique or Bust: a letter and a category board drop; everyone fills the board
 * on one clock. At reveal, a correct answer held by exactly ONE player pays its
 * category's share — duplicates cancel each other to zero. Answers must NOT
 * ride the game snapshot while the round is live (seeing a rival's word lets
 * you dodge the duplicate), so they live in a redis blob (lib/unique-or-bust
 * uniqueKey) until the collision grid lands in `state.results`. Like the other
 * clocked modes, `state` is server-owned and rides the game snapshot.
 */
export interface UniqueOrBustChallenge {
  _type: 'unique-or-bust-challenge'
  /** Display letter, uppercase. Every answer must start with it. */
  letter: string
  /** The board, in slot order — fixed per deal. */
  categories: UniqueCategoryId[]
  durationSeconds: number
  maximumPoints: number
  state: UniqueOrBustState
}

/** One distinct answer in the reveal's collision grid. */
export interface UniqueBoardCell {
  /** Collision key: the normalized answer name (uniqueNameKey). */
  key: string
  /** Register entry id of the first locker's pick — for `country` and
   *  `capital` cells this is the ISO code, so reveals can wear the flag. */
  id: string
  /** Display name as the first locker's register spells it. */
  name: string
  /** Everyone who locked this answer — more than one cancels the cell. */
  holders: string[]
  /** What each holder banked for the cell (0 when cancelled). */
  scored: number
}

export interface UniqueOrBustState {
  /** The round opens on a rules card each player must explicitly dismiss.
   *  No clock runs until everyone is ready (or the cap forces it). */
  briefing?: boolean
  /** Players who dismissed their briefing card. */
  ready: string[]
  /** Epoch ms the writing window closes; 0 while the briefing holds. */
  deadline: number
  /** Participants at the deal. */
  order: string[]
  /** Slots each player has locked — presence only; the words stay in the
   *  round's secret blob until the reveal. */
  locked: { [playerId: string]: UniqueCategoryId[] }
  /** The collision grid, filled at resolve — the answers' first and only
   *  appearance in a snapshot. */
  results?: { [category in UniqueCategoryId]?: UniqueBoardCell[] }
  /** Set when the round resolves; freezes the clock and starts the reveal. */
  finished?: boolean
}

export type GroupModeChallenge =
  | EmpireChallenge
  | BorderChainChallenge
  | AtlasChallenge
  | ManhuntChallenge
  | TimelineChallenge
  | HeritageHuntChallenge
  | NeighbourBlitzChallenge
  | SilhouetteChallenge
  | AnthemBuzzChallenge
  | TongueBuzzChallenge
  | HotColdChallenge
  | SketchChallenge
  | StatDetectiveChallenge
  | TwoTruthsChallenge
  | WaterBlitzChallenge
  | NameWaterChallenge
  | MotherTongueChallenge
  | FlagPaletteChallenge
  | CapitalGuessChallenge
  | StarChartChallenge
  | FlashpointChallenge
  | CompositionChallenge
  | GhostStateChallenge
  | NoMansLandChallenge
  | PinLandmarkChallenge
  | TrendRaceChallenge
  | UniqueOrBustChallenge
