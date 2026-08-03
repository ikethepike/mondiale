import { describe, expect, it } from 'vitest'
import {
  CHALLENGE_GROUP_BY_KIND,
  MINIMUM_TABLE_BY_KIND,
} from '~~/types/challenges/challenge-groups.type'
import type { ChallengeOverrides } from '~~/types/challenges/challenge-groups.type'
import type { RoundChallenge, RoundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import { roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import type { GameDifficulty } from '~~/types/game.types'
import {
  isKindFeasible,
  MECHANIC_BY_KIND,
  MIX_TUNING,
  mixWeights,
  pickRoundKind,
  recentKinds,
  ROUND_KINDS,
  ROUND_WEIGHTS,
} from './round-mix'

/** Seeded RNG so the statistical assertions below are reproducible. Local to
 *  the tests on purpose — nothing in production wants a seeded mix. */
const mulberry32 = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * The minimal persisted shape each kind round-trips through
 * `roundChallengeKind`. Built from that function's own switch so a history
 * fixture can never disagree with the reader the mix uses.
 */
const challengeOf = (kind: RoundChallengeKind): RoundChallenge | undefined => {
  if (kind === 'ranking') return undefined
  if (kind === 'river-run') return { _type: 'water-blitz-challenge', kind: 'river' } as RoundChallenge
  if (kind === 'shared-shores') return { _type: 'water-blitz-challenge', kind: 'sea' } as RoundChallenge
  if (kind === 'highlands') return { _type: 'water-blitz-challenge', kind: 'range' } as RoundChallenge
  if (kind === 'name-that-water') return { _type: 'name-water-challenge' } as RoundChallenge
  return { _type: `${kind}-challenge` } as RoundChallenge
}

const roundsOf = (...kinds: RoundChallengeKind[]) =>
  kinds.map(kind => ({ groupChallenge: challengeOf(kind) }))

const gameWith = (
  kinds: RoundChallengeKind[],
  difficulty: GameDifficulty = 'hard',
  challengeOverrides?: ChallengeOverrides
) => ({ difficulty, challengeOverrides, rounds: roundsOf(...kinds) })

const weightOf = (entries: [RoundChallengeKind, number][], kind: RoundChallengeKind) =>
  entries.find(([candidate]) => candidate === kind)?.[1] ?? 0

describe('the mix tables', () => {
  it('prices and classifies every round kind', () => {
    for (const kind of ROUND_KINDS) {
      expect(ROUND_WEIGHTS[kind], `${kind} has no weight`).toBeGreaterThan(0)
      expect(MECHANIC_BY_KIND[kind], `${kind} has no mechanic`).toBeTruthy()
    }
    expect(ROUND_KINDS.length).toBe(Object.keys(CHALLENGE_GROUP_BY_KIND).length)
  })

  it('keeps the deliberate rarities rarer than every staple', () => {
    const rare: RoundChallengeKind[] = ['ghost-state', 'no-mans-land', 'flashpoint']
    const staples = ROUND_KINDS.filter(kind => !rare.includes(kind))
    for (const oddity of rare) {
      for (const staple of staples) {
        expect(
          ROUND_WEIGHTS[oddity],
          `${oddity} must stay rarer than ${staple}`
        ).toBeLessThan(ROUND_WEIGHTS[staple])
      }
    }
  })
})

describe('recentKinds', () => {
  it('reads the history nearest-first, capped at the window', () => {
    const game = gameWith(['sketch', 'timeline', 'hot-cold'])
    expect(recentKinds(game, 6)).toEqual(['hot-cold', 'timeline', 'sketch'])
    expect(recentKinds(game, 2)).toEqual(['hot-cold', 'timeline'])
  })

  it('reads a legacy ranking round (no _type) as ranking', () => {
    expect(recentKinds(gameWith(['ranking']), 6)).toEqual(['ranking'])
  })
})

describe('mixWeights', () => {
  it('leaves the nominal weights untouched with no history', () => {
    const entries = mixWeights({ game: gameWith([]), contenders: 4 })
    for (const [kind, weight] of entries) expect(weight).toBeCloseTo(ROUND_WEIGHTS[kind], 10)
  })

  it('never returns more than a kind is nominally worth, whatever the history', () => {
    // The formal statement of "decay must not promote a rarity into a staple".
    const histories: RoundChallengeKind[][] = [
      ['river-run'],
      ['ghost-state', 'ghost-state'],
      ['sketch', 'timeline', 'hot-cold', 'empire', 'ranking', 'silhouette'],
      ['river-run', 'shared-shores', 'highlands', 'river-run', 'shared-shores', 'highlands'],
    ]
    for (const history of histories) {
      for (const [kind, weight] of mixWeights({ game: gameWith(history), contenders: 4 })) {
        expect(weight, `${kind} after ${history.join('>')}`).toBeLessThanOrEqual(
          ROUND_WEIGHTS[kind] + 1e-12
        )
      }
    }
  })

  it('drops the kind just played to the floor', () => {
    const entries = mixWeights({ game: gameWith(['sketch']), contenders: 4 })
    expect(weightOf(entries, 'sketch')).toBeCloseTo(ROUND_WEIGHTS.sketch * MIX_TUNING.floor, 10)
  })

  it('bites a shared group harder than a shared mechanic alone', () => {
    // river-run is water + collect. shared-shores shares both; two-truths
    // shares neither; flag-palette shares only the mechanic with… nothing —
    // so compare a group-only sharer against a mechanic-only sharer.
    const entries = mixWeights({ game: gameWith(['river-run']), contenders: 4 })
    const share = (kind: RoundChallengeKind) => weightOf(entries, kind) / ROUND_WEIGHTS[kind]

    // name-that-water: same group (water), different mechanic (typed).
    // no-mans-land: same mechanic (collect), different group (disputed).
    expect(share('name-that-water')).toBeLessThan(share('no-mans-land'))
    // Neither axis touched — untouched weight.
    expect(share('two-truths')).toBeCloseTo(1, 10)
  })

  it('leaves a rarity untouched when it shares no axis with the history', () => {
    const entries = mixWeights({ game: gameWith(['sketch']), contenders: 4 })
    expect(weightOf(entries, 'ghost-state')).toBeCloseTo(ROUND_WEIGHTS['ghost-state'], 10)
  })

  it('recovers monotonically with distance and forgets past the window', () => {
    const at = (distance: number) => {
      const filler: RoundChallengeKind[] = Array.from({ length: distance - 1 }, () => 'ranking')
      // 'sketch' sits `distance` rounds back.
      return weightOf(
        mixWeights({ game: gameWith(['sketch', ...filler]), contenders: 4 }),
        'sketch'
      )
    }
    expect(at(1)).toBeLessThan(at(2))
    expect(at(2)).toBeLessThan(at(3))
    expect(at(3)).toBeLessThan(at(6))
    // One past the window, the round is ancient history.
    expect(at(MIX_TUNING.window + 1)).toBeCloseTo(ROUND_WEIGHTS.sketch, 10)
  })

  it('never empties, even repeating one kind at a table with almost nothing on', () => {
    const allOff: ChallengeOverrides = {
      conflicts: false,
      navigation: false,
      water: false,
      flags: false,
      culture: false,
      disputed: false,
      trends: false,
      empires: false,
    }
    const game = gameWith(
      ['ranking', 'ranking', 'ranking', 'ranking', 'ranking', 'ranking'],
      'hard',
      allOff
    )
    const entries = mixWeights({ game, contenders: 2 })
    // Core survives every toggle: ranking, stat-detective, two-truths.
    expect(entries.length).toBe(3)
    for (const [, weight] of entries) expect(weight).toBeGreaterThan(0)
  })

  it('drops excluded kinds outright', () => {
    const entries = mixWeights({ game: gameWith([]), contenders: 4, exclude: ['ranking', 'sketch'] })
    expect(weightOf(entries, 'ranking')).toBe(0)
    expect(weightOf(entries, 'sketch')).toBe(0)
    expect(entries.length).toBe(ROUND_KINDS.length - 2)
  })
})

describe('isKindFeasible', () => {
  it('gates each kind on its own declared minimum table', () => {
    for (const kind of ROUND_KINDS) {
      const minimum = MINIMUM_TABLE_BY_KIND[kind] ?? 0
      expect(isKindFeasible(kind, minimum)).toBe(true)
      if (minimum > 0) expect(isKindFeasible(kind, minimum - 1)).toBe(false)
    }
  })

  it('lets every ungated kind deal at a table of one', () => {
    const gated = Object.keys(MINIMUM_TABLE_BY_KIND) as RoundChallengeKind[]
    for (const kind of ROUND_KINDS) {
      if (!gated.includes(kind)) expect(isKindFeasible(kind, 1)).toBe(true)
    }
  })
})

/** Deal `rounds` kinds, feeding each pick back as history — the real loop. */
const simulate = ({
  rounds,
  contenders,
  difficulty = 'hard',
  challengeOverrides,
  random,
  decay = true,
}: {
  rounds: number
  contenders: number
  difficulty?: GameDifficulty
  challengeOverrides?: ChallengeOverrides
  random: () => number
  decay?: boolean
}): RoundChallengeKind[] => {
  const dealt: RoundChallengeKind[] = []
  for (let round = 0; round < rounds; round++) {
    // The no-decay control deals against an empty history every time.
    const game = gameWith(decay ? dealt : [], difficulty, challengeOverrides)
    const kind = pickRoundKind({ game, contenders }, random)
    if (!kind) break
    dealt.push(kind)
  }
  return dealt
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

describe('the mix over a full game', () => {
  const GAMES = 500
  const ROUNDS = 12

  const play = (decay: boolean) => {
    const random = mulberry32(1234)
    const games: RoundChallengeKind[][] = []
    for (let game = 0; game < GAMES; game++) {
      games.push(simulate({ rounds: ROUNDS, contenders: 4, random, decay }))
    }
    return games
  }

  const distinctCount = (games: RoundChallengeKind[][]) =>
    games.map(dealt => new Set(dealt).size)

  const repeatRate = (games: RoundChallengeKind[][]) => {
    let repeats = 0
    let slots = 0
    for (const dealt of games) {
      for (let index = 1; index < dealt.length; index++) {
        slots++
        if (dealt[index] === dealt[index - 1]) repeats++
      }
    }
    return repeats / slots
  }

  it('covers more of the roster than an undecayed draw', () => {
    const decayed = median(distinctCount(play(true)))
    const control = median(distinctCount(play(false)))
    // The undecayed draw re-treads: ~10 distinct kinds across 12 rounds.
    expect(control).toBeLessThanOrEqual(10)
    // Decayed, a board is close to all-distinct.
    expect(decayed).toBeGreaterThanOrEqual(12)
  })

  it('almost never deals the same kind twice running', () => {
    expect(repeatRate(play(true))).toBeLessThan(0.005)
    // …and the control shows the problem it fixes.
    expect(repeatRate(play(false))).toBeGreaterThan(0.04)
  })

  it('keeps the rarities rare and ranking the staple', () => {
    const dealt = play(true).flat()
    const share = (kind: RoundChallengeKind) =>
      dealt.filter(seen => seen === kind).length / dealt.length

    const rarities = share('ghost-state') + share('no-mans-land') + share('flashpoint')
    expect(rarities).toBeLessThan(0.06)

    const ranked = ROUND_KINDS.map(kind => [kind, share(kind)] as const).sort(
      (a, b) => b[1] - a[1]
    )
    expect(ranked[0][0]).toBe('ranking')
  })

  it('clusters one group three-deep far less often than an undecayed draw', () => {
    // Not an absolute bar: `navigation` and `culture` hold five to six kinds
    // each, so some co-occurrence is structural. What matters is the mix
    // cutting it several-fold against the same seed.
    const clusterRate = (games: RoundChallengeKind[][]) => {
      let clustered = 0
      let windows = 0
      for (const dealt of games) {
        for (let index = 3; index < dealt.length; index++) {
          windows++
          const groups = dealt
            .slice(index - 3, index + 1)
            .map(kind => CHALLENGE_GROUP_BY_KIND[kind])
          const worst = Math.max(...groups.map(group => groups.filter(g => g === group).length))
          if (worst >= 3) clustered++
        }
      }
      return clustered / windows
    }
    expect(clusterRate(play(true))).toBeLessThan(clusterRate(play(false)) / 3)
  })
})

describe('the mix at a small table', () => {
  it('never deals a kind the table is too small for', () => {
    const random = mulberry32(99)
    const dealt = simulate({ rounds: 2000, contenders: 2, difficulty: 'easy', random })
    expect(dealt).not.toContain('manhunt')
    expect(dealt).not.toContain('unique-or-bust')
  })

  it('still spreads across a thin pool rather than alternating', () => {
    const random = mulberry32(7)
    const challengeOverrides: ChallengeOverrides = {
      water: false,
      navigation: false,
      trends: false,
    }
    const dealt = simulate({
      rounds: 2000,
      contenders: 2,
      difficulty: 'easy',
      challengeOverrides,
      random,
    })
    const kinds = new Set(dealt)
    for (const kind of kinds) {
      const share = dealt.filter(seen => seen === kind).length / dealt.length
      expect(share, `${kind} starved at ${share}`).toBeGreaterThan(0.03)
    }
  })

  it('keeps dealing past the window when only the core three are on', () => {
    // The floor's reason to exist: with a near-total kindBite and a pool of
    // three, a game longer than the window must not stall or lock into a
    // rigid cycle. Every core kind keeps a real share.
    const random = mulberry32(31)
    const allOff: ChallengeOverrides = {
      conflicts: false,
      navigation: false,
      water: false,
      flags: false,
      culture: false,
      disputed: false,
      trends: false,
      empires: false,
    }
    const dealt = simulate({
      rounds: 400,
      contenders: 2,
      difficulty: 'easy',
      challengeOverrides: allOff,
      random,
    })
    expect(dealt.length).toBe(400)
    for (const kind of ['ranking', 'stat-detective', 'two-truths'] as RoundChallengeKind[]) {
      const share = dealt.filter(seen => seen === kind).length / dealt.length
      expect(share, `${kind} starved at ${share}`).toBeGreaterThan(0.15)
    }
  })
})

describe('history fixtures', () => {
  it('round-trips every kind through roundChallengeKind', () => {
    // Guards the fixtures above: a synthetic round must read back as its kind,
    // or every decay assertion here is silently testing nothing.
    for (const kind of ROUND_KINDS) {
      expect(roundChallengeKind(challengeOf(kind)), `${kind} fixture`).toBe(kind)
    }
  })
})
