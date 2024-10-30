export * from './amounts'
export * from './mapping'

export interface GeneratorResult {
  success: boolean
  countries: Record<string, unknown>
  errors: Error[]
}

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
  isoCode: string
}

export interface CountryTransformer {
  transform(data: unknown, isoCode: string): unknown
}

export interface CountryValidator {
  validate(country: unknown): boolean
  validateResponse(response: unknown): boolean
}

export interface CountryWriter {
  writeISOCodes(codes: string[]): Promise<void>
  writeCountries(countries: Record<string, unknown>): Promise<void>
  writeRegions(regions: string[]): Promise<void>
}

export interface LinkMapping {
  isoCode: string
  fipsCode: string
  url: string
  folder: string
}

export interface MappingResult {
  success: boolean
  mappings: LinkMapping[]
  errors: Error[]
}
