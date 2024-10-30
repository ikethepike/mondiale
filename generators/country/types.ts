import type { Country, ISOCountryCode } from '~/types/geography.types'
import type { FactbookResponse } from '~/types/response.type'

export interface CountryGeneratorConfig {
  outputPaths: {
    isoCodesPath: string
    countriesPath: string
    regionsPath: string
  }
  fetchConfig: {
    maxRetries: number
    retryDelay: number
  }
}

export interface CountryDataSource {
  url: string
  isoCode: ISOCountryCode
}

export interface CountryTransformer {
  transform(data: FactbookResponse, isoCode: ISOCountryCode): Country
}

export interface CountryValidator {
  validate(country: Country): boolean
  validateResponse(response: FactbookResponse): boolean
}

export interface CountryWriter {
  writeISOCodes(codes: ISOCountryCode[]): Promise<void>
  writeCountries(countries: Record<ISOCountryCode, Country>): Promise<void>
  writeRegions(regions: string[]): Promise<void>
}

export interface CountryFetcher {
  fetch(source: CountryDataSource): Promise<FactbookResponse>
}

export interface ExternalDataFetcher {
  fetchBRIMembers(): Promise<string[]>
  fetchFlags(isoCode: string): Promise<string>
}

export type GeneratorResult = {
  success: boolean
  countries: Record<ISOCountryCode, Country>
  errors: Error[]
}
