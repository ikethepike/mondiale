import { getPercentages } from '../../../lib/strings'
import type { FactbookResponse } from '../../../types/response.type'
import { BaseTransformer } from './base'

export class ReligionTransformer extends BaseTransformer {
  constructor() {
    super('ReligionTransformer')
  }

  extract(data: FactbookResponse) {
    const religions = data['People and Society']?.Religions
    if (!religions?.text?.includes('none')) {
      return {}
    }

    const split = religions.text.split('none').pop()
    if (!split) return {}

    const atheists = getPercentages(split).shift()
    if (!atheists) return {}

    return {
      atheism: {
        amount: atheists,
        unit: '%' as const,
      },
      believers: {
        amount: 100 - atheists,
        unit: '%' as const,
      },
    }
  }
}
