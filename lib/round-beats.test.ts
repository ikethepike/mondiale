import { describe, expect, it } from 'vitest'
import {
  CLASSIC_SETTLE_SLACK_MS,
  classicPlaySeconds,
  EMPIRE_INTERBEAT_HOLD_MS,
  FINAL_QUESTION_CAP_MS,
  GROUP_SCORES_CAP_MS,
  INDIVIDUAL_GATE_CAP_MS,
  isClassicGroupRound,
  revealHoldMsFor,
  ROUND_BEATS,
  TUTORIAL_CAP_MS,
  UNTIMED_CLASSIC_CAP_SECONDS,
} from '~~/lib/round-beats'
import { ROUND_WEIGHTS } from '~~/lib/round-mix'
import type {
  EmpireChallenge,
  StatDetectiveChallenge,
  TwoTruthsChallenge,
} from '~~/types/challenges/group-modes.type'
import type { RoundChallengeKind } from '~~/types/challenges/traversal-challenge.type'

/**
 * ROUND_BEATS is a Record over RoundChallengeKind, so a NEW kind without a
 * beat spec is a compile error. These tests guard the runtime half: every
 * dealable kind resolves sane beats, and the five engines keep their
 * ownership — a dealer must never find a kind the clocks disagree about.
 */
describe('round beats', () => {
  const ENGINE_KINDS: RoundChallengeKind[] = [
    'border-chain',
    'heritage-hunt',
    'timeline',
    'manhunt',
    'unique-or-bust',
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
    expect(ROUND_BEATS['trend-race'].revealHoldMs).toBe(60000)
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

    const twoTruths = { _type: 'two-truths-challenge', durationSeconds: 25 } as TwoTruthsChallenge
    expect(classicPlaySeconds(twoTruths)).toBe(25)
    expect(revealHoldMsFor(twoTruths)).toBe(4500)
    expect(isClassicGroupRound(twoTruths)).toBe(true)
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
