import type { FactbookResponse } from '../../../types/response.type'
import { BaseTransformer } from './base'

export class HealthTransformer extends BaseTransformer {
  constructor() {
    super('HealthTransformer')
  }

  extract(data: FactbookResponse) {
    return {
      obesity: this.extractTextNode(
        data['People and Society']?.['Obesity - adult prevalence rate'],
        '%'
      ),
      doctors: this.extractTextNode(
        data['People and Society']?.['Physicians density'],
        'per 1000 people'
      ),
      hospitalBeds: this.extractTextNode(
        data['People and Society']?.['Hospital bed density'],
        'per 1000 people'
      ),
      accessToContraceptives: this.extractTextNode(
        data['People and Society']?.['Contraceptive prevalence rate'],
        '%'
      ),
      lifeExpectancy: this.extractTextNode(
        data['People and Society']?.['Life expectancy at birth']?.['total population'],
        'years'
      ),
      alcoholConsumption: this.extractTextNode(
        data['People and Society']?.['Alcohol consumption per capita']?.total,
        'liters of pure alcohol'
      ),
      tobaccoUse: this.extractTextNode(data['People and Society']?.['Tobacco use']?.total, '%'),
    }
  }
}
