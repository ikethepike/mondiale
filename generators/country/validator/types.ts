import type { Country } from '../../../types/geography.types'
import type { FactbookResponse } from '../../../types/response.type'

export interface CountryValidator {
  validate(country: Country): boolean
  validateResponse(response: FactbookResponse): boolean
}
