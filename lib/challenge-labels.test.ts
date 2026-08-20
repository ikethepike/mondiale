import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { challengeCategory, roundKicker } from '~~/lib/challenge-labels'
import { KIND_LABELS } from '~~/lib/victory-stats'
import { CHALLENGE_GROUP_BY_KIND } from '~~/types/challenges/challenge-groups.type'
import type { RoundChallengeKind } from '~~/types/challenges/traversal-challenge.type'

const KINDS = Object.keys(CHALLENGE_GROUP_BY_KIND) as RoundChallengeKind[]

describe('KIND_LABELS', () => {
  it('carries both registers for every kind', () => {
    for (const kind of KINDS) {
      const label = KIND_LABELS[kind]
      expect(label?.prose, `${kind} has no prose label`).toBeTruthy()
      expect(label?.title, `${kind} has no title label`).toBeTruthy()
    }
  })

  it('keeps prose lowercase and titles capitalised', () => {
    for (const kind of KINDS) {
      const { prose, title } = KIND_LABELS[kind]
      // Prose reads mid-sentence: "62% on border-run rounds".
      expect(prose, `${kind} prose is not lowercase`).toBe(prose.toLowerCase())
      expect(title[0], `${kind} title does not open capitalised`).toBe(title[0].toUpperCase())
    }
  })
})

describe('roundKicker', () => {
  it('signs the round with its number and the mode title', () => {
    expect(roundKicker('pin-landmark', 4)).toBe('Round 4 — Drop a Pin')
    expect(roundKicker('anthem-buzz', 1)).toBe('Round 1 — Opening Ceremony')
  })
})

describe('challengeCategory', () => {
  it('names the lobby toggle a round came out of', () => {
    expect(challengeCategory('capital-guess')).toEqual({
      id: 'cities',
      label: 'Cities & capitals',
    })
    expect(challengeCategory('anthem-buzz')?.id).toBe('language')
  })

  it('leaves core kinds uncategorised — they answer to no toggle', () => {
    expect(challengeCategory('ranking')).toBeUndefined()
    expect(challengeCategory('two-truths')).toBeUndefined()
  })

  it('gives every non-core kind a category', () => {
    for (const kind of KINDS) {
      if (CHALLENGE_GROUP_BY_KIND[kind] === 'core') continue
      expect(challengeCategory(kind)?.label, `${kind} has no category`).toBeTruthy()
    }
  })
})

describe('the move interstitial stays undressed', () => {
  // MOVE_INTERSTITIAL_OVERHEAD_MS is a MEASUREMENT of useIntroBeat's timeline,
  // and round-beats.test.ts asserts the whole card fits inside WALK_LEAD_MS
  // with only 310ms to spare. The category pill adds a sixth staggered piece
  // (+0.07s), which that budget cannot absorb — the board's card is safe only
  // because it passes no `kind` and so renders no pill. That is a DOM fact the
  // constants test cannot see, so it is asserted here.
  it('never passes a kind to Interstitial', () => {
    const source = readFileSync('components/board3d/BoardOverlay.vue', 'utf8')
    const card = source.slice(source.indexOf('<Interstitial'))
    const props = card.slice(0, card.indexOf('/>'))
    expect(props).toContain('title="On the move!"')
    expect(props, 'the move card grew a kind — it cannot afford the pill').not.toMatch(/:?kind=/)
  })
})
