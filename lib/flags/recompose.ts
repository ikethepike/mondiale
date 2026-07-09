import { classify } from './classify'
import { recomposeBhutan } from './families/bhutan'
import { recomposeCanton } from './families/canton'
import { recomposeNordic } from './families/nordic'
import { recomposeTriangle } from './families/triangle'
import { WIDE_SVGS } from './wide-svgs'
import { FAMILY_DEFAULTS, OVERRIDES } from './overrides'
import {
  IDENTITY,
  bboxCenter,
  multiply,
  rotate,
  scale,
  toMatrixString,
  translate,
  type Matrix,
} from './geometry'
import { splitField } from './emblem'
import {
  TARGET_HEIGHT,
  TARGET_WIDTH,
  type Family,
  type FlagOverride,
  type Placement,
  type RecomposeResult,
  type ViewBox,
} from './types'
import { anchorPoint, fieldStretch, parseViewBox, preservedAnchor } from './viewbox'
import { transformSvg, type XNode } from './xast'
import type { ISOCountryCode } from '~~/types/geography.types'

/** Wrap a list of nodes in a `<g transform=...>`; returns the group node. */
const groupWith = (nodes: XNode[], matrix: Matrix): XNode => ({
  type: 'element',
  name: 'g',
  attributes: matrix === IDENTITY ? {} : { transform: toMatrixString(matrix) },
  children: nodes,
})

/**
 * Build the emblem's new transform from a resolved Placement and its measured
 * source bbox. Result seats the emblem's centre at the anchor, scaled uniformly
 * to occupy `k` of the reference dimension, with rotation preserved.
 *
 *   M = translate(anchor + nudge) · rotate(θ) · scale(s) · translate(-centre)
 */
const placementMatrix = (
  placement: Placement,
  emblemBBox: { x: number; y: number; width: number; height: number },
  src: ViewBox
): Matrix => {
  const [cx, cy] = bboxCenter(emblemBBox)
  const [ax, ay] =
    'preserve' in placement.anchor ? preservedAnchor(src, cx, cy) : anchorPoint(placement.anchor)

  // Scale. The default (k = 0) PRESERVES the emblem's real size: recomposition
  // only widens the field, so the flag's height is unchanged and an emblem
  // keeps its exact source pixels (scale 1) — a device that filled 33% of the
  // flag height still fills 33%, as on the real flag. A positive `k` overrides
  // this to force the emblem to `k` of the target height (used when a device
  // genuinely needs resizing). scaleMode still selects the reference dimension
  // for the forced case.
  const refDim =
    placement.scaleMode === 'fitWidth'
      ? emblemBBox.width
      : placement.scaleMode === 'fitBox'
        ? Math.max(emblemBBox.width, emblemBBox.height)
        : emblemBBox.height
  const targetSpan = placement.scaleMode === 'fitWidth' ? TARGET_WIDTH : TARGET_HEIGHT
  const heightScale = TARGET_HEIGHT / src.height // source→target vertical scale
  const s = !placement.k
    ? heightScale // preserve real size
    : refDim === 0
      ? 1
      : (placement.k * targetSpan) / refDim

  const dx = placement.dx ?? 0
  const dy = placement.dy ?? 0

  return multiply(
    multiply(multiply(translate(ax + dx, ay + dy), rotate(placement.rotationDeg ?? 0)), scale(s)),
    translate(-cx, -cy)
  )
}

const resolvePlacement = (family: Family, override: FlagOverride | undefined): Placement => ({
  ...FAMILY_DEFAULTS[family],
  ...override,
})

/**
 * Recompose one flag SVG into a normalized 3:1 tile variant. Returns
 * `{ svg: null }` for excluded flags (caller uses the contain-fallback).
 *
 * `overrideArg` lets the review harness preview live tuning without editing the
 * overrides file; when omitted the committed `OVERRIDES` table is used.
 */
export const recompose = (
  iso: ISOCountryCode,
  sourceSvg: string,
  overrideArg?: FlagOverride
): RecomposeResult => {
  const override = overrideArg ?? OVERRIDES[iso]
  const family: Family = override?.family ?? classify(iso, sourceSvg)

  // Hand-authored wide SVG (from the WIDE_SVGS table or a live harness
  // override): use verbatim, bypass the engine entirely. The reliable escape
  // hatch for flags automation can't win.
  const wide = override?.wideSvg ?? WIDE_SVGS[iso]
  if (wide) {
    return { svg: wide, family: override?.family ?? family, resolution: 'override' }
  }

  // Bhutan: bespoke diagonal-split + isolated dragon (classified oneoff, but we
  // handle it rather than exclude). Skipped if explicitly excluded.
  if (iso === 'BT' && !override?.exclude) {
    const bt = recomposeBhutan(sourceSvg)
    if (bt) return { svg: bt, family, resolution: override ? 'override' : 'family-default' }
  }

  if (override?.exclude || family === 'ensign' || family === 'oneoff') {
    return {
      svg: null,
      family,
      resolution: 'excluded',
      note: override?.exclude ? 'override:exclude' : `excluded family:${family}`,
    }
  }

  const resolution = override ? 'override' : 'family-default'

  // Nordic crosses are rebuilt closed-form rather than field-stretched.
  if (family === 'nordic') {
    const nordic = recomposeNordic(sourceSvg)
    if (nordic) return { svg: nordic, family, resolution }
  }

  // Canton flags scale the canton unit uniformly so star lattices don't skew.
  if (family === 'canton') {
    const canton = recomposeCanton(sourceSvg)
    if (canton) return { svg: canton, family, resolution }
  }

  // Deep hoist-triangle flags (Czechia) rebuild the wedge at a height-relative
  // depth so it doesn't stretch into a shallow sliver.
  if (family === 'hoist-triangle') {
    const tri = recomposeTriangle(sourceSvg)
    if (tri) return { svg: tri, family, resolution }
  }

  const svg = transformSvg(sourceSvg, (root, svgEl) => {
    const vb = parseViewBox(svgEl.attributes?.viewBox)
    const { field, emblem, defs, emblemBBox } = splitField(svgEl, vb)

    const stretch = fieldStretch(vb)

    // `stretch` override: fold the emblem into the field so it's non-uniformly
    // widened with the field (for full-bleed sunbursts/waves like MK, KI).
    const fieldNodes = override?.stretch ? [...field, ...emblem] : field
    const fieldGroup = groupWith(fieldNodes, stretch.matrix as unknown as Matrix)

    // <defs> stay at the top level (un-transformed) so <use> references resolve.
    const newChildren: XNode[] = [...defs, fieldGroup]

    if (
      !override?.stretch &&
      emblem.length &&
      emblemBBox &&
      emblemBBox.width > 0 &&
      emblemBBox.height > 0
    ) {
      const placement = resolvePlacement(family, override)
      const m = placementMatrix(placement, emblemBBox, vb)
      newChildren.push(groupWith(emblem, m))
    }

    svgEl.children = newChildren
    svgEl.attributes = {
      ...svgEl.attributes,
      viewBox: `0 0 ${TARGET_WIDTH} ${TARGET_HEIGHT}`,
    }
    // Drop any hardcoded width/height so the tile box drives sizing.
    delete svgEl.attributes.width
    delete svgEl.attributes.height
  })

  return { svg, family, resolution }
}
