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

/**
 * Perceptual distance between two hex colours (CIE76 ΔE, via L*a*b*).
 *
 * The ONE place colour difference is measured: the board's gate tops are
 * spaced by it, and Parliament uses it to refuse two seat colours a player
 * could not tell apart. Raw RGB distance would not do — #ED1C24 and #ED1B34
 * are 16 apart in RGB and indistinguishable on screen.
 */
export const colorDistance = (a: string, b: string): number => {
  const lab = (hex: string): [number, number, number] => {
    const [red, green, blue] = hexToRgb(hex).map(channel => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }) as [number, number, number]

    const x = (0.4124 * red + 0.3576 * green + 0.1805 * blue) / 0.95047
    const y = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    const z = (0.0193 * red + 0.1192 * green + 0.9505 * blue) / 1.08883
    const f = (value: number) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116)
    const [fx, fy, fz] = [f(x), f(y), f(z)]
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
  }

  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/** Snap one hex colour to its nearest named bucket. */
const snapToNamedColor = (hex: string): NamedColor => {
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
