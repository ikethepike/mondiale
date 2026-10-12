import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLAIMS } from '~~/data/claims.gen'
import {
  pickTwoTruths,
  twoTruthsReceipts,
  twoTruthsVerdicts,
} from '~~/lib/events/server/two-truths-deck'
import {
  assembleSheet,
  isPerfectSheet,
  isSpicySheet,
  isTrap,
  revealedCardIndex,
  scoreSheet,
  sheetNet,
  toSheet,
  TWO_TRUTHS_TUNING,
} from '~~/lib/two-truths'
import { isFameDealable } from '~~/types/fame.types'
import type { Game, GameDifficulty } from '~~/types/game.types'
import type { TwoTruthsSheet, TwoTruthsStamp } from '~~/types/two-truths.types'

const MAX = 10
const STAMPS: TwoTruthsStamp[] = ['true', 'lie']

/** Every verdict pattern a sheet can be dealt with: four cards, one to three lies. */
const DEALS: boolean[][] = Array.from({ length: 16 }, (_, mask) =>
  Array.from({ length: 4 }, (_, index) => !((mask >> index) & 1))
).filter(truths => {
  const lies = truths.filter(truth => !truth).length
  return lies >= 1 && lies <= 3
})

const average = (sheetFor: (truths: boolean[]) => TwoTruthsSheet[]) => {
  const scores = DEALS.flatMap(truths =>
    sheetFor(truths).map(sheet => scoreSheet({ sheet, truths, maximumPoints: MAX }) / MAX)
  )
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

describe('a Two Truths sheet pays for knowing, not for guessing', () => {
  const everySheet: TwoTruthsSheet[] = Array.from({ length: 16 }, (_, mask) =>
    Array.from({ length: 4 }, (_, index) => STAMPS[(mask >> index) & 1])
  )

  it('pays a blind sheet a fifth of the pot at most', () => {
    expect(average(() => everySheet)).toBeLessThan(0.2)
  })

  it('pays stamping everything one way no better than a blind sheet', () => {
    expect(average(() => [['true', 'true', 'true', 'true']])).toBeLessThan(0.2)
    expect(average(() => [['lie', 'lie', 'lie', 'lie']])).toBeLessThan(0.2)
  })

  it('pays two sure cards and two blanks half the sheet', () => {
    const known = average(truths => [
      [truths[0] ? 'true' : 'lie', truths[1] ? 'true' : 'lie', null, null],
    ])
    expect(known).toBeCloseTo(Math.round(MAX * TWO_TRUTHS_TUNING.sheetShare * 0.5) / MAX, 5)
  })

  it('gives the first perfect sheet the remainder of the pot', () => {
    const truths = [true, false, true, false]
    const sheet: TwoTruthsSheet = ['true', 'lie', 'true', 'lie']
    expect(isPerfectSheet(sheet, truths)).toBe(true)
    expect(scoreSheet({ sheet, truths, maximumPoints: MAX, firstPerfect: true })).toBe(MAX)
    expect(scoreSheet({ sheet, truths, maximumPoints: MAX })).toBe(
      Math.round(MAX * TWO_TRUTHS_TUNING.sheetShare)
    )
  })

  it('reads a hostile wire sheet as blanks, cut to the dealt cards', () => {
    expect(toSheet(['true', 'nope', 7, 'lie', 'lie'], 4)).toEqual(['true', null, null, 'lie'])
    expect(toSheet('true,lie', 4)).toEqual([null, null, null, null])
    expect(sheetNet(toSheet(undefined, 4), [true, true, false, false])).toBe(0)
  })

  it('reveals a card that is stable per seed and spread over every card', () => {
    expect(revealedCardIndex('g:3:p', 4)).toBe(revealedCardIndex('g:3:p', 4))
    const hits = new Set(
      Array.from({ length: 200 }, (_, seat) => revealedCardIndex(`g:3:${seat}`, 4))
    )
    expect([...hits].sort()).toEqual([0, 1, 2, 3])
  })
})

describe('the deck', () => {
  it('has a unique id for every claim and a sentence that ends', () => {
    expect(new Set(CLAIMS.map(claim => claim.id)).size).toBe(CLAIMS.length)
    for (const claim of CLAIMS) expect(claim.text, claim.id).toMatch(/^[A-Z].*\.$/)
  })

  it('assembles sheets that keep every spice rule and the lie count asked', () => {
    const bySubject = Map.groupBy(CLAIMS, claim => claim.subject)
    let seed = 7
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    let dealt = 0
    for (const claims of bySubject.values()) {
      for (const lies of TWO_TRUTHS_TUNING.lies) {
        const sheet = assembleSheet(claims, lies, random)
        if (!sheet) continue
        dealt++
        expect(sheet).toHaveLength(TWO_TRUTHS_TUNING.cards)
        expect(sheet.filter(claim => !claim.truth)).toHaveLength(lies)
        expect(isSpicySheet(sheet)).toBe(true)
        expect(sheet.filter(isTrap).length).toBeGreaterThanOrEqual(TWO_TRUTHS_TUNING.trapsPerSheet)
      }
    }
    expect(dealt).toBeGreaterThan(120)
  })
})

describe('the dealer', () => {
  const game = (difficulty: GameDifficulty, rounds: Game['rounds'] = []) =>
    ({ id: 'g', difficulty, regions: [], challengeOverrides: {}, rounds }) as unknown as Game

  it.each(['easy', 'normal', 'hard'] as const)(
    'deals four dealable cards on %s with one to three lies',
    difficulty => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const challenge = pickTwoTruths(game(difficulty), MAX)
        expect(challenge).toBeDefined()
        expect(challenge!.cards).toHaveLength(TWO_TRUTHS_TUNING.cards)
        const lies = twoTruthsVerdicts(challenge!).filter(truth => !truth).length
        expect(lies).toBeGreaterThanOrEqual(1)
        expect(lies).toBeLessThanOrEqual(3)
        for (const card of challenge!.cards) {
          const claim = CLAIMS.find(candidate => candidate.id === card.id)!
          expect(isFameDealable(claim.fame, difficulty)).toBe(true)
          expect(card).not.toHaveProperty('truth')
        }
      }
    }
  )

  it('deals every lie count about equally often', () => {
    const counts = new Map<number, number>()
    for (let deal = 0; deal < 300; deal++) {
      const lies = twoTruthsVerdicts(pickTwoTruths(game('normal'), MAX)!).filter(t => !t).length
      counts.set(lies, (counts.get(lies) ?? 0) + 1)
    }
    for (const lies of TWO_TRUTHS_TUNING.lies) expect(counts.get(lies) ?? 0).toBeGreaterThan(60)
  })

  it('never deals a claim this game has already seen', () => {
    const first = pickTwoTruths(game('normal'), MAX)!
    const played = [{ groupChallenge: first, groupAnswers: {}, playerTurns: {} }] as never
    for (let attempt = 0; attempt < 20; attempt++) {
      const next = pickTwoTruths(game('normal', played), MAX)!
      for (const card of next.cards) {
        expect(first.cards.map(seen => seen.id)).not.toContain(card.id)
      }
    }
  })

  it('narrows receipts to the cards asked for', () => {
    const challenge = pickTwoTruths(game('normal'), MAX)!
    expect(twoTruthsReceipts(challenge)).toHaveLength(TWO_TRUTHS_TUNING.cards)
    expect(twoTruthsReceipts(challenge, [2]).map(receipt => receipt.index)).toEqual([2])
  })
})

describe('the answer key stays on the server', () => {
  const importersOf = (pattern: RegExp) => {
    const root = join(__dirname, '..')
    const found: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (
          ['node_modules', '.nuxt', '.output', '.git', '.claude', 'data', 'public'].includes(entry)
        )
          continue
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|vue)$/.test(entry) && pattern.test(readFileSync(path, 'utf-8')))
          found.push(path.slice(root.length + 1))
      }
    }
    walk(root)
    return found
  }

  it('reaches the client only through the answer loader', () => {
    const deck = importersOf(/(from|import\()\s*['"][^'"]*claims\.gen['"]/).filter(
      path =>
        path !== 'lib/events/server/two-truths-deck.ts' &&
        !path.endsWith('.test.ts') &&
        !path.startsWith('generators/')
    )
    const dealer = importersOf(/(from|import\()\s*['"][^'"]*two-truths-deck['"]/).filter(
      path =>
        path !== 'lib/two-truths-answers.ts' &&
        !path.startsWith('lib/events/server/') &&
        !path.endsWith('.test.ts')
    )
    expect([...deck, ...dealer]).toEqual([])
  })
})
