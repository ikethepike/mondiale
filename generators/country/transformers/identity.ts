import type { FactbookResponse } from '../../../types/response.type'
import { BaseTransformer } from './base'

export class IdentityTransformer extends BaseTransformer {
  constructor() {
    super('IdentityTransformer')
  }

  extract(_data: FactbookResponse, _isoCode: string, flag: string) {
    return {
      colors: this.extractNationalColors(flag),
    }
  }

  private extractNationalColors(flag: string): string[] {
    if (!flag?.includes('fill')) return []
    const matches = flag.match(/#(?:[0-9a-fA-F]{3}){1,2}/g) || []
    return Array.from(new Set(matches))
  }
}
