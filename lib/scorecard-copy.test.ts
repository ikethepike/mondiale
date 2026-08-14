import { describe, expect, it } from 'vitest'
import {
  scorecardExplainer,
  scorecardLabels,
  tongueFactLine,
  waterFactLine,
} from './scorecard-copy'
import { CHALLENGE_GROUP_BY_KIND } from '~~/types/challenges/challenge-groups.type'
import type {
  RoundChallenge,
  RoundChallengeKind,
} from '~~/types/challenges/traversal-challenge.type'

// The keys are compile-guarded as exhaustive over RoundChallengeKind
// (`satisfies Record<RoundChallengeKind, …>`), so a new kind lands here for
// free — which is the whole point of sweeping the copy through it.
const EVERY_KIND = Object.keys(CHALLENGE_GROUP_BY_KIND) as RoundChallengeKind[]

describe('scorecardExplainer', () => {
  it('covers every round kind', () => {
    expect(EVERY_KIND.length).toBeGreaterThan(30)
    for (const kind of EVERY_KIND) {
      const line = scorecardExplainer({ kind })
      expect(line, `no explainer for '${kind}'`).toBeTruthy()
      expect(line.trim(), `blank explainer for '${kind}'`).not.toBe('')
    }
  })

  it('counts border crossings in singular and plural', () => {
    const one = scorecardExplainer({
      kind: 'traversal',
      bridged: true,
      walkedHops: 1,
      shortestHops: 1,
    })
    expect(one).toContain('1 border,')

    const many = scorecardExplainer({
      kind: 'traversal',
      bridged: true,
      walkedHops: 3,
      shortestHops: 3,
    })
    expect(many).toContain('3 borders')
  })

  it('says so when the guesses never bridged the two', () => {
    const line = scorecardExplainer({ kind: 'traversal', bridged: false, shortestHops: 2 })
    expect(line).toContain('never bridged')
    expect(line).toContain('2 borders')
  })

  it('names the detour when the route is longer than the shortest', () => {
    const line = scorecardExplainer({
      kind: 'traversal',
      bridged: true,
      walkedHops: 4,
      shortestHops: 2,
    })
    expect(line).toContain('4 borders')
    expect(line).toContain('the shortest crosses 2')
  })

  it('drops the 50/50 note on hard mode', () => {
    expect(scorecardExplainer({ kind: 'two-truths', hardMode: false })).toContain('50/50')
    expect(scorecardExplainer({ kind: 'two-truths', hardMode: true })).not.toContain('50/50')
  })

  it('teaches the tie rule only on rankings that leaned on it', () => {
    expect(scorecardExplainer({ kind: 'ranking', hasTies: true })).toContain('share a place')
    expect(scorecardExplainer({ kind: 'ranking', hasTies: false })).not.toContain('share a place')
  })

  it('carries the internal-conflict fact only for conflict stats', () => {
    const conflict = scorecardExplainer({
      kind: 'ranking',
      challenge: { id: 'government.conflictsFought' } as never,
    })
    expect(conflict).toContain('internal')

    const plain = scorecardExplainer({
      kind: 'ranking',
      challenge: { id: 'people.population' } as never,
    })
    expect(plain).not.toContain('internal')
  })

  it('changes the guess-cap wording when a cap was dealt', () => {
    for (const kind of ['capital-guess', 'flashpoint'] as const) {
      expect(scorecardExplainer({ kind, maximumGuesses: 2 })).toContain('first try')
      expect(scorecardExplainer({ kind, maximumGuesses: undefined })).not.toContain('first try')
    }
  })
})

describe('scorecardLabels', () => {
  it('covers every round kind with both rows and a stray label', () => {
    for (const kind of EVERY_KIND) {
      const labels = scorecardLabels({ kind })
      expect(labels.submitted, `no submitted label for '${kind}'`).toBeTruthy()
      expect(labels.correct, `no correct label for '${kind}'`).toBeTruthy()
      // The stray tail reads the same everywhere.
      expect(labels.stray).toBe('Wrong Names')
    }
  })

  it('calls a traversal row a route only once it actually bridged', () => {
    expect(scorecardLabels({ kind: 'traversal', bridged: true }).submitted).toBe('Your Route')
    expect(scorecardLabels({ kind: 'traversal', bridged: false }).submitted).toBe('Your Guesses')
  })

  it('names the board a mother-tongue round was scoped to', () => {
    const challenge = {
      _type: 'mother-tongue-challenge',
      language: 'French',
      countries: ['FR', 'BE', 'LU', 'MC', 'CH'],
      scope: 'europe',
      durationSeconds: 45,
      maximumPoints: 3,
    } as unknown as RoundChallenge
    expect(scorecardLabels({ kind: 'mother-tongue', challenge }).correct).toBe(
      "Where It's Official in Europe"
    )
    // A world board keeps the unscoped wording…
    const { scope: _scope, ...world } = challenge as unknown as Record<string, unknown>
    expect(
      scorecardLabels({ kind: 'mother-tongue', challenge: world as unknown as RoundChallenge })
        .correct
    ).toBe("Everywhere It's Official")
    // …and so does a caller that hands over no challenge at all.
    expect(scorecardLabels({ kind: 'mother-tongue' }).correct).toBe("Everywhere It's Official")
  })
})

describe('waterFactLine', () => {
  it('measures a river by length and everything else by area', () => {
    expect(waterFactLine({ featureName: 'Nile', kind: 'river' }, { lengthKm: 6650 })).toContain(
      'source to mouth'
    )
    expect(waterFactLine({ featureName: 'Lake Chad', kind: 'lake' }, { areaSqKm: 1350 })).toContain(
      'km²'
    )
  })

  it('stays silent with nothing to say', () => {
    expect(waterFactLine({ featureName: 'Coral Sea', kind: 'sea' }, undefined)).toBeUndefined()
    expect(waterFactLine({ featureName: 'Coral Sea', kind: 'sea' }, {})).toBeUndefined()
    // A river with only an area still falls through to the area line.
    expect(waterFactLine({ featureName: 'Volga', kind: 'river' }, { areaSqKm: 10 })).toContain(
      'km²'
    )
  })
})

describe('tongueFactLine', () => {
  it('joins speakers and scripts when both are known', () => {
    const line = tongueFactLine('Swahili', { speakers: 15437390, scripts: ['Latin script'] })
    expect(line).toContain('Swahili')
    expect(line).toContain('people worldwide')
    expect(line).toContain('Latin script')
  })

  it('stays silent for a language it could not resolve', () => {
    expect(tongueFactLine('Nauruan', undefined)).toBeUndefined()
    expect(tongueFactLine('Nauruan', {})).toBeUndefined()
  })
})
