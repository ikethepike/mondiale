import alea from 'alea'
import { describe, expect, it } from 'vitest'
import { BORDERS } from '~~/data/borders.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { MAP_BOUNDS, MAP_REGIONS } from '~~/data/map.gen'
import { getRoundChallenge } from '~~/lib/challenges'
import { gradeGroupAnswer } from '~~/lib/events/server/grade-group-answer'
import { blitzScore } from '~~/lib/scoring'
import {
  countryLatLng,
  haversineKm,
  isLabelableBox,
  labelBoxFor,
  mainlandBox,
  WORLD_BOX,
} from '~~/lib/geo'
import {
  pickVanishDeck,
  terraAbsorber,
  terraAnswers,
  terraRestoredBy,
  terraRestoredHoles,
  terraField,
  terraSeconds,
  terraFrame,
  terraVanishAt,
  terraVanishedBy,
  terraCollapseThreshold,
  terraVanishedCount,
  TERRA_CADENCE_MS,
  TERRA_COLLAPSE_THRESHOLD,
  TERRA_FRAME_REACH,
  TERRA_MINIMUM_DECK,
  TERRA_OPENING_MS,
  TERRA_REACH,
  TERRA_TAIL_MS,
  TERRA_THEATRE_MAX_KM,
  TERRA_VANISH_COUNT,
} from '~~/lib/terra-incognita'
import type { TerraIncognitaChallenge } from '~~/types/challenges/group-modes.type'
import type { Game, GameDifficulty, GameVariant } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const rules = (difficulty: GameDifficulty = 'normal', variant: GameVariant = 'world') =>
  ({ difficulty, variant }) as Game

const seeded = (seed: string) => alea(seed) as unknown as () => number

const DIFFICULTIES: GameDifficulty[] = ['easy', 'normal', 'hard']
const VARIANTS: GameVariant[] = [
  'world',
  'europe',
  'africa',
  'asia',
  'north-america',
  'south-america',
]

const challengeOf = (
  vanishings: ISOCountryCode[],
  difficulty: GameDifficulty = 'normal'
): TerraIncognitaChallenge => ({
  _type: 'terra-incognita-challenge',
  vanishings,
  // The deal stamps these, so a test challenge without them would grade by
  // rules no real round plays under.
  absorbedBy: Object.fromEntries(
    vanishings.flatMap(isoCode => {
      const absorber = terraAbsorber(isoCode)
      return absorber ? [[isoCode, absorber] as const] : []
    })
  ),
  cadenceMs: TERRA_CADENCE_MS[difficulty],
  collapseThreshold: terraCollapseThreshold(vanishings.length, difficulty),
  durationSeconds: terraSeconds(vanishings.length, TERRA_CADENCE_MS[difficulty]),
  maximumPoints: 100,
  state: { ready: [], order: [] },
})

describe('terraField', () => {
  it('sorts the field most populous first', () => {
    const field = terraField(rules())
    expect(field.length).toBeGreaterThan(100)
    for (let index = 1; index < field.length; index++) {
      const previous = COUNTRIES[field[index - 1]!]?.people?.population?.amount ?? 0
      const current = COUNTRIES[field[index]!]?.people?.population?.amount ?? 0
      expect(previous).toBeGreaterThanOrEqual(current)
    }
  })

  it('drops islands — nothing to melt into means nothing to notice', () => {
    const field = new Set(terraField(rules()))
    // Every one of these owns its whole outline, so erasing it into "the
    // neighbour wash" would leave it sitting there in plain sight.
    for (const island of ['IS', 'MG', 'LK', 'NZ', 'CU', 'JP', 'AU'] as ISOCountryCode[]) {
      expect(field.has(island), island).toBe(false)
    }
    expect(field.has('TM')).toBe(true)
    expect(field.has('MW')).toBe(true)
  })

  it('drops countries too small to carry their own name on the map', () => {
    for (const isoCode of terraField(rules())) {
      expect(isLabelableBox(labelBoxFor(MAP_BOUNDS[isoCode], MAP_REGIONS[isoCode])), isoCode).toBe(
        true
      )
    }
  })

  it('scopes to the variant', () => {
    const europe = terraField(rules('normal', 'europe'))
    expect(europe).toContain('PL')
    expect(europe).not.toContain('KE')
  })
})

describe('TERRA_REACH', () => {
  it('reaches deeper into the field as the game gets harder', () => {
    expect(TERRA_REACH.easy[1]).toBeLessThan(TERRA_REACH.normal[1])
    expect(TERRA_REACH.normal[1]).toBeLessThan(TERRA_REACH.hard[1])
  })

  it('gives up the very top of the field on hard only', () => {
    expect(TERRA_REACH.easy[0]).toBe(0)
    expect(TERRA_REACH.normal[0]).toBe(0)
    expect(TERRA_REACH.hard[0]).toBeGreaterThan(0)
  })
})

describe('pickVanishDeck', () => {
  it('deals the full count on the boards wide enough to host the mode', () => {
    // World and Europe seat a cropped deck at every difficulty. The crop is
    // what limits the rest: inside one ~1800km circle nearly every candidate
    // borders another, so a continental board with a thin or strung-out field
    // deals short, or yields to another kind entirely.
    for (const difficulty of DIFFICULTIES) {
      for (const variant of ['world', 'europe'] as GameVariant[]) {
        const deck = pickVanishDeck(rules(difficulty, variant), seeded(`${difficulty}-${variant}`))
        expect(deck, `${difficulty}/${variant}`).toHaveLength(TERRA_VANISH_COUNT[difficulty])
      }
    }
  })

  it('keeps every loss inside one theatre — the round is played cropped', () => {
    // The whole point of the crop: a deck spread across continents cannot be
    // framed tightly, and at world zoom an absence is invisible however well
    // the player knows the map.
    for (let seed = 0; seed < 40; seed++) {
      for (const difficulty of DIFFICULTIES) {
        const deck = pickVanishDeck(rules(difficulty), seeded(`crop-${difficulty}-${seed}`))!
        for (const a of deck) {
          for (const b of deck) {
            const from = countryLatLng(a)
            const to = countryLatLng(b)
            if (!from || !to) continue
            // Both sit within the radius of one shared anchor, so no pair can
            // be further apart than the theatre's own diameter.
            expect(haversineKm(from, to), `${a}/${b}`).toBeLessThanOrEqual(2 * TERRA_THEATRE_MAX_KM)
          }
        }
      }
    }
  })

  it('always deals a full deck on the world board, whatever the seed', () => {
    // A capacity-blind anchor would land in the empty half of the map and come
    // up short; the deal filters anchors by what their region can actually seat.
    for (let seed = 0; seed < 60; seed++) {
      for (const difficulty of DIFFICULTIES) {
        expect(
          pickVanishDeck(rules(difficulty), seeded(`anchor-${difficulty}-${seed}`)),
          `${difficulty}/${seed}`
        ).toHaveLength(TERRA_VANISH_COUNT[difficulty])
      }
    }
  })

  it('never deals below the floor when it deals at all', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const variant of VARIANTS) {
        const deck = pickVanishDeck(
          rules(difficulty, variant),
          seeded(`floor-${difficulty}-${variant}`)
        )
        if (!deck) continue
        expect(deck.length, `${difficulty}/${variant}`).toBeGreaterThanOrEqual(TERRA_MINIMUM_DECK)
      }
    }
  })

  it('never deals a duplicate, on any board', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const variant of VARIANTS) {
        const deck = pickVanishDeck(rules(difficulty, variant), seeded(`${difficulty}-${variant}`))
        if (!deck) continue
        expect(new Set(deck).size, `${difficulty}/${variant}`).toBe(deck.length)
      }
    }
  })

  it('never deals two countries that share a land border', () => {
    // Two adjacent blanks read as one larger blank — the wash each melts into
    // is the other one — so the question stops having a perceivable answer.
    for (let seed = 0; seed < 60; seed++) {
      for (const difficulty of DIFFICULTIES) {
        const deck = pickVanishDeck(rules(difficulty), seeded(`${difficulty}-${seed}`))!
        for (const isoCode of deck) {
          for (const other of deck) {
            if (isoCode === other) continue
            expect(BORDERS[isoCode]?.includes(other), `${isoCode}/${other}`).toBeFalsy()
          }
        }
      }
    }
  })

  it('leans toward the overlooked end of the window', () => {
    // The gate says what may be dealt; the lean says what usually is. Over
    // many deals the median pick must sit past the middle of the difficulty's
    // reach, or the mode is drilling nothing in particular.
    const field = terraField(rules())
    const [from, to] = TERRA_REACH.normal
    const middle = (from + to) / 2
    const positions: number[] = []
    for (let seed = 0; seed < 40; seed++) {
      for (const isoCode of pickVanishDeck(rules(), seeded(`lean-${seed}`))!) {
        positions.push(field.indexOf(isoCode) / field.length)
      }
    }
    const mean = positions.reduce((sum, value) => sum + value, 0) / positions.length
    expect(mean).toBeGreaterThan(middle)
  })

  it('keeps easy inside the household names', () => {
    const field = terraField(rules('easy'))
    const ceiling = Math.ceil(field.length * TERRA_REACH.easy[1])
    for (let seed = 0; seed < 30; seed++) {
      for (const isoCode of pickVanishDeck(rules('easy'), seeded(`easy-${seed}`))!) {
        expect(field.indexOf(isoCode), isoCode).toBeLessThan(ceiling)
      }
    }
  })

  it('yields rather than dealing a deck the geography cannot hold', () => {
    // Oceania is islands almost to a country — nothing for anything to melt
    // into — and the Southern Cone holds Uruguay and little else that
    // qualifies. Neither can host the mode at any difficulty, so the deal
    // returns undefined and the mix buys another kind.
    for (const difficulty of DIFFICULTIES) {
      for (const variant of ['south-america', 'oceania'] as GameVariant[]) {
        expect(
          pickVanishDeck(rules(difficulty, variant), seeded(`thin-${difficulty}-${variant}`)),
          `${difficulty}/${variant}`
        ).toBeUndefined()
      }
    }
  })
})

describe('terraFrame', () => {
  const contains = (
    [x, y, width, height]: readonly number[],
    [bx, by, bw, bh]: readonly number[]
  ) => bx >= x! && by >= y! && bx + bw <= x! + width! && by + bh <= y! + height!

  it('holds every loss with room to spare, so nothing vanishes at the frame`s edge', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const difficulty of DIFFICULTIES) {
        const deck = pickVanishDeck(rules(difficulty), seeded(`frame-${difficulty}-${seed}`))!
        const [x, y, width, height] = terraFrame({ vanishings: deck }, difficulty)
        const { floor } = TERRA_FRAME_REACH[difficulty]
        for (const isoCode of deck) {
          const box = mainlandBox(MAP_REGIONS[isoCode], MAP_BOUNDS[isoCode])!
          expect(contains([x, y, width, height], box), `${isoCode} in frame`).toBe(true)
          // Margin on every side, unless the world itself ends first.
          const margins = [
            box[0] - x,
            box[1] - y,
            x + width - (box[0] + box[2]),
            y + height - (box[1] + box[3]),
          ]
          const clipped = [
            x <= WORLD_BOX.x,
            y <= WORLD_BOX.y,
            x + width >= WORLD_BOX.width,
            y + height >= WORLD_BOX.height,
          ]
          margins.forEach((margin, side) => {
            if (!clipped[side])
              expect(margin, `${isoCode} side ${side}`).toBeGreaterThanOrEqual(floor - 1e-9)
          })
        }
      }
    }
  })

  it('widens with difficulty — the same deck is a bigger haystack on hard', () => {
    for (let seed = 0; seed < 20; seed++) {
      const deck = pickVanishDeck(rules(), seeded(`widen-${seed}`))!
      const area = (difficulty: GameDifficulty) => {
        const [, , width, height] = terraFrame({ vanishings: deck }, difficulty)
        return width * height
      }
      expect(area('easy')).toBeLessThan(area('normal'))
      expect(area('normal')).toBeLessThan(area('hard'))
    }
  })

  it('is centred on the deck, never on one loss', () => {
    // A symmetric pad: the losses sit in the middle of the shot, so the edges
    // of the frame are never a hint about what is about to go.
    const deck = pickVanishDeck(rules(), seeded('centre'))!
    const [x, y, width, height] = terraFrame({ vanishings: deck }, 'normal')
    const boxes = deck.map(isoCode => mainlandBox(MAP_REGIONS[isoCode], MAP_BOUNDS[isoCode])!)
    const left = Math.min(...boxes.map(box => box[0]))
    const right = Math.max(...boxes.map(box => box[0] + box[2]))
    const top = Math.min(...boxes.map(box => box[1]))
    const bottom = Math.max(...boxes.map(box => box[1] + box[3]))
    expect(x + width / 2).toBeCloseTo((left + right) / 2, 5)
    expect(y + height / 2).toBeCloseTo((top + bottom) / 2, 5)
  })

  it('never frames past the world', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const difficulty of DIFFICULTIES) {
        const deck = pickVanishDeck(rules(difficulty), seeded(`world-${difficulty}-${seed}`))!
        const [x, y, width, height] = terraFrame({ vanishings: deck }, difficulty)
        expect(x).toBeGreaterThanOrEqual(WORLD_BOX.x)
        expect(y).toBeGreaterThanOrEqual(WORLD_BOX.y)
        expect(x + width).toBeLessThanOrEqual(WORLD_BOX.x + WORLD_BOX.width)
        expect(y + height).toBeLessThanOrEqual(WORLD_BOX.y + WORLD_BOX.height)
      }
    }
  })

  it('is a crop, not the planet — even on hard', () => {
    for (let seed = 0; seed < 30; seed++) {
      const deck = pickVanishDeck(rules('hard'), seeded(`crop-${seed}`))!
      const [, , width] = terraFrame({ vanishings: deck }, 'hard')
      expect(width, `seed ${seed}`).toBeLessThan(WORLD_BOX.width / 3)
    }
  })
})

describe('the vanish schedule', () => {
  it('holds the world whole through the opening, then loses one per cadence', () => {
    const challenge = challengeOf(['UY', 'MW', 'AL', 'TM'])
    expect(terraVanishedCount(challenge, 0)).toBe(0)
    expect(terraVanishedCount(challenge, TERRA_OPENING_MS - 1)).toBe(0)
    expect(terraVanishedCount(challenge, TERRA_OPENING_MS)).toBe(1)
    expect(terraVanishedCount(challenge, TERRA_OPENING_MS + challenge.cadenceMs)).toBe(2)
  })

  it('never counts past the deck, however long the clock runs', () => {
    const challenge = challengeOf(['UY', 'MW'])
    expect(terraVanishedCount(challenge, 10 * 60 * 1000)).toBe(2)
  })

  it('loses them in dealt order', () => {
    const challenge = challengeOf(['UY', 'MW', 'AL'])
    expect(terraVanishedBy(challenge, TERRA_OPENING_MS + challenge.cadenceMs)).toEqual(['UY', 'MW'])
  })

  it('agrees with terraVanishAt at every index', () => {
    const challenge = challengeOf(['UY', 'MW', 'AL', 'TM', 'LA'])
    challenge.vanishings.forEach((_, index) => {
      const at = terraVanishAt(index, challenge.cadenceMs)
      expect(terraVanishedCount(challenge, at)).toBe(index + 1)
      expect(terraVanishedCount(challenge, at - 1)).toBe(index)
    })
  })

  it('always leaves room to name the last loss', () => {
    // The tail is what stops the final country being dealt into a dead clock —
    // a question nobody can answer and a point nobody can reach.
    for (const difficulty of DIFFICULTIES) {
      const count = TERRA_VANISH_COUNT[difficulty]
      const cadenceMs = TERRA_CADENCE_MS[difficulty]
      const windowMs = terraSeconds(count, cadenceMs) * 1000
      expect(windowMs - terraVanishAt(count - 1, cadenceMs), difficulty).toBeGreaterThanOrEqual(
        TERRA_TAIL_MS
      )
    }
  })

  it('lets the whole deck vanish before the clock dies', () => {
    for (const difficulty of DIFFICULTIES) {
      const count = TERRA_VANISH_COUNT[difficulty]
      const challenge = challengeOf(
        Array.from({ length: count }, () => 'UY' as ISOCountryCode),
        difficulty
      )
      expect(terraVanishedCount(challenge, challenge.durationSeconds * 1000), difficulty).toBe(
        count
      )
    }
  })
})

describe('terraCollapseThreshold', () => {
  it('stays reachable but never arithmetically certain, at the nominal count', () => {
    for (const difficulty of DIFFICULTIES) {
      const count = TERRA_VANISH_COUNT[difficulty]
      const threshold = terraCollapseThreshold(count, difficulty)
      expect(threshold, difficulty).toBeGreaterThan(1)
      expect(threshold, difficulty).toBeLessThanOrEqual(count - 2)
    }
  })

  it('tightens for a short deck, so the alarm can still ring in time', () => {
    // Four outstanding against a deck of five is an alarm that only fires once
    // the round is already lost.
    expect(terraCollapseThreshold(5, 'easy')).toBeLessThan(TERRA_COLLAPSE_THRESHOLD.easy)
    expect(terraCollapseThreshold(TERRA_MINIMUM_DECK, 'normal')).toBe(2)
  })
})

describe('the dealt round', () => {
  const dealt = async (difficulty: GameDifficulty = 'normal') => {
    process.env.FORCE_ROUND_TYPE = 'terra-incognita'
    try {
      const game = {
        ...rules(difficulty),
        rounds: [],
        players: {},
        challengeOverrides: {},
      } as unknown as Game
      return (await getRoundChallenge({ game })) as TerraIncognitaChallenge
    } finally {
      delete process.env.FORCE_ROUND_TYPE
    }
  }

  it('deals a coherent challenge through the round mix', async () => {
    const challenge = await dealt()

    expect(challenge._type).toBe('terra-incognita-challenge')
    expect(challenge.vanishings).toHaveLength(TERRA_VANISH_COUNT.normal)
    expect(challenge.cadenceMs).toBe(TERRA_CADENCE_MS.normal)
    expect(challenge.collapseThreshold).toBe(
      terraCollapseThreshold(challenge.vanishings.length, 'normal')
    )
    expect(challenge.durationSeconds).toBe(
      terraSeconds(TERRA_VANISH_COUNT.normal, TERRA_CADENCE_MS.normal)
    )
    expect(terraAnswers(challenge)).toEqual(challenge.vanishings)
    // Dealt behind its card: the clock waits for this table.
    expect(challenge.state.briefing).toBe(true)
    expect(challenge.state.ready).toEqual([])
  })
})

describe('grading', () => {
  const gradeWith = async (submitted: ISOCountryCode[]) => {
    const challenge = challengeOf(['UY', 'MW', 'AL', 'TM'])
    return await gradeGroupAnswer({
      game: rules(),
      round: { groupChallenge: challenge, groupAnswers: {} } as never,
      playerId: 'p1',
      submission: { ranking: submitted },
    })
  }

  it('pays for the countries put back and charges for the ones that were never gone', async () => {
    const clean = await gradeWith(['UY', 'MW', 'AL', 'TM'])
    expect(clean.scoring.scored).toBe(clean.scoring.maximum)
    expect(clean.answer.correct).toEqual(['UY', 'MW', 'AL', 'TM'])

    const half = await gradeWith(['UY', 'MW'])
    expect(half.scoring.scored).toBeLessThan(clean.scoring.scored)

    // Not BR/PE: Brazil absorbed Uruguay, so naming it now RESTORES rather
    // than strays. These three touch nothing in this deck.
    const sprayed = await gradeWith(['UY', 'MW', 'FR', 'JP', 'NZ'])
    expect(sprayed.scoring.scored).toBeLessThan(half.scoring.scored)

    // And the other half of that rule: the absorber pays exactly as the
    // country's own name does.
    const byAbsorber = await gradeWith(['BR', 'MZ', 'GR', 'UZ'])
    expect(byAbsorber.scoring.scored).toBe(clean.scoring.scored)
  })

  it('banks a zero for a seat that never noticed anything', async () => {
    const nothing = await gradeWith([])
    expect(nothing.scoring.scored).toBe(0)
  })
})

describe('terraAbsorber', () => {
  it('names the neighbour a country dissolves into', () => {
    // The longest shared border — the one the map paints out.
    expect(terraAbsorber('PT')).toBe('ES')
    expect(terraAbsorber('MX')).toBe('US')
    expect(terraAbsorber('BD')).toBe('IN')
  })

  it('resolves for every country the mode can deal', () => {
    // `terraField` gates on this, so the two are the same statement from
    // opposite directions — but a regression in either would be silent.
    for (const variant of VARIANTS) {
      for (const difficulty of DIFFICULTIES) {
        for (const isoCode of terraField(rules(difficulty, variant))) {
          expect(terraAbsorber(isoCode), `${variant}/${difficulty}/${isoCode}`).toBeTruthy()
        }
      }
    }
  })

  it('is always a real land neighbour', () => {
    for (const isoCode of terraField(rules('normal'))) {
      const absorber = terraAbsorber(isoCode)!
      expect(BORDERS[isoCode] ?? [], isoCode).toContain(absorber)
    }
  })

  it('drops the countries that cannot visibly vanish', () => {
    // Lesotho is wrapped by South Africa and the UK's only neighbour never
    // meets its mainland ring: nothing is painted out, so they used to be
    // dealt and then not vanish.
    expect(terraAbsorber('LS')).toBeUndefined()
    expect(terraAbsorber('GB')).toBeUndefined()
    const field = terraField(rules('normal'))
    expect(field).not.toContain('LS')
    expect(field).not.toContain('GB')
  })

  it('never names a country that is itself in the deck', () => {
    // Free from the no-adjacent-blanks guard: an absorber is by definition a
    // land neighbour, and no two dealt countries share a border. If that guard
    // ever loosened, one hole's answer would be another hole.
    for (let seed = 0; seed < 40; seed++) {
      for (const difficulty of DIFFICULTIES) {
        const deck = pickVanishDeck(rules(difficulty), seeded(`absorb-${difficulty}-${seed}`))
        if (!deck) continue
        for (const isoCode of deck) {
          expect(deck, `${difficulty}/${seed}/${isoCode}`).not.toContain(terraAbsorber(isoCode))
        }
      }
    }
  })
})

describe('restoring by either name', () => {
  /** Austria and Denmark both dissolve into Germany; Albania into Greece. */
  const shared = {
    vanishings: ['AT', 'DK', 'AL'] as ISOCountryCode[],
    absorbedBy: { AT: 'DE', DK: 'DE', AL: 'GR' } as Partial<Record<ISOCountryCode, ISOCountryCode>>,
  }

  it('takes the country that went or the land that took it', () => {
    const open = new Set(shared.vanishings)
    expect(terraRestoredBy(shared, 'AT', open)).toBe('AT')
    expect(terraRestoredBy(shared, 'GR', open)).toBe('AL')
    expect(terraRestoredBy(shared, 'FR', open)).toBeUndefined()
  })

  it('lets one absorber answer for each hole it swallowed, in turn', () => {
    // Germany took two. Naming it twice must reach BOTH, not re-claim the
    // first — this is ~20% of real decks.
    expect(terraRestoredHoles(shared, ['DE', 'DE', 'GR'])).toEqual(['AT', 'DK', 'AL'])
  })

  it('pays a perfect round the same by either name', () => {
    // The whole reason absorbers alias onto holes instead of joining the
    // answer set: widening the set would divide the pot by twice as many.
    const pot = 9
    const byCountry = blitzScore(
      shared.vanishings,
      terraRestoredHoles(shared, shared.vanishings),
      pot
    )
    const byAbsorber = blitzScore(
      shared.vanishings,
      terraRestoredHoles(shared, ['DE', 'DE', 'GR']),
      pot
    )
    expect(byCountry).toEqual({ scored: pot, maximum: pot })
    expect(byAbsorber).toEqual({ scored: pot, maximum: pot })
  })

  it('still charges for a country that was never gone', () => {
    const scored = blitzScore(shared.vanishings, terraRestoredHoles(shared, ['AT', 'FR']), 9)
    expect(scored.scored).toBeLessThan(blitzScore(shared.vanishings, ['AT'], 9).scored)
  })

  it('only accepts the absorber of a hole that has actually opened', () => {
    // `within` is the leak guard: before Denmark goes, naming Germany may
    // restore Austria but must never reach Denmark — that would tell the
    // player Denmark is in the deck.
    const opened: ISOCountryCode[] = ['AT']
    expect(terraRestoredHoles(shared, ['DE'], opened)).toEqual(['AT'])
    expect(terraRestoredHoles(shared, ['DE', 'DE'], opened)).toEqual(['AT', 'DE'])
  })

  it('gives every dealt round an absorber for every loss', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const difficulty of DIFFICULTIES) {
        const deck = pickVanishDeck(rules(difficulty), seeded(`restore-${difficulty}-${seed}`))
        if (!deck) continue
        for (const isoCode of deck) expect(terraAbsorber(isoCode), isoCode).toBeTruthy()
      }
    }
  })
})
