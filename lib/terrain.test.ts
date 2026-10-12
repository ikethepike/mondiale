import { afterEach, describe, expect, it } from 'vitest'
import { WATER_FEATURES } from '~~/data/water.gen'
import { TERRAIN_ROSTER } from '~~/data/static/terrain-roster'
import { getRoundChallenge, layOfTheLandCandidates } from '~~/lib/challenges'
import { isCountryInPlay, isMicroNation } from '~~/lib/game-rules'
import { blitzScore } from '~~/lib/scoring'
import {
  TERRAIN_TUNING,
  terrainHeadline,
  terrainKey,
  terrainPrompt,
  terrainSeconds,
} from '~~/lib/terrain'
import { countryOnBoard } from '~~/lib/variant'
import { isFameDealable } from '~~/types/fame.types'
import type { WaterBlitzChallenge } from '~~/types/challenges/group-modes.type'
import {
  gameDifficulties,
  gameVariants,
  type BoardRegion,
  type Game,
  type GameDifficulty,
} from '~~/types/game.types'

const BOARDS: BoardRegion[][] = gameVariants.map(variant => (variant === 'world' ? [] : [variant]))

const game = (
  difficulty: GameDifficulty,
  regions: BoardRegion[] = [],
  rounds: Game['rounds'] = []
): Game =>
  ({
    regions,
    difficulty,
    rounds,
    players: { a: { phase: 'group-challenge' } },
  }) as unknown as Game

const roundOf = (featureId: string) =>
  ({ groupChallenge: { _type: 'water-blitz-challenge', featureId } }) as Game['rounds'][number]

describe('the shipped terrain roster', () => {
  it('stamps every subject, and only roster subjects carry a fame tier', () => {
    for (const [id, entry] of Object.entries(TERRAIN_ROSTER)) {
      const feature = WATER_FEATURES[id]
      expect(feature, id).toBeDefined()
      expect(feature.fame, id).toBe(entry.fame)
      expect(feature.countries, id).toEqual(entry.required)
      expect(feature.accepted ?? [], id).toEqual(entry.accepted ?? [])
    }
    const famed = Object.values(WATER_FEATURES).filter(feature => feature.fame)
    expect(famed.map(feature => feature.id).sort()).toEqual(Object.keys(TERRAIN_ROSTER).sort())
  })

  it('never lists a country as both required and free', () => {
    for (const [id, { required, accepted = [] }] of Object.entries(TERRAIN_ROSTER))
      expect(
        required.filter(isoCode => accepted.includes(isoCode)),
        id
      ).toEqual([])
  })

  it('keeps the keys the geometry got wrong', () => {
    const key = (id: string) => WATER_FEATURES[id].countries
    const free = (id: string) => WATER_FEATURES[id].accepted ?? []
    // A river that IS a border: the samples land on one bank.
    expect(key('river-danube')).toContain('MD')
    expect(key('river-zambezi')).toContain('BW')
    expect(key('river-drau')).toContain('HU')
    // Shores and hosts a coarse outline invented.
    expect(key('river-parana')).not.toContain('BO')
    expect(key('river-chari')).not.toContain('NG')
    expect(key('river-chari')).toContain('CF')
    expect(key('desert-sahara')).not.toContain('NG')
    // The textbook answers that are not on the river itself are free, not wrong.
    expect(key('river-nile')).toEqual(['UG', 'SS', 'SD', 'EG'])
    expect(free('river-nile')).toContain('ET')
    expect(free('adriatic-sea')).toContain('GR')
    expect(free('south-china-sea')).toEqual(expect.arrayContaining(['TH', 'KH']))
    expect(key('mediterranean-sea')).toEqual(
      expect.arrayContaining(['MT', 'HR', 'AL', 'ME', 'SI', 'MA'])
    )
    expect(WATER_FEATURES['river-amazonas'].name).toBe('Amazon')
    expect(WATER_FEATURES['river-zapadnaya-dvina'].aliases).toContain('Zapadnaya Dvina')
  })

  it('leaves the ambiguous names off: Colombia owns the famous Cordillera Oriental', () => {
    expect(TERRAIN_ROSTER['range-cordillera-oriental']).toBeUndefined()
    expect(TERRAIN_ROSTER['range-cordillera-occidental']).toBeUndefined()
  })

  it('deals one subject under each name', () => {
    const names = Object.keys(TERRAIN_ROSTER).map(id => WATER_FEATURES[id].name)
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([])
  })
})

describe('terrainKey', () => {
  it('benches a micro-nation into the free tier, never the key', () => {
    const alps = WATER_FEATURES['range-alps']
    const normal = terrainKey(game('normal'), alps)!
    expect(normal.countries).not.toContain('MC')
    expect(normal.countries).not.toContain('LI')
    expect(normal.accepted).toEqual(expect.arrayContaining(['MC', 'LI']))
    expect(terrainKey(game('hard'), alps)!.countries).toEqual(expect.arrayContaining(['MC', 'LI']))
  })

  it("measures the floor on the reachable key: the Ligurian is Monaco's only below hard", () => {
    const ligurian = WATER_FEATURES['ligurian-sea']
    expect(terrainKey(game('normal'), ligurian)).toBeUndefined()
    expect(terrainKey(game('hard'), ligurian)?.countries).toHaveLength(3)
  })

  it("cuts an ocean to the board's coast and never deals one on the world board", () => {
    const pacific = WATER_FEATURES['pacific-ocean']
    expect(terrainKey(game('hard'), pacific)).toBeUndefined()
    const americas = terrainKey(game('hard', ['north-america']), pacific)!
    expect(americas.scope).toEqual(['north-america'])
    expect(americas.countries.sort()).toEqual(
      ['CA', 'CR', 'GT', 'HN', 'MX', 'NI', 'PA', 'SV', 'US'].sort()
    )
    expect(americas.accepted).toEqual(expect.arrayContaining(['JP', 'CL', 'CN']))
  })

  it('keeps a subject off a board that holds too little of it', () => {
    expect(terrainKey(game('hard', ['asia']), WATER_FEATURES['mediterranean-sea'])).toBeUndefined()
    expect(terrainKey(game('hard', ['europe']), WATER_FEATURES['river-nile'])).toBeUndefined()
  })
})

describe('layOfTheLandCandidates', () => {
  it('deals only what the difficulty allows', async () => {
    for (const difficulty of gameDifficulties)
      for (const { feature } of await layOfTheLandCandidates(game(difficulty)))
        expect(isFameDealable(feature.fame!, difficulty), `${difficulty} ${feature.id}`).toBe(true)
  })

  /** Each continent used to lose one of the three old kinds outright. */
  it('deals on every board at every difficulty, and widens with it', async () => {
    const floor: Record<GameDifficulty, number> = { easy: 5, normal: 7, hard: 10 }
    for (const regions of BOARDS) {
      const sizes = await Promise.all(
        gameDifficulties.map(
          async difficulty => (await layOfTheLandCandidates(game(difficulty, regions))).length
        )
      )
      gameDifficulties.forEach((difficulty, index) =>
        expect(sizes[index], `${regions[0] ?? 'world'} ${difficulty}`).toBeGreaterThanOrEqual(
          floor[difficulty]
        )
      )
      expect(sizes[0]).toBeLessThan(sizes[1])
      expect(sizes[1]).toBeLessThan(sizes[2])
    }
  })

  it('keeps every dealt key within the sweep and the board', async () => {
    const { minimumKey, maximumKey } = TERRAIN_TUNING
    for (const regions of BOARDS)
      for (const difficulty of gameDifficulties)
        for (const { feature, key } of await layOfTheLandCandidates(game(difficulty, regions))) {
          const label = `${regions[0] ?? 'world'} ${difficulty} ${feature.id}`
          expect(key.countries.length, label).toBeGreaterThanOrEqual(minimumKey)
          expect(key.countries.length, label).toBeLessThanOrEqual(maximumKey)
          for (const isoCode of key.countries) {
            expect(isCountryInPlay(game(difficulty), isoCode), `${label} ${isoCode}`).toBe(true)
            if (key.scope)
              expect(countryOnBoard(isoCode, regions), `${label} ${isoCode}`).toBe(true)
          }
          for (const isoCode of key.accepted)
            expect(key.countries, `${label} ${isoCode}`).not.toContain(isoCode)
        }
  })

  it("doesn't repeat a subject within a game until the board runs dry", async () => {
    const easy = await layOfTheLandCandidates(game('easy', ['north-america']))
    const ids = easy.map(({ feature }) => feature.id)
    const after = await layOfTheLandCandidates(
      game('easy', ['north-america'], ids.slice(1).map(roundOf))
    )
    expect(after.map(({ feature }) => feature.id)).toEqual([ids[0]])
    const spent = await layOfTheLandCandidates(game('easy', ['north-america'], ids.map(roundOf)))
    expect(spent).toHaveLength(ids.length)
  })
})

describe('getRoundChallenge for lay-of-the-land', () => {
  afterEach(() => {
    delete process.env.FORCE_ROUND_TYPE
  })

  it('deals a playable sweep on every board, with its clock and free tier', async () => {
    process.env.FORCE_ROUND_TYPE = 'lay-of-the-land'
    for (const regions of BOARDS)
      for (const difficulty of gameDifficulties) {
        const dealt = (await getRoundChallenge({
          game: { ...game(difficulty, regions), rounds: [{}] } as unknown as Game,
        })) as WaterBlitzChallenge
        const label = `${regions[0] ?? 'world'} ${difficulty}`
        expect(dealt._type, label).toBe('water-blitz-challenge')
        expect(dealt.durationSeconds).toBe(terrainSeconds(dealt.countries.length))
        for (const isoCode of dealt.countries)
          if (difficulty !== 'hard')
            expect(isMicroNation(isoCode), `${label} ${isoCode}`).toBe(false)
      }
  })
})

describe('the free tier in scoring', () => {
  it('neither pays nor bites for a true country off the key', () => {
    const full = blitzScore(['UG', 'SS', 'SD', 'EG'], ['UG', 'SS', 'SD', 'EG'], 20)
    expect(
      blitzScore(['UG', 'SS', 'SD', 'EG'], ['UG', 'SS', 'SD', 'EG', 'ET'], 20, ['ET'])
    ).toEqual(full)
    expect(
      blitzScore(['UG', 'SS', 'SD', 'EG'], ['UG', 'SS', 'SD', 'EG', 'FR'], 20, ['ET'])
    ).toEqual({
      ...full,
      scored: full.scored - 1,
    })
  })
})

describe('terrain copy', () => {
  const challenge = (id: string, scope?: BoardRegion[]) => {
    const feature = WATER_FEATURES[id]
    return {
      featureName: feature.name,
      kind: feature.kind,
      countries: feature.countries,
      ...(feature.bare ? { bare: true as const } : {}),
      ...(scope ? { scope } : {}),
    }
  }

  it('words the question for what the subject is', () => {
    expect(terrainPrompt(challenge('river-danube'))).toBe(
      'Which countries does the Danube flow through?'
    )
    expect(terrainPrompt(challenge('lake-victoria'))).toBe('Name every country on Lake Victoria')
    expect(terrainPrompt(challenge('pacific-ocean', ['north-america']))).toBe(
      'Name every country in North America on the Pacific Ocean'
    )
    expect(terrainPrompt(challenge('range-alps'))).toBe('Which countries share the Alps?')
    expect(terrainPrompt(challenge('region-central-america'))).toBe(
      'Which countries share Central America?'
    )
  })

  it('leads the headline with the count, so a plural name never needs a verb', () => {
    expect(terrainHeadline(challenge('range-alps'))).toBe('8 countries share the Alps')
  })

  it('gives a long key more time, up to the cap', () => {
    expect(terrainSeconds(3)).toBeLessThan(terrainSeconds(9))
    expect(terrainSeconds(40)).toBe(TERRAIN_TUNING.clock.capSeconds)
  })
})
