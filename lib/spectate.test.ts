import { describe, expect, it } from 'vitest'
import {
  finalStory,
  gateStory,
  pickDirectorTarget,
  roundStory,
  stageForPhase,
  type SpectateStory,
} from './spectate'
import {
  roundChallengeKind,
  type RoundChallenge,
  type RoundChallengeKind,
  type TraversalChallenge,
} from '~~/types/challenges/traversal-challenge.type'
import {
  individualChallengeVariants,
  type IndividualChallenge,
} from '~~/types/challenges/individual-challenge.type'
import type { FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import { EVENTS } from '~~/data/events.gen'
import { HERITAGE } from '~~/data/heritage.gen'
import { LANDMARKS } from '~~/data/landmarks.gen'
import { RECOGNITION_TERRITORIES } from '~~/data/recognition.gen'
import type { Player, PlayerPhase } from '~~/types/player.type'

const player = (id: string, phase: PlayerPhase, currentPosition = 0): Player => ({
  id,
  phase,
  currentPosition,
  name: id,
  ready: true,
  color: '#000' as Player['color'],
  moves: [],
})

describe('stageForPhase', () => {
  it('maps every board phase to the 3D stage', () => {
    expect(stageForPhase('moving')).toBe('board')
    expect(stageForPhase('movement-summary')).toBe('board')
  })

  it('maps the challenge phases to their cards', () => {
    expect(stageForPhase('group-challenge')).toBe('question')
    expect(stageForPhase('group-scores')).toBe('scores')
    expect(stageForPhase('individual-challenge')).toBe('gate')
    expect(stageForPhase('final-challenge')).toBe('final')
  })

  it('parks lobby-ish phases on idle', () => {
    expect(stageForPhase('tutorial')).toBe('idle')
    expect(stageForPhase('victory')).toBe('idle')
  })
})

describe('pickDirectorTarget', () => {
  it('prefers a walking pawn over everything else', () => {
    const target = pickDirectorTarget([
      player('thinker', 'group-challenge', 30),
      player('walker', 'moving', 2),
      player('gauntlet', 'final-challenge', 40),
    ])
    expect(target?.id).toBe('walker')
  })

  it('prefers the gauntlet over gates and thinking', () => {
    const target = pickDirectorTarget([
      player('gate', 'individual-challenge', 30),
      player('gauntlet', 'final-challenge', 20),
    ])
    expect(target?.id).toBe('gauntlet')
  })

  it('breaks phase ties toward the race leader', () => {
    const target = pickDirectorTarget([
      player('behind', 'group-challenge', 3),
      player('ahead', 'group-challenge', 11),
    ])
    expect(target?.id).toBe('ahead')
  })

  it('never picks a kicked player, and survives an empty room', () => {
    expect(pickDirectorTarget([player('gone', 'kicked')])).toBeUndefined()
    expect(pickDirectorTarget([])).toBeUndefined()
  })
})

describe('roundStory', () => {
  it('tells the traversal secret as the optimal route', () => {
    const challenge: TraversalChallenge = {
      _type: 'traversal-challenge',
      start: 'FR',
      target: 'DE',
      optimalHops: 1,
      optimalPath: ['FR', 'DE'],
      maximumClicks: 5,
      maximumPoints: 8,
    }
    const story = roundStory(challenge)
    expect(story.prompt).toContain('France')
    expect(story.prompt).toContain('Germany')
    expect(story.secret).toContain('France → Germany')
    expect(story.focus).toEqual(['FR', 'DE'])
  })

  it('keeps the silhouette answer in the secret, not the prompt', () => {
    const story = roundStory({
      _type: 'silhouette-challenge',
      country: 'TD',
      durationSeconds: 30,
      maximumPoints: 8,
    })
    expect(story.prompt).not.toContain('Chad')
    expect(story.secret).toContain('Chad')
  })

  it('falls back gracefully with no round dealt', () => {
    expect(roundStory(undefined).kicker).toBe('Between rounds')
  })
})

describe('gateStory', () => {
  it('renders flag choices and marks the answer for a flag-pick gate', () => {
    const challenge: IndividualChallenge = {
      _type: 'individual-challenge',
      id: 'flag',
      country: 'SE',
      variant: 'flag-pick',
      options: ['SE', 'NO', 'DK'],
    }
    const story = gateStory(challenge)
    expect(story.kicker).toContain('gate')
    // The country is named openly (as the real gate does), the flags are the
    // choices, and the correct one is flagged via `answer`.
    expect(story.prompt).toContain('Sweden')
    expect(story.options).toEqual(['SE', 'NO', 'DK'])
    expect(story.answer).toBe('SE')
  })

  it('mirrors the photo, not the accessor phrasing, for a capital-match gate', () => {
    const challenge: IndividualChallenge = {
      _type: 'individual-challenge',
      id: 'capital.name',
      country: 'SE',
      variant: 'capital-match',
      image: '/skylines/stockholm.webp',
      options: ['SE', 'NO', 'DK'],
    }
    const story = gateStory(challenge)
    expect(story.image).toBe('/skylines/stockholm.webp')
    expect(story.prompt).not.toContain('Stockholm') // the skyline is the clue, not its name
    expect(story.answer).toBe('SE')
  })

  it('keeps the hidden country a secret for a zoom-out gate', () => {
    const challenge: IndividualChallenge = {
      _type: 'individual-challenge',
      id: 'isoCode',
      country: 'SE',
      variant: 'zoom-out',
    }
    const story = gateStory(challenge)
    expect(story.prompt).not.toContain('Sweden')
    expect(story.secret).toContain('Sweden')
  })

  it('fills phrasing tokens like {leader} from the answer country', () => {
    const challenge: IndividualChallenge = {
      _type: 'individual-challenge',
      id: 'government.leader',
      country: 'SE',
      variant: 'leader-pick',
    }
    const story = gateStory(challenge)
    expect(story.prompt).not.toContain('{leader}')
    expect(story.secret).toContain('Sweden')
  })

  it('withholds a secret for client-streak gates with no single answer', () => {
    const challenge: IndividualChallenge = {
      _type: 'individual-challenge',
      id: 'isoCode',
      country: 'SE',
      variant: 'higher-lower',
      higherLower: { accessorId: 'people.population', pairs: [{ a: 'SE', b: 'NO' }] },
    }
    expect(gateStory(challenge).secret).toBeUndefined()
  })
})

describe('finalStory', () => {
  it('marks the membership exception as the secret', () => {
    const story = finalStory({
      _type: 'membership-challenge',
      organization: 'nato',
      exception: 'SE',
    })
    expect(story.prompt).toContain('North Atlantic Treaty Organization')
    expect(story.secret).toContain('Sweden')
  })

  it('describes an empty gauntlet hand as dealing', () => {
    expect(finalStory(undefined).prompt).toContain('dealt')
  })
})

/**
 * The "dangling asset" guard: no spectator card may reference an asset in its
 * prompt (a flag, colours, an outline, a dossier, a highlighted feature) that
 * the card doesn't actually render. This enumerates EVERY challenge type and
 * asserts the pattern is gone across the board — the regression net for
 * "ensure this is fixed for all challenge types".
 */
const DANGLING = [
  /\bthis flag\b/i,
  /\bthese colou?rs\b/i,
  /\bthis outline\b/i,
  /outline is this/i,
  /\bthis dossier\b/i,
  /\bthese claims\b/i,
  /\bthe highlighted\b/i,
  /draws itself/i,
  /tracing itself/i,
  /\bmarked countr/i,
  /of the window\b/i,
  /\bthis skyline\b/i,
  /\bthis photo\b/i,
]

const assertNoDangle = (label: string, story: SpectateStory) => {
  for (const pattern of DANGLING) {
    expect(story.prompt, `${label} prompt dangles (${pattern}): "${story.prompt}"`).not.toMatch(
      pattern
    )
  }
}

const heritageSlug = Object.keys(HERITAGE)[0]
const landmarkSlug = Object.keys(LANDMARKS)[0]
const eventSlugs = Object.keys(EVENTS).slice(0, 3)
const territoryId = Object.keys(RECOGNITION_TERRITORIES)[0]

const ROUND_FIXTURES: RoundChallenge[] = [
  { _type: 'group-challenge', id: 'economics.gdpPerCapita', countriesPerPlayer: {} },
  {
    _type: 'traversal-challenge',
    start: 'FR',
    target: 'DE',
    optimalHops: 1,
    optimalPath: ['FR', 'DE'],
    maximumClicks: 5,
    maximumPoints: 8,
  },
  {
    _type: 'neighbour-blitz-challenge',
    country: 'FR',
    neighbours: ['DE', 'ES'],
    durationSeconds: 30,
    maximumPoints: 8,
  },
  { _type: 'silhouette-challenge', country: 'TD', durationSeconds: 30, maximumPoints: 8 },
  { _type: 'hot-cold-challenge', country: 'TD', maximumGuesses: 5, maximumPoints: 8 },
  { _type: 'sketch-challenge', country: 'FR', maximumPoints: 8 },
  {
    _type: 'stat-detective-challenge',
    country: 'TD',
    clues: ['people.population'],
    secondsPerClue: 5,
    maximumPoints: 8,
  },
  {
    _type: 'two-truths-challenge',
    country: 'FR',
    statements: [
      { accessorId: 'people.population', amount: 1, unit: 'people' },
      { accessorId: 'economics.gdpPerCapita', amount: 2, unit: '$' },
      { accessorId: 'economics.militarySpending', amount: 3, unit: '%' },
    ],
    lieIndex: 1,
    lieSource: 'DE',
    durationSeconds: 40,
    maximumPoints: 8,
  },
  {
    _type: 'water-blitz-challenge',
    featureId: 'a',
    featureName: 'Nile',
    kind: 'river',
    countries: ['EG'],
    durationSeconds: 30,
    maximumPoints: 8,
  },
  {
    _type: 'water-blitz-challenge',
    featureId: 'b',
    featureName: 'Baltic Sea',
    kind: 'sea',
    countries: ['SE'],
    durationSeconds: 30,
    maximumPoints: 8,
  },
  {
    _type: 'water-blitz-challenge',
    featureId: 'c',
    featureName: 'Alps',
    kind: 'range',
    countries: ['CH'],
    durationSeconds: 30,
    maximumPoints: 8,
  },
  {
    _type: 'name-water-challenge',
    featureId: 'd',
    featureName: 'Baltic Sea',
    kind: 'sea',
    countries: ['SE'],
    maximumGuesses: 3,
    durationSeconds: 30,
    maximumPoints: 8,
  },
  {
    _type: 'mother-tongue-challenge',
    language: 'Swahili',
    countries: ['KE', 'TZ'],
    durationSeconds: 30,
    maximumPoints: 8,
  },
  {
    _type: 'flag-palette-challenge',
    country: 'SE',
    swatches: ['#006aa7', '#fecc00'],
    durationSeconds: 30,
    maximumPoints: 8,
  },
  {
    _type: 'capital-guess-challenge',
    country: 'FR',
    image: '/x.webp',
    durationSeconds: 30,
    maximumPoints: 8,
  },
  {
    _type: 'flashpoint-challenge',
    country: 'TD',
    eras: [0],
    secondsPerEra: 5,
    durationSeconds: 30,
    maximumPoints: 8,
  },
  {
    _type: 'ghost-state-challenge',
    territoryId,
    parent: 'MA',
    durationSeconds: 30,
    maximumPoints: 8,
  },
  {
    _type: 'no-mans-land-challenge',
    territoryId,
    claimants: [],
    durationSeconds: 30,
    maximumPoints: 8,
  },
  {
    _type: 'pin-landmark-challenge',
    slug: landmarkSlug,
    image: '/x.webp',
    perfectDistanceKm: 10,
    zeroDistanceKm: 100,
    durationSeconds: 30,
    maximumPoints: 8,
  },
  {
    _type: 'trend-race-challenge',
    metric: 'hdi',
    direction: 'risen',
    options: ['SE', 'NO'],
    standings: ['SE', 'NO'],
    windowStartYear: 2000,
    durationSeconds: 30,
    maximumPoints: 8,
  },
  {
    _type: 'border-chain-challenge',
    turnSeconds: 15,
    maximumPoints: 8,
    strikes: 1,
    state: {
      chains: [['FR']],
      order: [],
      activeIndex: 0,
      turn: 0,
      deadline: 0,
      named: {},
      strikesLeft: {},
      eliminated: [],
      outcomes: {},
      missedOuts: {},
    },
  },
  {
    _type: 'heritage-hunt-challenge',
    slugs: [heritageSlug],
    beatSeconds: 15,
    perfectDistanceKm: 10,
    zeroDistanceKm: 100,
    maximumPoints: 8,
    state: { beat: 0, deadline: 0, order: [], pins: {} },
  },
  {
    _type: 'timeline-challenge',
    turnSeconds: 15,
    revealSeconds: 7,
    maximumPoints: 8,
    state: {
      deck: eventSlugs,
      placed: [eventSlugs[0]],
      card: 1,
      order: [],
      activeIndex: 0,
      turn: 0,
      deadline: 0,
      banked: {},
      placements: [],
    },
  },
  {
    _type: 'empire-challenge',
    empireId: 'gran-colombia',
    keyframeYears: [1819, 1826, 1830],
    peakYear: 1826,
    durationSeconds: 28,
    tapSeconds: 35,
    members: ['CO', 'VE', 'EC', 'PA'],
    partialMembers: ['PE'],
    maximumPoints: 8,
  },
] as unknown as RoundChallenge[]

const FINAL_FIXTURES: FinalChallengeItem[] = [
  { _type: 'region-challenge', country: 'FR' },
  { _type: 'max-challenge', accessorId: 'people.population', country: 'FR', hints: ['DE', 'ES'] },
  { _type: 'min-challenge', accessorId: 'people.population', country: 'FR', hints: ['DE', 'ES'] },
  { _type: 'leadership-challenge', country: 'FR' },
  { _type: 'language-challenge', language: 'French' },
  { _type: 'membership-challenge', organization: 'nato', exception: 'SE' },
  { _type: 'sunset-blitz-challenge', countries: ['FR'], quotaRatio: 0.5, durationSeconds: 30 },
  {
    _type: 'scales-challenge',
    accessorId: 'people.population',
    target: 'FR',
    maxPicks: 3,
    tolerance: 0.2,
  },
  { _type: 'born-challenge', year: 1990, quota: 3 },
  { _type: 'made-challenge', commodity: 'oil' },
  { _type: 'city-nocturne-challenge', country: 'FR', cityCount: 5, quota: 3, durationSeconds: 30 },
] as unknown as FinalChallengeItem[]

describe('no spectator card dangles an unshown asset', () => {
  it('covers every group round kind', () => {
    const covered = new Set<RoundChallengeKind>()
    for (const fixture of ROUND_FIXTURES) {
      const kind = roundChallengeKind(fixture)
      covered.add(kind)
      assertNoDangle(`round:${kind}`, roundStory(fixture))
    }
    // Every kind the game can deal is exercised above.
    const ALL_KINDS: RoundChallengeKind[] = [
      'ranking',
      'traversal',
      'border-chain',
      'heritage-hunt',
      'neighbour-blitz',
      'silhouette',
      'hot-cold',
      'sketch',
      'stat-detective',
      'two-truths',
      'river-run',
      'shared-shores',
      'highlands',
      'name-that-water',
      'mother-tongue',
      'flag-palette',
      'capital-guess',
      'flashpoint',
      'ghost-state',
      'no-mans-land',
      'pin-landmark',
      'trend-race',
      'timeline',
      'empire',
    ]
    for (const kind of ALL_KINDS)
      expect(covered.has(kind), `missing round kind: ${kind}`).toBe(true)
  })

  it('covers every individual gate variant', () => {
    for (const variant of individualChallengeVariants) {
      const challenge = {
        _type: 'individual-challenge',
        id: 'flag',
        country: 'SE',
        variant,
        options: ['SE', 'NO', 'DK'],
        oddOneOut: { countries: ['SE', 'NO', 'DK'], propertyLabel: 'landlocked' },
        higherLower: { accessorId: 'people.population', pairs: [{ a: 'SE', b: 'NO' }] },
        trendDuels: [{ metric: 'hdi', seek: 'rising', a: 'SE', b: 'NO' }],
        neighbours: ['NO', 'DK', 'FI'],
        trajectory: { metric: 'hdi', options: ['SE', 'NO'], valuesHint: false },
        portrait: { image: '/x.webp', name: 'X' },
        image: '/x.webp',
      } as unknown as IndividualChallenge
      assertNoDangle(`gate:${variant}`, gateStory(challenge))
    }
  })

  it('covers every final gauntlet question type', () => {
    for (const item of FINAL_FIXTURES) assertNoDangle(`final:${item._type}`, finalStory(item))
  })
})

describe('asset-driven cards actually carry their asset', () => {
  const round = (fixture: RoundChallenge) => roundStory(fixture)
  const find = (type: string) =>
    ROUND_FIXTURES.find(
      f => roundChallengeKind(f) !== undefined && (f as { _type: string })._type === type
    )!

  it('silhouette carries an outline', () => {
    expect(round(find('silhouette-challenge')).outline).toBe('TD')
  })
  it('flag-palette carries swatches', () => {
    expect(round(find('flag-palette-challenge')).swatches?.length).toBeGreaterThan(0)
  })
  it('two-truths carries three fact claims', () => {
    expect(round(find('two-truths-challenge')).facts?.length).toBe(3)
  })
  it('stat-detective carries a dossier', () => {
    expect(round(find('stat-detective-challenge')).facts?.length).toBeGreaterThan(0)
  })
  it('trend-race carries option flags', () => {
    expect(round(find('trend-race-challenge')).options?.length).toBeGreaterThan(0)
  })
})
