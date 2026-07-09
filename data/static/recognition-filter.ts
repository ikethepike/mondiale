/**
 * Which contested territories become playable, and why.
 *
 * Natural Earth's disputed-areas layer ships 99 features, from de facto states
 * with parliaments down to nine-metre rocks. Two casts are drawn from it, both
 * by *factual predicates on the data* rather than a hand-curated allowlist —
 * so inclusion stays reviewable and a vendor bump can't silently smuggle
 * something in.
 */

/**
 * Cast A — "Ghost States". A government actually exists here and administers
 * the territory. NE records this in NOTE_BRK as "Self admin.; Claimed by X".
 *
 * This selects exactly ten features, and — because NE marks the Israeli-held
 * territories "Admin. By Israel" rather than self-administering — it excludes
 * Gaza, East Jerusalem, the West Bank, Mount Scopus, Shebaa Farms and both
 * No Man's Lands without anyone having to name them. The tonal line falls out
 * of the data.
 */
export const SELF_ADMIN_PREDICATE = /^Self admin\./i

/**
 * The two of those ten that are an active invasion rather than a frozen
 * curiosity. NE's POP_EST of 5,000,000 for each is a fiction, and a party game
 * should not deal them as trivia.
 *
 * Keyed by NE's BRK_NAME. Naming two exclusions is a smaller editorial act
 * than hand-picking the other eight.
 */
export const EXCLUDED_TERRITORIES = new Set([
  "Donetsk People's Republic",
  "Luhansk People's Republic",
])

/**
 * Cast B — "No Man's Land". Uninhabited, not self-administering, and every
 * party named in NOTE_BRK resolves to a playable country.
 *
 * Tonal exclusions (live conflicts and armistice lines) and the resolvability
 * gate are applied in the generator. Bir Tawil is the deliberate exception to
 * the "must have a claim clause" rule: its NOTE_BRK reads "Between Egypt and
 * Sudan" precisely because *nobody claims it*, which is the entire joke.
 */
export const CAST_B_TONAL_EXCLUSIONS = /Jerusalem|West Bank|Gaza|Scopus|Latrun|Shebaa/i
export const CAST_B_ARMISTICE_EXCLUSIONS = /Demilitarized Zone|UN jurisdiction|UNDOF/i

/** The one territory whose empty claimant set is real data, not a data gap. */
export const TERRA_NULLIUS = /Bir Tawil/i
