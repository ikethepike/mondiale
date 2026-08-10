import { isChallengeOfType } from '~~/lib/rounds'
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
/** Extra opening-turn time — the first clock starts behind the round
 *  interstitial, which everyone watches for a few seconds. */
export const FIRST_TURN_GRACE_MS = 4000
/** How long a briefing (the click-away rules cards manhunt and unique-or-bust
 *  open on) may hold before the round starts regardless. */
export const BRIEFING_CAP_MS = 30000
/** Border Chain's dead-end hold: long enough for the table to read the closed
 *  doors and see that the trapped player truly had no move. The client's
 *  overlay reads this too — one beat, one constant. */
export const TRAP_HOLD_MS = 5500

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
export const GROUP_SCORES_CAP_MS = 45000
/**
 * The walk protocol's leads: EVERY walk (client- or server-initiated)
 * announces itself — phase 'moving' rides its own snapshot — then lets the
 * lead pass before the first step, so the stage is on screen and the steps
 * play in view. A turn-OPENING walk (walkIntro) leads long enough for the
 * "On the move!" beat to fit inside it; a between-gates resume leads only a
 * view transition — the gate verdict the player just watched IS the
 * announcement.
 */
export const WALK_LEAD_MS = 3200
export const WALK_RESUME_LEAD_MS = 900
/** Snapshot delivery grace inside the lead, so a slow wire can't push the
 *  announcement beat past the first step. */
export const WALK_ANNOUNCE_WIRE_GRACE_MS = 350

/** The "On the move!" interstitial, sized to FIT INSIDE the walk lead by
 *  construction (enforced in round-beats.test.ts): the reading hold plus
 *  the intro/stagger/outro choreography budget. */
export const MOVE_INTERSTITIAL_HOLD_MS = 1200
export const MOVE_INTERSTITIAL_OVERHEAD_MS = 1650
export const MOVE_INTERSTITIAL_TOTAL_MS = MOVE_INTERSTITIAL_HOLD_MS + MOVE_INTERSTITIAL_OVERHEAD_MS

/**
 * The camera's framing sweep onto the walking pawn, sized to land INSIDE the
 * announce lead (enforced in round-beats.test.ts). A turn-OPENING walk holds
 * the overview a breath and then sweeps in behind the "On the move!" beat, so
 * the pawn is already framed when the interstitial lifts; a between-gates
 * resume re-frames inside the short lead the gate verdict earned. Without a
 * sweep per announce the persistent stage never re-frames at all — `follow`
 * is a pure translation and keeps whatever shot the camera has held all game.
 */
export const WALK_FRAME_LEAD_MS = 400
export const WALK_FRAME_MS = 1200
export const WALK_RESUME_FRAME_MS = 700

/** One tile's hop tween; catch-up tiers derive from it (use-pawn-movement). */
export const PAWN_HOP_MS = 380
/** How long a pawn rests with an empty queue before it counts as LANDED
 *  (squash + ripple) — server steps arrive a cadence apart, so the queue is
 *  briefly empty between every step. */
export const LANDING_SETTLE_MS = 650
/** The challenge-tile alert ripple's sweep. */
export const ARRIVAL_RIPPLE_MS = 1400
/** Slack on the arrival flourish before the view may take the stage away. */
export const ARRIVAL_PAD_MS = 170
/** How long the board holds after a gate arrival before the challenge view
 *  swaps in — the full arrival flourish, composed so it can't drift. */
export const BOARD_TO_CHALLENGE_HOLD_MS =
  PAWN_HOP_MS + LANDING_SETTLE_MS + ARRIVAL_RIPPLE_MS + ARRIVAL_PAD_MS

/** One tile per tick — the walk cadence. 500 read as trudging once every
 *  step became live and visible; the hop (PAWN_HOP_MS) must stay under it. */
export const STEP_INTERVAL_MS = 400
/** How much earlier than the cadence a step tick may land before it reads
 *  as a duplicate chain's tick (the single-stepper latch in
 *  enter-movement-phase). */
export const STEP_LATCH_SLACK_MS = 150
/** Staged round → reveal settle pause. */
export const NEW_ROUND_PAUSE_MS = 2000
/** A round-1 tutorial card left open force-closes. */
export const TUTORIAL_CAP_MS = 60000
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
/** The gate shell's fallback end of the result beat — DERIVED, never an
 *  ad-hoc sum at the call site. */
export const GATE_RESULT_FALLBACK_MS = GATE_RESULT_HOLD_MS + GATE_RESULT_WIRE_GRACE_MS
/** The mid-gauntlet reveal (clearFinalResultBeat): the teachable scorecards —
 *  rankings, lessons, the fact you missed — need longer on screen than a
 *  gate's verdict pill. The knockout keeps the shorter gate hold: its exit
 *  line says everything. */
export const FINAL_REVEAL_HOLD_MS = 8000

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
  'anthem-buzz': { owner: 'classic', revealHoldMs: 7000 },
  'tongue-buzz': { owner: 'classic', revealHoldMs: 7000 },
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
  composition: { owner: 'classic', revealHoldMs: 0 },
  flashpoint: { owner: 'classic', revealHoldMs: 0 },
  'ghost-state': { owner: 'classic', revealHoldMs: 0 },
  'no-mans-land': { owner: 'classic', revealHoldMs: 0 },
  'pin-landmark': { owner: 'classic', revealHoldMs: 6000 },
  // The trend-race outcome is browsable: Continue submits and flips inline;
  // the cap only pads the settle budget for tabs that never click.
  'trend-race': { owner: 'classic', revealHoldMs: 0, browseCapMs: 60000 },
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
  timeline: engine(),
  manhunt: engine({ briefingCapMs: BRIEFING_CAP_MS }),
  'unique-or-bust': engine({ briefingCapMs: BRIEFING_CAP_MS }),
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

/**
 * A classic round's play length in seconds, or undefined when the kind is
 * untimed (no challenge clock, no derived total) — the server then applies
 * `UNTIMED_CLASSIC_CAP_SECONDS` under the cap switch.
 */
export const classicPlaySeconds = (challenge: RoundChallenge | undefined): number | undefined => {
  if (!challenge) return undefined
  const derived = roundBeats(challenge).playSeconds?.(challenge)
  if (derived !== undefined) return derived
  if ('durationSeconds' in challenge && challenge.durationSeconds) return challenge.durationSeconds
  return undefined
}
