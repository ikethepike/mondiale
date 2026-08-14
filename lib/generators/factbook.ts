import { decode } from 'he'
import type { FactbookResponse } from '~~/types/response.type'
import { FACTBOOK } from '~~/data/factbook.gen'

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
 * Every country's Factbook payload, read from the frozen snapshot in
 * link-mapping order.
 *
 * This used to fetch each country live, and swallowed failures with a warn so
 * a run would not die on one flaky request. That was the wrong trade once the
 * upstream mirror died: a generator run on a bad day produced SHORT output
 * silently — regenerate flag-meanings while the repo is unreachable and you
 * lose flag descriptions for whatever did not answer, with nothing failing.
 * The `response.ok` check was missing too, so a 404 page reached
 * `response.json()` rather than being caught as an error.
 *
 * Reading data/factbook.gen.ts removes both problems: there is no network, and
 * a country missing from the snapshot is a hard error rather than a gap,
 * because a truncated snapshot must never quietly shrink a generated file.
 */
export function* factbookResponses(
  combinations: readonly { isoCode: string }[]
): Generator<{ isoCode: string; data: FactbookResponse }> {
  const missing = combinations.filter(({ isoCode }) => !FACTBOOK[isoCode]).map(x => x.isoCode)
  if (missing.length) {
    throw new Error(
      `Factbook snapshot is missing ${missing.length} countries (${missing.slice(0, 8).join(', ')}` +
        `${missing.length > 8 ? ', …' : ''}). Re-run \`bun run snapshot:factbook\`.`
    )
  }
  for (const { isoCode } of combinations) {
    yield { isoCode, data: FACTBOOK[isoCode]! }
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
