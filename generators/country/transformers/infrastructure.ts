import type { FactbookResponse } from '../../../types/response.type'
import { BaseTransformer } from './base'

export class InfrastructureTransformer extends BaseTransformer {
  constructor() {
    super('InfrastructureTransformer')
  }

  extract(data: FactbookResponse) {
    return {
      roads: this.extractTextNode(data.Transportation?.Roadways?.total, 'km'),
      rail: this.extractTextNode(data.Transportation?.Railways?.total, 'km'),
      internetAccess: this.extractTextNode(
        data.Communications?.['Internet users']?.['percent of population'],
        '%'
      ),
    }
  }
}
