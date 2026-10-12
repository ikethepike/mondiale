import { afterEach, describe, expect, it } from 'vitest'
import { RECOGNITION_FLAGS } from '~~/data/recognition-flags.gen'
import { RECOGNITION_TERRITORIES } from '~~/data/recognition.gen'
import { DISSOLVED_TERRITORIES } from '~~/data/static/recognition-filter'
import { getRoundChallenge } from '~~/lib/challenges'
import { isCountryPlayable } from '~~/lib/game-rules'
import { isChallengeOfType } from '~~/lib/rounds'
import { regionsForVariant } from '~~/lib/board-regions'
import { testSeat } from '~~/lib/events/server/test-seat'
import { gameVariants, type BoardRegion, type Game } from '~~/types/game.types'

const gameOn = (regions: BoardRegion[]): Game =>
  ({
    id: 'recognition',
    regions,
    difficulty: 'normal',
    rounds: [{}],
    players: { a: testSeat('a'), b: testSeat('b') },
  }) as unknown as Game

const BOARDS: BoardRegion[][] = [
  ...gameVariants.map(regionsForVariant),
  ['europe', 'africa'],
  ['north-america', 'south-america'],
]

afterEach(() => {
  delete process.env.FORCE_ROUND_TYPE
})

describe('recognition rounds stay on the board', () => {
  // Demchok (India/China) dealt on a Europe board; Rockall on an Africa one.
  it('deals a dispute only where one of its claimants stands', async () => {
    process.env.FORCE_ROUND_TYPE = 'no-mans-land'
    for (const regions of BOARDS) {
      const game = gameOn(regions)
      for (let attempt = 0; attempt < 12; attempt++) {
        const dealt = await getRoundChallenge({ game })
        if (!isChallengeOfType(dealt, 'no-mans-land-challenge')) continue
        if (!dealt.claimants.length) {
          expect(regions, 'Bir Tawil off the world board').toEqual([])
          continue
        }
        expect(
          dealt.claimants.some(isoCode => isCountryPlayable(game, isoCode)),
          `${regions.join('+') || 'world'} dealt ${dealt.territoryId}`
        ).toBe(true)
      }
    }
  })

  // Abkhazia (Georgia) dealt on a Europe board.
  it('deals a ghost state only where its parent stands', async () => {
    process.env.FORCE_ROUND_TYPE = 'ghost-state'
    for (const regions of BOARDS) {
      const game = gameOn(regions)
      for (let attempt = 0; attempt < 12; attempt++) {
        const dealt = await getRoundChallenge({ game })
        if (!isChallengeOfType(dealt, 'ghost-state-challenge')) continue
        expect(
          isCountryPlayable(game, dealt.parent),
          `${regions.join('+') || 'world'} dealt ${dealt.territoryId}`
        ).toBe(true)
      }
    }
  })

  it('still deals both on the boards that hold their subjects', async () => {
    for (const [kind, regions] of [
      ['ghost-state', ['africa']],
      ['no-mans-land', ['europe']],
      ['no-mans-land', ['south-america']],
    ] as const) {
      process.env.FORCE_ROUND_TYPE = kind
      const dealt = await getRoundChallenge({ game: gameOn([...regions]) })
      expect(dealt._type, `${kind} on ${regions.join('+')}`).toBe(`${kind}-challenge`)
    }
  })
})

describe('the recognition roster', () => {
  it('holds no state that has ceased to exist', () => {
    expect(DISSOLVED_TERRITORIES).toHaveProperty('Artsakh')
    const names = new Set(Object.values(RECOGNITION_TERRITORIES).map(territory => territory.name))
    for (const name of Object.keys(DISSOLVED_TERRITORIES)) expect(names.has(name), name).toBe(false)
    expect(RECOGNITION_TERRITORIES).not.toHaveProperty('artsakh')
  })

  it('ships a flag only for a territory it can deal', () => {
    for (const id of Object.keys(RECOGNITION_FLAGS))
      expect(RECOGNITION_TERRITORIES, id).toHaveProperty(id)
  })
})
