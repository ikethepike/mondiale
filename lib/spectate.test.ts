import { describe, expect, it } from 'vitest'
import {
  IDLE_CUT_GRACE_MS,
  MIN_SHOT_MS,
  MOUNTABLE_KINDS,
  nextDirectorShot,
  pickDirectorTarget,
  roundSettled,
  roundStory,
  stageForPhase,
  type DirectorShot,
  type SpectateStory,
} from './spectate'
import {
  roundChallengeKind,
  type RoundChallenge,
} from '~~/types/challenges/traversal-challenge.type'
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

describe('nextDirectorShot', () => {
  const at = (targetId: string, classIndex: number, at: number): DirectorShot => ({
    targetId,
    classIndex,
    at,
  })

  it('cuts to the best candidate with no memory', () => {
    const shot = nextDirectorShot(undefined, [player('walker', 'moving')], 1000)
    expect(shot).toEqual(at('walker', 0, 1000))
  })

  it('cuts immediately when the subject vanishes', () => {
    const shot = nextDirectorShot(at('gone', 0, 1000), [player('thinker', 'group-challenge')], 1200)
    expect(shot?.targetId).toBe('thinker')
    expect(shot?.at).toBe(1200)
  })

  // The flicker bug: every ~500ms walk snapshot re-sorted the field and the
  // leader tiebreak re-cut the camera between two walkers mid-stride.
  it('never re-cuts between subjects in the same shot class', () => {
    const field = [player('walkerA', 'moving', 2), player('walkerB', 'moving', 9)]
    const shot = nextDirectorShot(at('walkerA', 0, 1000), field, 1500)
    expect(shot).toEqual(at('walkerA', 0, 1000))
  })

  it('keeps the subject through their own phase changes without restarting the clock', () => {
    const shot = nextDirectorShot(
      at('runner', 0, 1000),
      [player('runner', 'movement-summary'), player('idle', 'group-scores')],
      6000
    )
    expect(shot).toEqual(at('runner', 0, 1000))
  })

  it('lets a better story cut only after the dwell floor', () => {
    const field = [player('thinker', 'group-challenge'), player('walker', 'moving')]
    const previous = at('thinker', 3, 1000)
    expect(nextDirectorShot(previous, field, 1000 + MIN_SHOT_MS - 1)).toEqual(previous)
    const cut = nextDirectorShot(previous, field, 1000 + MIN_SHOT_MS)
    expect(cut?.targetId).toBe('walker')
  })

  it('abandons an idle subject after the grace, not instantly', () => {
    const field = [player('done', 'victory'), player('thinker', 'group-challenge')]
    const previous = at('done', 5, 1000)
    expect(nextDirectorShot(previous, field, 1000 + IDLE_CUT_GRACE_MS - 1)).toEqual(previous)
    expect(nextDirectorShot(previous, field, 1000 + IDLE_CUT_GRACE_MS)?.targetId).toBe('thinker')
  })

  it('holds the board shot against a lower-class candidate indefinitely', () => {
    const field = [player('summary', 'movement-summary'), player('scores', 'group-scores')]
    const previous = at('summary', 0, 1000)
    expect(nextDirectorShot(previous, field, 1000 + MIN_SHOT_MS * 10)).toEqual(previous)
  })
})

describe('MOUNTABLE_KINDS', () => {
  // The three honest impossibilities: audio needs a local play tap (the
  // inert wrapper blocks it) and sketch's canvas is local-only. Everything
  // else mounts — a regression here silently downgrades the booth to cards.
  it('excludes exactly the unmountable kinds', () => {
    for (const kind of ['anthem-buzz', 'tongue-buzz', 'sketch']) {
      expect(MOUNTABLE_KINDS).not.toContain(kind)
    }
    expect(MOUNTABLE_KINDS.length).toBeGreaterThanOrEqual(25)
  })
})

describe('roundSettled', () => {
  it('is settled once every active racer is past the answering window', () => {
    const field = [player('a', 'group-scores'), player('b', 'movement-summary')]
    expect(roundSettled(field, {})).toBe(true)
  })

  it('is unsettled while an unanswered racer is still in the round', () => {
    const field = [player('a', 'group-scores'), player('b', 'group-challenge')]
    expect(roundSettled(field, {})).toBe(false)
    expect(roundSettled(field, { b: { submitted: [], correct: [] } })).toBe(true)
  })

  it('ignores kicked and finished players', () => {
    const done = { ...player('done', 'group-challenge'), completedAtRound: 2 }
    const field = [player('gone', 'kicked'), done, player('a', 'group-scores')]
    expect(roundSettled(field, {})).toBe(true)
  })
})

describe('roundStory', () => {
  // Only the three unmountable kinds keep bespoke cards; every other kind
  // mounts its real view and falls through to the generic fallback here.
  it('keeps the anthem answer in the secret, not the prompt', () => {
    const story = roundStory({
      _type: 'anthem-buzz-challenge',
      country: 'TD',
      durationSeconds: 45,
      maximumPoints: 8,
    } as unknown as RoundChallenge)
    expect(story.prompt).not.toContain('Chad')
    expect(story.secret).toContain('Chad')
  })

  it('names the whole answer set for the tongue round', () => {
    const story = roundStory({
      _type: 'tongue-buzz-challenge',
      language: 'German',
      countries: ['DE', 'AT', 'CH'],
      durationSeconds: 45,
      maximumPoints: 8,
    } as unknown as RoundChallenge)
    expect(story.secret).toContain('German')
    expect(story.focus).toEqual(['DE', 'AT', 'CH'])
  })

  it('falls back gracefully with no round dealt', () => {
    expect(roundStory(undefined).kicker).toBe('Between rounds')
  })

  it('gives mounted kinds the generic card as a safety net', () => {
    const story = roundStory({
      _type: 'silhouette-challenge',
      country: 'TD',
      durationSeconds: 30,
      maximumPoints: 8,
    } as unknown as RoundChallenge)
    expect(story.kicker).toBe('Group round')
    expect(story.secret).toBeUndefined()
  })
})

// Copy that references an asset the card isn't showing ("this flag", "these
// colours") reads as broken — the sweep below keeps the fallback cards honest.
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
    secondsPerHint: 5,
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

describe('no spectator card dangles an unshown asset', () => {
  // The surviving fallback cards (and the generic net every mounted kind
  // falls to) must never promise an asset the template cannot show.
  it('covers every fixture the dealer can produce', () => {
    for (const fixture of ROUND_FIXTURES) {
      assertNoDangle(`round:${roundChallengeKind(fixture)}`, roundStory(fixture))
    }
  })
})
