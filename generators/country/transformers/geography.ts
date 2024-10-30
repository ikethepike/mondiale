import type { FactbookResponse } from '../../../types/response.type'
import type { Geography } from '../types/geography'
import { BaseTransformer } from './base'

export class GeographyTransformer extends BaseTransformer<Geography> {
  transform(response: FactbookResponse): Geography {
    const geography: Geography = {
      area: {},
    }

    try {
      if (response.Geography['Geographic coordinates']) {
        geography.coordinates = this.extractTextNode(response.Geography['Geographic coordinates'])
      }

      if (response.Geography.Area) {
        const areaData = response.Geography.Area
        if (areaData.total) {
          const match = areaData.total.text.match(
            /([\d,]+(?:\.\d+)?)\s*(?:sq\s*)?(?:km|square\s*kilometers?|km2)/
          )
          if (match) {
            geography.area.total = {
              amount: Number(match[1].replace(/,/g, '')),
              unit: 'km²',
            }
          }
        }

        if (areaData.land) {
          const match = areaData.land.text.match(
            /([\d,]+(?:\.\d+)?)\s*(?:sq\s*)?(?:km|square\s*kilometers?|km2)/
          )
          if (match) {
            geography.area.land = {
              amount: Number(match[1].replace(/,/g, '')),
              unit: 'km²',
            }
          }
        }

        if (areaData.water) {
          const match = areaData.water.text.match(
            /([\d,]+(?:\.\d+)?)\s*(?:sq\s*)?(?:km|square\s*kilometers?|km2)/
          )
          if (match) {
            geography.area.water = {
              amount: Number(match[1].replace(/,/g, '')),
              unit: 'km²',
            }
          }
        }
      }

      if (response.Government?.Capital) {
        const capital = response.Government.Capital
        geography.capital = {
          name: this.extractTextNode(capital.name) || '',
        }

        if (capital['geographic coordinates']) {
          geography.capital.coordinates = this.extractTextNode(capital['geographic coordinates'])
        }
      }
    } catch (error) {
      console.error('Error transforming geography data:', error)
    }

    return geography
  }
}
