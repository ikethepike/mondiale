import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  roundChallengeKind,
  type RoundChallengeKind,
} from '~~/types/challenges/traversal-challenge.type'
import type { Game } from '~~/types/game.types'

// The mix is mocked so a staging can be driven down an exact sequence of
// kinds; the dealers underneath stay real, so a "miss" is a real thin-table
// miss (manhunt at a duo) rather than a stubbed one.
const { pickRoundKind } = vi.hoisted(() => ({ pickRoundKind: vi.fn() }))
vi.mock('./round-mix', async importOriginal => ({
  ...(await importOriginal<typeof import('./round-mix')>()),
  pickRoundKind,
}))

const { getRoundChallenge } = await import('./challenges')

/** Sequence the mix's picks; the loop takes them in order. */
const dealsInOrder = (...kinds: RoundChallengeKind[]) => {
  pickRoundKind.mockReset()
  for (const kind of kinds) pickRoundKind.mockReturnValueOnce(kind)
  pickRoundKind.mockReturnValue(undefined)
}

const game = (players: number, rounds = 3, difficulty: Game['difficulty'] = 'normal'): Game =>
  ({
    id: 'test-room',
    variant: 'world',
    difficulty,
    rounds: Array.from({ length: rounds }, () => ({})),
    players: Object.fromEntries(
      Array.from({ length: players }, (_, index) => [
        `p${index}`,
        { phase: 'group-challenge', currentPosition: 0 },
      ])
    ),
  }) as unknown as Game

beforeEach(() => {
  delete process.env.FORCE_ROUND_TYPE
  vi.restoreAllMocks()
})

afterEach(() => {
  delete process.env.FORCE_ROUND_TYPE
  pickRoundKind.mockReset()
})

describe('round staging', () => {
  it('re-rolls past a kind the table is too thin for, instead of dropping to ranking', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // manhunt needs four players — at a duo its dealer yields nothing.
    dealsInOrder('manhunt', 'silhouette')

    const dealt = await getRoundChallenge({ game: game(2) })

    expect(roundChallengeKind(dealt)).toBe('silhouette')
    expect(pickRoundKind).toHaveBeenCalledTimes(2)
  })

  it('excludes a spent kind from the next pick so an attempt is never burnt twice', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // The exclusion list is passed by reference and keeps growing, so snapshot
    // what each call actually saw at the time.
    const excludedAt: RoundChallengeKind[][] = []
    pickRoundKind.mockReset()
    pickRoundKind.mockImplementation(({ exclude }: { exclude?: RoundChallengeKind[] }) => {
      excludedAt.push([...(exclude ?? [])])
      return excludedAt.length === 1 ? 'manhunt' : 'silhouette'
    })

    await getRoundChallenge({ game: game(2) })

    expect(excludedAt[0]).toEqual([])
    expect(excludedAt[1]).toEqual(['manhunt'])
  })

  it('takes the ranking floor once the attempt budget is spent, logging the table shape', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // A solo table: manhunt and unique-or-bust are gated on size, and
    // border-chain has nobody to outlast.
    dealsInOrder('manhunt', 'unique-or-bust', 'border-chain')

    const dealt = await getRoundChallenge({ game: game(1) })

    expect(roundChallengeKind(dealt)).toBe('ranking')
    expect(pickRoundKind).toHaveBeenCalledTimes(3)

    const summary = warn.mock.calls
      .map(call => String(call[0]))
      .find(line => line.includes('fell back'))
    expect(summary).toContain('test-room')
    expect(summary).toContain('manhunt, unique-or-bust, border-chain')
    expect(summary).toContain('1 players')
    expect(summary).toContain('normal/world')
  })

  it('does not retry a dealer that THREW — it takes the floor at once', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    // A drifted dataset surfaces as a throw from inside the dealer, not as an
    // empty pool.
    const timeline = await import('./timeline')
    vi.spyOn(timeline, 'dealTimelineDeck').mockImplementation(() => {
      throw new Error('drifted dataset')
    })
    dealsInOrder('timeline', 'silhouette')

    const dealt = await getRoundChallenge({ game: game(4) })

    expect(roundChallengeKind(dealt)).toBe('ranking')
    // One pick only: the throw must not buy a second kind.
    expect(pickRoundKind).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalled()
  })

  it('takes the floor when an ASYNC dealer rejects, same as a sync throw', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    // empire's dealer is async — a rejected promise must reach the same floor
    // as a synchronous throw, not slip past as "nothing viable".
    const empires = await import('./empires')
    vi.spyOn(empires, 'subsampleKeyframes').mockImplementation(() => {
      throw new Error('drifted keyframes')
    })
    dealsInOrder('empire', 'silhouette')

    const dealt = await getRoundChallenge({ game: game(4) })

    expect(roundChallengeKind(dealt)).toBe('ranking')
    expect(pickRoundKind).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalled()
  })

  it('keeps FORCE_ROUND_TYPE bypassing the mix entirely', async () => {
    process.env.FORCE_ROUND_TYPE = 'silhouette'
    dealsInOrder('sketch')

    const dealt = await getRoundChallenge({ game: game(4) })

    expect(roundChallengeKind(dealt)).toBe('silhouette')
    expect(pickRoundKind).not.toHaveBeenCalled()
  })

  it('still opens every game on ranking, without consulting the mix', async () => {
    dealsInOrder('sketch')

    const dealt = await getRoundChallenge({ game: game(4, 0) })

    expect(roundChallengeKind(dealt)).toBe('ranking')
    expect(pickRoundKind).not.toHaveBeenCalled()
  })

  it('deals ranking as a first-class pick, not as a miss', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    dealsInOrder('ranking')

    const dealt = await getRoundChallenge({ game: game(4) })

    expect(roundChallengeKind(dealt)).toBe('ranking')
    // One pick, and no "had nothing" / "fell back" noise — it was a real deal.
    expect(pickRoundKind).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })
})
