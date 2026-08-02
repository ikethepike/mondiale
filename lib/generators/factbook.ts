import { decode } from 'he'
import type { FactbookResponse } from '~~/types/response.type'

/**
 * Factbook text contains HTML entities (e.g. C&ocirc;te d'Ivoire) which break
 * downstream parsing such as truncating on semicolons. Decode every string in
 * the response before any processing.
 */
export const decodeHtmlEntitiesDeep = <T>(value: T): T => {
  if (typeof value === 'string') return decode(value) as T
  if (Array.isArray(value)) return value.map(decodeHtmlEntitiesDeep) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, decodeHtmlEntitiesDeep(entry)])
    ) as T
  }
  return value
}

/**
 * Every country's Factbook payload, fetched in link-mapping order with the
 * entities pre-decoded. Failed fetches warn and skip — a generator run must
 * not die on one flaky country.
 */
export async function* factbookResponses(
  combinations: readonly { url: string; isoCode: string }[]
): AsyncGenerator<{ isoCode: string; data: FactbookResponse }> {
  for (const { url, isoCode } of combinations) {
    try {
      const response = await fetch(url)
      yield { isoCode, data: decodeHtmlEntitiesDeep(await response.json()) }
    } catch (error) {
      console.warn(`Failed to fetch: ${isoCode} - ${url}`, error)
    }
  }
}

/**
 * Flatten a Factbook prose node to plain text: `<br>` runs become spaces,
 * emphasis/bold tags drop away, whitespace collapses.
 */
export const stripFactbookMarkup = (value: string): string =>
  value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(em|strong|i|b|p)>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[;,.\s]+/, '')

/**
 * Split a `<strong>label:</strong> …` sectioned Factbook text (Flag, National
 * anthem…) into its labelled parts. Numbered labels ("note 1") fold into their
 * base label; unsectioned text lands under `defaultLabel`. Labels the Factbook
 * writes with a stray space inside the tag ("description: </strong>") parse too.
 */
export const splitFactbookSections = (
  text: string,
  defaultLabel: string
): Record<string, string> => {
  const parts = text.split(/<strong>\s*([a-z]+(?: \d+)?)\s*:\s*<\/strong>/gi)
  const sections: Record<string, string> = {}
  const add = (label: string, value: string) => {
    const content = stripFactbookMarkup(value)
    if (!content) return
    const key = label.replace(/ \d+$/, '').toLowerCase()
    // Folded sections ("note 1" + "note 2") are separate sentences — keep a
    // seam between them or they read as one run-on.
    sections[key] = sections[key] ? `${sections[key]}; ${content}` : content
  }
  add(defaultLabel, parts[0] ?? '')
  for (let index = 1; index < parts.length; index += 2) {
    add(parts[index], parts[index + 1] ?? '')
  }
  return sections
}
