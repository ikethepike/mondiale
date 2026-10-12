import { describe, expect, it } from 'vitest'
import { gradeGroupAnswer } from './grade-group-answer'
import type { MotherTongueChallenge } from '~~/types/challenges/group-modes.type'
import type { Game, Round } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const croatian: MotherTongueChallenge = {
  _type: 'mother-tongue-challenge',
  language: 'Croatian',
  countries: ['BA', 'HR', 'ME'],
  durationSeconds: 35,
  maximumPoints: 3,
}

const grade = (ranking: ISOCountryCode[]) =>
  gradeGroupAnswer({
    game: {} as Game,
    round: { groupChallenge: croatian, groupAnswers: {}, playerTurns: {} } as unknown as Round,
    playerId: 'p1',
    submission: { ranking },
  })

describe('mother tongue grading', () => {
  it('never charges a regional speaker the view would have bounced', async () => {
    const plain = await grade(['BA', 'HR'])
    const withAustria = await grade(['BA', 'HR', 'AT'])
    expect(withAustria.scoring).toEqual(plain.scoring)
    expect(withAustria.answer.submitted).not.toContain('AT')
  })

  it('still charges a country that does not speak it', async () => {
    const plain = await grade(['BA', 'HR'])
    const withFrance = await grade(['BA', 'HR', 'FR'])
    expect(withFrance.scoring.scored).toBe(plain.scoring.scored - 1)
  })
})
