import { afterEach, describe, expect, it } from 'vitest'
import { EMPIRES } from '~~/data/empires.gen'
import { clampClientScore, getRoundChallenge } from '~~/lib/challenges'
import {
  EMPIRE_TUNING,
  empireAnswerMatches,
  empireFameWeight,
  empirePots,
  normalizeEmpireAnswer,
  scoreEmpireExtent,
  subsampleKeyframes,
} from '~~/lib/empires'
import { variantCountries } from '~~/lib/variant'
import type { EmpireChallenge } from '~~/types/challenges/group-modes.type'
import { FAME_BY_DIFFICULTY, FAME_TIERS, isFameDealable } from '~~/types/fame.types'
import { gameDifficulties, type Game, type GameDifficulty } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

describe('empirePots', () => {
  it('splits the pot with the smaller share on the name', () => {
    for (const maximum of [12, 15, 21]) {
      const pots = empirePots(maximum)
      expect(pots.name + pots.extent).toBe(maximum)
      expect(pots.name).toBeLessThan(pots.extent)
      expect(pots.name).toBe(Math.round(maximum * 0.4))
    }
  })
})

describe('subsampleKeyframes', () => {
  it('returns everything when the set already fits', () => {
    expect(subsampleKeyframes([1, 2, 3], 5, 2)).toEqual([1, 2, 3])
  })

  it('always keeps the first frame, the last frame and the peak', () => {
    const years = [-500, -300, -100, 100, 300, 500, 700, 900]
    for (const peak of years) {
      const sampled = subsampleKeyframes(years, 5, peak)
      expect(sampled).toHaveLength(5)
      expect(sampled[0]).toBe(-500)
      expect(sampled[sampled.length - 1]).toBe(900)
      expect(sampled).toContain(peak)
      expect([...sampled].sort((a, b) => a - b)).toEqual(sampled)
    }
  })
})

describe('scoreEmpireExtent', () => {
  const challenge = {
    members: ['FR', 'DE', 'IT'] as ISOCountryCode[],
    partialMembers: ['ES'] as ISOCountryCode[],
  }

  it('pays the full pot for the exact core', () => {
    expect(scoreEmpireExtent({ challenge, taps: ['FR', 'DE', 'IT'], maximumPoints: 9 })).toEqual({
      scored: 9,
      maximum: 9,
    })
  })

  it('pays nothing for no taps', () => {
    expect(scoreEmpireExtent({ challenge, taps: [], maximumPoints: 9 }).scored).toBe(0)
  })

  it('forgives a tapped partial — identical score with and without it', () => {
    const without = scoreEmpireExtent({ challenge, taps: ['FR', 'DE'], maximumPoints: 9 })
    const withPartial = scoreEmpireExtent({ challenge, taps: ['FR', 'DE', 'ES'], maximumPoints: 9 })
    expect(withPartial).toEqual(without)
  })

  it('dilutes with stray taps via the union, never below zero', () => {
    const clean = scoreEmpireExtent({ challenge, taps: ['FR', 'DE', 'IT'], maximumPoints: 9 })
    const strayed = scoreEmpireExtent({
      challenge,
      taps: ['FR', 'DE', 'IT', 'SE', 'NO'],
      maximumPoints: 9,
    })
    expect(strayed.scored).toBeLessThan(clean.scored)
    expect(strayed.scored).toBeGreaterThanOrEqual(0)
  })
})

describe('the handler composition (beat 1 clamp + beat 2 jaccard)', () => {
  const challenge = {
    empireId: 'gran-colombia',
    members: ['CO', 'VE', 'EC', 'PA'] as ISOCountryCode[],
    partialMembers: ['PE'] as ISOCountryCode[],
    maximumPoints: 15,
  }

  const settle = (
    empire: { guessedId?: string; clientScore: number } | undefined,
    taps: ISOCountryCode[]
  ) => {
    const pots = empirePots(challenge.maximumPoints)
    const named = empire?.guessedId === challenge.empireId
    const beat1 = clampClientScore(empire?.clientScore, pots.name, named)
    const beat2 = scoreEmpireExtent({ challenge, taps, maximumPoints: pots.extent })
    return beat1.scored + beat2.scored
  }

  it('pays beat 2 even when the buzz was wrong or absent', () => {
    const taps: ISOCountryCode[] = ['CO', 'VE', 'EC', 'PA']
    const wrongBuzz = settle({ guessedId: 'inca-empire', clientScore: 6 }, taps)
    const noBuzz = settle(undefined, taps)
    expect(wrongBuzz).toBe(empirePots(15).extent)
    expect(noBuzz).toBe(empirePots(15).extent)
  })

  it('clamps an inflated beat-1 claim to the name share', () => {
    expect(settle({ guessedId: 'gran-colombia', clientScore: 999 }, [])).toBe(empirePots(15).name)
  })
})

describe('normalizeEmpireAnswer', () => {
  it('folds case, diacritics, punctuation and the leading article', () => {
    expect(normalizeEmpireAnswer('  The  Achaemenid—Empire! ')).toBe('achaemenid empire')
    expect(normalizeEmpireAnswer('São Tomé')).toBe('sao tome')
  })
})

describe('empireAnswerMatches', () => {
  const soviet = {
    name: 'Soviet Union',
    answerAliases: ['USSR', 'Union of Soviet Socialist Republics', 'CCCP'],
  }

  it('accepts every reasonable spelling of the answer', () => {
    for (const guess of [
      'USSR',
      'ussr',
      'CCCP',
      'Soviet union',
      'The soviet union',
      'the  Soviet Union!',
      'union of soviet socialist republics',
      'The Union of Soviet Socialist Republics',
      'sovet union', // one-letter typo
    ]) {
      expect(empireAnswerMatches(guess, soviet), guess).toBe(true)
    }
  })

  it('accepts the identity word without its polity type', () => {
    expect(empireAnswerMatches('abbasid', { name: 'Abbasid Caliphate' })).toBe(true)
    expect(
      empireAnswerMatches('abbasids', { name: 'Abbasid Caliphate', answerAliases: ['Abbasids'] })
    ).toBe(true)
  })

  it('never lets lookalikes or fragments through', () => {
    expect(empireAnswerMatches('mughal empire', { name: 'Mongol Empire' })).toBe(false)
    expect(empireAnswerMatches('colombia', { name: 'Gran Colombia' })).toBe(false)
    expect(empireAnswerMatches('union', soviet)).toBe(false)
    expect(empireAnswerMatches('', soviet)).toBe(false)
  })
})

describe('the fame gate', () => {
  it('weighs a tier at zero exactly when the shared gate benches it', () => {
    for (const difficulty of gameDifficulties) {
      for (const fame of FAME_TIERS) {
        expect(empireFameWeight(fame, difficulty) > 0, `${difficulty}/${fame}`).toBe(
          FAME_BY_DIFFICULTY[difficulty].has(fame)
        )
      }
    }
  })

  it('leans hard tables toward the deep cuts without benching the canon', () => {
    const { fameWeights } = EMPIRE_TUNING.hard
    expect(fameWeights.obscure).toBeGreaterThan(fameWeights.minor)
    expect(fameWeights.minor).toBeGreaterThan(fameWeights.major)
    expect(fameWeights.major).toBeGreaterThan(0)
  })

  it('keeps every region stocked for every difficulty', () => {
    const regions = new Set(Object.values(EMPIRES).map(empire => empire.region))
    for (const region of regions) {
      const inRegion = Object.values(EMPIRES).filter(empire => empire.region === region)
      for (const difficulty of gameDifficulties) {
        const dealable = inRegion.filter(empire => isFameDealable(empire.fame, difficulty))
        expect(dealable.length, `${region}/${difficulty}`).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

// --- The dealer, through the front door ----------------------------------------

const game = (difficulty: GameDifficulty, overrides?: object): Game =>
  ({
    variant: 'world',
    difficulty,
    rounds: [{}],
    players: { a: { phase: 'group-challenge' } },
    ...(overrides ?? {}),
  }) as unknown as Game

afterEach(() => {
  delete process.env.FORCE_ROUND_TYPE
})

describe('getEmpireChallenge (via getRoundChallenge)', () => {
  it('deals a coherent arc: subsampled years from the empire, peak retained', async () => {
    process.env.FORCE_ROUND_TYPE = 'empire'
    const dealt = (await getRoundChallenge({ game: game('normal') })) as EmpireChallenge
    expect(dealt._type).toBe('empire-challenge')

    const meta = EMPIRES[dealt.empireId]
    expect(meta).toBeDefined()
    expect(dealt.keyframeYears.length).toBeLessThanOrEqual(EMPIRE_TUNING.normal.keyframes)
    expect(dealt.keyframeYears[0]).toBe(meta.keyframeYears[0])
    expect(dealt.keyframeYears[dealt.keyframeYears.length - 1]).toBe(
      meta.keyframeYears[meta.keyframeYears.length - 1]
    )
    expect(dealt.keyframeYears).toContain(dealt.peakYear)
    for (const year of dealt.keyframeYears) expect(meta.keyframeYears).toContain(year)

    expect(dealt.members.length).toBeGreaterThanOrEqual(2)
    expect(dealt.members.some(isoCode => dealt.partialMembers.includes(isoCode))).toBe(false)
    expect(dealt.maximumPoints).toBe(15)
  })

  it('offers 3 name options (answer included) outside hard, none on hard', async () => {
    process.env.FORCE_ROUND_TYPE = 'empire'
    const normal = (await getRoundChallenge({ game: game('normal') })) as EmpireChallenge
    expect(normal.options).toHaveLength(3)
    expect(normal.options).toContain(normal.empireId)

    const hard = (await getRoundChallenge({ game: game('hard') })) as EmpireChallenge
    expect(hard.options).toBeUndefined()
  })

  it('deals every ghost inside the difficulty’s fame gate', async () => {
    process.env.FORCE_ROUND_TYPE = 'empire'
    for (const difficulty of gameDifficulties) {
      for (let attempt = 0; attempt < 25; attempt++) {
        const dealt = (await getRoundChallenge({ game: game(difficulty) })) as EmpireChallenge
        if (dealt._type !== 'empire-challenge') continue
        const { fame } = EMPIRES[dealt.empireId]
        expect(isFameDealable(fame, difficulty), `${difficulty}/${dealt.empireId}`).toBe(true)
        for (const id of dealt.options ?? [])
          expect(isFameDealable(EMPIRES[id].fame, difficulty), `decoy ${id}`).toBe(true)
      }
    }
  })

  it('never repeats an empire within a game', async () => {
    process.env.FORCE_ROUND_TYPE = 'empire'
    const first = (await getRoundChallenge({ game: game('normal') })) as EmpireChallenge
    const seen = game('normal')
    ;(seen.rounds as unknown as { groupChallenge: EmpireChallenge }[])[0] = {
      groupChallenge: first,
    }
    for (let attempt = 0; attempt < 25; attempt++) {
      const next = (await getRoundChallenge({ game: seen })) as EmpireChallenge
      if (next._type !== 'empire-challenge') continue
      expect(next.empireId).not.toBe(first.empireId)
    }
  })

  it('only deals empires whose whole core is playable in the variant', async () => {
    process.env.FORCE_ROUND_TYPE = 'empire'
    for (const variant of ['world', 'europe', 'south-america'] as const) {
      const pool = new Set(variantCountries(variant))
      const dealt = await getRoundChallenge({
        game: game('normal', { variant }),
      })
      if (!('_type' in dealt) || dealt._type !== 'empire-challenge') continue // ranking fallback is the contract
      for (const isoCode of dealt.members) expect(pool.has(isoCode)).toBe(true)
    }
  })

  it('never deals when the empires group is toggled off (unforced weights)', async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const dealt = await getRoundChallenge({
        game: game('normal', { challengeOverrides: { empires: false } }),
      })
      expect('_type' in dealt && dealt._type === 'empire-challenge').toBe(false)
    }
  })
})
