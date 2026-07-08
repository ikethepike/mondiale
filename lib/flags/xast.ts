// The browser build is pure JS (no os/fs/path) so it runs in BOTH the Bun
// generator and the Vite-bundled harness/runtime; the default `svgo` entry
// pulls in node builtins and would break in the browser.
import { optimize } from 'svgo/browser'
import type { BBox, Matrix } from './geometry'
import { applyPoint, multiply, parseTransform, transformBBox, unionBBox } from './geometry'

/**
 * The subset of svgo's XAST node shape we rely on. svgo v4 doesn't expose its
 * parser/stringifier publicly, so we borrow both by running `optimize()` with a
 * single custom plugin that captures (and mutates) the parsed tree in place —
 * no optimization plugins run, so ids/`<use>`/gradients/matrices round-trip
 * intact (verified against Serbia's flag). See the plan's parse-tooling note.
 */
export interface XNode {
  type: 'root' | 'element' | 'text' | 'cdata' | 'comment' | 'doctype' | 'instruction'
  name?: string
  value?: string
  attributes?: Record<string, string>
  children?: XNode[]
}

/** Parse an SVG string, hand the root to `mutate`, and re-serialize. */
export const transformSvg = (svg: string, mutate: (root: XNode, svgEl: XNode) => void): string => {
  const plugin = {
    name: 'flag-recompose',
    fn: () => ({
      root: {
        enter: (root: XNode) => {
          const svgEl = findElement(root, 'svg')
          if (svgEl) mutate(root, svgEl)
        },
      },
    }),
  }
  const result = optimize(svg, {
    plugins: [plugin],
    js2svg: { pretty: false, indent: 0 },
  })
  return result.data
}

/** Depth-first: first element node with the given tag name. */
export const findElement = (node: XNode, name: string): XNode | undefined => {
  if (node.type === 'element' && node.name === name) return node
  for (const child of node.children || []) {
    const found = findElement(child, name)
    if (found) return found
  }
  return undefined
}

/**
 * Build an id → element map for the whole document, so `<use href="#id">`
 * references can be resolved when measuring emblem bounds. Most flag emblems
 * (stars, ornaments, repeated arms) are one defined shape instanced many times
 * via `<use>` — without resolving these the bbox only sees the single
 * definition and comes out far too small.
 */
export const buildIdMap = (root: XNode): Map<string, XNode> => {
  const map = new Map<string, XNode>()
  walkElements(root, el => {
    const id = el.attributes?.id
    if (id) map.set(id, el)
  })
  return map
}

/** All element children (direct) of a node. */
export const elementChildren = (node: XNode): XNode[] =>
  (node.children || []).filter(c => c.type === 'element')

const composeTransform = (parent: string | undefined, own: string | undefined): string | undefined => {
  if (!parent) return own
  if (!own) return parent
  return `${parent} ${own}`
}

/**
 * Flatten the drawing tree into a list of leaf drawables (`rect`/`path`/
 * `circle`/`ellipse`/`polygon`/`line`/`use`), each carrying its CUMULATIVE
 * transform (all ancestor `<g transform>`s composed with its own) as a single
 * `transform` attribute. Wrapper `<g>`s — which flag-icons uses heavily to
 * scale/translate/clip whole flags — are dissolved so field/emblem detection
 * sees the real drawing elements in one flat list, not an opaque wrapper.
 *
 * `<defs>` subtrees are NOT flattened (they only render via `<use>`); they're
 * returned separately so `<use>` still resolves. `clip-path` on a dissolved
 * wrapper is dropped (the flag's own bounds are the clip in practice — the
 * clips flag-icons uses just crop to the flag rectangle).
 */
export interface Flattened {
  drawables: XNode[]
  defs: XNode[]
}

// Presentation attributes that a leaf inherits from an ancestor group when it
// doesn't set them itself. Critically includes `fill`/`stroke` — flag-icons
// sets colour on a wrapper `<g>` (e.g. Switzerland's white cross via
// `<g fill="#fff">`), and dissolving the group without carrying the fill down
// turns those shapes black.
const INHERITED = [
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'clip-rule',
  'color',
]

export const flattenDrawables = (svgEl: XNode): Flattened => {
  const drawables: XNode[] = []
  const defs: XNode[] = []
  const LEAF = new Set(['rect', 'path', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'use'])

  const recurse = (node: XNode, transform: string | undefined, inherited: Record<string, string>) => {
    for (const child of elementChildren(node)) {
      if (child.name === 'defs') {
        defs.push(child)
        continue
      }
      const childTransform = composeTransform(transform, child.attributes?.transform)
      // Extend inherited paint with this node's own presentation attributes.
      const childInherited = { ...inherited }
      for (const key of INHERITED) {
        const v = child.attributes?.[key]
        if (v != null) childInherited[key] = v
      }
      if (child.name === 'g') {
        recurse(child, childTransform, childInherited)
      } else if (child.name && LEAF.has(child.name)) {
        // Start from inherited paint, then let the leaf's own attributes win.
        const attributes: Record<string, string> = { ...inherited, ...child.attributes }
        if (childTransform) attributes.transform = childTransform
        else delete attributes.transform
        drawables.push({ ...child, attributes })
      }
      // Other elements (title/metadata/etc.) are ignored for drawing.
    }
  }

  recurse(svgEl, undefined, {})
  return { drawables, defs }
}

/** Walk every element node in the subtree (pre-order), calling `visit`. */
export const walkElements = (node: XNode, visit: (el: XNode, parent: XNode | null) => void) => {
  const recurse = (n: XNode, parent: XNode | null) => {
    if (n.type === 'element') visit(n, parent)
    for (const child of n.children || []) recurse(child, n)
  }
  recurse(node, null)
}

const num = (v: string | undefined, fallback = 0): number => {
  const n = parseFloat(v ?? '')
  return Number.isFinite(n) ? n : fallback
}

/**
 * Rough analytic bbox of a single primitive element in ITS OWN coordinate space
 * (before its own transform). rect/circle/ellipse/line are exact; polygon and
 * path are approximated from their coordinate numbers (control points included,
 * so a slight over-estimate — acceptable, and tunable via the placement `k`).
 */
export const primitiveBBox = (el: XNode): BBox | null => {
  const a = el.attributes || {}
  switch (el.name) {
    case 'rect':
      return { x: num(a.x), y: num(a.y), width: num(a.width), height: num(a.height) }
    case 'circle': {
      const r = num(a.r)
      return { x: num(a.cx) - r, y: num(a.cy) - r, width: r * 2, height: r * 2 }
    }
    case 'ellipse': {
      const rx = num(a.rx)
      const ry = num(a.ry)
      return { x: num(a.cx) - rx, y: num(a.cy) - ry, width: rx * 2, height: ry * 2 }
    }
    case 'line':
      return boundsOfPoints([
        [num(a.x1), num(a.y1)],
        [num(a.x2), num(a.y2)],
      ])
    case 'polygon':
    case 'polyline':
      return boundsOfPoints(parsePairs(a.points))
    case 'path':
      return boundsOfPoints(parsePathCoords(a.d))
    default:
      return null
  }
}

const boundsOfPoints = (pts: [number, number][]): BBox | null => {
  if (!pts.length) return null
  const xs = pts.map(p => p[0])
  const ys = pts.map(p => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

const parsePairs = (s: string | undefined): [number, number][] => {
  const nums = (s || '').split(/[\s,]+/).map(Number).filter(Number.isFinite)
  const out: [number, number][] = []
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]])
  return out
}

/**
 * Extract the visited anchor points from a path `d`, honouring command
 * semantics (absolute vs relative, and the coordinate layout of each command)
 * so relative curves don't accumulate into a garbage bounding box. Control
 * points of curves are included as well (a slight over-estimate of the true
 * bounds, which is fine for the placement heuristic — the emblem's extent, not
 * its exact silhouette, is what matters).
 */
const parsePathCoords = (d: string | undefined): [number, number][] => {
  if (!d) return []
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
  const pts: [number, number][] = []
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0
  let i = 0
  let cmd = ''

  const readNums = (n: number): number[] => {
    const out: number[] = []
    while (out.length < n && i < tokens.length && !/[a-zA-Z]/.test(tokens[i])) {
      out.push(parseFloat(tokens[i++]))
    }
    return out
  }

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      cmd = tokens[i++]
    }
    const rel = cmd === cmd.toLowerCase()
    const C = cmd.toUpperCase()

    switch (C) {
      case 'M':
      case 'L':
      case 'T': {
        const [x, y] = readNums(2)
        if (x === undefined) break
        cx = rel ? cx + x : x
        cy = rel ? cy + y : y
        if (C === 'M') {
          startX = cx
          startY = cy
        }
        pts.push([cx, cy])
        break
      }
      case 'H': {
        const [x] = readNums(1)
        if (x === undefined) break
        cx = rel ? cx + x : x
        pts.push([cx, cy])
        break
      }
      case 'V': {
        const [y] = readNums(1)
        if (y === undefined) break
        cy = rel ? cy + y : y
        pts.push([cx, cy])
        break
      }
      case 'C': {
        const n = readNums(6)
        if (n.length < 6) break
        for (let k = 0; k < 6; k += 2) {
          pts.push([rel ? cx + n[k] : n[k], rel ? cy + n[k + 1] : n[k + 1]])
        }
        cx = rel ? cx + n[4] : n[4]
        cy = rel ? cy + n[5] : n[5]
        break
      }
      case 'S':
      case 'Q': {
        const n = readNums(4)
        if (n.length < 4) break
        for (let k = 0; k < 4; k += 2) {
          pts.push([rel ? cx + n[k] : n[k], rel ? cy + n[k + 1] : n[k + 1]])
        }
        cx = rel ? cx + n[2] : n[2]
        cy = rel ? cy + n[3] : n[3]
        break
      }
      case 'A': {
        // rx ry rot large sweep x y — only the endpoint is a real coordinate.
        const n = readNums(7)
        if (n.length < 7) break
        cx = rel ? cx + n[5] : n[5]
        cy = rel ? cy + n[6] : n[6]
        pts.push([cx, cy])
        break
      }
      case 'Z':
        cx = startX
        cy = startY
        break
      default:
        // Unknown command — skip a token to avoid an infinite loop.
        i++
    }
  }
  return pts
}

/**
 * Count the distinct corner points a path `d` traces (command-aware, so H/V and
 * relative segments are handled). Used to tell a triangle (3 corners) from a
 * rectangular band (4 corners). Curve control points are ignored — only the
 * anchor points that a straight-edged shape would have.
 */
export const pathCornerCount = (d: string | undefined): number => {
  const pts = parsePathCoords(d)
  const seen = new Set<string>()
  for (const [x, y] of pts) seen.add(`${Math.round(x)},${Math.round(y)}`)
  return seen.size
}

export interface SubPath {
  /** The subpath `d`, with a relative leading `m` rewritten to absolute `M`. */
  d: string
  bbox: BBox
}

/**
 * Split a path `d` into its subpaths (each `M…`/`m…` run), returning each as a
 * self-contained absolute-start path with its bbox. Relative `m` starts are
 * resolved against the running current point so a split subpath keeps its true
 * position. Used to separate a fused emblem (e.g. Canada's maple leaf) from
 * field shapes (the red side-bars) that share one `<path>`.
 */
export const splitPathSubpaths = (d: string | undefined): SubPath[] => {
  if (!d) return []
  // Split before each M/m; each chunk is one subpath.
  const chunks = d.split(/(?=[Mm])/).filter(s => s.trim())
  const out: SubPath[] = []
  let cursorX = 0
  let cursorY = 0
  for (const chunk of chunks) {
    // Resolve a leading relative m to absolute using the running cursor.
    let abs = chunk
    const m = /^\s*m\s*(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)/.exec(chunk)
    if (m) {
      const ax = cursorX + parseFloat(m[1])
      const ay = cursorY + parseFloat(m[2])
      abs = chunk.replace(/^\s*m\s*-?\d*\.?\d+[\s,]+-?\d*\.?\d+/, `M${ax} ${ay}`)
    }
    const pts = parsePathCoords(abs)
    const box = boundsOfPoints(pts)
    // Advance the cursor to this subpath's last point (in absolute space).
    if (pts.length) {
      cursorX = pts[pts.length - 1][0]
      cursorY = pts[pts.length - 1][1]
    }
    if (box) out.push({ d: abs, bbox: box })
  }
  return out
}

const hrefOf = (el: XNode): string | undefined => {
  const raw = el.attributes?.['xlink:href'] ?? el.attributes?.href
  return raw?.startsWith('#') ? raw.slice(1) : undefined
}

/**
 * Bounding box of an element subtree in the coordinate space of `baseMatrix`'s
 * source (accumulating each node's own `transform`). Resolves `<use>` by
 * looking the referenced element up in `idMap` and rendering it under the use's
 * `x`/`y`/`transform` — without this, emblems built from `<defs>`+`<use>`
 * measure far too small. A recursion guard prevents cyclic references from
 * looping. Pass `idMap` from `buildIdMap(root)`; omit it to skip use-resolution.
 */
export const subtreeBBox = (
  node: XNode,
  baseMatrix: Matrix,
  idMap?: Map<string, XNode>
): BBox | null => {
  let box: BBox | null = null
  const seen = new Set<XNode>()

  const recurse = (n: XNode, m: Matrix) => {
    const local = n.attributes?.transform
      ? multiply(m, parseTransform(n.attributes.transform))
      : m

    if (n.type === 'element') {
      if (n.name === 'use' && idMap) {
        const ref = hrefOf(n)
        const target = ref ? idMap.get(ref) : undefined
        if (target && !seen.has(target)) {
          seen.add(target)
          // <use x y> offsets the referenced content before its own transform.
          const ux = num(n.attributes?.x)
          const uy = num(n.attributes?.y)
          const useMatrix = ux || uy ? multiply(local, parseTransform(`translate(${ux} ${uy})`)) : local
          recurse(target, useMatrix)
          seen.delete(target)
        }
        return
      }
      // <defs> content isn't rendered in place; only <use> instantiates it.
      if (n.name === 'defs') return
      const prim = primitiveBBox(n)
      if (prim) box = unionBBox(box, transformBBox(local, prim))
    }
    for (const child of n.children || []) recurse(child, local)
  }
  recurse(node, baseMatrix)
  return box
}

// Re-export for callers that only need points transformed.
export { applyPoint }
