import { clamp01 } from '~~/lib/number'
import { isChallengeOfType } from '~~/lib/rounds'
import type { IndividualChallengeVariant } from '~~/types/challenges/individual-challenge.type'
import {
  roundChallengeKind,
  type RoundChallenge,
  type RoundChallengeKind,
} from '~~/types/challenges/traversal-challenge.type'
import type { PlayerPhase } from '~~/types/player.type'

/**
 * The one home for a round's rhythm: which side runs each kind's clock, how
 * long its beats hold, and the caps that guarantee every seat always has a
 * server-owned exit. Isomorphic on purpose — the server arms its timers and
 * the views pace their choreography from the SAME numbers, so the two sides
 * can never drift.
 */

/** Post-round basking time before an engine round settles into scores. */
export const REVEAL_HOLD_MS = 6000
/** Buzzer grace so an on-the-wire submit beats its own turn's timeout. */
export const TIMEOUT_SLACK_MS = 350
/** The round interstitial stands in front of a clock that is already running,
 *  so the server hands that time back. Must cover INTERSTITIAL_TOTAL_MS —
 *  pinned in round-beats.test.ts, since a card lengthened without this is play
 *  time taken from the table. */
export const FIRST_TURN_GRACE_MS = 6000
/** How long a briefing (the click-away rules cards manhunt and unique-or-bust
 *  open on) may hold before the round starts regardless. */
export const BRIEFING_CAP_MS = 60000
/** How long an audio round may sit on its play button before the settle
 *  backstop stops waiting. The clip only starts when the player taps — iOS
 *  refuses autoplay outright — so the window is `durationSeconds` measured
 *  FROM that tap, and the server budget covers the wait as well as the play.
 *  Bounded like a briefing cap: a seat that never taps is still swept. Kept
 *  distinct from BRIEFING_CAP_MS on purpose — a briefing is a beat the SERVER
 *  knows about (`state.briefing` rides the snapshot), a play gate is local. */
export const PLAY_GATE_CAP_MS = 15000
/** How long a round may wait on a rules card the player must dismiss before a
 *  LOCAL clock starts (Terra Incognita's ready card). The same shape as the
 *  audio play gate — a local wait the server budgets for — but sized for
 *  reading a card with a worked example rather than tapping a button, and the
 *  view force-starts the round at this cap so no seat can outrun the budget. */
export const READY_GATE_CAP_MS = 45000
/** Border Chain's dead-end hold: long enough for the table to read the closed
 *  doors and see that the trapped player truly had no move. The client's
 *  overlay reads this too — one beat, one constant. */
export const TRAP_HOLD_MS = 5500
/**
 * Government's beat verdict: how long a resolved beat holds before the next
 * question replaces it.
 *
 * Without it the score and the new beat land in ONE save, so a player sees
 * "+3 and now beat 2" together and never learns whether they were right. Long
 * enough to read a wash and a number, short enough that a three-beat round
 * does not turn into three interstitials.
 */
export const BEAT_VERDICT_HOLD_MS = 2600
/** Clean Sweep's bench: how long a wrong name locks a seat out of the board.
 *  The mode's whole penalty — in a contested pool, seconds in front of a
 *  draining board are the only scarce thing, so the cost is tempo rather than
 *  a docked point. Isomorphic like its neighbours: the server STAMPS
 *  `state.benched[playerId]` with it and the view counts the same number down,
 *  so there is no timer to arm, lose or re-arm. */
export const SWEEP_LOCKOUT_MS = 3500

/** Phases that no longer take part in a round's movement. */
export const SETTLED_PHASES: readonly PlayerPhase[] = ['movement-summary', 'victory', 'kicked']

/** Phases that live INSIDE the round (or before the game): never walkable.
 *  Walking one ejects the seat to 'movement-summary' mid-round — the reveal
 *  flips seats to 'group-challenge' with `moves: []`, and a watchdog tick
 *  armed before the reveal (up to 8s earlier) lands exactly there. */
export const ROUND_BOUND_PHASES: readonly PlayerPhase[] = [
  'naming',
  'waiting-for-game',
  'tutorial',
  'group-challenge',
]

/** Phases a round SETTLE may force-grade and advance — the seats actually in
 *  (or gated behind the rules card of) the live round. Deliberately narrower
 *  than ROUND_BOUND_PHASES: a late joiner still typing their name is
 *  walk-exempt but was never dealt into the round, and banking it a zero
 *  would hand it a scorecard for a round it never saw. */
export const ROUND_SETTLE_PHASES: readonly PlayerPhase[] = ['tutorial', 'group-challenge']

/**
 * Master switch for the seam caps below — the timers that force-advance a
 * seat parked OUTSIDE a round's own clock (an unread scorecard, an open
 * tutorial, an unanswered gate). The round clocks themselves are not gated:
 * a timed round always settles.
 */
export const SERVER_CONTROLLED_CAPS = true

/** A scorecard left unread force-walks its seat. */
export const GROUP_SCORES_CAP_MS = 90000
/**
 * The walk protocol's leads: EVERY walk (client- or server-initiated)
 * announces itself — phase 'moving' rides its own snapshot — then lets the
 * lead pass before the first step, so the stage is on screen and the steps
 * play in view. A turn-OPENING walk (walkIntro) leads long enough for the
 * "On the move!" beat to fit inside it; a between-gates resume leads only a
 * view transition — the gate verdict the player just watched IS the
 * announcement.
 */
export const WALK_LEAD_MS = 2600
export const WALK_RESUME_LEAD_MS = 900
/** Snapshot delivery grace inside the lead, so a slow wire can't push the
 *  announcement beat past the first step. */
export const WALK_ANNOUNCE_WIRE_GRACE_MS = 350
/** Minimum slack between the announcement beat and the first step. The lead
 *  used to sit EXACTLY on the interstitial total + wire grace, so any retune
 *  of the card pushed the pawn's first hop behind it with nothing to catch it.
 *  Enforced in round-beats.test.ts. */
export const WALK_LEAD_HEADROOM_MS = 250

/** The "On the move!" interstitial, sized to FIT INSIDE the walk lead by
 *  construction (enforced in round-beats.test.ts): the reading hold plus
 *  the intro/stagger/outro choreography budget.
 *
 *  The overhead is a MEASUREMENT of useIntroBeat's timeline (shell fade →
 *  pieces stagger → rule draw → fade-out), not a wish — it was 1650 against a
 *  real 1350, so the lead carried 300ms of budget the card never used. Retune
 *  the timeline and this number moves with it. */
export const MOVE_INTERSTITIAL_HOLD_MS = 900
export const MOVE_INTERSTITIAL_OVERHEAD_MS = 1040
export const MOVE_INTERSTITIAL_TOTAL_MS = MOVE_INTERSTITIAL_HOLD_MS + MOVE_INTERSTITIAL_OVERHEAD_MS

/** The challenge card's hold. Longer than the move card's: it carries rules a
 *  slow reader has to finish, and a tap skips it. */
export const INTERSTITIAL_HOLD_MS = 4500
/** Hold + the beat's own fade/stagger/rule choreography. */
export const INTERSTITIAL_TOTAL_MS = INTERSTITIAL_HOLD_MS + MOVE_INTERSTITIAL_OVERHEAD_MS

/**
 * The camera's framing sweep onto the walking pawn, sized to land INSIDE the
 * announce lead (enforced in round-beats.test.ts). A turn-OPENING walk sweeps
 * behind the "On the move!" beat, so the pawn is already framed when the
 * interstitial lifts; a between-gates resume re-frames inside the short lead
 * the gate verdict earned. Without a sweep per announce the persistent stage
 * never re-frames at all — `follow` is a pure translation and keeps whatever
 * shot the camera has held all game.
 */
export const WALK_FRAME_MS = 1200
export const WALK_RESUME_FRAME_MS = 700

/**
 * The gate punch-in: the camera's hard push onto a pawn that just slammed into
 * a challenge tile. Deliberately far shorter than a walk's framing sweep —
 * this is a cut, not a glide, and at WALK_FRAME_MS on the standard cross ease
 * it read as the camera drifting rather than reacting. It plays WITH the knock
 * and the ripple inside the arrival hold, never after them.
 */
export const GATE_PUNCH_MS = 420

/** One tile's hop tween; catch-up tiers derive from it (use-pawn-movement). */
export const PAWN_HOP_MS = 380
/** How long a pawn rests with an empty queue before it counts as LANDED
 *  (squash + ripple) — server steps arrive a cadence apart, so the queue is
 *  briefly empty between every step. */
export const LANDING_SETTLE_MS = 650
/** The challenge-tile alert ripple's sweep.
 *  Sized to the part of the sweep that is actually VISIBLE: the contour shader
 *  fades the annulus itself (`1 - smoothstep(0.4, 1, uRippleProgress)`), so it
 *  is transparent at progress 1 and already faint past 0.4. At 1400 with a
 *  power1.out ease the last ~600ms drew an invisible ring expanding away from
 *  the pawn — and since the arrival hold is DERIVED from this, the board sat
 *  on a spent shader before every gate. */
export const ARRIVAL_RIPPLE_MS = 800
/** Slack on the arrival flourish before the view may take the stage away. */
export const ARRIVAL_PAD_MS = 170
/** How long the board holds after a gate arrival before the challenge view
 *  swaps in — the full arrival flourish, composed so it can't drift. */
export const BOARD_TO_CHALLENGE_HOLD_MS =
  PAWN_HOP_MS + LANDING_SETTLE_MS + ARRIVAL_RIPPLE_MS + ARRIVAL_PAD_MS
/** How long the dispatcher parks a DIRECT challenge→challenge resolution
 *  before re-reading the live view — no legitimate phase sequence produces
 *  one (a board or scores beat always intervenes), so it is a snapshot-burst
 *  transient that self-heals, and this is the verify window. */
export const CHALLENGE_SWAP_VERIFY_MS = 250

/** One tile per tick — the walk cadence. 500 read as trudging once every
 *  step became live and visible; the hop (PAWN_HOP_MS) must stay under it. */
export const STEP_INTERVAL_MS = 400
/** How much earlier than the cadence a step tick may land before it reads
 *  as a duplicate chain's tick (the single-stepper latch in
 *  enter-movement-phase). */
export const STEP_LATCH_SLACK_MS = 150
/** Staged round → reveal settle pause. */
export const NEW_ROUND_PAUSE_MS = 2000
/** A round-1 tutorial card left open force-closes. Also bounds how long the
 *  round-1 classic clock can wait on one AFK reader (the last-close stamp). */
export const TUTORIAL_CAP_MS = 90000
/** An unanswered stop-tile gate forfeits. */
export const INDIVIDUAL_GATE_CAP_MS = 90000
/** An unanswered final-gauntlet question burns its miss. */
export const FINAL_QUESTION_CAP_MS = 90000
/** A gate's result beat: how long the seat basks in its verdict before the
 *  walk resumes. The gate shell reads it too — the beat normally ends by the
 *  view unmounting (the seat walks on), but a leap that lands the pawn at the
 *  NEXT gate's stop tile re-enters the same phase with nothing to walk, so the
 *  shell has to time the beat's end itself. One beat, one constant. */
export const GATE_RESULT_HOLD_MS = 5000
/** Wire grace on the shell's copy of the beat, so the server's own resume —
 *  which unmounts the view in the ordinary walked case — lands first and the
 *  shell's fallback stays a fallback. */
export const GATE_RESULT_WIRE_GRACE_MS = 750
/** A browsable gate reveal (Chronicle's storied record): the player reads at
 *  their own pace and leaves by an explicit Continue; this cap is the AFK
 *  backstop, not the beat. The beat is SOLO — a long cap delays nobody else. */
export const GATE_BROWSE_CAP_MS = 45000
/** The variants whose reveal is worth reading, not just basking in. ONE home
 *  for the decision: the server's result hold, the shell's fallback timer and
 *  the view's Continue button all read it here — a client-only or server-only
 *  entry would ship a Continue that does nothing, or a hold nobody can end. */
const GATE_BROWSE_VARIANTS = new Set<IndividualChallengeVariant>(['chronicle'])
export const isBrowsableGateVariant = (variant: IndividualChallengeVariant | undefined): boolean =>
  !!variant && GATE_BROWSE_VARIANTS.has(variant)
/** The result beat's length for a gate variant — the browse cap where the
 *  reveal is browsable, the shared verdict bask everywhere else. */
export const gateResultHoldMsFor = (variant: IndividualChallengeVariant | undefined): number =>
  isBrowsableGateVariant(variant) ? GATE_BROWSE_CAP_MS : GATE_RESULT_HOLD_MS
/** The shell's fallback end of the variant-aware beat — DERIVED, never an
 *  ad-hoc sum at a call site. */
export const gateResultFallbackMsFor = (variant: IndividualChallengeVariant | undefined): number =>
  gateResultHoldMsFor(variant) + GATE_RESULT_WIRE_GRACE_MS
/** The no-variant fallback, kept as the named shape recovery paths reach for
 *  when the answered gate's variant is unknowable. */
export const GATE_RESULT_FALLBACK_MS = gateResultFallbackMsFor(undefined)
/** The browsable Continue's countdown appears inside this final stretch,
 *  seconds — ONE hint window for every browse button (trend-race, the
 *  timeline chronicle, the gate record), so they flip in step. */
export const BROWSE_HINT_S = 10
/** The timeline chronicle's browse allowance — named so the harness and the
 *  protocol tests read the SAME number the spec row carries, never a private
 *  fallback that would keep tests green while the engine drifted. */
export const TIMELINE_BROWSE_CAP_MS = 60000
/** The mid-gauntlet reveal (clearFinalResultBeat): the teachable scorecards —
 *  rankings, lessons, the fact you missed — need longer on screen than a
 *  gate's verdict pill. The knockout keeps the shorter gate hold: its exit
 *  line says everything. */
export const FINAL_REVEAL_HOLD_MS = 8000

/** How long a gauntlet beat stands before it prunes itself. DERIVED from the
 *  reveal it narrates, plus slack for the wire: a beat that expired mid-hold
 *  would blank a watcher's verdict while the runner still sees theirs, which
 *  is the exact desync this whole event exists to close. */
export const FINAL_BEAT_TTL_MS = FINAL_REVEAL_HOLD_MS + 2000

/** Ceiling for classic kinds that carry no clock of their own (a ranking
 *  being dragged, a sketch being drawn) — only armed under the cap switch. */
export const UNTIMED_CLASSIC_CAP_SECONDS = 180
/** Settle grace behind a classic round's deadline + reveal budget, so a live
 *  client's own timeout submit always wins the race against the backstop —
 *  generous, because a throttled-but-alive tab's intervals drift late and a
 *  browse cap's 60 one-second ticks compound that drift. */
export const CLASSIC_SETTLE_SLACK_MS = 8000

/** Empire's beat-1 → beat-2 memorize hold (the sweep freezing at the peak). */
export const EMPIRE_INTERBEAT_HOLD_MS = 1800

/** The bot brain's cadence: how often a game with brain-played seats re-reads
 *  state to see if any of them owes an action. Coarse on purpose — per-act
 *  timing rides the rolled act-at stamps, not the tick. */
export const BOT_PUMP_MS = 1500
/** A bot "reads" its rules card this long before closing it. */
export const BOT_TUTORIAL_MS = 5000
export const BOT_TUTORIAL_JITTER_MS = 2000
/** A bot "reads" its scorecard this long before walking on. */
export const BOT_SCORES_MS = 6000
export const BOT_SCORES_JITTER_MS = 2500
/** A turn-engine bot's think beat before its move, plus up to this much
 *  jitter — near the harness chain-simulator's rival beat, slower than a
 *  buzzer so a human never feels raced by a machine. */
export const BOT_TURN_THINK_MS = 2200
export const BOT_TURN_JITTER_MS = 2600
/** A gauntlet question reads longer than a turn; the extra sits here, not
 *  as a bare literal in the engine. */
export const BOT_FINAL_EXTRA_MS = 2000
/** A manhunt marker weighs a candidate map — slower than a plain turn. */
export const BOT_MARKER_EXTRA_MS = 1500
/** A bot "reads" a briefing card this long before its ready. */
export const BOT_READY_MS = 3500
export const BOT_READY_JITTER_MS = 2500
/** A bot "reads" a browsable reveal (the timeline chronicle) this long. */
export const BOT_BROWSE_ACK_MS = 9000
export const BOT_BROWSE_ACK_JITTER_MS = 6000
/** The classic think on a round with no server clock (caps off in dev). */
export const BOT_UNTIMED_THINK_MS = 15000
export const BOT_UNTIMED_THINK_JITTER_MS = 20000
/** Unique or Bust: the first category lands after the base, each further
 *  category a stagger later — one blank at a time, like a person. */
export const BOT_UNIQUE_BASE_MS = 4000
export const BOT_UNIQUE_STAGGER_MS = 6000
export const BOT_UNIQUE_JITTER_MS = 5000
/** Clean Sweep's claim cadence: base + (1 − share) × spread per claim. */
export const BOT_SWEEP_BASE_MS = 1200
export const BOT_SWEEP_SPREAD_MS = 3500
export const BOT_SWEEP_JITTER_MS = 1800
/** Where in a classic round's play window a bot's answer lands, as fractions
 *  of the budget — never first-instant, never at the buzzer. */
export const BOT_CLASSIC_WINDOW: readonly [number, number] = [0.3, 0.75]
/** Where a retiring bot may actually leave: past its round, not yet (or no
 *  longer) owing the table a turn. Beside the other phase buckets so the
 *  escapability matrix pins it when a new PlayerPhase lands. */
export const RETIREMENT_PHASES: readonly PlayerPhase[] = [
  'group-scores',
  'moving',
  'movement-summary',
]

/** A vanished socket must stay gone this long mid-race before the autopilot
 *  takes the seat over — a refresh or a tunnel must not trigger a takeover. */
export const AUTOPILOT_GRACE_MS = 25000
/** The returning player's catch-up interstitial hold. */
export const AUTOPILOT_RECLAIM_HOLD_MS = 6000

/**
 * Flashpoint's two schedules. The dot waves land first, then the hint ladder
 * unlocks one rung at a time — so the round's length is a function of BOTH,
 * and `playSeconds` below is what reconciles them with the dealer. They live
 * here rather than in the dealer because the view paces its chips off the same
 * numbers: a second copy in `challenges.ts` would drift the moment either is
 * tuned.
 */
export const FLASHPOINT_SECONDS_PER_ERA = 4
/** The breath between the last wave and the first hint — the dots get first
 *  refusal before the words step in. */
export const FLASHPOINT_HINT_LEAD_SECONDS = 3
/** Five rungs is the ladder's real length for all but a handful of countries,
 *  so the gap is sized against five, not four: at 6s a full round ran 55s. */
export const FLASHPOINT_SECONDS_PER_HINT = 5
/** Thinking time after the last rung lands. */
export const FLASHPOINT_TAIL_SECONDS = 6

/** The one length formula for a flashpoint round, shared by the dealer (which
 *  stamps `durationSeconds`) and `playSeconds` (which the server clocks). */
export const flashpointSeconds = (eras: number, hints: number): number =>
  eras * FLASHPOINT_SECONDS_PER_ERA +
  FLASHPOINT_HINT_LEAD_SECONDS +
  hints * FLASHPOINT_SECONDS_PER_HINT +
  FLASHPOINT_TAIL_SECONDS

/** One layer of a city plan's ladder. Long enough to read the grain before the
 *  next class lands on top of it. */
export const GROUND_PLAN_SECONDS_PER_LAYER = 8

/** The breath between the last layer and the first hint — the plan gets first
 *  refusal before the words step in. */
export const GROUND_PLAN_HINT_LEAD_SECONDS = 3

/** How long each hint holds the floor before the next one lands. */
export const GROUND_PLAN_SECONDS_PER_HINT = 5

/** Thinking time after the last rung, before the round settles. */
export const GROUND_PLAN_TAIL_SECONDS = 6

/** The one length formula for a ground-plan round, shared by the dealer (which
 *  stamps `durationSeconds`) and `playSeconds` (which the server clocks). */
export const groundPlanSeconds = (layers: number, hints = 0): number =>
  layers * GROUND_PLAN_SECONDS_PER_LAYER +
  (hints ? GROUND_PLAN_HINT_LEAD_SECONDS + hints * GROUND_PLAN_SECONDS_PER_HINT : 0) +
  GROUND_PLAN_TAIL_SECONDS

export interface RoundBeatSpec {
  /** Who runs this kind's server clock — the ONE home for the classic/engine
   *  taxonomy; nothing else may hand-roll a list of engine `_type`s. */
  owner: 'classic' | 'engine'
  /** Play length for kinds whose clock is NOT the challenge's own
   *  `durationSeconds` (a derived multi-beat total, say). Undefined result =
   *  fall through to `durationSeconds` when the challenge carries one, else
   *  untimed. */
  playSeconds?: (challenge: RoundChallenge) => number | undefined
  /** SERVER-paced post-answer reveal beat: the seat submits at the answer,
   *  the view plays its (display-only) reveal, and the server flips to the
   *  scorecard after exactly this hold. 0 = immediate flip. */
  revealHoldMs: number
  /** PLAYER-paced reveal cap (trend-race's browsable outcome): the player's
   *  own submit is the exit and flips inline; this cap is consumed ONLY by
   *  the settle backstop's budget, never as a post-submit park. */
  browseCapMs?: number
  /** Click-away rules card before play (manhunt/unique pattern); capped. */
  briefingCapMs?: number
  /** The play window opens on a LOCAL gesture, not at the round reveal: the
   *  audio rounds wait, silent and stopped, for the play tap iOS requires.
   *  Two consequences, both owned here:
   *   • the client's countdown is a pure local decrement from that tap —
   *     `round.deadline` measures a window that had not opened yet, so
   *     pinning the clock to it burns the player's wait;
   *   • the server's settle budget widens by this allowance, so a seat still
   *     legitimately mid-clip is never force-banked a zero.
   *  Bounded on purpose: a seat that never taps settles at deadline + this.
   *  A gated kind whose start needs a real gesture (audio) must stay OUT of
   *  `KIND_MOUNTABLE` (lib/spectate.ts) — watch-mode ambience calls `begin()`
   *  off the round number, and no spectator ever taps the play button a gated
   *  clock waits for. A gate that only holds a rules card (Terra Incognita)
   *  stays mountable: the booth skips the card and the ambience clock IS the
   *  round. */
  playGateMs?: number
  // Future beats (a twist, a bonus, a second guess window) are added HERE as
  // named optional fields — never as a view-local timer or a per-engine
  // constant. Every beat needs a server-owned exit and a rearm branch.
}

const engine = (spec: Partial<Omit<RoundBeatSpec, 'owner'>> = {}) =>
  ({ owner: 'engine', revealHoldMs: REVEAL_HOLD_MS, ...spec }) satisfies RoundBeatSpec

/**
 * Per-kind beat schedule. Reveal holds are the exact values the views used to
 * hard-code — moved, not retuned. Engine kinds keep their turn rhythm in
 * their own `state` (stamped by their engines); their entries here carry the
 * settle hold and briefing cap those engines arm.
 */
export const ROUND_BEATS: Record<RoundChallengeKind, RoundBeatSpec> = {
  ranking: { owner: 'classic', revealHoldMs: 0 },
  traversal: { owner: 'classic', revealHoldMs: 1200 },
  'neighbour-blitz': { owner: 'classic', revealHoldMs: 0 },
  silhouette: { owner: 'classic', revealHoldMs: 4000 },
  // The two audio kinds: no `playSeconds` (their play length genuinely IS
  // `durationSeconds`), but a play gate — the clock starts on the tap.
  'anthem-buzz': { owner: 'classic', revealHoldMs: 7000, playGateMs: PLAY_GATE_CAP_MS },
  'tongue-buzz': { owner: 'classic', revealHoldMs: 7000, playGateMs: PLAY_GATE_CAP_MS },
  'hot-cold': { owner: 'classic', revealHoldMs: 1200 },
  sketch: { owner: 'classic', revealHoldMs: 0 },
  'stat-detective': {
    owner: 'classic',
    revealHoldMs: 4000,
    // The photo counts as a clue interval of its own — the view's console
    // shows the same total, imported from here, so the server window can
    // never run a clue short of the on-screen clock.
    playSeconds: challenge =>
      isChallengeOfType(challenge, 'stat-detective-challenge')
        ? (challenge.clues.length + (challenge.photo ? 1 : 0)) * challenge.secondsPerClue
        : undefined,
  },
  'two-truths': { owner: 'classic', revealHoldMs: 4500 },
  'river-run': { owner: 'classic', revealHoldMs: 0 },
  'shared-shores': { owner: 'classic', revealHoldMs: 0 },
  highlands: { owner: 'classic', revealHoldMs: 0 },
  'name-that-water': { owner: 'classic', revealHoldMs: 4200 },
  'mother-tongue': { owner: 'classic', revealHoldMs: 0 },
  'flag-palette': { owner: 'classic', revealHoldMs: 0 },
  'capital-guess': { owner: 'classic', revealHoldMs: 0 },
  'ground-plan': {
    owner: 'classic',
    // Five things land at the reveal — the city, the withheld layers, the form,
    // the crossing count and the photo. At 0 the scorecard covers the caption
    // before anyone reads it.
    revealHoldMs: 7000,
    playSeconds: challenge =>
      isChallengeOfType(challenge, 'ground-plan-challenge')
        ? groundPlanSeconds(challenge.layers.length, challenge.hints?.length ?? 0)
        : undefined,
  },
  // The reveal IS the lesson: every star — found and missed alike — names
  // itself on the dark map at its true spot, which is the one beat that
  // teaches position. At 0 the scorecard covered it before it landed.
  'star-chart': { owner: 'classic', revealHoldMs: 6000 },
  // The reveal IS the lesson: the arc paints itself bloc by bloc, and a share
  // a player misjudged is only legible once its neighbours are coloured in.
  government: engine({}),
  // The reveal is the mode's whole lesson and the only moment the table sees
  // the world whole again: every loss re-inks itself, the saved ones in the
  // player's own hand and the missed ones alongside. At 0 the scorecard
  // covered a map that was still visibly broken.
  // Gated behind the ready card: the schedule starts on the player's own
  // click, so the clock is a local decrement from it and the server's budget
  // covers the reading time.
  'terra-incognita': { owner: 'classic', revealHoldMs: 6000, playGateMs: READY_GATE_CAP_MS },
  composition: { owner: 'classic', revealHoldMs: 0 },
  // The reveal is the mode's whole teaching payload — the profile card's
  // sides, years, decade strip and UCDP note, plus the amber abroad-dots
  // layer. At 0 the scorecard covered all of it while the card was still
  // awaiting its dynamic import, so nobody ever read it.
  flashpoint: {
    owner: 'classic',
    revealHoldMs: 6000,
    // Length is waves + ladder, so it can't fall through to durationSeconds
    // the way a single-schedule kind does. Both sides compute it here.
    playSeconds: challenge =>
      isChallengeOfType(challenge, 'flashpoint-challenge')
        ? flashpointSeconds(challenge.eras.length, challenge.hints?.length ?? 0)
        : undefined,
  },
  // The reveal draws the territory's outline, highlights the claimant and
  // frames the two together — at 0 the scorecard covered all of it before the
  // bloom finished. The hold is the time to actually find the place on Earth.
  'ghost-state': { owner: 'classic', revealHoldMs: 4500 },
  'no-mans-land': { owner: 'classic', revealHoldMs: 0 },
  'pin-landmark': { owner: 'classic', revealHoldMs: 6000 },
  // The trend-race outcome is browsable: Continue submits and flips inline;
  // the cap only pads the settle budget for tabs that never click.
  'trend-race': { owner: 'classic', revealHoldMs: 0, browseCapMs: 60000 },
  // The reveal replays sixty years with the scars marked — a war, a policy or
  // an epidemic showing up as a dent that climbs the chart. The hold is the
  // time to actually watch one country's century go past.
  'pyramid-scheme': { owner: 'classic', revealHoldMs: 9000 },
  empire: {
    owner: 'classic',
    revealHoldMs: 12000,
    playSeconds: challenge =>
      isChallengeOfType(challenge, 'empire-challenge')
        ? challenge.durationSeconds +
          challenge.tapSeconds +
          Math.ceil(EMPIRE_INTERBEAT_HOLD_MS / 1000)
        : undefined,
  },
  atlas: engine({ briefingCapMs: BRIEFING_CAP_MS }),
  'border-chain': engine({ briefingCapMs: BRIEFING_CAP_MS }),
  'heritage-hunt': engine(),
  // The finished round's chronicle is browsable: settle waits on every seat's
  // reveal-done ack, capped so an AFK reader can't hold the table.
  timeline: engine({ browseCapMs: TIMELINE_BROWSE_CAP_MS }),
  manhunt: engine({ briefingCapMs: BRIEFING_CAP_MS }),
  'unique-or-bust': engine({ briefingCapMs: BRIEFING_CAP_MS }),
  'clean-sweep': engine({ briefingCapMs: BRIEFING_CAP_MS }),
}

export const roundBeats = (challenge: RoundChallenge | undefined): RoundBeatSpec =>
  ROUND_BEATS[roundChallengeKind(challenge)]

/** A round whose server clock is the generic classic engine — everything but
 *  the five turn/beat engines. */
export const isClassicGroupRound = (challenge: RoundChallenge | undefined): boolean =>
  roundBeats(challenge).owner === 'classic'

export const revealHoldMsFor = (challenge: RoundChallenge | undefined): number =>
  roundBeats(challenge).revealHoldMs

/** The full reveal allowance the settle backstop budgets with: the
 *  server-paced hold plus any player-paced browse cap. */
export const revealBudgetMsFor = (challenge: RoundChallenge | undefined): number => {
  const spec = roundBeats(challenge)
  return spec.revealHoldMs + (spec.browseCapMs ?? 0)
}

/** The pre-play allowance a kind's window opens behind; 0 where the clock
 *  starts at the reveal. Rides the PLAY budget (it is time before the
 *  answer), never `revealBudgetMsFor` — counting it in both double-counts. */
export const playGateMsFor = (challenge: RoundChallenge | undefined): number =>
  roundBeats(challenge).playGateMs ?? 0

/**
 * Whether the client's countdown may read `round.deadline`. False where the
 * stamp does not measure this very countdown, for either of two reasons: a
 * derived multi-beat budget (empire, flashpoint, stat-detective) stamps the
 * WHOLE round, and a play-gated kind's window had not opened when the stamp
 * was made. Both cases run the local decrement; the server settle backstops
 * them. One home for the question — call sites never re-test the parts.
 */
export const clockRidesRoundDeadline = (challenge: RoundChallenge | undefined): boolean => {
  const spec = roundBeats(challenge)
  return spec.playSeconds === undefined && spec.playGateMs === undefined
}

/**
 * A classic round's play length in seconds, or undefined when the kind is
 * untimed (no challenge clock, no derived total) — the server then applies
 * `UNTIMED_CLASSIC_CAP_SECONDS` under the cap switch. The play GATE is not
 * part of this: a gated kind still plays for exactly this long once the clip
 * starts, and only the server's budget covers the wait before it.
 */
/**
 * How much of a clock is still to run, 0..1 — THE deadline→fraction math.
 * Both sides of the wire price a buzz off this: `useDeadlineClock` repaints
 * the player's shot clock with it and the bot brain stamps its own `buzzAt`
 * with it, so a human and a machine answering at the same moment can never be
 * graded by two different roundings.
 *
 * No WINDOW means nothing to be early in, so the clock reads full. An unset
 * DEADLINE is a different thing — a round that hasn't been stamped yet — and
 * reads empty, matching `secondsOnDeadline`, which returns 0 for the same
 * input. The two must never disagree about whether a clock is running.
 */
export const remainingFractionOn = (
  deadline: number | undefined,
  totalSeconds: number | undefined
): number => {
  const total = (totalSeconds ?? 0) * 1000
  if (!total) return 1
  if (!deadline) return 0
  return clamp01((deadline - Date.now()) / total)
}

export const classicPlaySeconds = (challenge: RoundChallenge | undefined): number | undefined => {
  if (!challenge) return undefined
  const derived = roundBeats(challenge).playSeconds?.(challenge)
  if (derived !== undefined) return derived
  if ('durationSeconds' in challenge && challenge.durationSeconds) return challenge.durationSeconds
  return undefined
}
