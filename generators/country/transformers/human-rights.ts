import { extractNumbers, extractYears } from '../../../lib/strings'
import type { FactbookResponse } from '../../../types/response.type'
import type { Amount } from '../types/amounts'
import { BaseTransformer } from './base'

export class HumanRightsTransformer extends BaseTransformer {
  constructor() {
    super('HumanRightsTransformer')
  }

  extract(
    data: FactbookResponse,
    isoCode: string,
    marriageRights: Record<string, { yearAllowed: number }>
  ) {
    return {
      refugees: this.extractRefugees(data),
      gayMarriageLegalized: marriageRights[isoCode]
        ? {
            amount: marriageRights[isoCode].yearAllowed,
            unit: 'year' as const,
          }
        : undefined,
    }
  }

  private extractRefugees(data: FactbookResponse): Amount<'people'> | undefined {
    const unparsed =
      data['Transnational Issues']?.['Refugees and internally displaced persons']?.[
        'refugees (country of origin)'
      ]
    if (!unparsed?.text) return undefined

    const withoutDate = unparsed.text.replace(/\([^)]*\)/g, '')
    const years = extractYears(withoutDate)
    let withoutYears = withoutDate.replaceAll(',', '')
    for (const year of years) {
      withoutYears = withoutYears.replace(year.toString(), '')
    }

    const numbers = extractNumbers(withoutYears)
    if (!numbers.length) return undefined

    return {
      unit: 'people',
      amount: numbers.reduce((a, b) => a + b),
    }
  }
}
