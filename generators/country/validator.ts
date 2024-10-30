import type { Country } from '../../types/geography.types'
import type { FactbookResponse } from '../../types/response.type'
import { Logger } from './logger'

export interface CountryValidator {
  validate(country: Country): boolean
  validateResponse(response: FactbookResponse): boolean
}

export class CountryDataValidator implements CountryValidator {
  private readonly logger = new Logger('CountryDataValidator')

  validate(country: Country): boolean {
    try {
      if (!country.name.english || !country.isoCode) {
        this.logger.error('Missing required fields', { country })
        return false
      }

      if (!this.validateEconomics(country)) {
        this.logger.error('Invalid economics data', { economics: country.economics })
        return false
      }

      if (!this.validateGeography(country)) {
        this.logger.error('Invalid geography data', { geography: country.geography })
        return false
      }

      return true
    } catch (error) {
      this.logger.error('Validation error:', error)
      return false
    }
  }

  validateResponse(response: FactbookResponse): boolean {
    try {
      if (!response.Government || !response.Geography) {
        this.logger.error('Missing required sections', { response })
        return false
      }

      if (!response.Government['Country name']) {
        this.logger.error('Missing country name', { government: response.Government })
        return false
      }

      if (!response.Geography['Map references']) {
        this.logger.error('Missing map references', { geography: response.Geography })
        return false
      }

      return true
    } catch (error) {
      this.logger.error('Response validation error:', error)
      return false
    }
  }

  private validateEconomics(country: Country): boolean {
    const { economics } = country
    if (!economics) return false

    // Validate required economic fields
    if (economics.gdpPerCapita && !this.validateAmount(economics.gdpPerCapita)) {
      return false
    }

    if (economics.inflation && !this.validateAmount(economics.inflation)) {
      return false
    }

    return true
  }

  private validateGeography(country: Country): boolean {
    const { geography } = country
    if (!geography) return false

    // Validate required geography fields
    if (!geography.area) return false

    if (geography.area.total && !this.validateAmount(geography.area.total)) {
      return false
    }

    if (geography.capital && !geography.capital.name) {
      return false
    }

    return true
  }

  private validateAmount<T extends string>(amount: {
    unit: T
    amount: number
    year?: number
  }): boolean {
    return (
      typeof amount.unit === 'string' &&
      typeof amount.amount === 'number' &&
      (amount.year === undefined || typeof amount.year === 'number')
    )
  }
}
