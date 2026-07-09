import {
  bboxCenter,
  multiply,
  rotate,
  scale,
  toMatrixString,
  translate,
  type Matrix,
} from '../geometry'
import { TARGET_HEIGHT, TARGET_WIDTH } from '../types'
import { parseViewBox } from '../viewbox'
import { buildIdMap, elementChildren, subtreeBBox, transformSvg, type XNode } from '../xast'
import { IDENTITY } from '../geometry'

/**
 * Bhutan is a one-off: a diagonal-split field (yellow over orange, split
 * corner-to-corner) with a white dragon striding along the diagonal. Generic
 * recomposition can't handle the diagonal field, but the structure is clean —
 * a bg rect, an orange triangle path, then the dragon as a trailing `<g>`.
 *
 * We rebuild the split for 3:1 (so the diagonal still runs corner to corner),
 * then place the dragon isolated on top: its real size preserved (only the
 * field widened) and re-centred, so it reads as the dragon on the seam rather
 * than being stretched with the field.
 */
export const recomposeBhutan = (sourceSvg: string): string | null => {
  let ok = false
  const out = transformSvg(sourceSvg, (root, svgEl) => {
    const vb = parseViewBox(svgEl.attributes?.viewBox)
    const top = elementChildren(svgEl)
    // bg rect, orange diagonal path, then the dragon group(s).
    const bg = top.find(n => n.name === 'rect')
    const diagonal = top.find(n => n.name === 'path')
    const dragon = top.filter(n => n.name === 'g')
    if (!bg || !diagonal || !dragon.length) return

    const W = TARGET_WIDTH
    const H = TARGET_HEIGHT

    // Rebuild the split at 3:1: yellow fills, orange is the lower-left triangle
    // running corner to corner (matching the source's M0,H H W V0 z shape).
    const yellow = bg.attributes?.fill ?? '#ffd520'
    const orange = diagonal.attributes?.fill ?? '#ff4e12'
    const bgRect: XNode = {
      type: 'element',
      name: 'rect',
      attributes: { width: String(W), height: String(H), fill: yellow },
      children: [],
    }
    const diag: XNode = {
      type: 'element',
      name: 'path',
      attributes: { d: `M0,${H}H${W}V0z`, fill: orange },
      children: [],
    }

    // Dragon: measure it (resolving <use>), preserve its real height fraction,
    // re-centre on the flag.
    const idMap = buildIdMap(svgEl)
    let box = null as ReturnType<typeof subtreeBBox>
    for (const g of dragon) {
      const b = subtreeBBox(g, IDENTITY, idMap)
      if (b) box = box ? union(box, b) : b
    }
    const children: XNode[] = [bgRect, diag]
    if (box) {
      const [cx, cy] = bboxCenter(box)
      const s = H / vb.height // preserve real size
      const m: Matrix = multiply(
        multiply(multiply(translate(W / 2, H / 2), rotate(0)), scale(s)),
        translate(-cx, -cy)
      )
      children.push({
        type: 'element',
        name: 'g',
        attributes: { transform: toMatrixString(m) },
        children: dragon,
      })
    }

    svgEl.children = children
    svgEl.attributes = { ...svgEl.attributes, viewBox: `0 0 ${W} ${H}` }
    delete svgEl.attributes.width
    delete svgEl.attributes.height
    ok = true
  })
  return ok ? out : null
}

const union = (
  a: NonNullable<ReturnType<typeof subtreeBBox>>,
  b: NonNullable<ReturnType<typeof subtreeBBox>>
) => {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}
