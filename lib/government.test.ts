import { describe, expect, it } from 'vitest'
import {
  BEAT_POINTS,
  dealGovernment,
  governmentPool,
  GOVERNMENT_BEATS,
  MIN_PARTY_OPTIONS,
  PARTY_OPTIONS,
  SEAT_BLOCKS,
  scoreBeat,
  scoreGovernment,
  type GovernmentDeal,
} from './government'
import { gameDifficulties } from '~~/types/game.types'
import type { GameRules } from '~~/types/game.types'

const RULES = { difficulty: 'normal', variant: 'world', length: 'medium' } as unknown as GameRules

const deal = (isoCode?: Parameters<typeof dealGovernment>[2]): GovernmentDeal => {
  const dealt = dealGovernment(RULES, 'normal', isoCode)
  expect(dealt).toBeDefined()
  return dealt!
}

describe('dealGovernment', () => {
  it('offers exactly one right answer, and every option is a real party', () => {
    for (const isoCode of governmentPool(RULES)) {
      const dealt = deal(isoCode)
      const right = dealt.options.filter(option => option.name === dealt.governingParty)
      expect(right.length, `${isoCode} options`).toBe(1)
      for (const option of dealt.options) {
        expect(dealt.benches.some(bench => bench.name === option.name)).toBe(true)
      }
    }
  })

  // A logo missing from ONE option makes it the odd one out on sight, which
  // answers the question without knowing anything.
  it('gives every option a logo to stand behind', () => {
    for (const isoCode of governmentPool(RULES)) {
      for (const option of deal(isoCode).options) expect(option.logo).toBeTruthy()
    }
  })

  it('offers exactly one true seat block', () => {
    for (const isoCode of governmentPool(RULES)) {
      const dealt = deal(isoCode)
      expect(dealt.blocks).toContain(dealt.governingSeats)
      expect(dealt.blocks.filter(block => block === dealt.governingSeats).length).toBe(1)
      expect(dealt.blocks.length).toBe(SEAT_BLOCKS.normal)
      expect(new Set(dealt.blocks).size).toBe(dealt.blocks.length)
    }
  })

  // The blocks are sorted, so a fixed decoy spread would park the answer at the
  // same index every time — and "third from the left" is a rule a player can
  // learn instead of the politics. A previous version did exactly that in 15 of
  // 16 chambers.
  it('does not always hide the answer at the same position', () => {
    const isoCode = governmentPool(RULES)[0]!
    const positions = new Set(
      Array.from({ length: 40 }, () => {
        const dealt = dealGovernment(RULES, 'normal', isoCode)!
        return dealt.blocks.indexOf(dealt.governingSeats)
      })
    )
    expect(positions.size).toBeGreaterThan(1)
  })

  it('never seats more members than the chamber holds', () => {
    for (const isoCode of governmentPool(RULES)) {
      const dealt = deal(isoCode)
      const held = dealt.benches.reduce((total, bench) => total + bench.seats, 0)
      expect(held, isoCode).toBeLessThanOrEqual(dealt.totalSeats)
    }
  })

  it('sorts only benches that are on the arc, and never the one already named', () => {
    for (const isoCode of governmentPool(RULES)) {
      const dealt = deal(isoCode)
      expect(dealt.sorted).not.toContain(dealt.governingParty)
      for (const name of dealt.sorted) {
        expect(
          dealt.benches.some(bench => bench.name === name),
          `${isoCode} ${name}`
        ).toBe(true)
      }
    }
  })

  it('deals a pool at every difficulty', () => {
    for (const difficulty of gameDifficulties) {
      expect(governmentPool(RULES, difficulty).length, difficulty).toBeGreaterThanOrEqual(
        POOL_FLOOR
      )
    }
  })

  // The difficulty sets a CEILING, not a fixed count: a hard bump to six
  // options would cost a third of the pool (chambers able to fill the row run
  // 13/12/10/7 at 3/4/5/6), so the chamber fills what it can down to a floor.
  it('offers as many options as the chamber can fill, up to the difficulty', () => {
    for (const difficulty of gameDifficulties) {
      for (const isoCode of governmentPool(RULES, difficulty)) {
        const dealt = dealGovernment(RULES, difficulty, isoCode)!
        expect(dealt.options.length, `${isoCode} ${difficulty}`).toBeLessThanOrEqual(
          PARTY_OPTIONS[difficulty]
        )
        expect(dealt.options.length, `${isoCode} ${difficulty}`).toBeGreaterThanOrEqual(
          MIN_PARTY_OPTIONS
        )
      }
    }
  })

  it('lets a rich chamber deal more options at hard than at easy', () => {
    // The Netherlands seats fourteen logo-bearing benches; Italy four.
    const easy = dealGovernment(RULES, 'easy', 'NL')!
    const hard = dealGovernment(RULES, 'hard', 'NL')!
    expect(hard.options.length).toBeGreaterThan(easy.options.length)
  })
})

// 92 chambers deal today, up from 19. The round used to be a European one with
// visitors — one country in the whole western hemisphere — because the pool was
// built by matching a Wikipedia cabinet's party names against a CIA Factbook
// roster, and the join failed far more often than the data was missing.
//
// Sourcing standings from polity, where every seat row states its own side,
// replaced the matcher outright. What is left is the round's real gate: the
// governing party and two rivals must each carry a logo.
const POOL_FLOOR = 80

describe('the dealable pool', () => {
  // Pinned as NUMBERS so the round's reach stays visible. A variant that deals
  // nothing is not a crash — an undefined deal buys another kind — but it IS a
  // round that quietly never appears there, which is what these guard against.
  it('reaches every variant', () => {
    const poolOf = (variant: string) =>
      governmentPool({ ...RULES, variant } as unknown as GameRules).length

    expect(poolOf('world')).toBeGreaterThanOrEqual(POOL_FLOOR)
    // Every region now deals. South America and the Middle East were both
    // pinned at exactly zero before the swap; the Americas had Canada alone.
    for (const variant of [
      'europe',
      'asia',
      'africa',
      'north-america',
      'south-america',
      'oceania',
      'middle-east',
    ] as const) {
      expect(poolOf(variant), `${variant} deals nothing`).toBeGreaterThan(0)
    }
    // The round is no longer Europe-weighted by an order of magnitude: Asia and
    // Africa each deal within striking distance of Europe.
    expect(poolOf('asia')).toBeGreaterThanOrEqual(15)
    expect(poolOf('africa')).toBeGreaterThanOrEqual(15)
  })
})

describe('the reveal facts', () => {
  // The flag drives the reveal's teaching sentence, so it has to agree with
  // the seats rather than with whether a supply deal happens to exist. An
  // earlier version required backers, which called Denmark and Spain — both
  // governing in a minority with no formal deal — majority governments.
  it('calls a government a minority on its seats alone', () => {
    for (const isoCode of governmentPool(RULES)) {
      const dealt = deal(isoCode)
      const held = dealt.benches
        .filter(bench => bench.standing === 'government')
        .reduce((total, bench) => total + bench.seats, 0)
      expect(dealt.minority, isoCode).toBe(held * 2 <= dealt.totalSeats)
    }
  })

  it('only counts backed seats where a supply deal carries the government', () => {
    for (const isoCode of governmentPool(RULES)) {
      const dealt = deal(isoCode)
      const backers = dealt.benches.filter(bench => bench.standing === 'backing')
      if (!backers.length) {
        expect(dealt.backedSeats, isoCode).toBeUndefined()
        continue
      }
      const held = dealt.benches
        .filter(bench => bench.standing === 'government')
        .reduce((total, bench) => total + bench.seats, 0)
      expect(dealt.backedSeats, isoCode).toBe(
        held + backers.reduce((total, bench) => total + bench.seats, 0)
      )
    }
  })

  // Sweden is the whole reason the round separates backers from opposition:
  // the government's own 103 seats are short of the 175 a majority needs, and
  // the supply deal is what closes the gap.
  it('shows Sweden governing from a minority its backers carry', () => {
    const dealt = deal('SE')
    expect(dealt.minority).toBe(true)
    expect(dealt.backedSeats).toBeGreaterThan(dealt.totalSeats / 2)
  })

  // The status line is printed verbatim under the verdict, so markup or a
  // citation tail reaches the player as debris.
  it('carries a status clean enough to print', () => {
    for (const isoCode of governmentPool(RULES)) {
      const { status } = deal(isoCode)
      if (!status) continue
      expect(status, isoCode).not.toMatch(/\{\{|\[\[|url=|https?:|<[a-z]/i)
      expect(status.length, isoCode).toBeLessThanOrEqual(60)
    }
  })
})

describe('scoreBeat', () => {
  const sweden = () => deal('SE')

  it('pays the party beat only for the party that governs', () => {
    const dealt = sweden()
    expect(scoreBeat('party', dealt, { party: dealt.governingParty })).toBe(BEAT_POINTS.party)
    const wrong = dealt.options.find(option => option.name !== dealt.governingParty)!
    expect(scoreBeat('party', dealt, { party: wrong.name })).toBe(0)
    expect(scoreBeat('party', dealt, {})).toBe(0)
  })

  it('pays the seats beat only for the exact block', () => {
    const dealt = sweden()
    expect(scoreBeat('seats', dealt, { seats: dealt.governingSeats })).toBe(BEAT_POINTS.seats)
    const wrong = dealt.blocks.find(block => block !== dealt.governingSeats)!
    expect(scoreBeat('seats', dealt, { seats: wrong })).toBe(0)
  })

  // Beat 3 is four judgements, so it pays per bench — an all-or-nothing sort
  // would make one slip worth as much as knowing nothing.
  it('pays the sides beat per bench', () => {
    const dealt = sweden()
    const truth = Object.fromEntries(
      dealt.sorted.map(name => {
        const standing = dealt.benches.find(bench => bench.name === name)!.standing
        return [name, standing === 'opposition' ? 'opposition' : 'government'] as const
      })
    )
    expect(scoreBeat('sides', dealt, { sides: truth })).toBe(BEAT_POINTS.sides)

    const flipped = Object.fromEntries(
      Object.entries(truth).map(([name, side]) => [
        name,
        side === 'government' ? 'opposition' : 'government',
      ])
    ) as Record<string, 'government' | 'opposition'>
    expect(scoreBeat('sides', dealt, { sides: flipped })).toBe(0)
    expect(scoreBeat('sides', dealt, {})).toBe(0)
  })

  // Isaac's catch, encoded: the Sweden Democrats hold no ministries but keep
  // the government in power. Beat 3 asks who is WITH the government, so filing
  // them there is right — the ministries/backing distinction is the reveal's
  // lesson, not a trap in the grade.
  it('counts a confidence-and-supply backer as with the government', () => {
    const dealt = sweden()
    const backer = dealt.benches.find(bench => bench.standing === 'backing')
    expect(backer, 'Sweden should deal a backing bench').toBeDefined()
    if (!dealt.sorted.includes(backer!.name)) return
    const sides = { [backer!.name]: 'government' } as Record<string, 'government' | 'opposition'>
    expect(scoreBeat('sides', dealt, { sides })).toBeGreaterThan(0)
  })

  it('never pays more than the beat is worth', () => {
    for (const isoCode of governmentPool(RULES)) {
      const dealt = deal(isoCode)
      for (const beat of GOVERNMENT_BEATS) {
        const everything = {
          party: dealt.governingParty,
          seats: dealt.governingSeats,
          sides: Object.fromEntries(dealt.sorted.map(name => [name, 'government'] as const)),
        }
        expect(scoreBeat(beat, dealt, everything)).toBeLessThanOrEqual(BEAT_POINTS[beat])
      }
    }
  })
})

describe('scoreGovernment', () => {
  it('sums the beats, and pays nothing for silence', () => {
    const dealt = deal('SE')
    expect(scoreGovernment(dealt, {})).toBe(0)
    const perfect = {
      party: dealt.governingParty,
      seats: dealt.governingSeats,
      sides: Object.fromEntries(
        dealt.sorted.map(name => {
          const standing = dealt.benches.find(bench => bench.name === name)!.standing
          return [name, standing === 'opposition' ? 'opposition' : 'government'] as const
        })
      ),
    }
    expect(scoreGovernment(dealt, perfect)).toBe(
      GOVERNMENT_BEATS.reduce((total, beat) => total + BEAT_POINTS[beat], 0)
    )
  })
})
