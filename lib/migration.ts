import { MIGRATION } from '~~/data/migration.gen'
import type { MigrationCorridor } from '~~/generators/vendors/undesa/create-migration'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Where the world's people were born and where they now live, from the UN
 * DESA International Migrant Stock matrix.
 *
 * The dataset counts the FOREIGN-BORN: living people born in one country and
 * resident in another. It cannot see descent — the millions of Brazilians of
 * Japanese or Lebanese ancestry are invisible here, and so are recognised
 * national minorities born at home (Sweden Finns, Tornedalians, Sámi). Copy
 * built on this module must say "people born in X", never "diaspora",
 * "descent", "ethnic" or "minority".
 *
 * Every caller — both dealers, both reveals and the generator — resolves
 * corridors through this module, so a mode and its reveal can never disagree.
 */

/** Top destinations for people born in `origin`, largest first. */
export const corridorsFromOrigin = (origin: ISOCountryCode): MigrationCorridor[] =>
  MIGRATION[origin]?.destinations ?? []

/** Where a country's foreign-born residents were born, largest first. */
export const corridorsToDestination = (destination: ISOCountryCode): MigrationCorridor[] =>
  MIGRATION[destination]?.origins ?? []

/**
 * Share of a destination's foreign-born residents that came from each listed
 * origin, 0–1. Shares are of the country's WHOLE foreign-born population, so
 * a truncated list sums to less than 1 — the remainder is the long tail.
 */
export const originShares = (destination: ISOCountryCode): number[] =>
  corridorsToDestination(destination).map(corridor => corridor.share)

/**
 * How diverse a country's foreign-born population is by origin, 0–1 — Shannon
 * evenness over every origin, computed by the generator across the full matrix
 * before truncation. 1 is a perfectly even mix, 0 a single dominant origin.
 */
export const originDiversity = (destination: ISOCountryCode): number | undefined =>
  MIGRATION[destination]?.diversity

/**
 * How decisively the largest corridor leads the runner-up. A lone corridor is
 * unbounded (Infinity) — nothing to tie with; an empty list is 0.
 *
 * This is the shared decisiveness test. Both modes gate on it against their
 * own threshold: a diaspora beat needs a clear answer to tap, a composition
 * round needs a largest origin that isn't a coin-flip.
 */
export const corridorMargin = (corridors: readonly MigrationCorridor[]): number => {
  if (!corridors.length) return 0
  if (corridors.length === 1) return Infinity
  const [first, second] = corridors
  return second.value.amount > 0 ? first.value.amount / second.value.amount : Infinity
}

/** Ratio at or above which the largest destination is a fair single answer. */
export const DIASPORA_MIN_MARGIN = 1.5
/** Corridors thinner than this are noise, not migration history. */
export const DIASPORA_MIN_STOCK = 20_000

/**
 * Composition tolerates a slimmer lead than a diaspora beat: the bar shows
 * every slice, so a near-tie is visible rather than hidden behind one tap.
 * Measured on the 2024 revision, 1.25 excludes the 22 genuinely ambiguous
 * boards (Spain 1.02×, the Netherlands 1.02×, Canada 1.05×).
 */
export const COMPOSITION_MIN_MARGIN = 1.25
/** Fewer slices than this and the bar has no shape to read. */
export const COMPOSITION_MIN_SLICES = 4
/** Below this the percentages describe a rounding error, not a population. */
export const COMPOSITION_MIN_TOTAL = 100_000
