import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  categoryLineup,
  challengeCategory,
  modesInPlay,
  roundKicker,
} from '~~/lib/challenge-labels'
import { KIND_LABELS } from '~~/lib/victory-stats'
import {
  CHALLENGE_GROUP_BY_KIND,
  CHALLENGE_GROUPS,
} from '~~/types/challenges/challenge-groups.type'
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

const TABLE = 8

describe('categoryLineup', () => {
  it('names every mode a category owns', () => {
    const language = categoryLineup('language', { difficulty: 'normal' }, TABLE)
    expect(language.modes.map(mode => mode.title)).toEqual([
      'Mother Tongue',
      'Opening Ceremony',
      'Tongues',
    ])
    expect(language.playing).toBe(3)
    expect(language.total).toBe(3)
  })

  it('separates the three ways a mode can be benched', () => {
    // Flashpoint is hard-only, and conflicts holds nothing else.
    const auto = categoryLineup('conflicts', { difficulty: 'normal' }, TABLE)
    expect(auto.modes[0]?.status).toBe('hard-only')
    expect(auto.playing).toBe(0)

    // Forcing the group on lifts its own difficulty gate.
    const forced = categoryLineup(
      'conflicts',
      { difficulty: 'normal', challengeOverrides: { conflicts: true } },
      TABLE
    )
    expect(forced.modes[0]?.status).toBe('playing')

    const off = categoryLineup(
      'conflicts',
      { difficulty: 'hard', challengeOverrides: { conflicts: false } },
      TABLE
    )
    expect(off.modes[0]?.status).toBe('off')

    // Manhunt needs four; no switch can buy the seats.
    const solo = categoryLineup(
      'navigation',
      { difficulty: 'hard', challengeOverrides: { navigation: true } },
      2
    )
    const manhunt = solo.modes.find(mode => mode.kind === 'manhunt')
    expect(manhunt?.status).toBe('short-table')
    expect(manhunt?.minimumTable).toBe(4)
  })

  it('gives every visible category at least one mode to list', () => {
    for (const [id, group] of Object.entries(CHALLENGE_GROUPS)) {
      if ('hidden' in group && group.hidden) continue
      const lineup = categoryLineup(id as never, { difficulty: 'normal' }, TABLE)
      expect(lineup.total, `${id} owns no modes`).toBeGreaterThan(0)
    }
  })
})

describe('modesInPlay', () => {
  it('counts the core kinds no toggle can reach', () => {
    const everythingOff = Object.fromEntries(
      Object.keys(CHALLENGE_GROUPS).map(group => [group, false])
    )
    const { playing, total } = modesInPlay(
      { difficulty: 'normal', challengeOverrides: everythingOff },
      TABLE
    )
    expect(total).toBe(KINDS.length)
    // Ranking and two truths — the floor that keeps a game playable.
    expect(playing).toBe(2)
  })

  // The header count and the accordion's rows are read off separate
  // functions; a table that agrees only by coincidence would drift.
  it('agrees with the sum of every category lineup', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (const contenders of [2, 4, 8]) {
        const settings = { difficulty, challengeOverrides: { conflicts: true, water: false } }
        const summed = Object.entries(CHALLENGE_GROUPS).reduce(
          (running, [id]) => running + categoryLineup(id as never, settings, contenders).playing,
          0
        )
        const core = KINDS.filter(kind => CHALLENGE_GROUP_BY_KIND[kind] === 'core').length
        expect(modesInPlay(settings, contenders).playing, `${difficulty} at ${contenders}`).toBe(
          summed + core
        )
      }
    }
  })
})
