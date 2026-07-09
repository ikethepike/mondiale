import type { BBox } from './geometry'
import { IDENTITY, parseTransform, transformBBox } from './geometry'
import type { ViewBox } from './types'
import {
  buildIdMap,
  flattenDrawables,
  primitiveBBox,
  splitPathSubpaths,
  subtreeBBox,
  type XNode,
} from './xast'

/**
 * A flag's content split into the stretchable field and the undistortable
 * emblem. Both lists hold FLATTENED drawables (each with its cumulative
 * transform baked into a `transform` attribute), plus the doc's `<defs>` so
 * `<use>` references still resolve. `field` gets the non-uniform 3:1 stretch;
 * `emblem` is re-placed as one uniformly-scaled unit.
 */
export interface FieldSplit {
  field: XNode[]
  emblem: XNode[]
  defs: XNode[]
  /** Emblem bbox in SOURCE coordinate space (accounts for transforms + <use>). */
  emblemBBox: BBox | null
}

/** The transform-aware bbox of a leaf drawable (its own baked transform applied). */
const drawableBBox = (el: XNode): BBox | null => {
  const raw = primitiveBBox(el)
  if (!raw) return null
  const t = el.attributes?.transform
  return t ? transformBBox(parseTransform(t), raw) : raw
}

/**
 * If a `<path>` fuses field shapes and an emblem in one `d` (same fill — e.g.
 * Canada's two red side-bars + maple leaf), split it into per-subpath nodes so
 * the emblem can be isolated. Only splits when the subpaths are genuinely mixed
 * (some span a full flag dimension, some don't) AND the path has no transform
 * (transformed emblem groups are already separable); otherwise returns the
 * node unchanged so we never fragment a single coherent emblem.
 */
const expandFusedPath = (el: XNode, vb: ViewBox): XNode[] => {
  if (el.name !== 'path' || el.attributes?.transform) return [el]
  const subs = splitPathSubpaths(el.attributes?.d)
  if (subs.length < 2) return [el]

  const spans = (b: { width: number; height: number }) =>
    b.width >= vb.width * 0.98 || b.height >= vb.height * 0.98
  const someField = subs.some(s => spans(s.bbox))
  const someEmblem = subs.some(s => !spans(s.bbox))
  if (!(someField && someEmblem)) return [el] // not a fused field+emblem path

  return subs.map(s => ({ ...el, attributes: { ...el.attributes, d: s.d } }))
}

/**
 * A flattened drawable is "field" if it covers a full dimension of the flag — a
 * background or a full-width/height stripe. Everything else (devices, arms,
 * stars, crosses) is emblem. Works on the transform-aware bbox so a stripe
 * drawn in a scaled wrapper group is still recognised.
 */
const isFieldNode = (el: XNode, vb: ViewBox): boolean => {
  if (el.name !== 'rect' && el.name !== 'path' && el.name !== 'polygon') return false
  const b = drawableBBox(el)
  if (!b) return false

  const spansWidth = b.width >= vb.width * 0.98
  const spansHeight = b.height >= vb.height * 0.98

  // A shape covering the whole viewBox in BOTH dims is a background — even if it
  // overscans (bg rects are often drawn larger than the frame). Always field.
  if (spansWidth && spansHeight) return true

  // A stripe/bar spans exactly one dimension fully. This is field even when it
  // overscans that spanning axis (bars are often drawn past the frame edge,
  // e.g. Canada's side-bars at x=-19.7) — but the NON-spanning extent must stay
  // within bounds, which rules out a wild emblem-path bbox.
  if (spansWidth && !spansHeight) {
    return b.y >= vb.minY - vb.height * 0.05 && b.y + b.height <= vb.minY + vb.height * 1.05
  }
  if (spansHeight && !spansWidth) {
    return b.x >= vb.minX - vb.width * 0.1 && b.x + b.width <= vb.minX + vb.width * 1.1
  }
  return false
}

/**
 * Split a flag into field vs emblem. Flattens wrapper groups first (flag-icons
 * nests everything under scaled/translated/clipped `<g>`s), then classifies each
 * flattened drawable by whether it spans a full flag dimension.
 */
export const splitField = (svgEl: XNode, vb: ViewBox): FieldSplit => {
  const { drawables, defs } = flattenDrawables(svgEl)
  const expanded = drawables.flatMap(el => expandFusedPath(el, vb))
  const field: XNode[] = []
  const emblem: XNode[] = []
  for (const el of expanded) {
    if (isFieldNode(el, vb)) field.push(el)
    else emblem.push(el)
  }
  // Resolve <use> references (stars/ornaments) when measuring the emblem, or its
  // bounds collapse to the single defined shape. idMap spans the whole doc so
  // refs into <defs> resolve.
  const idMap = buildIdMap(svgEl)
  const emblemBBox = boundsOf(emblem, idMap)
  // Some flags define the shapes a <use> instances INLINE in the body (not in
  // <defs>) — flattening dissolves those id-bearing wrappers, so the surviving
  // <use> refs would resolve to nothing (Serbia's crown gems). Re-emit each
  // referenced definition into defs so <use> still renders.
  const referencedDefs = referencedDefinitions(emblem, idMap)
  return { field, emblem, defs: [...defs, ...referencedDefs], emblemBBox }
}

/** The `#id` a `<use>` points at, from either `xlink:href` or `href`. */
const useTargetId = (el: XNode): string | undefined => {
  if (el.name !== 'use') return undefined
  const href = el.attributes?.['xlink:href'] ?? el.attributes?.href
  return href?.startsWith('#') ? href.slice(1) : undefined
}

/**
 * For every id a `<use>` in `nodes` references, return the source definition
 * subtree wrapped as `<defs>` so the reference resolves in the recomposed
 * output. Recurses into nested `<use>` (a definition may itself instance another)
 * and skips ids that already live under a `<defs>` in the doc.
 */
const referencedDefinitions = (nodes: XNode[], idMap: Map<string, XNode>): XNode[] => {
  const wanted = new Set<string>()
  const visit = (el: XNode) => {
    const id = useTargetId(el)
    if (id) wanted.add(id)
    for (const child of el.children || []) visit(child)
  }
  nodes.forEach(visit)

  const collected: XNode[] = []
  const seen = new Set<string>()
  const pull = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    const def = idMap.get(id)
    if (!def) return
    collected.push(def)
    // A definition may <use> another definition — pull those too.
    const nested = (el: XNode) => {
      const nestedId = useTargetId(el)
      if (nestedId) pull(nestedId)
      for (const child of el.children || []) nested(child)
    }
    nested(def)
  }
  wanted.forEach(pull)

  if (!collected.length) return []
  return [{ type: 'element', name: 'defs', attributes: {}, children: collected }]
}

const boundsOf = (nodes: XNode[], idMap: Map<string, XNode>): BBox | null => {
  let box: BBox | null = null
  for (const n of nodes) {
    // subtreeBBox reads the node's own `transform` attribute, so start at
    // identity (the flattened node already carries its cumulative transform).
    const b = subtreeBBox(n, IDENTITY, idMap)
    if (b) box = box ? unify(box, b) : b
  }
  return box
}

const unify = (a: BBox, b: BBox): BBox => {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}
