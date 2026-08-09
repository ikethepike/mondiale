import { describe, expect, it } from 'vitest'
import {
  ADVANCE_WATCHDOG_MAX_TICKS,
  ROUND_BOUND_PHASES,
  SETTLED_PHASES,
  shouldArmAdvanceWatchdog,
  tableIsSettled,
} from './enter-movement-phase.handler'
import { isStrandedSubmitter } from './join.event'
import type { Player, PlayerPhase } from '~~/types/player.type'

const seat = (phase: PlayerPhase): Pick<Player, 'phase'> => ({ phase })

/**
 * Regression cover for the two freezes that stranded room
 * `gold-slipped-discover`. Both left every seat looking finished while the
 * round never staged, so they are asserted from the outside: does the table
 * read as settled, and does a settled seat arm the server-owned backstop.
 */
describe('tableIsSettled', () => {
  it('is true only when every seat has finished its turn', () => {
    expect(tableIsSettled([seat('movement-summary'), seat('movement-summary')])).toBe(true)
    expect(tableIsSettled([seat('movement-summary'), seat('victory')])).toBe(true)
    expect(tableIsSettled([seat('movement-summary'), seat('kicked')])).toBe(true)
  })

  // Freeze #1: a submitter whose answer banked but whose phase advance was
  // lost sits in 'group-challenge'. One such seat froze the whole table.
  it('is false when a seat is stranded back in the challenge', () => {
    expect(tableIsSettled([seat('movement-summary'), seat('group-challenge')])).toBe(false)
  })

  it('does not count mid-walk or scorecard seats as settled', () => {
    expect(tableIsSettled([seat('moving')])).toBe(false)
    expect(tableIsSettled([seat('group-scores')])).toBe(false)
  })

  it('agrees with the exported settled-phase list', () => {
    for (const phase of SETTLED_PHASES) {
      expect(tableIsSettled([seat(phase as PlayerPhase)])).toBe(true)
    }
  })
})

describe('shouldArmAdvanceWatchdog', () => {
  // Freeze #2: the round advance is driven by a browser-memory flag. When the
  // last seat holding one goes quiet, nothing re-enters the handler — so a
  // settled seat waiting on an unsettled table must arm its own re-check.
  it('arms when this seat is done but the table is not', () => {
    expect(
      shouldArmAdvanceWatchdog({
        players: [seat('movement-summary'), seat('group-challenge')],
        playerPhase: 'movement-summary',
      })
    ).toBe(true)
  })

  it('stays quiet once every seat is settled', () => {
    expect(
      shouldArmAdvanceWatchdog({
        players: [seat('movement-summary'), seat('movement-summary')],
        playerPhase: 'movement-summary',
      })
    ).toBe(false)
  })

  it('stays quiet for a seat that has not settled yet', () => {
    expect(
      shouldArmAdvanceWatchdog({
        players: [seat('moving'), seat('group-challenge')],
        playerPhase: 'moving',
      })
    ).toBe(false)
  })

  // The staging latch already owns the follow-up; a second timer would race it.
  it('stays quiet when a round is already staged', () => {
    expect(
      shouldArmAdvanceWatchdog({
        players: [seat('movement-summary'), seat('group-challenge')],
        playerPhase: 'movement-summary',
        pendingRoundStart: true,
      })
    ).toBe(false)
  })

  it('is bounded so an abandoned seat cannot poll forever', () => {
    expect(ADVANCE_WATCHDOG_MAX_TICKS).toBeGreaterThan(0)
    expect(Number.isFinite(ADVANCE_WATCHDOG_MAX_TICKS)).toBe(true)
  })
})

describe('the phase partition', () => {
  // Freeze #3: a watchdog tick armed up to 8s before the reveal lands after
  // seats flipped back to 'group-challenge' with no moves — walking one
  // ejected it to 'movement-summary' mid-round. Round-bound seats must be
  // walk-exempt, and every phase must land in EXACTLY one bucket: a phase in
  // two would be ambiguous to the handler's re-entry, and a phase in none is
  // silently walkable — the exact bug class this partition exists to close.
  // The Record over the union makes a NEW phase a compile error here, not a
  // prod incident.
  const PARTITION: Record<PlayerPhase, 'round-bound' | 'settled' | 'walkable'> = {
    naming: 'round-bound',
    'waiting-for-game': 'round-bound',
    tutorial: 'round-bound',
    'group-challenge': 'round-bound',
    'group-scores': 'walkable',
    moving: 'walkable',
    'individual-challenge': 'walkable',
    'final-challenge': 'walkable',
    'movement-summary': 'settled',
    victory: 'settled',
    kicked: 'settled',
  }

  it('agrees with the exported sets, exhaustively over every phase', () => {
    const buckets = Object.values(PARTITION)
    for (const [phase, bucket] of Object.entries(PARTITION)) {
      expect(ROUND_BOUND_PHASES.includes(phase)).toBe(bucket === 'round-bound')
      expect(SETTLED_PHASES.includes(phase)).toBe(bucket === 'settled')
    }
    // …and the exported sets hold nothing that is not a real phase.
    expect(ROUND_BOUND_PHASES).toHaveLength(buckets.filter(b => b === 'round-bound').length)
    expect(SETTLED_PHASES).toHaveLength(buckets.filter(b => b === 'settled').length)
  })

  it('has no phase in both exemption sets', () => {
    for (const phase of ROUND_BOUND_PHASES) {
      expect(SETTLED_PHASES).not.toContain(phase)
    }
  })
})

/**
 * Regression cover for the freeze that stranded room
 * `construction-sitting-talk`. `composition` was dealt by the mix but had no
 * arm in the scoring switch, so it fell to `default:` — which needs a
 * `countriesPerPlayer` ranking it does not have — and threw on EVERY
 * submission. All three seats stayed in `group-challenge` with an empty
 * `groupAnswers`, and no seat was settled enough to arm the advance watchdog.
 *
 * A mode reaching the switch with no arm is unscoreable by construction, so
 * assert the two sets line up rather than waiting for a room to hang.
 */
describe('group-challenge scoring coverage', () => {
  /** Kinds that settle somewhere OTHER than the scoring switch: the ranking
   *  shape the `default:` arm exists for, the engines that score themselves,
   *  and `floor`, which is a mix-tuning constant rather than a round. */
  const SCORED_ELSEWHERE = [
    'ranking',
    'border-chain',
    'atlas',
    'heritage-hunt',
    'timeline',
    'manhunt',
    'unique-or-bust',
    'floor',
  ]

  it('gives every dealable round kind a scoring arm', async () => {
    const [{ ROUND_WEIGHTS }, handler] = await Promise.all([
      import('~~/lib/round-mix'),
      import('node:fs/promises').then(fs =>
        fs.readFile(new URL('./submit-group-challenge-answers.handler.ts', import.meta.url), 'utf8')
      ),
    ])
    const arms = new Set([...handler.matchAll(/case '([a-z-]+)':/g)].map(match => match[1]))

    const unscoreable = Object.keys(ROUND_WEIGHTS).filter(
      kind => !arms.has(kind) && !SCORED_ELSEWHERE.includes(kind)
    )
    expect(unscoreable).toEqual([])
  })

  it('keeps the exemption list free of kinds that grew their own arm', async () => {
    const handler = await import('node:fs/promises').then(fs =>
      fs.readFile(new URL('./submit-group-challenge-answers.handler.ts', import.meta.url), 'utf8')
    )
    const arms = new Set([...handler.matchAll(/case '([a-z-]+)':/g)].map(match => match[1]))
    expect(SCORED_ELSEWHERE.filter(kind => arms.has(kind))).toEqual([])
  })
})

/**
 * Regression cover for the second half of the `construction-sitting-talk`
 * freeze: the seat was stuck in 'group-challenge' and NO join heal covered
 * it (orphanedInChallenge wants an individual/final phase, wedgedMoving
 * wants 'moving', tableSettledButStuck wants a SETTLED_PHASES seat), so
 * refreshing — the documented recovery moment — could never cure it.
 */
describe('isStrandedSubmitter', () => {
  it('heals a seat whose answer banked but whose phase advance was lost', () => {
    expect(isStrandedSubmitter({ phase: 'group-challenge', answered: true })).toBe(true)
  })

  it('leaves a seat still genuinely playing the round alone', () => {
    // No banked answer: the player owes the round an answer and must keep
    // the challenge, not be walked off it.
    expect(isStrandedSubmitter({ phase: 'group-challenge', answered: false })).toBe(false)
  })

  it('never fires for a seat that already advanced', () => {
    for (const phase of ['group-scores', 'moving', 'movement-summary', 'victory'] as const) {
      expect(isStrandedSubmitter({ phase, answered: true })).toBe(false)
    }
  })

  it('is disjoint from the movement-summary demotion above it', () => {
    // join.event demotes a 'movement-summary' seat back to 'group-challenge'
    // only when its answer is ABSENT; this heal requires it PRESENT. The two
    // must never both fire, or the seat would ping-pong on every rejoin.
    const demoted = { phase: 'movement-summary', answered: false } as const
    expect(isStrandedSubmitter(demoted)).toBe(false)
  })
})
