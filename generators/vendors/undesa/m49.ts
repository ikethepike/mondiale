/**
 * The migrant stock matrix names 233 entities and keys them by UN M49 numeric
 * code; resolution to ISO now lives in generators/lib/un-names.ts, shared with
 * the Treaty Collection generator, which reads the same naming conventions.
 *
 * Codes at or above 900 are regional and development-group aggregates
 * ("World", "Sub-Saharan Africa"). The generator drops those on their numeric
 * code before a name ever reaches the resolver — belt and braces, since their
 * names would also fail to resolve.
 */
export { resolveUnLocation } from '~~/generators/lib/un-names'
