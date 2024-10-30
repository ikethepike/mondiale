import type { FactbookResponse } from '../../../types/response.type'
import { BaseTransformer } from './base'

export class EducationTransformer extends BaseTransformer {
  constructor() {
    super('EducationTransformer')
  }

  extract(data: FactbookResponse) {
    return {
      literacy: this.extractTextNode(
        data['People and Society']?.Literacy?.['total population'],
        '%'
      ),
      averageYearsOfStudy: this.extractTextNode(
        data['People and Society']?.['School life expectancy (primary to tertiary education)']
          ?.total,
        'years'
      ),
    }
  }
}
