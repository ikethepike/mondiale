import { describe, expect, it } from 'vitest'
import {
  ADVANCE_WATCHDOG_MAX_TICKS,
  ROUND_BOUND_PHASES,
  SETTLED_PHASES,
  shouldArmAdvanceWatchdog,
  tableIsSettled,
} from './enter-movement-phase.handler'
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

describe('ROUND_BOUND_PHASES', () => {
  // Freeze #3: a watchdog tick armed up to 8s before the reveal lands after
  // seats flipped back to 'group-challenge' with no moves — walking one
  // ejected it to 'movement-summary' mid-round. Round-bound seats must be
  // walk-exempt, and the two exemption sets must never overlap (a phase in
  // both would be ambiguous to the handler's re-entry).
  it('covers every in-round and pre-game phase', () => {
    for (const phase of ['naming', 'waiting-for-game', 'tutorial', 'group-challenge']) {
      expect(ROUND_BOUND_PHASES).toContain(phase)
    }
  })

  it('is disjoint from the settled set', () => {
    for (const phase of ROUND_BOUND_PHASES) {
      expect(SETTLED_PHASES).not.toContain(phase)
    }
  })

  it('leaves the walking phases walkable', () => {
    for (const phase of ['group-scores', 'moving', 'individual-challenge', 'final-challenge']) {
      expect(ROUND_BOUND_PHASES).not.toContain(phase)
      expect(SETTLED_PHASES).not.toContain(phase)
    }
  })
})
