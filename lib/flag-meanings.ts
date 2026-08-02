import type { FlagMeaning } from '~~/data/flag-meanings.gen'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The country's flag symbolism from the lazy flag-meanings table — undefined
 * when the Factbook offers neither a `meaning` nor a `history`, so callers can
 * gate their reveal on the result (a visual description alone must never be
 * presented as symbolism).
 */
export const loadFlagMeaning = async (
  isoCode: ISOCountryCode
): Promise<FlagMeaning | undefined> => {
  const { FLAG_MEANINGS } = await import('~~/data/flag-meanings.gen')
  const entry = FLAG_MEANINGS[isoCode]
  return entry?.meaning || entry?.history ? entry : undefined
}
