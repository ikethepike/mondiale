import { normalizeAnswer } from '~~/lib/strings'
import type { WaterFacts } from '~~/data/water-facts.gen'

/**
 * The Factbook figure for a water feature, matched through its display name
 * and aliases (the same names typed answers match on). The table ships as a
 * lazy chunk — reveals await it; play never does. Undefined for features the
 * Factbook doesn't list (most seas, every range) — callers degrade gracefully.
 */
export const waterFactsFor = async (feature: {
  name: string
  aliases?: string[]
}): Promise<WaterFacts | undefined> => {
  const { WATER_FACTS } = await import('~~/data/water-facts.gen')
  for (const name of [feature.name, ...(feature.aliases ?? [])]) {
    const hit = WATER_FACTS[normalizeAnswer(name)]
    if (hit) return hit
  }
  return undefined
}
