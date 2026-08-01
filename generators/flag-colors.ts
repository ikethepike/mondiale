/**
 * Flag-colour extraction — the one home shared by the full country generator
 * and the standalone colour repair. Hex fills were always caught; NAMED fills
 * (`fill="red"` — 46 flags; `fill="gold"` — Ukraine's entire lower half) were
 * silently dropped, which is how Ukraine shipped blue-only, Switzerland and
 * Georgia white-only, and Kyrgyzstan lost its whole red field.
 */

/** The named fills the flag set actually uses, as the hex a browser paints
 *  them (CSS named-colour values). `none` and paint-server refs fall through
 *  the table and are skipped. */
const NAMED_FILLS: Record<string, string> = {
  red: '#ff0000',
  gold: '#ffd700',
  white: '#ffffff',
  gray: '#808080',
  purple: '#800080',
}

/**
 * Sanity ceiling on the stored list. El Salvador's crest alone paints 160+
 * distinct shades; nothing downstream reads past the head, so shipping them
 * all is pure dead weight. The ceiling must stay comfortably ABOVE the
 * curated/dump threshold in `lib/audio-palette.ts` (8): a capped crest dump
 * still has to LOOK like a dump, or its crest colours would be trusted as
 * flag identity.
 */
const MAX_EXTRACTED_COLORS = 24

/** Every colour an SVG flag paints, in document order, deduped and capped. */
export const getNationalColors = (flag: string): string[] => {
  if (!flag.includes('fill')) return []

  const seen = new Set<string>()
  const colors: string[] = []
  for (const match of flag.matchAll(/#(?:[0-9a-fA-F]{3}){1,2}|fill="([a-z]+)"/g)) {
    const hex = match[1] ? NAMED_FILLS[match[1]] : match[0]
    if (!hex || seen.has(hex)) continue
    seen.add(hex)
    colors.push(hex)
    if (colors.length === MAX_EXTRACTED_COLORS) break
  }
  return colors
}
