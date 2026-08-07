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

/**
 * Master switch for the seam caps below — the timers that force-advance a
 * seat parked OUTSIDE a round's own clock (an unread scorecard, an open
 * tutorial, an unanswered gate). The round clocks themselves are not gated:
 * a timed round always settles.
 */
export const SERVER_CONTROLLED_CAPS = true

/** A scorecard left unread force-walks its seat. */
export const GROUP_SCORES_CAP_MS = 45000
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

/** Ceiling for classic kinds that carry no clock of their own (a ranking
 *  being dragged, a sketch being drawn) — only armed under the cap switch. */
export const UNTIMED_CLASSIC_CAP_SECONDS = 180
/** Settle grace behind a classic round's deadline + reveal hold, so a live
 *  client's own timeout submit always wins the race against the backstop. */
export const CLASSIC_SETTLE_SLACK_MS = 2000

/** Empire's beat-1 → beat-2 memorize hold (the sweep freezing at the peak). */
export const EMPIRE_INTERBEAT_HOLD_MS = 1800

export interface RoundBeatSpec {
  /** Who runs this kind's server clock — the ONE home for the classic/engine
   *  taxonomy; nothing else may hand-roll a list of engine `_type`s. */
  owner: 'classic' | 'engine'
  /** Play length for kinds whose clock is NOT the challenge's own
   *  `durationSeconds` (a derived multi-beat total, say). Omitted =
   *  `durationSeconds` when the challenge carries one, else untimed. */
  playSeconds?: (challenge: RoundChallenge) => number
  /** Post-answer reveal beat before the seat flips to scores; 0 = immediate
   *  flip. User-paced reveals (trend-race's browsable outcome) put their CAP
   *  here — the early exit is the player's own submit. */
  revealHoldMs: number
  /** Click-away rules card before play (manhunt/unique pattern); capped. */
  briefingCapMs?: number
  // Future beats (a twist, a bonus, a second guess window) are added HERE as
  // named optional fields — never as a view-local timer or a per-engine
  // constant. Every beat needs a server-owned exit and a rearm branch.
}

const engine = (spec: Omit<RoundBeatSpec, 'owner'> = { revealHoldMs: REVEAL_HOLD_MS }) =>
  ({ owner: 'engine', ...spec }) satisfies RoundBeatSpec

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
    playSeconds: challenge =>
      '_type' in challenge && challenge._type === 'stat-detective-challenge'
        ? challenge.clues.length * challenge.secondsPerClue
        : 0,
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
  // The trend-race outcome is browsable: the hold is a CAP, the player's own
  // submit (Continue) is the early exit.
  'trend-race': { owner: 'classic', revealHoldMs: 60000 },
  empire: {
    owner: 'classic',
    revealHoldMs: 12000,
    playSeconds: challenge =>
      '_type' in challenge && challenge._type === 'empire-challenge'
        ? challenge.durationSeconds +
          challenge.tapSeconds +
          Math.ceil(EMPIRE_INTERBEAT_HOLD_MS / 1000)
        : 0,
  },
  'border-chain': engine({ revealHoldMs: REVEAL_HOLD_MS, briefingCapMs: BRIEFING_CAP_MS }),
  'heritage-hunt': engine(),
  timeline: engine(),
  manhunt: engine({ revealHoldMs: REVEAL_HOLD_MS, briefingCapMs: BRIEFING_CAP_MS }),
  'unique-or-bust': engine({ revealHoldMs: REVEAL_HOLD_MS, briefingCapMs: BRIEFING_CAP_MS }),
}

export const roundBeats = (challenge: RoundChallenge | undefined): RoundBeatSpec =>
  ROUND_BEATS[roundChallengeKind(challenge)]

/** A round whose server clock is the generic classic engine — everything but
 *  the five turn/beat engines. */
export const isClassicGroupRound = (challenge: RoundChallenge | undefined): boolean =>
  roundBeats(challenge).owner === 'classic'

export const revealHoldMsFor = (challenge: RoundChallenge | undefined): number =>
  roundBeats(challenge).revealHoldMs

/**
 * A classic round's play length in seconds, or undefined when the kind is
 * untimed (no challenge clock, no derived total) — the server then applies
 * `UNTIMED_CLASSIC_CAP_SECONDS` under the cap switch.
 */
export const classicPlaySeconds = (challenge: RoundChallenge | undefined): number | undefined => {
  if (!challenge) return undefined
  const derived = roundBeats(challenge).playSeconds?.(challenge)
  if (derived) return derived
  if ('durationSeconds' in challenge && challenge.durationSeconds) return challenge.durationSeconds
  return undefined
}
