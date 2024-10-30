import type { FactbookResponse } from '../../../types/response.type'
import type { TextNode, YearlyIndex } from '../../../types/response.type'

export abstract class BaseTransformer<T> {
  abstract transform(response: FactbookResponse): T

  protected extractTextNode(node: TextNode | undefined): string | undefined {
    return node?.text
  }

  protected extractYearlyIndex(
    index: YearlyIndex | undefined
  ): { value: string; year: number } | undefined {
    if (!index) return undefined

    const years = Object.keys(index).map(Number)
    if (years.length === 0) return undefined

    const latestYear = Math.max(...years)
    return {
      value: index[latestYear.toString()].text,
      year: latestYear,
    }
  }

  protected parseNumber(text: string): number | undefined {
    const match = text.match(/[-\d,.]+/)
    if (!match) return undefined

    return Number(match[0].replace(/,/g, ''))
  }

  protected removeTitles(name: string): string {
    return name
      .replace(
        /^(?:President|Prime Minister|King|Queen|Prince|Princess|Sheikh|Emir|Sultan)\s+/i,
        ''
      )
      .replace(/\s+(?:bin|bint)\s+/g, ' ')
      .trim()
  }
}
