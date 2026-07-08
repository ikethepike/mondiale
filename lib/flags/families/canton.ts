import { multiply, scale, toMatrixString, translate, type Matrix } from '../geometry'
import { TARGET_HEIGHT, TARGET_WIDTH, type ViewBox } from '../types'
import { fieldStretch, parseViewBox } from '../viewbox'
import { elementChildren, primitiveBBox, transformSvg, type XNode } from '../xast'

/**
 * Canton flags (US, Liberia, Chile): a striped/solid field with an upper-hoist
 * canton carrying a star or star-lattice. The stripes tolerate a non-uniform
 * 3:1 stretch, but the canton — and especially a star lattice — must NOT be
 * stretched or the stars skew. So we treat the canton as a self-contained unit
 * and UNIFORMLY scale it to fit the target canton region, anchored upper-hoist,
 * while the field stripes restretch underneath.
 *
 * The canton unit is the hoist-anchored solid rect (the blue field) plus every
 * node after it (the stars). The field is everything before it.
 */

// Target canton box (matches the US 0.4W × 0.538H convention).
const CANTON_W = TARGET_WIDTH * 0.4
const CANTON_H = TARGET_HEIGHT * 0.538

const isCantonRect = (el: XNode, vb: ViewBox): boolean => {
  if (el.name !== 'rect') return false
  const b = primitiveBBox(el)
  if (!b) return false
  // Hoist-upper, roughly a third-to-half of each dimension, touching origin.
  const nearOrigin = Math.abs(b.x - vb.minX) < vb.width * 0.02 && Math.abs(b.y - vb.minY) < vb.height * 0.02
  const partial = b.width < vb.width * 0.9 && b.height < vb.height * 0.9
  return nearOrigin && partial
}

const group = (nodes: XNode[], m: Matrix): XNode => ({
  type: 'element',
  name: 'g',
  attributes: { transform: toMatrixString(m) },
  children: nodes,
})

export const recomposeCanton = (sourceSvg: string): string | null => {
  let ok = false
  const out = transformSvg(sourceSvg, (root, svgEl) => {
    const vb = parseViewBox(svgEl.attributes?.viewBox)
    const top = elementChildren(svgEl)

    const cantonIdx = top.findIndex(el => isCantonRect(el, vb))
    if (cantonIdx < 0) return

    const cantonRect = top[cantonIdx]
    const cb = primitiveBBox(cantonRect)
    if (!cb || cb.width === 0 || cb.height === 0) return

    const field = top.slice(0, cantonIdx)
    const canton = top.slice(cantonIdx)

    // Field: non-uniform stretch to full 3:1.
    const stretch = fieldStretch(vb)
    const fieldGroup = group(field, stretch.matrix as unknown as Matrix)

    // Canton: uniform scale to fit the target canton box, anchored at origin.
    // Scale by the smaller ratio so nothing overflows, then it fills width
    // (cantons are wider than tall, width usually governs).
    const s = Math.min(CANTON_W / cb.width, CANTON_H / cb.height)
    // Map the canton's source top-left (cb.x,cb.y) to target origin (0,0).
    const cantonMatrix = multiply(scale(s), translate(-cb.x, -cb.y))
    const cantonGroup = group(canton, cantonMatrix)

    svgEl.children = [fieldGroup, cantonGroup]
    svgEl.attributes = { ...svgEl.attributes, viewBox: `0 0 ${TARGET_WIDTH} ${TARGET_HEIGHT}` }
    delete svgEl.attributes.width
    delete svgEl.attributes.height
    ok = true
  })
  return ok ? out : null
}
