import { TARGET_HEIGHT, TARGET_WIDTH, type ViewBox } from '../types'
import { parseViewBox } from '../viewbox'
import { elementChildren, primitiveBBox, transformSvg, type XNode } from '../xast'

/**
 * Flags that are two/three bands plus a HOIST TRIANGLE whose apex points into
 * the field (Czechia, and the same shape underlies Cuba/Jordan/etc. — but those
 * are handled fine by the generic path because their triangle is a fixed width
 * fraction). Czechia's triangle apex sits at the horizontal MIDPOINT, so a plain
 * field-stretch drags the apex out to half of the now-much-wider flag, making a
 * long shallow wedge. Here we rebuild it: the bands fill 3:1, and the triangle
 * keeps a HEIGHT-proportional depth so it reads like the real flag, just wider.
 *
 * Detected structurally (see classify): a full-cover background, a full-width
 * half-height band, and a single triangle path from the hoist edge to an apex.
 */
export const recomposeTriangle = (sourceSvg: string): string | null => {
  let ok = false
  const out = transformSvg(sourceSvg, (root, svgEl) => {
    const vb = parseViewBox(svgEl.attributes?.viewBox)
    const top = elementChildren(svgEl)
    const tri = top.find(n => n.name === 'path' && isHoistTriangle(n, vb))
    const bands = top.filter(n => n !== tri)
    if (!tri || !bands.length) return

    const W = TARGET_WIDTH
    const H = TARGET_HEIGHT

    // Bands: stretch to fill 3:1 (they're full-width, so this is just a widen).
    const sx = W / vb.width
    const sy = H / vb.height
    const bandGroup: XNode = {
      type: 'element',
      name: 'g',
      attributes: { transform: `matrix(${sx} 0 0 ${sy} ${-vb.minX * sx} ${-vb.minY * sy})` },
      children: bands,
    }

    // Triangle: base is the full hoist edge (0,0)-(0,H); apex depth preserved as
    // a fraction of HEIGHT (source apex-x / source-height), so it stays a
    // shape-consistent wedge rather than stretching to mid-flag.
    const apexFrac = triangleApexDepthFraction(tri, vb) // depth / source height
    const apexX = apexFrac * H
    const fill = tri.attributes?.fill ?? '#000'
    const triNode: XNode = {
      type: 'element',
      name: 'path',
      attributes: { d: `M0,0 ${apexX},${H / 2} 0,${H} z`, fill },
      children: [],
    }

    // Bands under the triangle.
    svgEl.children = [bandGroup, triNode]
    svgEl.attributes = { ...svgEl.attributes, viewBox: `0 0 ${W} ${H}` }
    delete svgEl.attributes.width
    delete svgEl.attributes.height
    ok = true
  })
  return ok ? out : null
}

/** A path is a hoist triangle if its bbox touches the hoist edge and spans most of the height. */
const isHoistTriangle = (el: XNode, vb: ViewBox): boolean => {
  const b = primitiveBBox(el)
  if (!b) return false
  const touchesHoist = b.x <= vb.minX + vb.width * 0.02
  const tallEnough = b.height >= vb.height * 0.9
  const notFullWidth = b.width < vb.width * 0.95
  return touchesHoist && tallEnough && notFullWidth
}

/** Apex depth (max x extent from hoist) as a fraction of source HEIGHT. */
const triangleApexDepthFraction = (el: XNode, vb: ViewBox): number => {
  const b = primitiveBBox(el)
  if (!b) return 0.5
  return b.width / vb.height
}
