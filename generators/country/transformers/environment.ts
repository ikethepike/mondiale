import type { FactbookResponse } from '../../../types/response.type'
import { BaseTransformer } from './base'
import type { Amount } from '../types/amounts'

export class EnvironmentTransformer extends BaseTransformer {
  constructor() {
    super('EnvironmentTransformer')
  }

  extract(data: FactbookResponse) {
    return {
      CO2Emissions: this.extractTextNode(
        data.Environment?.['Air pollutants']?.['carbon dioxide emissions'],
        'megatons'
      ),
      renewables: this.extractRenewablesProduction(data),
    }
  }

  private extractRenewablesProduction(data: FactbookResponse): Amount<'%'> | undefined {
    const sources = data.Energy?.['Electricity generation sources']
    if (!sources) return undefined

    const renewableSources = [
      'solar',
      'wind',
      'hydroelectricity',
      'tide and wave',
      'geothermal',
      'biomass and waste',
    ] as const

    let renewablePercentage: number | undefined
    for (const source of renewableSources) {
      if (!Reflect.has(sources, source)) continue
      if (renewablePercentage === undefined) {
        renewablePercentage = 0
      }

      const parsed = this.extractTextNode(sources[source], '%')
      if (!parsed) continue

      renewablePercentage += parsed.amount
    }

    if (renewablePercentage === undefined) {
      return undefined
    }

    return {
      unit: '%',
      amount: Math.round(renewablePercentage),
    }
  }
}
