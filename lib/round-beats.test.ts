import { describe, expect, it } from 'vitest'
import {
  ARRIVAL_PAD_MS,
  ARRIVAL_RIPPLE_MS,
  BOARD_TO_CHALLENGE_HOLD_MS,
  CLASSIC_SETTLE_SLACK_MS,
  GATE_RESULT_FALLBACK_MS,
  GATE_RESULT_HOLD_MS,
  GATE_RESULT_WIRE_GRACE_MS,
  LANDING_SETTLE_MS,
  MOVE_INTERSTITIAL_HOLD_MS,
  MOVE_INTERSTITIAL_OVERHEAD_MS,
  MOVE_INTERSTITIAL_TOTAL_MS,
  PAWN_HOP_MS,
  STEP_INTERVAL_MS,
  GATE_PUNCH_MS,
  WALK_ANNOUNCE_WIRE_GRACE_MS,
  WALK_FRAME_MS,
  WALK_LEAD_HEADROOM_MS,
  WALK_LEAD_MS,
  WALK_RESUME_FRAME_MS,
  WALK_RESUME_LEAD_MS,
  classicPlaySeconds,
  EMPIRE_INTERBEAT_HOLD_MS,
  FLASHPOINT_HINT_LEAD_SECONDS,
  FLASHPOINT_SECONDS_PER_ERA,
  FLASHPOINT_SECONDS_PER_HINT,
  FLASHPOINT_TAIL_SECONDS,
  flashpointSeconds,
  FINAL_QUESTION_CAP_MS,
  FINAL_REVEAL_HOLD_MS,
  GROUP_SCORES_CAP_MS,
  INDIVIDUAL_GATE_CAP_MS,
  clockRidesRoundDeadline,
  isClassicGroupRound,
  PLAY_GATE_CAP_MS,
  playGateMsFor,
  revealHoldMsFor,
  ROUND_BEATS,
  TUTORIAL_CAP_MS,
  UNTIMED_CLASSIC_CAP_SECONDS,
} from '~~/lib/round-beats'
import { ROUND_WEIGHTS } from '~~/lib/round-mix'
import type {
  AnthemBuzzChallenge,
  EmpireChallenge,
  FlashpointChallenge,
  StatDetectiveChallenge,
  TwoTruthsChallenge,
} from '~~/types/challenges/group-modes.type'
import type { RoundChallengeKind } from '~~/types/challenges/traversal-challenge.type'

/**
 * ROUND_BEATS is a Record over RoundChallengeKind, so a NEW kind without a
 * beat spec is a compile error. These tests guard the runtime half: every
 * dealable kind resolves sane beats, and the six engines keep their
 * ownership — a dealer must never find a kind the clocks disagree about.
 */
describe('round beats', () => {
  const ENGINE_KINDS: RoundChallengeKind[] = [
    'atlas',
    'border-chain',
    'heritage-hunt',
    'timeline',
    'manhunt',
    'unique-or-bust',
    'clean-sweep',
    'government',
  ]

  it('covers every dealable kind with a spec', () => {
    for (const kind of Object.keys(ROUND_WEIGHTS) as RoundChallengeKind[]) {
      const spec = ROUND_BEATS[kind]
      expect(spec, kind).toBeDefined()
      expect(spec.revealHoldMs, kind).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(spec.revealHoldMs), kind).toBe(true)
    }
  })

  it('keeps the engine/classic taxonomy on the spec alone', () => {
    for (const [kind, spec] of Object.entries(ROUND_BEATS)) {
      expect(spec.owner, kind).toBe(
        ENGINE_KINDS.includes(kind as RoundChallengeKind) ? 'engine' : 'classic'
      )
    }
  })

  /** Value parity with the constants the views hard-coded before the spec
   *  existed — proves the migration was a move, not a retune. Retire these
   *  pins when the holds are deliberately retuned. */
  it('carries the view reveal holds verbatim', () => {
    expect(ROUND_BEATS.silhouette.revealHoldMs).toBe(4000)
    expect(ROUND_BEATS['stat-detective'].revealHoldMs).toBe(4000)
    expect(ROUND_BEATS['name-that-water'].revealHoldMs).toBe(4200)
    expect(ROUND_BEATS['two-truths'].revealHoldMs).toBe(4500)
    expect(ROUND_BEATS['pin-landmark'].revealHoldMs).toBe(6000)
    expect(ROUND_BEATS['anthem-buzz'].revealHoldMs).toBe(7000)
    expect(ROUND_BEATS['tongue-buzz'].revealHoldMs).toBe(7000)
    expect(ROUND_BEATS.empire.revealHoldMs).toBe(12000)
    // Deliberately retuned, not migrated: flashpoint shipped at 0, which flipped
    // the scorecard over the conflict profile card while it was still awaiting
    // its dynamic import. The reveal IS this mode's teaching payload.
    expect(ROUND_BEATS.flashpoint.revealHoldMs).toBe(6000)
    // Trend-race's reveal is PLAYER-paced: Continue flips inline (hold 0);
    // the browse cap only pads the settle budget.
    expect(ROUND_BEATS['trend-race'].revealHoldMs).toBe(0)
    expect(ROUND_BEATS['trend-race'].browseCapMs).toBe(60000)
  })

  it('derives play length where the challenge clock is not durationSeconds', () => {
    const statDetective = {
      _type: 'stat-detective-challenge',
      country: 'SE',
      clues: ['economics.gdpPerCapita', 'geography.area.land', 'geography.area.water'],
      secondsPerClue: 10,
      maximumPoints: 10,
    } as StatDetectiveChallenge
    expect(classicPlaySeconds(statDetective)).toBe(30)

    const empire = {
      _type: 'empire-challenge',
      empireId: 'rome',
      keyframeYears: [100],
      peakYear: 117,
      durationSeconds: 12,
      tapSeconds: 30,
      members: [],
      partialMembers: [],
      maximumPoints: 10,
    } as unknown as EmpireChallenge
    expect(classicPlaySeconds(empire)).toBe(12 + 30 + Math.ceil(EMPIRE_INTERBEAT_HOLD_MS / 1000))

    // Flashpoint's clock is TWO schedules — the dot waves, then the hint
    // ladder — so it can't fall through to durationSeconds the way a
    // single-schedule kind does.
    const flashpoint = {
      _type: 'flashpoint-challenge',
      country: 'CO',
      eras: [0, 1, 2, 3],
      secondsPerEra: FLASHPOINT_SECONDS_PER_ERA,
      hints: [
        { kind: 'onset', text: 'x' },
        { kind: 'shape', text: 'x' },
        { kind: 'tempo', text: 'x' },
        { kind: 'scale', text: 'x' },
        { kind: 'bounds', neighbours: ['PE'] },
      ],
      secondsPerHint: FLASHPOINT_SECONDS_PER_HINT,
      durationSeconds: flashpointSeconds(4, 5),
      maximumPoints: 10,
    } as unknown as FlashpointChallenge
    expect(classicPlaySeconds(flashpoint)).toBe(
      4 * FLASHPOINT_SECONDS_PER_ERA +
        FLASHPOINT_HINT_LEAD_SECONDS +
        5 * FLASHPOINT_SECONDS_PER_HINT +
        FLASHPOINT_TAIL_SECONDS
    )
    // The invariant that matters: the server's window and the payload the view
    // clocks off are the SAME number. A dealer that stamped its own arithmetic
    // could run the round a rung short of the ladder on screen.
    expect(classicPlaySeconds(flashpoint)).toBe(flashpoint.durationSeconds)

    const twoTruths = { _type: 'two-truths-challenge', durationSeconds: 25 } as TwoTruthsChallenge
    expect(classicPlaySeconds(twoTruths)).toBe(25)
    expect(revealHoldMsFor(twoTruths)).toBe(4500)
    expect(isClassicGroupRound(twoTruths)).toBe(true)
  })

  /** The audio rounds wait for a play tap iOS requires before any sound can
   *  happen, so their window opens on that gesture — not at the reveal. */
  it('gates the audio rounds behind a bounded play tap', () => {
    for (const kind of ['anthem-buzz', 'tongue-buzz'] as const) {
      expect(ROUND_BEATS[kind].playGateMs, kind).toBe(PLAY_GATE_CAP_MS)
      // The gate is a WAIT allowance, never the play length: once the clip
      // starts the round is still exactly `durationSeconds` long.
      expect(ROUND_BEATS[kind].playSeconds, kind).toBeUndefined()
    }
    // Bounded, so a seat that never taps can't hold the table open.
    expect(PLAY_GATE_CAP_MS).toBeGreaterThan(0)
    expect(Number.isFinite(PLAY_GATE_CAP_MS)).toBe(true)
  })

  /** `playSeconds === undefined` used to answer two unrelated questions at
   *  once. These pin that they now answer independently. */
  it('keeps the client clock off a stamp that does not measure it', () => {
    const anthem = {
      _type: 'anthem-buzz-challenge',
      country: 'SE',
      durationSeconds: 30,
      maximumPoints: 10,
    } as AnthemBuzzChallenge

    // Play-gated: the stamp was made before the window opened, so the client
    // counts down locally from the tap instead.
    expect(clockRidesRoundDeadline(anthem)).toBe(false)
    expect(playGateMsFor(anthem)).toBe(PLAY_GATE_CAP_MS)
    // …but the play LENGTH is untouched, so the server budget and any view
    // reading it still see 30 seconds of anthem.
    expect(classicPlaySeconds(anthem)).toBe(30)

    // A multi-beat kind stays off the stamp for its own, different reason.
    const empire = {
      _type: 'empire-challenge',
      durationSeconds: 12,
      tapSeconds: 30,
    } as unknown as EmpireChallenge
    expect(clockRidesRoundDeadline(empire)).toBe(false)
    expect(playGateMsFor(empire)).toBe(0)

    // The majority case: a plain single-schedule kind still rides the stamp,
    // which is what stops a throttled tab outliving its window.
    const twoTruths = { _type: 'two-truths-challenge', durationSeconds: 25 } as TwoTruthsChallenge
    expect(clockRidesRoundDeadline(twoTruths)).toBe(true)
    expect(playGateMsFor(twoTruths)).toBe(0)
  })

  it('leaves untimed kinds to the capped ceiling', () => {
    const hotCold = {
      _type: 'hot-cold-challenge',
      country: 'SE',
      maximumGuesses: 6,
      maximumPoints: 10,
    } as const
    expect(classicPlaySeconds(hotCold)).toBeUndefined()
    expect(UNTIMED_CLASSIC_CAP_SECONDS).toBeGreaterThan(0)
  })

  it('fits the move interstitial inside the walk lead by construction', () => {
    // The announcement beat must END before the first step can land — a
    // hold retune that outgrows the lead fails here, not on screen.
    expect(MOVE_INTERSTITIAL_TOTAL_MS + WALK_ANNOUNCE_WIRE_GRACE_MS).toBeLessThanOrEqual(
      WALK_LEAD_MS
    )
    // ...and with room to spare. The lead used to sit EXACTLY on the total,
    // so the fit passed while any retune of the card pushed the first hop
    // behind it. Slack is the invariant, not mere non-overlap.
    expect(
      WALK_LEAD_MS - (MOVE_INTERSTITIAL_TOTAL_MS + WALK_ANNOUNCE_WIRE_GRACE_MS)
    ).toBeGreaterThanOrEqual(WALK_LEAD_HEADROOM_MS)
    expect(MOVE_INTERSTITIAL_TOTAL_MS).toBe(
      MOVE_INTERSTITIAL_HOLD_MS + MOVE_INTERSTITIAL_OVERHEAD_MS
    )
    // The resume lead carries no overlay — only the view transition.
    expect(WALK_RESUME_LEAD_MS).toBeLessThan(WALK_LEAD_MS)
  })

  it('fits the camera framing sweep inside the announce lead it plays under', () => {
    // The opening sweep runs BEHIND the interstitial: it must be over before
    // the beat that hides it lifts, or the camera is seen moving under the
    // card. There is no room after the interstitial — the fit above pins it
    // to the whole lead.
    expect(WALK_FRAME_MS).toBeLessThan(MOVE_INTERSTITIAL_TOTAL_MS)
    // A between-gates resume has no interstitial and a short lead: the
    // re-frame must land before the first step, whose follow banks behind it.
    expect(WALK_RESUME_FRAME_MS).toBeLessThanOrEqual(WALK_RESUME_LEAD_MS)
    expect(WALK_RESUME_FRAME_MS).toBeLessThan(WALK_FRAME_MS)
  })

  it('composes the arrival hold and gate fallback from their parts', () => {
    expect(BOARD_TO_CHALLENGE_HOLD_MS).toBe(
      PAWN_HOP_MS + LANDING_SETTLE_MS + ARRIVAL_RIPPLE_MS + ARRIVAL_PAD_MS
    )
    expect(GATE_RESULT_FALLBACK_MS).toBe(GATE_RESULT_HOLD_MS + GATE_RESULT_WIRE_GRACE_MS)
    // The gate punch-in plays INSIDE the arrival hold: the hold is what keeps
    // the stage up, so a hold trimmed under the punch would cut the camera
    // move off mid-flight and swap to the question over a moving shot. The
    // punch starts after the landing debounce, so that is the real budget.
    expect(GATE_PUNCH_MS).toBeLessThanOrEqual(BOARD_TO_CHALLENGE_HOLD_MS - LANDING_SETTLE_MS)
    // A punch is a CUT, not a sweep — if it ever grows to a framing sweep's
    // length it has stopped being the beat it exists to be.
    expect(GATE_PUNCH_MS).toBeLessThan(WALK_RESUME_FRAME_MS)
    // The hop must undercut the step cadence, or live walks stall mid-hop.
    expect(PAWN_HOP_MS).toBeLessThan(STEP_INTERVAL_MS)
    // The gauntlet's reveal outlasts a gate verdict by design, and stays
    // well inside the question cap armed after it.
    expect(FINAL_REVEAL_HOLD_MS).toBeGreaterThan(GATE_RESULT_HOLD_MS)
    expect(FINAL_REVEAL_HOLD_MS).toBeLessThan(FINAL_QUESTION_CAP_MS)
  })

  it('backs every cap with a live value', () => {
    for (const cap of [
      GROUP_SCORES_CAP_MS,
      TUTORIAL_CAP_MS,
      INDIVIDUAL_GATE_CAP_MS,
      FINAL_QUESTION_CAP_MS,
      CLASSIC_SETTLE_SLACK_MS,
    ]) {
      expect(cap).toBeGreaterThan(0)
      expect(Number.isFinite(cap)).toBe(true)
    }
  })
})
