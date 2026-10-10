import { MAP_BOUNDS, MAP_REGIONS, type MapCode } from '~~/data/map.gen'
import { regionsIntersect, type MapBox } from '~~/lib/geo'
import { SUNSET_TILT } from '~~/lib/sunset-window'
import { bleedBox, projectToRect, type MapViewBox, type ScreenRect } from '~~/lib/use-map-viewbox'

/**
 * The night as one moving plane: the sweep runs in map-space dusk coordinates
 * (lib/sunset-window) and lands on screen as a single compositor transform,
 * with the darkened land a static svg counter-transformed inside it. The
 * plane's keyframes and the view's grading both read `sunsetSweep`'s one
 * schedule, so the drawn line and the rule never disagree.
 */
export interface Viewport {
  width: number
  height: number
}

/** How far behind the terminator the land reaches full night, as a share of
 *  the viewport width — the veil mask's fade. */
export const SUNSET_VEIL_FEATHER = 0.2
/** Map units past the camera's edges the sweep starts and ends. */
export const SUNSET_SWEEP_MARGIN = 8
/** The plane's ease to full night once the clock runs out. */
export const SUNSET_SETTLE_MS = 1400
/** Screen tilt of the terminator: the camera keeps the viewBox at the
 *  screen's aspect, so map-space tilt IS screen tilt. */
export const SUNSET_VEIL_TILT_DEG = -(SUNSET_TILT * 180) / Math.PI

const TAN = Math.tan(SUNSET_TILT)
const SIN = Math.sin(SUNSET_TILT)
const COS = Math.cos(SUNSET_TILT)
/** The plane's bowed left edge, as a share of the viewport width — the
 *  settled push must clear it. Fed to the CSS `border-radius` as `--bow`. */
export const SUNSET_VEIL_BOW = 0.05
/** Where the plane's sea gradient reaches full night, as a share of the
 *  viewport width (its last stop in SunsetVeil's `.plane`) — the settle must
 *  push past THIS, not merely past the land mask's feather, or the west edge
 *  keeps a translucent strip through the reveal. */
export const SEA_OPAQUE_VW = 0.38

/** The sweep's map-space bounds for a camera: the night enters from off the
 *  east edge and has fully crossed the west edge when the clock runs out. */
export const sweepBounds = (vb: MapViewBox): { start: number; end: number } => ({
  start: vb.x + vb.w - vb.y * TAN + SUNSET_SWEEP_MARGIN,
  end: vb.x - (vb.y + vb.h) * TAN - SUNSET_SWEEP_MARGIN,
})

/** Where the terminator crosses the map's vertical centre, in viewport px. */
export const veilMidPx = (vb: MapViewBox, dusk: number, rect: ScreenRect): number => {
  const midY = vb.y + vb.h / 2
  return projectToRect(vb, { x: dusk + midY * TAN, y: midY }, rect).x
}

/** The plane pushed far enough west that its opaque night covers every
 *  viewport corner (relative to the plane's origin, the map's centre). */
export const settledMidPx = (viewport: Viewport): number =>
  -(
    viewport.width * (Math.max(SUNSET_VEIL_FEATHER, SEA_OPAQUE_VW) + SUNSET_VEIL_BOW) +
    (viewport.height / 2) * SIN
  ) / COS

/**
 * A plane box that covers the viewport east of the line for every position
 * the sweep visits, from just off the east edge to `settledMidPx`. Rotation
 * about the left-centre origin swings the far end by `width·sinθ`, so the
 * height carries that on both sides.
 */
export const veilPlaneSize = (viewport: Viewport): Viewport => {
  const reach = viewport.width - settledMidPx(viewport) + (viewport.height / 2) * SIN
  const width = reach / COS + SUNSET_SWEEP_MARGIN
  return { width, height: viewport.height + 2 * width * SIN }
}

/** The plane's transform and the exact inverse its land layer wears. Only
 *  `midPx` moves, so both interpolate in lockstep. */
export const veilTransforms = (midPx: number): { plane: string; inverse: string } => ({
  plane: `translateX(${midPx}px) rotate(${SUNSET_VEIL_TILT_DEG}deg)`,
  inverse: `rotate(${-SUNSET_VEIL_TILT_DEG}deg) translateX(${-midPx}px)`,
})

/** Keyframes per second of sweep — linear between samples of a smooth curve. */
const SWEEP_SAMPLES_PER_SECOND = 8

/**
 * The whole sweep as two compositor animations' keyframes, sampled once: the
 * plane and its inverse play them from one start time, so the night moves
 * with no main-thread work per frame. Both lists share offsets and only their
 * `translateX` varies, so linear interpolation keeps them exact inverses.
 */
export const veilKeyframes = (
  midPxAt: (elapsedSeconds: number) => number,
  durationSeconds: number
): { plane: Keyframe[]; inverse: Keyframe[] } => {
  const steps = Math.max(1, Math.ceil(durationSeconds * SWEEP_SAMPLES_PER_SECOND))
  const plane: Keyframe[] = []
  const inverse: Keyframe[] = []
  for (let step = 0; step <= steps; step++) {
    const offset = step / steps
    const transforms = veilTransforms(midPxAt(offset * durationSeconds))
    plane.push({ offset, transform: transforms.plane })
    inverse.push({ offset, transform: transforms.inverse })
  }
  return { plane, inverse }
}

/** How far the window's pool of light reaches, as a multiple of the frame's
 *  half-extent, and where along that radius dusk begins to take it — the
 *  frame's corners (√2 out) must sit inside the clear part. */
export const SUNSET_POOL_REACH = 2
export const SUNSET_POOL_CLEAR = 0.72

/**
 * The pool of light the window stands in, in viewport px: an ellipse around
 * the dealt frame on screen. Everything past it is already dusk.
 */
export const twilightPool = (
  vb: MapViewBox,
  frame: MapBox,
  rect: ScreenRect
): { cx: number; cy: number; rx: number; ry: number } => {
  const [x, y, width, height] = frame
  const topLeft = projectToRect(vb, { x, y }, rect)
  const bottomRight = projectToRect(vb, { x: x + width, y: y + height }, rect)
  return {
    cx: (topLeft.x + bottomRight.x) / 2,
    cy: (topLeft.y + bottomRight.y) / 2,
    rx: ((bottomRight.x - topLeft.x) / 2) * SUNSET_POOL_REACH,
    ry: ((bottomRight.y - topLeft.y) / 2) * SUNSET_POOL_REACH,
  }
}

const asBox = (vb: MapViewBox): MapBox => [vb.x, vb.y, vb.w, vb.h]

/** Every map shape the camera can see — the night takes them all, windowed,
 *  pooled or not. Bled past the edges like every camera-pinned overlay. */
export const veilCodes = (vb: MapViewBox): MapCode[] => {
  const box = asBox(bleedBox(vb))
  return (Object.keys(MAP_BOUNDS) as MapCode[]).filter(code =>
    regionsIntersect(MAP_REGIONS[code] ?? [MAP_BOUNDS[code]!], box)
  )
}
