/**
 * Canonical named-colour buckets for FLAG palettes — the single source both the
 * data generator (to emit `identity.simplifiedColors`) and the runtime
 * (flag-pick confusability, Flag Twins "same palette") share, so the two never
 * disagree about what "red" or "same colours" means.
 *
 * This is distinct from `data/palette.ts` PLAYER_COLORS (pawn identity).
 */

export type NamedColor = 'red' | 'white' | 'blue' | 'green' | 'yellow' | 'black' | 'orange' | 'cyan'

/** RGB anchors for each bucket, tuned against real flag palettes. */
const COLOR_ANCHORS: { name: NamedColor; rgb: [number, number, number] }[] = [
  { name: 'red', rgb: [206, 17, 38] },
  { name: 'white', rgb: [255, 255, 255] },
  { name: 'blue', rgb: [0, 45, 120] },
  { name: 'green', rgb: [0, 122, 61] },
  { name: 'yellow', rgb: [252, 209, 22] },
  { name: 'black', rgb: [20, 20, 20] },
  { name: 'orange', rgb: [240, 140, 20] },
  { name: 'cyan', rgb: [0, 158, 224] },
]

/** A flag with more raw colours than this is emblem/coat-of-arms noise (El
 *  Salvador has 164) — its palette is meaningless, so we skip it. */
export const MAX_FLAG_COLORS = 6

export const hexToRgb = (hex: string): [number, number, number] => {
  let value = hex.replace('#', '')
  if (value.length === 3) {
    value = value
      .split('')
      .map(char => char + char)
      .join('')
  }
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

/** Snap one hex colour to its nearest named bucket. */
export const snapToNamedColor = (hex: string): NamedColor => {
  const [r, g, b] = hexToRgb(hex)
  let best: NamedColor = 'black'
  let bestDistance = Infinity
  for (const { name, rgb } of COLOR_ANCHORS) {
    const distance = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = name
    }
  }
  return best
}

/**
 * The simplified named palette for a flag's raw hex colours: snapped, deduped,
 * sorted (so two flags with the same colours compare equal regardless of
 * order). Returns `[]` for emblem-heavy flags (>MAX_FLAG_COLORS raw) — they
 * shouldn't take part in palette-based challenges. Sorted output doubles as a
 * signature key for grouping palette-twins.
 */
export const simplifiedPalette = (rawColors: string[]): NamedColor[] => {
  if (!rawColors.length || rawColors.length > MAX_FLAG_COLORS) return []
  return [...new Set(rawColors.map(snapToNamedColor))].sort()
}

/** True when two flags share the exact same simplified palette (Flag Twins). */
export const sameSimplifiedPalette = (a: NamedColor[], b: NamedColor[]): boolean =>
  a.length > 0 && a.length === b.length && a.every((color, index) => color === b[index])
