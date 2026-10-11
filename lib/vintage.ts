import { resampleOpen, type OutlinePoint } from './outline'
import { vintageSchedule } from './round-beats'
import type {
  VintageEra,
  VintageRegion,
  VintageRegionId,
  VintageStep,
  VintageUnitLook,
} from '~~/types/vintage.types'

/**
 * Vintage's map history on the client side: replaying the yearless step
 * stream into a scene, and turning arcs into paths. Nothing here knows a year
 * — the years, and so the answers, live server-side.
 */

/** One chunk per region, so a round downloads only the map it plays. */
const REGION_LOADERS: Record<VintageRegionId, () => Promise<{ VINTAGE_REGION: VintageRegion }>> = {
  africa: () => import('~~/data/vintage-africa.gen'),
  europe: () => import('~~/data/vintage-europe.gen'),
  'middle-east': () => import('~~/data/vintage-middle-east.gen'),
  'south-asia': () => import('~~/data/vintage-south-asia.gen'),
  'east-asia': () => import('~~/data/vintage-east-asia.gen'),
  'north-america': () => import('~~/data/vintage-north-america.gen'),
  'south-america': () => import('~~/data/vintage-south-america.gen'),
}

export const loadVintageRegion = async (id: VintageRegionId): Promise<VintageRegion> =>
  (await REGION_LOADERS[id]()).VINTAGE_REGION

export interface VintageScene {
  borders: Set<number>
  looks: VintageUnitLook[]
}

/** Arc geometry overrides by arc id — a slide in flight reshapes its arcs. */
export type ArcOverrides = Map<number, OutlinePoint[]>

export const sceneCount = (region: VintageRegion) => region.steps.length + 1

export const finalScene = (region: VintageRegion) => sceneCount(region) - 1

const applyStep = (scene: VintageScene, step: VintageStep, forward: boolean) => {
  for (const arc of forward ? step.erase : step.draw) scene.borders.delete(arc)
  for (const arc of forward ? step.draw : step.erase) scene.borders.add(arc)
  for (const [unit, beforeShape, beforeEra, afterShape, afterEra] of step.units)
    scene.looks[unit] = forward ? [afterShape, afterEra] : [beforeShape, beforeEra]
}

export const sceneAt = (region: VintageRegion, index: number): VintageScene => {
  const scene: VintageScene = {
    borders: new Set(region.first.borders),
    looks: region.first.looks.map(look => [...look] as VintageUnitLook),
  }
  for (let step = 0; step < index; step++) applyStep(scene, region.steps[step], true)
  return scene
}

/** Step `scene` one change toward `toward` — the rewind walks backward. */
export const stepScene = (
  region: VintageRegion,
  scene: VintageScene,
  from: number,
  toward: number
) => {
  const next: VintageScene = {
    borders: new Set(scene.borders),
    looks: scene.looks.map(look => [...look] as VintageUnitLook),
  }
  if (toward > from) applyStep(next, region.steps[from], true)
  else applyStep(next, region.steps[from - 1], false)
  return next
}

/** The step crossed moving from scene `from` one scene toward `toward`, oriented
 *  so `erase`/`draw`/`slides.from → to` read in the direction of travel. */
export const stepToward = (region: VintageRegion, from: number, toward: number): VintageStep => {
  if (toward > from) return region.steps[from]
  const step = region.steps[from - 1]
  return {
    erase: step.draw,
    draw: step.erase,
    units: step.units.map(([unit, bs, be, as, ae]) => [unit, as, ae, bs, be]),
    slides: step.slides.map(slide => ({ from: slide.to, to: slide.from })),
  }
}

export const arcPoints = (region: VintageRegion, signed: number): OutlinePoint[] => {
  const flat = region.arcs[signed < 0 ? ~signed : signed]
  const points: OutlinePoint[] = []
  for (let index = 0; index + 1 < flat.length; index += 2)
    points.push([flat[index], flat[index + 1]])
  return signed < 0 ? points.reverse() : points
}

const joinArcs = (lists: OutlinePoint[][]): OutlinePoint[] => {
  const points: OutlinePoint[] = []
  for (const list of lists) points.push(...(points.length ? list.slice(1) : list))
  return points
}

const pointsOf = (
  region: VintageRegion,
  signed: number,
  overrides?: ArcOverrides
): OutlinePoint[] => {
  const arc = signed < 0 ? ~signed : signed
  const override = overrides?.get(arc)
  if (!override) return arcPoints(region, signed)
  return signed < 0 ? [...override].reverse() : override
}

export const polylinePath = (points: OutlinePoint[]) =>
  points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('')

export const arcPath = (region: VintageRegion, arc: number, overrides?: ArcOverrides) =>
  polylinePath(pointsOf(region, arc, overrides))

/** A unit's fill: every ring as one even-odd path, so holes (Lesotho in
 *  South Africa) cut through. */
export const shapePath = (region: VintageRegion, shape: number, overrides?: ArcOverrides) =>
  region.shapes[shape].rings
    .map(
      ring => `${polylinePath(joinArcs(ring.map(signed => pointsOf(region, signed, overrides))))}Z`
    )
    .join('')

export const eraOf = (region: VintageRegion, look: VintageUnitLook): VintageEra | undefined =>
  look[0] < 0 ? undefined : region.eras[look[1]]

const SLIDE_SAMPLES = 96

export interface SlideTrack {
  from: OutlinePoint[]
  to: OutlinePoint[]
  /** Each from-arc's span along the chain, as sample-index fractions. */
  spans: { arc: number; reversed: boolean; start: number; end: number }[]
}

export const slideTrack = (
  region: VintageRegion,
  slide: VintageStep['slides'][number]
): SlideTrack => {
  const fromPoints = joinArcs(slide.from.map(signed => arcPoints(region, signed)))
  const toPoints = joinArcs(slide.to.map(signed => arcPoints(region, signed)))
  const lengths = slide.from.map(signed => {
    const points = arcPoints(region, signed)
    let length = 0
    for (let index = 1; index < points.length; index++)
      length += Math.hypot(
        points[index][0] - points[index - 1][0],
        points[index][1] - points[index - 1][1]
      )
    return length
  })
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1
  let travelled = 0
  const spans = slide.from.map((signed, index) => {
    const start = travelled / total
    travelled += lengths[index]
    return {
      arc: signed < 0 ? ~signed : signed,
      reversed: signed < 0,
      start,
      end: travelled / total,
    }
  })
  return {
    from: resampleOpen(fromPoints, SLIDE_SAMPLES),
    to: resampleOpen(toPoints, SLIDE_SAMPLES),
    spans,
  }
}

const lerpPoint = (a: OutlinePoint, b: OutlinePoint, t: number): OutlinePoint => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
]

/** The sliding line at `t` (0 = where it was, 1 = where it ends up). */
export const slideLine = (track: SlideTrack, t: number): OutlinePoint[] =>
  track.from.map((point, index) => lerpPoint(point, track.to[index], t))

/** Overrides that bend every from-arc onto the sliding line, so the fills on
 *  both sides follow it with no gap. */
export const slideOverrides = (track: SlideTrack, t: number, into: ArcOverrides = new Map()) => {
  const line = slideLine(track, t)
  const last = line.length - 1
  const sampleAt = (fraction: number): OutlinePoint => {
    const position = fraction * last
    const lower = Math.floor(position)
    return lerpPoint(line[lower], line[Math.min(last, lower + 1)], position - lower)
  }
  for (const span of track.spans) {
    const points: OutlinePoint[] = [sampleAt(span.start)]
    for (let index = Math.ceil(span.start * last); index < span.end * last; index++)
      if (index / last > span.start) points.push(line[index])
    points.push(sampleAt(span.end))
    into.set(span.arc, span.reversed ? points.reverse() : points)
  }
  return into
}

export type VintageLabelStyle = 'empire' | 'colony' | 'state'

export interface VintageLabel {
  unit: number
  at: OutlinePoint
  lines: string[]
  sizePx: number
  style: VintageLabelStyle
}

/** Average Lusitana advance per em; empires add their small-caps tracking. */
const GLYPH_EM = 0.54
const EMPIRE_TRACKING_EM = 0.14
const LINE_HEIGHT = 1.1
const LABEL_STEPS = [1, 0.85]

const styleOf = (era: VintageEra): VintageLabelStyle =>
  era.wash && era.sovereign ? 'empire' : era.wash ? 'colony' : 'state'

const wrapInTwo = (name: string): string[] | undefined => {
  const spaces = [...name.matchAll(/ /g)].map(match => match.index!)
  if (!spaces.length) return undefined
  const middle = name.length / 2
  const cut = spaces.reduce((best, index) =>
    Math.abs(index - middle) < Math.abs(best - middle) ? index : best
  )
  return [name.slice(0, cut), name.slice(cut + 1)]
}

/**
 * Which names fit on the map at this zoom, and how: one line, then two, then
 * a step smaller — biggest outlines first, and never on top of a name already
 * placed. A name that fits nowhere is left to the tap.
 */
export const placeLabels = (
  region: VintageRegion,
  looks: VintageUnitLook[],
  pxPerUnit: number,
  basePx: number
): VintageLabel[] => {
  const placed: { label: VintageLabel; box: [number, number, number, number] }[] = []
  const order = looks
    .map((look, unit) => ({ look, unit }))
    .filter(({ look }) => look[0] >= 0)
    .sort((a, b) => region.shapes[b.look[0]].span - region.shapes[a.look[0]].span)
  for (const { look, unit } of order) {
    const era = region.eras[look[1]]
    const shape = region.shapes[look[0]]
    const style = styleOf(era)
    const across = shape.span * pxPerUnit
    const tall = shape.room * pxPerUnit * 2
    const name = style === 'empire' ? era.name.toUpperCase() : era.name
    const em = GLYPH_EM + (style === 'empire' ? EMPIRE_TRACKING_EM : 0)
    const width = (lines: string[], size: number) =>
      Math.max(...lines.map(line => line.length)) * size * em
    let fit: { lines: string[]; size: number } | undefined
    for (const step of LABEL_STEPS) {
      const size = basePx * step
      for (const lines of [[name], wrapInTwo(name)]) {
        if (!lines) continue
        if (width(lines, size) <= across && lines.length * size * LINE_HEIGHT <= tall) {
          fit = { lines, size }
          break
        }
      }
      if (fit) break
    }
    if (!fit) continue
    const [x, y] = shape.anchor
    const halfW = width(fit.lines, fit.size) / 2 / pxPerUnit
    const halfH = (fit.lines.length * fit.size * LINE_HEIGHT) / 2 / pxPerUnit
    const box: [number, number, number, number] = [x - halfW, y - halfH, x + halfW, y + halfH]
    const clashes = placed.some(
      ({ box: other }) =>
        box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1]
    )
    if (clashes) continue
    placed.push({ label: { unit, at: [x, y], lines: fit.lines, sizePx: fit.size, style }, box })
  }
  return placed.map(({ label }) => label)
}

/** One animated walk across scenes — the rewind, or the reveal's replay. */
export interface VintagePass {
  from: number
  to: number
  /** Step weights in the order the pass crosses them. */
  weights: readonly number[]
  budgetMs: number
  /** How long the pass holds on `from` before the first step. */
  leadMs: number
}

export interface PassFrame {
  /** The last scene fully reached. */
  scene: number
  /** The scene the step in flight is heading to, and how far along it is. */
  next?: number
  progress: number
  done: boolean
}

/** Where a pass stands `elapsedMs` after it started — a pure seek, so a
 *  reload, a booth or a throttled tab all land on the same frame. */
export const passFrameAt = (pass: VintagePass, elapsedMs: number): PassFrame => {
  const direction = pass.to >= pass.from ? 1 : -1
  const schedule = vintageSchedule(pass.weights, pass.budgetMs)
  const t = elapsedMs - pass.leadMs
  let completed = 0
  while (completed < schedule.length && t >= schedule[completed][0] + schedule[completed][1])
    completed++
  const scene = pass.from + direction * completed
  if (completed >= schedule.length) return { scene: pass.to, progress: 0, done: true }
  const [start, length] = schedule[completed]
  if (t < start) return { scene, progress: 0, done: false }
  return {
    scene,
    next: scene + direction,
    progress: length ? (t - start) / length : 1,
    done: false,
  }
}

export const passLengthMs = (pass: VintagePass) => {
  const schedule = vintageSchedule(pass.weights, pass.budgetMs)
  const last = schedule[schedule.length - 1]
  return pass.leadMs + (last ? last[0] + last[1] : 0)
}
