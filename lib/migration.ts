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
 * How diverse a country's foreign-born population is by origin, 0–1 — Shannon
 * evenness over every origin, computed by the generator across the full matrix
 * before truncation, so it describes the real population rather than the
 * stored head. 1 is a perfectly even mix, 0 a single dominant origin.
 *
 * No mode reads this yet: it is the one figure that cannot be recovered from
 * the shipped file, because truncating to the top corridors destroys it. The
 * alternative to keeping it is re-running the hand-run generator against a
 * pinned 6MB workbook the day a ranking mode wants it.
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
 * Measured on the 2024 revision, 1.25 rejects 19 of the 121 boards that are
 * otherwise big enough — the tightest being the Netherlands (1.030×, Poland
 * against Türkiye), Palestine (1.057×) and Uruguay (1.073×). Canada sits at
 * 1.215× and is also refused; Spain passes at 1.374×.
 */
export const COMPOSITION_MIN_MARGIN = 1.25
/** Fewer slices than this and the bar has no shape to read. */
export const COMPOSITION_MIN_SLICES = 4
/**
 * At or above this the leading origin dominates its bar outright — Colombia is
 * 96% Venezuelan-born, Iran 98% Afghan-born — and the shape answers the
 * question before the names do. Easy leads with these; hard exhausts the tight
 * boards (Australia and Germany both sit at 1.3×) first.
 */
export const COMPOSITION_CLEAR_MARGIN = 4
/** Below this the percentages describe a rounding error, not a population. */
export const COMPOSITION_MIN_TOTAL = 100_000
