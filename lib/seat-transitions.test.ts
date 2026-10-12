import { describe, expect, it } from 'vitest'
import { SEAT_STEPS, type SeatCursor, type SeatStep } from '~~/types/seat.types'
import {
  applySeatMove,
  BOARD_STEPS,
  IllegalTransition,
  RETIREMENT_STEPS,
  ROUND_BOUND_STEPS,
  ROUND_SETTLE_STEPS,
  SEAT_STEP_SPECS,
  SEAT_TIMER_KINDS,
  SEAT_TRANSITIONS,
  SETTLED_STEPS,
  seatFireAt,
  stepRequirementGap,
  tableOwesNextRound,
  TERMINAL_STEPS,
} from './seat-transitions'
import { SEAT_DEADLINE_GRACE_MS } from './round-beats'

const cursorOn = (step: SeatStep, extra: Partial<SeatCursor> = {}): SeatCursor => ({
  seq: 7,
  step,
  subject: 'subject',
  enteredAt: 0,
  cause: 'test',
  walk: 2,
  leg: 1,
  ...extra,
})

const successors = (step: SeatStep) =>
  SEAT_TRANSITIONS.filter(rule => rule.from === step).map(rule => rule.to)

const reachableFrom = (start: SeatStep): Set<SeatStep> => {
  const seen = new Set<SeatStep>([start])
  const queue = [start]
  while (queue.length) {
    for (const next of successors(queue.shift()!)) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return seen
}

describe('the seat transition table', () => {
  it('names every step exactly once in its spec table', () => {
    expect(Object.keys(SEAT_STEP_SPECS).sort()).toEqual([...SEAT_STEPS].sort())
  })

  it('reaches every step from the lobby', () => {
    expect([...reachableFrom('lobby')].sort()).toEqual([...SEAT_STEPS].sort())
  })

  it('lets every non-terminal step reach victory — no seat is ever stranded', () => {
    for (const step of SEAT_STEPS) {
      if (TERMINAL_STEPS.includes(step)) continue
      expect(reachableFrom(step).has('victory'), step).toBe(true)
    }
  })

  it('gives every step a server-owned exit, and terminal steps none', () => {
    for (const step of SEAT_STEPS) {
      const spec = SEAT_STEP_SPECS[step]
      const outgoing = successors(step)
      if (spec.exit === 'terminal') {
        expect(outgoing, step).toEqual([])
        continue
      }
      expect(outgoing.length, step).toBeGreaterThan(0)
      if (spec.exit === 'timer') {
        expect(spec.timer, step).toBeDefined()
        const timerDriven = SEAT_TRANSITIONS.some(
          rule => rule.from === step && rule.causes.some(cause => cause === `timer:${spec.timer}`)
        )
        expect(timerDriven, `${step} exits on its own timer`).toBe(true)
      }
      if (spec.exit === 'table') {
        const tableDriven = SEAT_TRANSITIONS.some(
          rule => rule.from === step && rule.causes.some(cause => cause.startsWith('table:'))
        )
        expect(tableDriven, `${step} exits on a table action`).toBe(true)
      }
    }
  })

  it('arms every timer kind from some step, and every rule names a cause', () => {
    const armed = new Set(SEAT_STEPS.flatMap(step => SEAT_STEP_SPECS[step].timer ?? []))
    expect([...armed].sort()).toEqual([...SEAT_TIMER_KINDS].sort())
    for (const rule of SEAT_TRANSITIONS) expect(rule.causes.length).toBeGreaterThan(0)
  })

  it('names every cause by its class and its source', () => {
    for (const rule of SEAT_TRANSITIONS) {
      for (const cause of rule.causes) {
        expect(cause).toMatch(/^(event|timer|table|admin):[a-z-]+$/)
      }
    }
  })

  it('partitions the steps the way the table and the board read them', () => {
    expect(ROUND_SETTLE_STEPS.every(step => ROUND_BOUND_STEPS.includes(step))).toBe(true)
    expect(SETTLED_STEPS).toEqual(['settled', 'victory', 'kicked'])
    expect(BOARD_STEPS).toEqual(['walk', 'arrive', 'settled'])
    expect(RETIREMENT_STEPS.every(step => !ROUND_BOUND_STEPS.includes(step))).toBe(true)
  })

  it('owes the next round only when every seat is done and someone is still racing', () => {
    expect(tableOwesNextRound(['settled', 'victory'])).toBe(true)
    expect(tableOwesNextRound(['victory', 'kicked'])).toBe(false)
    expect(tableOwesNextRound(['settled', 'walk'])).toBe(false)
  })
})

describe('applySeatMove', () => {
  it('bumps seq and stamps the new step', () => {
    const seat = { cursor: cursorOn('scores') }
    const next = applySeatMove(
      seat,
      { step: 'walk', subject: 'walk:w2:0', holdUntil: 10 },
      'timer:scores-cap',
      5
    )
    expect(next).toMatchObject({
      seq: 8,
      step: 'walk',
      subject: 'walk:w2:0',
      holdUntil: 10,
      enteredAt: 5,
    })
    expect(seat.cursor).toBe(next)
  })

  it("keeps a round's spent picks across its own moves, and drops them with it", () => {
    const round = { cursor: cursorOn('round', { subject: 'round:3', deadline: 50 }) }
    applySeatMove(
      round,
      { step: 'round', subject: 'round:3', deadline: 50, spent: ['NE'] },
      'event:spend-pick'
    )
    applySeatMove(round, { step: 'round', subject: 'round:3', deadline: 40 }, 'event:round-play')
    expect(round.cursor).toMatchObject({ spent: ['NE'], deadline: 40 })
    applySeatMove(round, { step: 'scores', subject: 'scores:3', deadline: 90 }, 'table:settle')
    expect(round.cursor.spent).toBeUndefined()
  })

  it("keeps a subject's hints and lights across its own moves, and drops them with it", () => {
    const gate = { cursor: cursorOn('gate', { subject: 'gate:w2:t5', deadline: 50 }) }
    applySeatMove(
      gate,
      { step: 'gate', subject: 'gate:w2:t5', deadline: 50, hints: ['iso'] },
      'event:buy-hint'
    )
    applySeatMove(gate, { step: 'gate', subject: 'gate:w2:t5', deadline: 40 }, 'event:round-play')
    expect(gate.cursor).toMatchObject({ hints: ['iso'], deadline: 40 })

    const final = { cursor: cursorOn('final', { subject: 'final:w2:q0', deadline: 50 }) }
    applySeatMove(
      final,
      { step: 'final', subject: 'final:w2:q0', deadline: 50, lit: ['SE'] },
      'event:final-light'
    )
    applySeatMove(
      final,
      { step: 'final', subject: 'final:w2:q0', deadline: 40 },
      'event:round-play'
    )
    expect(final.cursor.lit).toEqual(['SE'])
    applySeatMove(
      final,
      {
        step: 'final-verdict',
        subject: 'final:w2:q0',
        holdUntil: 60,
        verdict: {
          kind: 'final',
          subject: 'final:w2:q0',
          correct: true,
          timedOut: false,
          knockedOut: false,
          won: false,
        },
      },
      'timer:final-cap'
    )
    applySeatMove(
      final,
      { step: 'final', subject: 'final:w2:q1', deadline: 90 },
      'timer:verdict-hold'
    )
    expect(final.cursor.lit).toBeUndefined()
    expect(final.cursor.hints).toBeUndefined()
  })

  it('refuses every pair the table does not list', () => {
    for (const from of SEAT_STEPS) {
      for (const to of SEAT_STEPS) {
        const legal = SEAT_TRANSITIONS.find(rule => rule.from === from && rule.to === to)
        if (legal) continue
        const seat = { cursor: cursorOn(from) }
        expect(
          () => applySeatMove(seat, { step: to, subject: 'x' }, 'event:any'),
          `${from} → ${to}`
        ).toThrow(IllegalTransition)
        expect(seat.cursor.step).toBe(from)
      }
    }
  })

  it('refuses a legal pair driven by the wrong cause', () => {
    const seat = { cursor: cursorOn('gate') }
    expect(() =>
      applySeatMove(
        seat,
        {
          step: 'gate-verdict',
          subject: 'subject',
          holdUntil: 1,
          verdict: {
            kind: 'gate',
            subject: 'subject',
            correct: true,
            timedOut: false,
            steps: 1,
            browsable: false,
          },
        },
        'event:enter-movement-phase'
      )
    ).toThrow(IllegalTransition)
  })

  it("enforces each step's required stamps", () => {
    expect(stepRequirementGap({ step: 'walk', subject: 's' }, true)).toMatch(/holdUntil/)
    expect(stepRequirementGap({ step: 'scores', subject: 's' }, true)).toMatch(/deadline/)
    expect(stepRequirementGap({ step: 'scores', subject: 's' }, false)).toBeUndefined()
    expect(stepRequirementGap({ step: 'gate-verdict', subject: 's', holdUntil: 1 }, true)).toMatch(
      /verdict/
    )
    expect(
      stepRequirementGap(
        {
          step: 'final-verdict',
          subject: 's',
          holdUntil: 1,
          verdict: {
            kind: 'final',
            subject: 'other',
            correct: true,
            timedOut: false,
            knockedOut: false,
            won: false,
          },
        },
        true
      )
    ).toMatch(/another subject/)
    expect(
      stepRequirementGap(
        {
          step: 'round',
          subject: 's',
          verdict: { kind: 'round', subject: 's', scored: 1, maximum: 1 },
        },
        true
      )
    ).toMatch(/carries no verdict/)
  })
})

describe('seatFireAt', () => {
  it('reads the hold first, then the deadline plus grace, and nothing for table exits', () => {
    expect(seatFireAt(cursorOn('walk', { holdUntil: 100 }))).toBe(100)
    expect(seatFireAt(cursorOn('gate', { deadline: 100 }))).toBe(100 + SEAT_DEADLINE_GRACE_MS)
    expect(seatFireAt(cursorOn('round', { deadline: 100 }))).toBeUndefined()
    expect(seatFireAt(cursorOn('settled'))).toBeUndefined()
    expect(seatFireAt(cursorOn('scores'))).toBeUndefined()
  })
})
