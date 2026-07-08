import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Structural families a flag can fall into for 3:1 tile recomposition. Each
 * family has a rule that knows how to restretch that flag's field and re-place
 * any emblem. See `lib/flags/families/*`. Order/letters match the plan.
 */
export type Family =
  | 'plain' // A: stripes/blocks, no device
  | 'nordic' // B: off-hoist cross (dk fi is no se fo ax)
  | 'hoist-triangle' // C: hoist chevron + bands
  | 'vertical-triband' // D: vertical bars ± centered emblem
  | 'horizontal-band' // E: horizontal bands + centered emblem (the bulk)
  | 'single-device' // F: one device on a solid/bicolor field, often hoist-ward
  | 'canton' // G: upper-hoist canton (us lr cl)
  | 'ensign' // H: Union-Jack canton + fly badge (excluded in v1)
  | 'oneoff' // I/J: np gb za bt … — excluded, contain-fallback

/** The canonical target: a 3:1 flag in a normalized origin-at-zero viewBox. */
export const TARGET_WIDTH = 900
export const TARGET_HEIGHT = 300

/** A source or target viewBox as an explicit basis (handles negative origins). */
export interface ViewBox {
  minX: number
  minY: number
  width: number
  height: number
}

/**
 * Where an emblem's centre lands in the TARGET flag.
 * - `preserve`: keep the emblem at its ORIGINAL position-fraction within the
 *   source flag, mapped to the same fraction of the target (faithful to the
 *   real composition — Malta's cross stays in the hoist half). Vertical
 *   fraction is preserved as-is; horizontal fraction is preserved but clamped
 *   so a near-hoist emblem doesn't drift off into the widened field.
 * - named `region`: snap to a conventional region centre (for genuinely
 *   centered emblems, or canton/triangle devices).
 * - `{x,y}`: an explicit target fraction.
 */
export type Anchor =
  | { preserve: true }
  | { region: 'field' | 'canton' | 'center-band' | 'triangle'; at?: 'center' | 'upper-hoist' }
  | { x: number; y: number } // fractions of target width/height

/** How the emblem is scaled to the target reference dimension. */
export type ScaleMode = 'fitHeight' | 'fitWidth' | 'fitBox'

/**
 * A fully-resolved instruction for re-seating one emblem unit in the 3:1
 * target — independent of whatever messy transform the source used. The engine
 * turns this into `translate·rotate·scale·translate(-center)`.
 */
export interface Placement {
  anchor: Anchor
  scaleMode: ScaleMode
  /** Fraction of the reference dimension the emblem should occupy. */
  k: number
  /** Intrinsic rotation to preserve (defaults to the source's extracted rotation). */
  rotationDeg?: number
  /** Fine nudges in target units, applied after anchoring (from overrides). */
  dx?: number
  dy?: number
}

/** A hand-tuned override for a single flag, merged over its family default. */
export interface FlagOverride extends Partial<Placement> {
  /** Force a family (escape hatch for a misclassified flag). */
  family?: Family
  /** Route to the contain-fallback instead of recomposing. */
  exclude?: boolean
  /**
   * Stretch the emblem WITH the field (non-uniform) instead of isolating it at
   * preserved size. For flags whose "emblem" is designed to span the whole flag
   * — sunbursts whose rays reach the edges (Macedonia), wave patterns
   * (Kiribati) — where distortion is acceptable and full-bleed is the point.
   */
  stretch?: boolean
  /**
   * A hand-authored 3:1 wide SVG, used VERBATIM (the engine is bypassed). For
   * the handful of flags where automated recomposition can't win — fused
   * emblems, unusual geometry — it's simpler and more reliable to draw the wide
   * version by hand. Keyed by iso in `WIDE_SVGS` (overrides.ts) and injected as
   * this field at classify time.
   */
  wideSvg?: string
}

export type OverrideTable = Partial<Record<ISOCountryCode, FlagOverride>>

/** How a flag's wide variant was produced — surfaced in the review harness. */
export type Resolution = 'family-default' | 'override' | 'excluded'

export interface RecomposeResult {
  /** The recomposed 3:1 SVG string, or null when excluded (use contain-fallback). */
  svg: string | null
  family: Family
  resolution: Resolution
  /** Human-readable note for the harness (e.g. why excluded). */
  note?: string
}
