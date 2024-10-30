import { writeFileSync } from 'fs'
import { MARRIAGE_RIGHTS } from '../../data/static/marriage-rights'
import { GENERATOR_CONFIG } from './config'
import { CountryDataFetcher } from './fetcher'
import { CountryDataTransformer } from './transformer'
import { CountryDataValidator } from './validator'
import { MappingGenerator } from './mapping'
import { Logger } from './logger'
import type { GeneratorResult } from './types'
import { FileSystemError, ValidationError } from './errors'
import type { Country, ISOCountryCode } from '../../types/geography.types'

export class GeneratorRunner {
  private readonly logger = new Logger('GeneratorRunner')
  private readonly fetcher: CountryDataFetcher
  private readonly transformer: CountryDataTransformer
  private readonly validator: CountryDataValidator
  private readonly mappingGenerator: MappingGenerator

  constructor() {
    this.fetcher = new CountryDataFetcher(GENERATOR_CONFIG.api.factbook)
    this.transformer = new CountryDataTransformer({
      briMembers: [],
      conflicts: {},
      flags: {},
      marriageRights: MARRIAGE_RIGHTS,
    })
    this.validator = new CountryDataValidator()
    this.mappingGenerator = new MappingGenerator()
  }

  async run(): Promise<GeneratorResult> {
    this.logger.info('Starting country data generation')

    const result: GeneratorResult = {
      success: false,
      countries: {} as Record<ISOCountryCode, Country>,
      errors: [],
    }

    try {
      // Generate link mapping first
      const mappingResult = await this.mappingGenerator.generate()
      if (!mappingResult.success) {
        throw new ValidationError('Failed to generate link mapping', mappingResult.errors)
      }

      // Generate country data
      for (const mapping of mappingResult.mappings) {
        try {
          const data = await this.fetcher.fetch(mapping)
          if (!this.validator.validateResponse(data)) {
            throw new ValidationError('Invalid country data', data)
          }

          const country = this.transformer.transform(data, mapping.isoCode)
          if (!this.validator.validate(country)) {
            throw new ValidationError('Invalid transformed country', country)
          }

          result.countries[mapping.isoCode] = country
        } catch (error) {
          result.errors.push(error as Error)
          this.logger.error(`Failed to process country ${mapping.isoCode}:`, error)
        }
      }

      // Write output files
      await this.writeOutputFiles(result)

      result.success = true
      this.logger.info('Country data generation completed successfully')
    } catch (error) {
      result.errors.push(error as Error)
      this.logger.error('Country data generation failed:', error)
    }

    return result
  }

  private async writeOutputFiles(result: GeneratorResult) {
    try {
      // Write ISO codes
      const isoCodes = Object.keys(result.countries)
      writeFileSync(
        GENERATOR_CONFIG.paths.isoCodesFile,
        GENERATOR_CONFIG.templates.isoCodesFile(isoCodes)
      )

      // Write countries
      writeFileSync(
        GENERATOR_CONFIG.paths.countriesFile,
        GENERATOR_CONFIG.templates.countriesFile(result.countries)
      )

      this.logger.info('Output files written successfully')
    } catch (error) {
      throw new FileSystemError(
        'Failed to write output files',
        GENERATOR_CONFIG.paths.countriesFile
      )
    }
  }
}
