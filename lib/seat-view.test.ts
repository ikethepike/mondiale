import { describe, expect, it } from 'vitest'
import { previewOn, seatVerdictOn, seatViewFamily, seatViewKey } from '~~/lib/seat-view'
import { BOARD_STEPS, SEAT_STEP_SPECS, seatSubject } from '~~/lib/seat-transitions'
import { SEAT_STEPS, type SeatCursor, type SeatStep, type SeatVerdict } from '~~/types/seat.types'
import { testCursor } from '~~/lib/events/server/test-seat'

const roundVerdict = (subject: string): SeatVerdict => ({
  kind: 'round',
  subject,
  scored: 4,
  maximum: 10,
})
const gateVerdict = (subject: string): SeatVerdict => ({
  kind: 'gate',
  subject,
  correct: true,
  timedOut: false,
  steps: 2,
  browsable: false,
})
const finalVerdict = (subject: string): SeatVerdict => ({
  kind: 'final',
  subject,
  correct: true,
  timedOut: false,
  knockedOut: false,
  won: false,
})

describe('seatViewFamily', () => {
  it('maps every step to the family its spec names', () => {
    for (const step of SEAT_STEPS) {
      expect(seatViewFamily({ step })).toBe(SEAT_STEP_SPECS[step].family)
    }
  })

  it.each([
    ['round', 'round-verdict'],
    ['gate', 'gate-verdict'],
    ['final', 'final-verdict'],
  ] as [SeatStep, SeatStep][])('%s and %s share one family', (question, verdict) => {
    expect(seatViewFamily({ step: question })).toBe(seatViewFamily({ step: verdict }))
  })

  it('puts walk, arrive and settled on the board', () => {
    expect(BOARD_STEPS).toEqual(['walk', 'arrive', 'settled'])
    for (const step of BOARD_STEPS) expect(seatViewFamily({ step })).toBe('board')
  })
})

describe('seatViewKey', () => {
  it('keeps one key across a question and its verdict', () => {
    for (const [question, verdict] of [
      ['round', 'round-verdict'],
      ['gate', 'gate-verdict'],
      ['final', 'final-verdict'],
    ] as [SeatStep, SeatStep][]) {
      const asked = testCursor(question)
      const graded = testCursor(verdict)
      expect(graded.subject).toBe(asked.subject)
      expect(seatViewKey(graded)).toBe(seatViewKey(asked))
    }
  })

  it('changes exactly when a round or gate subject changes', () => {
    const round = (index: number) => testCursor('round', { subject: seatSubject.round(index) })
    expect(seatViewKey(round(3))).toBe(seatViewKey(round(3)))
    expect(seatViewKey(round(3))).not.toBe(seatViewKey(round(4)))

    const gate = (walk: number, tile: number) =>
      testCursor('gate', { walk, subject: seatSubject.gate(walk, tile) })
    expect(seatViewKey(gate(2, 9))).toBe(seatViewKey(gate(2, 9)))
    expect(seatViewKey(gate(2, 9))).not.toBe(seatViewKey(gate(2, 12)))
    expect(seatViewKey(gate(2, 9))).not.toBe(seatViewKey(gate(3, 9)))
  })

  it('keys scores on their round', () => {
    const scores = (index: number) => testCursor('scores', { subject: seatSubject.scores(index) })
    expect(seatViewKey(scores(1))).not.toBe(seatViewKey(scores(2)))
    expect(seatViewKey(scores(1))).not.toBe(
      seatViewKey(testCursor('round', { subject: seatSubject.round(1) }))
    )
  })

  it('holds one board key across every walk leg, landing and settle', () => {
    const keys = new Set([
      seatViewKey(testCursor('walk', { walk: 1, leg: 0, subject: seatSubject.walk(1, 0) })),
      seatViewKey(testCursor('walk', { walk: 1, leg: 2, subject: seatSubject.walk(1, 2) })),
      seatViewKey(testCursor('walk', { walk: 4, leg: 0, subject: seatSubject.walk(4, 0) })),
      seatViewKey(testCursor('arrive', { walk: 4, subject: seatSubject.gate(4, 7) })),
      seatViewKey(testCursor('settled', { subject: seatSubject.settled(3) })),
    ])
    expect([...keys]).toEqual(['board'])
  })

  it('keys the gauntlet on its walk, never its question', () => {
    const question = (walk: number, index: number) =>
      testCursor('final', { walk, subject: seatSubject.final(walk, index) })
    expect(seatViewKey(question(5, 0))).toBe('final:w5')
    expect(seatViewKey(question(5, 3))).toBe('final:w5')
    expect(
      seatViewKey(testCursor('final-verdict', { walk: 5, subject: seatSubject.final(5, 3) }))
    ).toBe('final:w5')
    expect(seatViewKey(question(6, 0))).toBe('final:w6')
  })

  it('keys subject-less families on the family alone', () => {
    for (const step of ['lobby', 'tutorial', 'victory', 'kicked'] as SeatStep[]) {
      expect(seatViewKey(testCursor(step))).toBe(SEAT_STEP_SPECS[step].family)
    }
  })

  it('never lets two families share a key', () => {
    const byKey = new Map<string, string>()
    for (const step of SEAT_STEPS) {
      const key = seatViewKey(testCursor(step))
      const family = seatViewFamily({ step })
      expect(byKey.get(key) ?? family).toBe(family)
      byKey.set(key, family)
    }
  })
})

describe('seatVerdictOn', () => {
  const on = (step: SeatStep, verdict: SeatVerdict, extra: Partial<SeatCursor> = {}) =>
    testCursor(step, { verdict, ...extra })

  it('shows the verdict of its kind on the cursor subject', () => {
    const cursor = on('gate-verdict', gateVerdict(seatSubject.gate(1, 0)))
    expect(seatVerdictOn(cursor, 'gate')).toBe(cursor.verdict)
    expect(seatVerdictOn(cursor, 'gate', cursor.subject)).toBe(cursor.verdict)
  })

  it('never shows a verdict of another kind', () => {
    const cursor = on('gate-verdict', gateVerdict(seatSubject.gate(1, 0)))
    expect(seatVerdictOn(cursor, 'final')).toBeUndefined()
    expect(seatVerdictOn(cursor, 'round')).toBeUndefined()
  })

  it('never shows a verdict on a subject the view was not mounted for', () => {
    const cursor = on('gate-verdict', gateVerdict(seatSubject.gate(1, 0)))
    expect(seatVerdictOn(cursor, 'gate', seatSubject.gate(1, 5))).toBeUndefined()
  })

  it('never shows a verdict whose own subject differs from the cursor', () => {
    const stale = on('final-verdict', finalVerdict(seatSubject.final(1, 0)), {
      subject: seatSubject.final(1, 1),
    })
    expect(seatVerdictOn(stale, 'final')).toBeUndefined()
    expect(seatVerdictOn(stale, 'final', seatSubject.final(1, 0))).toBeUndefined()
    expect(seatVerdictOn(stale, 'final', seatSubject.final(1, 1))).toBeUndefined()
  })

  it('shows nothing without a cursor or a verdict', () => {
    expect(seatVerdictOn(undefined, 'round')).toBeUndefined()
    expect(seatVerdictOn(undefined, 'round', seatSubject.round(0))).toBeUndefined()
    expect(seatVerdictOn(testCursor('round'), 'round')).toBeUndefined()
  })

  it('reads a round verdict through to its score', () => {
    const cursor = on('round-verdict', roundVerdict(seatSubject.round(0)))
    expect(seatVerdictOn(cursor, 'round')?.scored).toBe(4)
  })
})

describe('previewOn', () => {
  const preview = (subject: string) => ({ subject, value: 'correct' as const })

  it('shows a preview graded on the subject on screen', () => {
    const cursor = testCursor('gate')
    expect(previewOn(preview(cursor.subject), cursor)?.value).toBe('correct')
  })

  it('hides a preview once the cursor moves to another subject', () => {
    const graded = preview(seatSubject.gate(1, 0))
    expect(previewOn(graded, testCursor('walk'))).toBeUndefined()
    expect(
      previewOn(graded, testCursor('gate', { subject: seatSubject.gate(1, 9) }))
    ).toBeUndefined()
  })

  it('shows nothing without a preview or a cursor', () => {
    expect(previewOn(undefined, testCursor('gate'))).toBeUndefined()
    expect(previewOn(preview(seatSubject.gate(1, 0)), undefined)).toBeUndefined()
  })
})
