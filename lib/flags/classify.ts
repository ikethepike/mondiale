import { splitField } from './emblem'
import type { Family } from './types'
import { parseViewBox } from './viewbox'
import { parseTransform, transformBBox } from './geometry'
import { flattenDrawables, pathCornerCount, primitiveBBox, transformSvg, type XNode } from './xast'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Known one-offs the engine can't do cleanly: whole-flag diagonals/saltires
 * (gb, gb-sct, za), non-rectangular pennons (np), a dragon spanning the field
 * (bt), and full-flag centred compositions where the "emblem" is essentially
 * the whole flag (br's globe). All route to the contain-fallback.
 */
const ONE_OFFS = new Set(['np', 'gb', 'gb-sct', 'za', 'bt', 'br'])

/** Nordic off-hoist crosses (pure geometry, closed-form rebuild). */
const NORDIC = new Set(['dk', 'fi', 'is', 'no', 'se', 'fo', 'ax'])

/** UK ensigns / Union-Jack canton + fly badge (excluded in v1). */
const ENSIGNS = new Set([
  'au',
  'nz',
  'fj',
  'tv',
  'ck',
  'nu',
  'pn',
  'sh',
  'gs',
  'io',
  'ky',
  'vg',
  'tc',
  'ms',
  'ai',
  'fk',
  'hm',
  'bm',
])

/** Canton flags (a hoist block/canton carrying a device on a striped field). */
const CANTON = new Set(['us', 'tw'])

/**
 * Classify a flag into a structural family. Known-iso sets short-circuit the
 * hard cases (nordic/ensign/canton/one-off); everything else is decided by
 * geometry: does it have an emblem, and are its field bands horizontal or
 * vertical? Overrides can force a family (see `recompose`).
 */
export const classify = (iso: ISOCountryCode, svg: string): Family => {
  const lower = iso.toLowerCase()
  if (ONE_OFFS.has(lower)) return 'oneoff'
  if (ENSIGNS.has(lower)) return 'ensign'
  if (NORDIC.has(lower)) return 'nordic'
  if (CANTON.has(lower)) return 'canton'

  let family: Family = 'plain'
  transformSvg(svg, (root, svgEl) => {
    const vb = parseViewBox(svgEl.attributes?.viewBox)
    const { drawables } = flattenDrawables(svgEl)

    // Hoist triangle whose apex reaches past a fixed hoist fraction toward the
    // centre (Czechia): a deep wedge that a plain field-stretch would distort.
    if (drawables.some(n => n.name === 'path' && isDeepHoistTriangle(n, vb))) {
      family = 'hoist-triangle'
      return
    }

    const { field, emblem } = splitField(svgEl, vb)

    if (!emblem.length) {
      family = 'plain'
      return
    }

    // Has an emblem — decide band orientation from the field bands.
    const orientation = fieldOrientation(field, vb)
    family = orientation === 'vertical' ? 'vertical-triband' : 'horizontal-band'
  })
  return family
}

/** Transform-aware bbox of a flattened drawable. */
const nodeBBox = (el: XNode) => {
  const raw = primitiveBBox(el)
  if (!raw) return null
  const t = el.attributes?.transform
  return t ? transformBBox(parseTransform(t), raw) : raw
}

/**
 * A hoist triangle deep enough to need rebuilding (Czechia): a genuinely
 * TRIANGULAR path (exactly 3 corners, not a 4-corner band) anchored to the
 * hoist edge, ~full height, apex reaching ≥40% of the width. The 3-corner check
 * is essential — a vertical band (Andorra, Benin) has the same bbox signature
 * but 4 corners, and must NOT be treated as a triangle.
 */
const isDeepHoistTriangle = (el: XNode, vb: ReturnType<typeof parseViewBox>): boolean => {
  if (el.name !== 'path') return false
  const b = nodeBBox(el)
  if (!b) return false
  const touchesHoist = b.x <= vb.minX + vb.width * 0.02
  const tall = b.height >= vb.height * 0.9
  // Apex must reach at least halfway — Czechia's is at 56%. Shallower chevrons
  // (Cuba/Jordan ~40%) recompose fine via the generic path, so leave them.
  const deep = b.width >= vb.width * 0.5 && b.width < vb.width * 0.95
  if (!(touchesHoist && tall && deep)) return false
  // Exactly 3 corners — a rectangular band (4 corners) must not qualify.
  return pathCornerCount(el.attributes?.d) === 3
}

/**
 * Whether the field's stripes run vertical (side-by-side bars) or horizontal
 * (stacked bands). Determined from the non-background field rects: a
 * full-height, partial-width rect is a vertical bar; a full-width,
 * partial-height rect is a horizontal band.
 */
const fieldOrientation = (
  field: XNode[],
  vb: ReturnType<typeof parseViewBox>
): 'horizontal' | 'vertical' => {
  let vertical = 0
  let horizontal = 0
  for (const el of field) {
    const b = nodeBBox(el)
    if (!b) continue
    const fullW = b.width >= vb.width * 0.98
    const fullH = b.height >= vb.height * 0.98
    if (fullH && !fullW) vertical++
    else if (fullW && !fullH) horizontal++
  }
  return vertical > horizontal ? 'vertical' : 'horizontal'
}
