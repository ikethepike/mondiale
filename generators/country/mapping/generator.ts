import { Logger } from '../logger'
import type { MappingResult, LinkMapping } from './types'
import { ValidationError } from '../errors'
import { FOLDERS, ISO_FIPS_MAPPING, NON_SOVEREIGNS } from './constants'
import { MappingValidator } from './validator'
import type { ISOCountryCode } from '../../../types/geography.types'

export class MappingGenerator {
  private readonly logger = new Logger('MappingGenerator')
  private readonly validator = new MappingValidator()
  private readonly baseUrl = 'https://github.com/factbook/factbook.json/raw/master'

  async generate(): Promise<MappingResult> {
    const result: MappingResult = {
      success: false,
      mappings: [],
      errors: [],
    }

    try {
      // Add non-sovereign territories first
      for (const nonSovereign of NON_SOVEREIGNS) {
        try {
          const response = await fetch(nonSovereign.url)
          if (response.ok) {
            const mapping: LinkMapping = {
              isoCode: nonSovereign.isoCode,
              fipsCode: nonSovereign.fipsCode,
              url: nonSovereign.url,
              folder: nonSovereign.url.split('/').slice(-2)[0],
            }
            if (this.validator.validateMapping(mapping)) {
              result.mappings.push(mapping)
              this.logger.info(`Added non-sovereign territory: ${nonSovereign.isoCode}`)
            }
          }
        } catch (error) {
          this.logger.warn(
            `Failed to fetch non-sovereign territory: ${nonSovereign.isoCode}`,
            error
          )
        }
      }

      // Process sovereign nations
      for (const [isoCode, fipsCode] of Object.entries(ISO_FIPS_MAPPING)) {
        let found = false
        this.logger.info(`Processing country: ${isoCode}`)

        for (const folder of FOLDERS) {
          if (found) continue

          this.logger.debug(`> Trying folder: ${folder}`)
          try {
            const url = `${this.baseUrl}/${folder}/${fipsCode.toLowerCase()}.json`
            const response = await fetch(url)

            if (response.ok) {
              found = true
              const mapping: LinkMapping = {
                fipsCode,
                folder,
                isoCode: isoCode as ISOCountryCode,
                url,
              }
              if (this.validator.validateMapping(mapping)) {
                result.mappings.push(mapping)
                this.logger.info(`☀️ Found successful combination for: ${isoCode}`)
              } else {
                throw new ValidationError(`Invalid mapping for ${isoCode}`, mapping)
              }
            }
          } catch (error) {
            this.logger.debug(`Failed to fetch from ${folder} for ${isoCode}:`, error)
          }
        }

        if (!found) {
          const error = new ValidationError(`Failed to find mapping for: ${isoCode}`, {
            isoCode,
            fipsCode,
          })
          result.errors.push(error)
          this.logger.warn(`⚠️ ${error.message}`)
        }
      }

      this.logger.info(`Found: ${result.mappings.length} mappings`)
      this.logger.info(`Failed: ${result.errors.length} mappings`)

      result.success = result.mappings.length > 0
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      result.errors.push(err)
      this.logger.error('Failed to generate mappings:', err)
    }

    return result
  }

  async validateUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url)
      return response.ok
    } catch {
      return false
    }
  }
}
