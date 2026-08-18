import { describe, expect, it } from 'vitest'
import { beatDisplayedLives, beatPickedCountry, beatStatus, latestBeatFor } from './final-beat'
import { FINAL_BEAT_TTL_MS, FINAL_REVEAL_HOLD_MS } from './round-beats'
import type { FinalBeatEntry } from '~~/store/game.store'

const NOW = 1_000_000

const beat = (overrides: Partial<FinalBeatEntry> = {}): FinalBeatEntry =>
  ({
    entryId: 'final:ike:0',
    playerId: 'ike',
    turn: 0,
    correct: true,
    timedOut: false,
    challenge: { _type: 'region-challenge', country: 'BR' },
    lives: 2,
    answeredCorrect: 1,
    totalCount: 5,
    knockedOut: false,
    at: NOW,
    ...overrides,
  }) as FinalBeatEntry

describe('latestBeatFor', () => {
  it('takes the newest beat for the seat', () => {
    const beats = [beat({ entryId: 'a', at: NOW - 500 }), beat({ entryId: 'b', at: NOW - 100 })]
    expect(latestBeatFor(beats, 'ike', { now: NOW })?.entryId).toBe('b')
  })

  it('ignores other seats — a watcher must not grade by someone else', () => {
    const beats = [beat({ playerId: 'marco' })]
    expect(latestBeatFor(beats, 'ike', { now: NOW })).toBeUndefined()
  })

  it('ignores a beat past its window', () => {
    const beats = [beat({ at: NOW - FINAL_BEAT_TTL_MS - 1 })]
    expect(latestBeatFor(beats, 'ike', { now: NOW })).toBeUndefined()
  })

  it('keeps the beat whose reveal is on screen, drops the ones behind it', () => {
    // A beat names the turn it RESOLVED; the snapshot has already bumped past
    // it, so during the reveal the live turn is the beat's plus one. Equality
    // would discard every beat — the off-by-one that would have made this
    // whole feature silently show nothing.
    const beats = [beat({ turn: 3 })]
    expect(latestBeatFor(beats, 'ike', { turn: 4, now: NOW })?.turn).toBe(3)
    expect(latestBeatFor(beats, 'ike', { turn: 3, now: NOW })?.turn).toBe(3)
    // Two questions back is history — it must not relight the reveal.
    expect(latestBeatFor(beats, 'ike', { turn: 5, now: NOW })).toBeUndefined()
  })

  it('has no beat without a seat', () => {
    expect(latestBeatFor([beat()], undefined, { now: NOW })).toBeUndefined()
  })
})

describe('beatStatus', () => {
  it('speaks the map status vocabulary', () => {
    expect(beatStatus(beat({ correct: true }))).toBe('correct')
    expect(beatStatus(beat({ correct: false }))).toBe('incorrect')
    expect(beatStatus(undefined)).toBeUndefined()
  })
})

describe('beatDisplayedLives', () => {
  const base = { livesRemaining: 2, knockedOut: false }

  it('prefers the beat — the post-verdict count the snapshot withholds', () => {
    expect(beatDisplayedLives({ ...base, beat: beat({ lives: 1 }) })).toBe(1)
  })

  it('is empty on a knockout, from either signal', () => {
    expect(beatDisplayedLives({ ...base, knockedOut: true })).toBe(0)
    expect(beatDisplayedLives({ ...base, beat: beat({ knockedOut: true, lives: 1 }) })).toBe(0)
  })

  it('falls back to the optimistic spend with no beat', () => {
    expect(beatDisplayedLives({ ...base, status: 'incorrect' })).toBe(1)
    expect(beatDisplayedLives({ ...base, status: 'correct' })).toBe(2)
    expect(beatDisplayedLives({ ...base })).toBe(2)
  })

  it('never goes negative', () => {
    expect(beatDisplayedLives({ ...base, livesRemaining: 0, status: 'incorrect' })).toBe(0)
    expect(beatDisplayedLives({ ...base, beat: beat({ lives: -1 }) })).toBe(0)
  })
})

describe('beatPickedCountry', () => {
  it('names a single-pick answer', () => {
    const picked = beat({ submittedAnswer: { _type: 'max-challenge', isoCode: 'BR' } })
    expect(beatPickedCountry(picked)).toBe('BR')
  })

  it('has no single subject for multi-pick modes or a timeout', () => {
    const swept = beat({
      submittedAnswer: { _type: 'sunset-blitz-challenge', namedCountries: ['BR', 'AR'] },
    })
    expect(beatPickedCountry(swept)).toBeUndefined()
    expect(beatPickedCountry(beat({ submittedAnswer: undefined }))).toBeUndefined()
    expect(beatPickedCountry(undefined)).toBeUndefined()
  })
})

describe('the beat outlives the reveal it narrates', () => {
  it('never expires mid-hold', () => {
    // A beat that pruned before the reveal ended would blank a watcher's
    // verdict while the runner still sees theirs — the desync this closes.
    expect(FINAL_BEAT_TTL_MS).toBeGreaterThan(FINAL_REVEAL_HOLD_MS)
  })
})
