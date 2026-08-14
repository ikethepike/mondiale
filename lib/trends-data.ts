import { TRENDS as OWID_TRENDS } from '~~/data/trends.gen'
import { WPP_TRENDS } from '~~/data/wpp-trends.gen'
import { IMF_TRENDS } from '~~/data/imf.gen'
import type { TrendMapping } from './trends'

/**
 * The one merged per-country series table (OWID + UN WPP) — game code reads
 * this, never a vendor's gen file directly. Split from lib/trends so the
 * helpers/metadata there stay import-light: this module carries ~1.2MB of
 * series and is loaded lazily by dealers (view chunks import it statically —
 * they only load when a trend surface renders). Issue #110.
 */
export const TRENDS: TrendMapping = (() => {
  const merged: TrendMapping = {}
  const sources: TrendMapping[] = [OWID_TRENDS, WPP_TRENDS, IMF_TRENDS]
  for (const source of sources) {
    for (const isoCode of Object.keys(source) as (keyof TrendMapping)[]) {
      merged[isoCode] = { ...merged[isoCode], ...source[isoCode] }
    }
  }
  return merged
})()
