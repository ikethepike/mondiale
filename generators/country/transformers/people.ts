import type { FactbookResponse } from '../../../types/response.type'
import { BaseTransformer } from './base'

export class PeopleTransformer extends BaseTransformer {
  constructor() {
    super('PeopleTransformer')
  }

  extract(data: FactbookResponse) {
    return {
      lifeExpectancy: this.extractTextNode(
        data['People and Society']?.['Life expectancy at birth']?.['total population'],
        'years'
      ),
      medianAge: this.extractTextNode(data['People and Society']?.['Median age']?.total, 'years'),
      childrenPerWoman: this.extractTextNode(
        data['People and Society']?.['Total fertility rate'],
        'children'
      ),
      population: this.extractTextNode(data['People and Society']?.Population, 'people'),
      populationGrowthRate: this.extractTextNode(
        data['People and Society']?.['Population growth rate'],
        '%'
      ),
    }
  }
}
