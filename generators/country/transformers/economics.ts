import type { FactbookResponse } from '../../../types/response.type'
import type { Economics } from '../types/economics'
import { BaseTransformer } from './base'

export class EconomicsTransformer extends BaseTransformer<Economics> {
  transform(response: FactbookResponse): Economics {
    const economics: Economics = {}

    try {
      const gdpData = this.extractYearlyIndex(response.Economy['Real GDP per capita'])
      if (gdpData) {
        const match = gdpData.value.match(/\$?([\d,]+(?:\.\d+)?)/)
        if (match) {
          economics.gdpPerCapita = {
            amount: Number(match[1].replace(/,/g, '')),
            unit: '$',
            year: gdpData.year,
          }
        }
      }

      const inflationData = this.extractYearlyIndex(
        response.Economy['Inflation rate (consumer prices)']
      )
      if (inflationData) {
        const match = inflationData.value.match(/([-\d,]+(?:\.\d+)?)%/)
        if (match) {
          economics.inflation = {
            amount: Number(match[1].replace(/,/g, '')),
            unit: '%',
            year: inflationData.year,
          }
        }
      }

      const giniData = this.extractYearlyIndex(
        response.Economy['Gini Index coefficient - distribution of family income']
      )
      if (giniData) {
        const match = giniData.value.match(/([\d,]+(?:\.\d+)?)/)
        if (match) {
          economics.equality = {
            amount: Number(match[1].replace(/,/g, '')),
            unit: 'Gini Coefficient',
            year: giniData.year,
          }
        }
      }
    } catch (error) {
      console.error('Error transforming economics data:', error)
    }

    return economics
  }
}
