import { describe, expect, it } from 'vitest'
import { regionsForVariant } from '~~/lib/board-regions'
import { mentionsCountry } from '~~/lib/country'
import { buzzScore } from '~~/lib/scoring'
import { TIMEOUT_SLACK_MS } from '~~/lib/round-beats'
import { dealUnmask } from '~~/lib/events/server/unmask-deal'
import { unmaskDossier } from '~~/lib/events/server/unmask-file'
import { startUnmask } from '~~/lib/events/server/unmask-seal'
import { gradeGroupAnswer, type GroupSubmission } from '~~/lib/events/server/grade-group-answer'
import {
  decodePixels,
  downsamplePixels,
  narrowFields,
  unmaskClueLine,
  unmaskFacts,
  unmaskInitials,
} from './unmask'
import { UNMASK_TUNING, unmaskKey, unmaskRemainingFraction, unmaskRungsShown } from './unmask-pace'
import type { UnmaskChallenge, UnmaskFile } from '~~/types/challenges/group-modes.type'
import type { Game, GameDifficulty, GameVariant, Round } from '~~/types/game.types'
import type { EngineContext } from '~~/lib/events/server/round-engine'

const gameFor = (variant: GameVariant, difficulty: GameDifficulty) =>
  ({ id: 'g', regions: regionsForVariant(variant), difficulty, rounds: [] }) as unknown as Game

const DEALS = 60
const MAX = 10

const deal = (variant: GameVariant, difficulty: GameDifficulty) => {
  const dealt = dealUnmask(gameFor(variant, difficulty), MAX)
  expect(dealt, `${variant}/${difficulty}`).toBeDefined()
  return dealt as UnmaskChallenge & { sealed: UnmaskFile }
}

describe('the Unmask deal', () => {
  it('opens on a face and ends on the name, rung for rung with its file', () => {
    for (const variant of ['world', 'europe', 'africa', 'asia'] as const) {
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        for (let round = 0; round < DEALS / 6; round++) {
          const { rungs, suspects, sealed } = deal(variant, difficulty)
          expect(rungs[0]).toBe('portrait')
          expect(rungs.at(-1)).toBe('name')
          expect(sealed.clues.map(clue => clue.kind)).toEqual(rungs)
          expect(sealed.fields).toHaveLength(rungs.length)
          expect(suspects).toContain(sealed.country)
          for (const field of sealed.fields) expect(field).toContain(sealed.country)
        }
      }
    }
  })

  it('never lets the map answer for the player', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const { floor } = UNMASK_TUNING[difficulty]
      for (let round = 0; round < DEALS; round++) {
        const { suspects, sealed } = deal('world', difficulty)
        for (const field of sealed.fields) {
          expect(field.length).toBeGreaterThanOrEqual(Math.min(floor, suspects.length))
        }
      }
    }
  })

  it('says nothing that names the country before the reveal', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (let round = 0; round < DEALS; round++) {
        const { sealed } = deal('world', difficulty)
        for (const clue of sealed.clues) {
          // A region is not a giveaway, though "Africa" stems South Africa.
          const { line } = unmaskClueLine(clue)
          if (line && clue.kind !== 'region')
            expect(mentionsCountry(line, sealed.country), line).toBe(false)
          if (clue.kind === 'logo') expect(clue.logo).not.toContain(sealed.country)
        }
      }
    }
  })

  it('cuts each portrait tier from the one source, coarse to fine', () => {
    const { sealed } = deal('world', 'normal')
    const sizes = sealed.clues.flatMap(clue => (clue.kind === 'portrait' ? [clue.size] : []))
    expect(sizes).toEqual(UNMASK_TUNING.normal.tiers)
    const [first, ...rest] = sealed.clues.filter(clue => clue.kind === 'portrait')
    const finest = rest.at(-1)!
    if (first?.kind !== 'portrait' || finest.kind !== 'portrait') throw new Error('no portrait')
    expect(downsamplePixels(decodePixels(finest.pixels), finest.size, first.size)).toEqual(
      decodePixels(first.pixels)
    )
  })

  it('keeps a shared leader out of the lineup', () => {
    for (let round = 0; round < DEALS; round++) {
      const { suspects } = deal('world', 'hard')
      const names = suspects.map(isoCode => unmaskFacts(isoCode)!.leader.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('stocks enough files to deal a world board', () => {
    expect(deal('world', 'hard').suspects.length).toBeGreaterThanOrEqual(150)
  })
})

describe('the sealed file', () => {
  it('leaves the snapshot before the reveal saves', async () => {
    const challenge = deal('world', 'normal')
    const game = { ...gameFor('world', 'normal'), rounds: [{ groupChallenge: challenge }] }
    const store = new Map<string, unknown>()
    const redis = {
      set: async (key: string, value: unknown) => void store.set(key, value),
      expire: async () => 1,
    } as unknown as EngineContext['redis']
    const sealed = challenge.sealed
    await startUnmask({ redis }, game as unknown as Game, challenge)
    expect(challenge.sealed).toBeUndefined()
    expect(store.get(unmaskKey('g', 0))).toEqual(sealed)
    expect(JSON.stringify(challenge)).not.toContain(`"country":"${sealed.country}"`)
    // A second call finds nothing to move and leaves the key alone.
    await startUnmask({ redis }, game as unknown as Game, challenge)
    expect(store.get(unmaskKey('g', 0))).toEqual(sealed)
  })
})

describe('the dossier', () => {
  const STARTS = 1_000_000
  const challenge = deal('world', 'normal')
  const file = challenge.sealed
  const cut = (now: number, revealed = false) =>
    unmaskDossier({
      challenge,
      file,
      round: { playStartsAt: STARTS },
      roundIndex: 0,
      now,
      revealed,
    })

  it('holds every rung back until the round clock reaches it', () => {
    expect(cut(STARTS - 5_000).clues).toHaveLength(0)
    expect(cut(STARTS).clues).toHaveLength(1)
    const step = challenge.secondsPerRung * 1000
    expect(cut(STARTS + step * 2 + 10).clues).toHaveLength(3)
    expect(cut(STARTS + step * 999).clues).toHaveLength(challenge.rungs.length)
  })

  it('names the subject only once revealed', () => {
    expect(cut(STARTS + 999_999).reveal).toBeUndefined()
    expect(cut(STARTS, true).reveal).toEqual({ country: file.country })
    expect(cut(STARTS, true).clues).toHaveLength(challenge.rungs.length)
  })

  it('lights the field the landed rungs leave', () => {
    const step = challenge.secondsPerRung * 1000
    expect(cut(STARTS - 1).field).toEqual(challenge.suspects)
    expect(cut(STARTS + step).field).toEqual(file.fields[1])
  })
})

describe('the accusation', () => {
  const STARTS = 1_000_000
  const challenge = deal('world', 'normal')
  const file = challenge.sealed
  const accuse = (ranking: string[], ms: number) =>
    gradeGroupAnswer({
      game: { id: 'g', difficulty: 'normal', regions: [], rounds: [] } as unknown as Game,
      round: {
        groupChallenge: challenge,
        groupAnswers: {},
        playerTurns: {},
        playStartsAt: STARTS,
      } as unknown as Round,
      playerId: 'p',
      submission: { ranking } as GroupSubmission,
      at: STARTS + ms + TIMEOUT_SLACK_MS,
      redis: { get: async <T>() => file as T },
    })

  it('pays the right country by how little of the file it needed', async () => {
    const early = await accuse([file.country], 0)
    expect(early.scoring.scored).toBe(MAX)
    const step = challenge.secondsPerRung * 1000
    const late = await accuse([file.country], step * 4 + 10)
    expect(late.scoring.scored).toBe(buzzScore(MAX, unmaskRemainingFraction(challenge, 5)))
    expect(late.answer.unmaskRung).toBe(5)
  })

  it('pays a wrong country nothing, and never banks a country on the snapshot', async () => {
    const wrong = await accuse([file.country === 'FR' ? 'DE' : 'FR'], 0)
    expect(wrong.scoring.scored).toBe(0)
    for (const graded of [wrong, await accuse([file.country], 0)]) {
      expect(graded.answer.submitted).toEqual([])
      expect(graded.answer.correct).toEqual([])
    }
  })
})

describe('the Unmask pace', () => {
  const ladder = { rungs: ['portrait', 'born', 'office', 'name'] as never, secondsPerRung: 5 }

  it('opens one rung per interval, the first at once', () => {
    expect(unmaskRungsShown(ladder, 0)).toBe(1)
    expect(unmaskRungsShown(ladder, 4_999)).toBe(1)
    expect(unmaskRungsShown(ladder, 5_000)).toBe(2)
    expect(unmaskRungsShown(ladder, 60_000)).toBe(4)
  })

  it('pays in full on the first rung and only the floor once the name is out', () => {
    expect(unmaskRemainingFraction(ladder, 1)).toBe(1)
    expect(unmaskRemainingFraction(ladder, 4)).toBe(0)
  })
})

describe('the file helpers', () => {
  it('writes initials without particles, keeping regnal numerals', () => {
    expect(unmaskInitials('Emmanuel Macron')).toBe('E. M.')
    expect(unmaskInitials('Mohammed bin Zayed Al Nahyan')).toBe('M. Z. N.')
    expect(unmaskInitials('Charles III')).toBe('C. III')
  })

  it('reads the office off the title, not a second role in the description', () => {
    expect(unmaskFacts('FR')?.office).toBe('president')
    expect(unmaskFacts('QA')?.office).toBe('monarch')
    expect(unmaskFacts('JP')?.office).toBe('premier')
  })

  it('narrows only while the floor holds', () => {
    const facts = {
      A: { born: 1950 },
      B: { born: 1950 },
      C: { born: 1960 },
    } as const
    const fields = narrowFields(
      ['A', 'B', 'C'] as never,
      [{ kind: 'born', decade: 1950 }],
      isoCode => facts[isoCode as keyof typeof facts] as never,
      2
    )
    expect(fields).toEqual([['A', 'B']])
    expect(
      narrowFields(
        ['A', 'B', 'C'] as never,
        [{ kind: 'born', decade: 1960 }],
        isoCode => facts[isoCode as keyof typeof facts] as never,
        2
      )
    ).toEqual([['A', 'B', 'C']])
  })
})
