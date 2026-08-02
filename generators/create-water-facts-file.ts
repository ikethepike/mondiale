import { writeFileSync } from 'fs'
import { factbookResponses, splitFactbookSections } from '~~/lib/generators/factbook'
import { normalizeAnswer } from '~~/lib/strings'
import { successfulCombinations } from './link-mapping.gen'

const OUTPUT_FILE = 'data/water-facts.gen.ts'

/** Mirrored into the generated file's header — the app imports it from there. */
interface WaterFacts {
  lengthKm?: number
  areaSqKm?: number
}

/**
 * "Rhin (Rhine) (shared with Switzerland [s], …) - 1,233 km" → every name the
 * entry answers to (base + alt-name parentheticals) and its figure. Sharing
 * notes and the [s]/[m] source/mouth markers are not names.
 */
const parseEntry = (
  entry: string,
  unit: 'km' | 'sq km'
): { names: string[]; value: number } | undefined => {
  const match = entry.match(new RegExp(`-\\s*([\\d,.]+)\\s*${unit === 'km' ? 'km' : 'sq km'}\\s*$`))
  if (!match) return undefined
  const value = Number(match[1].replaceAll(',', ''))
  if (!Number.isFinite(value) || value <= 0) return undefined

  const label = entry.slice(0, entry.lastIndexOf('-')).trim()
  const names: string[] = []
  // "Amazon river mouth" / "Paraguay river source" are shared-river markers,
  // not part of the name; a slashed base ("Río de la Plata/Paraná") is two.
  const base = label
    .replace(/\([^)]*\)?/g, ' ')
    .replace(/\b(river )?(mouth|source)( and (mouth|source))?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  // A base past five words is a leaked sharing list, never a name.
  names.push(
    ...base
      .split('/')
      .map(part => part.trim())
      .filter(part => part.split(' ').length <= 5)
  )
  for (const [, inner] of label.matchAll(/\(([^)]*)\)/g)) {
    // Alt-name parentheticals are short proper names ("Rhine", "Danube");
    // descriptors ("shared with…", "endorheic basin", "ephemeral") are not.
    const alt = inner.trim()
    if (/shared with|\[|source|mouth/i.test(alt)) continue
    if (!/^[A-ZÀ-Þ]/.test(alt) || alt.split(/\s+/).length > 3) continue
    names.push(alt)
  }
  const kept = names.filter(Boolean)
  return kept.length ? { names: kept, value } : undefined
}

/**
 * Official figures for named water bodies, from the CIA World Factbook's
 * per-country `Major rivers (by length in km)` and `Major lakes (area sq km)`
 * prose (public domain). Keyed by normalized name so `waterFactsFor`
 * (lib/water-facts.ts) can join them to Natural Earth's features and aliases.
 * Countries repeat a shared river with its full length; name collisions
 * between distinct bodies keep the largest figure — the major one is the one
 * the rounds deal.
 *
 *   bun run generate:water-facts
 */
const createWaterFactsFile = async () => {
  const facts: { [normalizedName: string]: WaterFacts } = {}

  const record = (names: string[], patch: WaterFacts) => {
    for (const name of names) {
      const key = normalizeAnswer(name)
      if (!key) continue
      const existing = facts[key] ?? {}
      facts[key] = {
        ...existing,
        ...(patch.lengthKm && patch.lengthKm > (existing.lengthKm ?? 0)
          ? { lengthKm: patch.lengthKm }
          : {}),
        ...(patch.areaSqKm && patch.areaSqKm > (existing.areaSqKm ?? 0)
          ? { areaSqKm: patch.areaSqKm }
          : {}),
      }
    }
  }

  for await (const { data } of factbookResponses(successfulCombinations)) {
    const rivers = data.Geography['Major rivers (by length in km)']?.text
    if (rivers) {
      // The trailing note explains the [s]/[m] markers — not a river.
      const body = splitFactbookSections(rivers, 'rivers').rivers ?? ''
      for (const entry of body.split(';')) {
        const parsed = parseEntry(entry.trim(), 'km')
        if (parsed) record(parsed.names, { lengthKm: parsed.value })
      }
    }

    const lakes = data.Geography['Major lakes (area sq km)']
    for (const node of [lakes?.['fresh water lake(s)'], lakes?.['salt water lake(s)']]) {
      if (!node?.text) continue
      const body = splitFactbookSections(node.text, 'lakes').lakes ?? ''
      for (const entry of body.split(';')) {
        const parsed = parseEntry(entry.trim(), 'sq km')
        if (parsed) record(parsed.names, { areaSqKm: parsed.value })
      }
    }
  }

  const rivers = Object.values(facts).filter(entry => entry.lengthKm).length
  const lakes = Object.values(facts).filter(entry => entry.areaSqKm).length
  console.log(
    `Water facts: ${Object.keys(facts).length} names — ${rivers} river lengths, ${lakes} lake areas`
  )

  writeFileSync(
    OUTPUT_FILE,
    `// This is a generated file, don't touch it.
// Generated at: ${new Date().toISOString()}

/** Official water-body figures from the CIA World Factbook (public domain),
 *  keyed by normalized name — join through waterFactsFor (lib/water-facts.ts),
 *  never by raw string. */
export interface WaterFacts {
  lengthKm?: number
  areaSqKm?: number
}

export const WATER_FACTS: { [normalizedName: string]: WaterFacts } = ${JSON.stringify(facts)}
`
  )
  console.log(`Finished creating file: ${OUTPUT_FILE}`)
}

createWaterFactsFile()
