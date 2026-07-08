import type { BBox } from './geometry'
import { TARGET_HEIGHT, TARGET_WIDTH, type Anchor, type ViewBox } from './types'

/** Parse a `viewBox` string into an explicit basis. Falls back to 0,0 origin. */
export const parseViewBox = (value: string | undefined): ViewBox => {
  const parts = (value || '').split(/[\s,]+/).map(Number)
  if (parts.length === 4 && parts.every(n => Number.isFinite(n))) {
    const [minX, minY, width, height] = parts
    return { minX, minY, width, height }
  }
  // No/invalid viewBox: assume a unit square so callers still get finite math.
  return { minX: 0, minY: 0, width: 1, height: 1 }
}

export const formatViewBox = (vb: ViewBox): string =>
  `${vb.minX} ${vb.minY} ${vb.width} ${vb.height}`

export const TARGET_VIEWBOX: ViewBox = {
  minX: 0,
  minY: 0,
  width: TARGET_WIDTH,
  height: TARGET_HEIGHT,
}

/**
 * Resolve a named target region to a rectangle in target space. Regions encode
 * the conventional layout fractions used by the family rules — `field` is the
 * whole flag, `center-band` the middle horizontal third, `canton` the
 * upper-hoist quarter-ish, `triangle` the hoist chevron zone.
 */
export const regionRect = (region: 'field' | 'canton' | 'center-band' | 'triangle'): BBox => {
  switch (region) {
    case 'field':
      return { x: 0, y: 0, width: TARGET_WIDTH, height: TARGET_HEIGHT }
    case 'center-band':
      // Middle horizontal third (where a triband emblem sits vertically).
      return { x: 0, y: TARGET_HEIGHT / 3, width: TARGET_WIDTH, height: TARGET_HEIGHT / 3 }
    case 'canton':
      // Upper-hoist canton: US convention ~0.4 width × ~0.54 height.
      return { x: 0, y: 0, width: TARGET_WIDTH * 0.4, height: TARGET_HEIGHT * 0.538 }
    case 'triangle':
      // Hoist chevron reaching ~0.4 of the width.
      return { x: 0, y: 0, width: TARGET_WIDTH * 0.4, height: TARGET_HEIGHT }
  }
}

/**
 * Resolve a non-`preserve` anchor to a target-space point (the emblem centre
 * lands here). `preserve` is handled by `preservedAnchor` (it needs source
 * context) — callers must branch on it before calling this.
 */
export const anchorPoint = (anchor: Exclude<Anchor, { preserve: true }>): [number, number] => {
  if ('x' in anchor) {
    return [anchor.x * TARGET_WIDTH, anchor.y * TARGET_HEIGHT]
  }
  const rect = regionRect(anchor.region)
  if (anchor.at === 'upper-hoist') {
    // Centre of the hoist-upper quadrant of the region.
    return [rect.x + rect.width * 0.5, rect.y + rect.height * 0.5]
  }
  // Default: region centre.
  return [rect.x + rect.width / 2, rect.y + rect.height / 2]
}

/**
 * The `preserve` anchor: keep the emblem where it sits in the real flag.
 *
 * Vertical fraction is preserved directly. Horizontal blends two behaviours by
 * how central the emblem is:
 *  - A CENTRED emblem (fx≈0.5) maps to the target centre (450) — otherwise a
 *    widened flag would leave a centred device sitting off to the hoist side.
 *  - An EDGE emblem (fx near 0 or 1) preserves its DISTANCE from that edge,
 *    measured in flag-HEIGHT units (aspect-independent) so a hoist device stays
 *    the same visual distance from the hoist at 3:1, not flung toward the middle.
 * The two are interpolated by a centrality weight so mid-positioned emblems get
 * a sensible blend. This is the default; per-flag dx overrides fine-tune it.
 */
export const preservedAnchor = (
  src: ViewBox,
  emblemCenterX: number,
  emblemCenterY: number
): [number, number] => {
  const fx = (emblemCenterX - src.minX) / src.width
  const fy = (emblemCenterY - src.minY) / src.height

  const y = fy * TARGET_HEIGHT

  // Edge-preserving x: keep the gap to the nearer edge, in height units.
  const nearHoist = fx <= 0.5
  const edgeGap = (nearHoist ? fx : 1 - fx) * src.width // in source px
  const gapTarget = (edgeGap / src.height) * TARGET_HEIGHT
  const edgeX = nearHoist ? gapTarget : TARGET_WIDTH - gapTarget

  // Centre-preserving x: the plain target centre.
  const centreX = TARGET_WIDTH / 2

  // Centrality: 1 at fx=0.5, 0 at the edges. Emblems within ~15% of centre are
  // treated as centred; beyond that, edge-distance takes over smoothly.
  const centrality = Math.max(0, 1 - Math.abs(fx - 0.5) / 0.35)
  const x = centrality * centreX + (1 - centrality) * edgeX

  // Guard: keep the anchor inside the flag.
  return [Math.max(0, Math.min(TARGET_WIDTH, x)), Math.max(0, Math.min(TARGET_HEIGHT, y))]
}

/**
 * The non-uniform affine that maps the source field basis onto the full 3:1
 * target. Applied to field geometry only (bands/blocks tolerate the stretch).
 */
export const fieldStretch = (src: ViewBox) => {
  const sx = TARGET_WIDTH / src.width
  const sy = TARGET_HEIGHT / src.height
  return {
    sx,
    sy,
    // matrix that also cancels the source origin
    matrix: [sx, 0, 0, sy, -src.minX * sx, -src.minY * sy] as const,
  }
}
