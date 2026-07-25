import { describe, expect, it } from 'vitest'
import { finalStory, gateStory, pickDirectorTarget, roundStory, stageForPhase } from './spectate'
import type { TraversalChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
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
