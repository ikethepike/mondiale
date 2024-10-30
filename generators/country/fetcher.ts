import type { FactbookResponse } from '../../types/response.type'
import type { ISOCountryCode } from '../../types/geography.types'
import { Logger } from './logger'
import type { LinkMapping } from './mapping'

export class CountryDataFetcher {
  private readonly logger = new Logger('CountryDataFetcher')

  constructor(
    private readonly config: {
      maxRetries: number
      retryDelay: number
    }
  ) {}

  async fetch(mapping: LinkMapping): Promise<FactbookResponse> {
    let retries = 0
    while (retries < this.config.maxRetries) {
      try {
        const response = await fetch(mapping.url)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.json()
        return data
      } catch (error) {
        retries++
        this.logger.warn(
          `Failed to fetch data for ${mapping.isoCode} (attempt ${retries}/${this.config.maxRetries}):`,
          error
        )
        if (retries < this.config.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay))
        }
      }
    }
    throw new Error(
      `Failed to fetch data for ${mapping.isoCode} after ${this.config.maxRetries} attempts`
    )
  }
}
