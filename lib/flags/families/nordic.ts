import { TARGET_HEIGHT, TARGET_WIDTH, type ViewBox } from '../types'
import { parseViewBox } from '../viewbox'
import { flattenDrawables, primitiveBBox, splitPathSubpaths, transformSvg, type XNode } from '../xast'

/**
 * A Nordic cross: a background plus one or more "layers", each an off-hoist
 * cross (a full-height vertical bar shifted toward the hoist + a full-width
 * horizontal bar near the vertical middle). Bordered crosses (Norway, Iceland)
 * stack two coloured layers.
 *
 * A plain field-stretch to 3:1 fattens the vertical bar and drags the cross
 * toward centre. Instead we REBUILD the cross closed-form at 900×300: bar
 * thickness and the cross's vertical/hoist position scale with HEIGHT, so the
 * cross keeps its true proportions and stays the same distance from the hoist.
 *
 * Works on flattened drawables, handling both source shapes flag-icons uses:
 * separate horizontal + vertical bar paths, and a single combined cross path
 * (split into subpaths). Returns null if it doesn't parse as a cross.
 */
interface Bar {
  color: string
  /** vertical bar: x + width; horizontal bar: y + height */
  pos: number
  size: number
  vertical: boolean
}

const rect = (attrs: Record<string, string>): XNode => ({
  type: 'element',
  name: 'rect',
  attributes: attrs,
  children: [],
})

/** Collect cross bars from the non-background drawables (paths or rects). */
const collectBars = (nodes: XNode[], vb: ViewBox): Bar[] => {
  const bars: Bar[] = []
  for (const node of nodes) {
    const color = node.attributes?.fill ?? '#000'
    const boxes =
      node.name === 'path'
        ? splitPathSubpaths(node.attributes?.d).map(s => s.bbox)
        : [primitiveBBox(node)]
    for (const b of boxes) {
      if (!b) continue
      const fullW = b.width >= vb.width * 0.98
      const fullH = b.height >= vb.height * 0.98
      if (fullH && !fullW) bars.push({ color, pos: b.x, size: b.width, vertical: true })
      else if (fullW && !fullH) bars.push({ color, pos: b.y, size: b.height, vertical: false })
    }
  }
  return bars
}

export const recomposeNordic = (sourceSvg: string): string | null => {
  let ok = false
  const out = transformSvg(sourceSvg, (root, svgEl) => {
    const vb = parseViewBox(svgEl.attributes?.viewBox)
    const { drawables } = flattenDrawables(svgEl)
    if (!drawables.length) return

    const background = drawables[0].attributes?.fill ?? '#fff'
    const bars = collectBars(drawables.slice(1), vb)
    if (!bars.length) return

    const W = TARGET_WIDTH
    const H = TARGET_HEIGHT
    const children: XNode[] = [rect({ width: `${W}`, height: `${H}`, fill: background })]

    for (const bar of bars) {
      const t = (bar.size / vb.height) * H // thickness scales with height
      if (bar.vertical) {
        const x = (bar.pos / vb.height) * H // hoist inset, height-relative
        children.push(rect({ x: `${x}`, width: `${t}`, height: `${H}`, fill: bar.color }))
      } else {
        const y = (bar.pos / vb.height) * H
        children.push(rect({ y: `${y}`, width: `${W}`, height: `${t}`, fill: bar.color }))
      }
    }

    svgEl.children = children
    svgEl.attributes = { ...svgEl.attributes, viewBox: `0 0 ${W} ${H}` }
    delete svgEl.attributes.width
    delete svgEl.attributes.height
    ok = true
  })
  return ok ? out : null
}
