import type { FactbookResponse } from '../../../types/response.type'
import type { Gender } from '../types/gender'
import { BaseTransformer } from './base'
import { extractText, extractNestedText } from '../../../types/response.type'

export class GenderTransformer extends BaseTransformer<Gender> {
  transform(response: FactbookResponse): Gender {
    const gender: Gender = {}

    try {
      const motherAge = extractText(
        response['People and Society']["Mother's mean age at first birth"]
      )
      if (motherAge) {
        const match = motherAge.match(/(\d+(?:\.\d+)?)/)
        if (match) {
          gender.motherMeanAgeAtFirstBirth = {
            amount: Number(match[1]),
            unit: 'year',
          }
        }
      }

      const legislativeBranch = response.Government['Legislative branch']
      if (legislativeBranch) {
        const electionResults = extractText(legislativeBranch)
        if (electionResults) {
          const femaleMatch = electionResults.match(/(\d+(?:\.\d+)?)\s*%\s*female/i)
          if (femaleMatch) {
            gender.femaleParliamentRepresentation = {
              amount: Number(femaleMatch[1]),
              unit: '%',
            }
          }
        }
      }
    } catch (error) {
      console.error('Error transforming gender data:', error)
    }

    return gender
  }
}
