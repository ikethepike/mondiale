import { Logger } from '../logger'
import type { LinkMapping } from './types'

export class MappingValidator {
  private readonly logger = new Logger('MappingValidator')

  validateMapping(mapping: LinkMapping): boolean {
    if (!mapping.isoCode || !mapping.fipsCode || !mapping.url || !mapping.folder) {
      this.logger.error('Invalid mapping structure', mapping)
      return false
    }

    if (!this.validateUrl(mapping.url)) {
      this.logger.error('Invalid URL format', mapping.url)
      return false
    }

    if (!this.validateISOCode(mapping.isoCode)) {
      this.logger.error('Invalid ISO code format', mapping.isoCode)
      return false
    }

    if (!this.validateFIPSCode(mapping.fipsCode)) {
      this.logger.error('Invalid FIPS code format', mapping.fipsCode)
      return false
    }

    return true
  }

  private validateUrl(url: string): boolean {
    try {
      new URL(url)
      return url.startsWith('https://github.com/factbook/factbook.json/raw/master/')
    } catch {
      return false
    }
  }

  private validateISOCode(code: string): boolean {
    return /^[A-Z]{2}$/.test(code)
  }

  private validateFIPSCode(code: string): boolean {
    return /^[A-Z]{2}$/.test(code)
  }
}
