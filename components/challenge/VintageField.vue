<template>
  <div
    ref="root"
    class="vintage-field"
    :class="{ interactive }"
    :style="frameStyle"
    @pointerleave="tip = undefined"
  >
    <svg
      v-if="fieldBox"
      :viewBox="`${fieldBox.x} ${fieldBox.y} ${fieldBox.w} ${fieldBox.h}`"
      preserveAspectRatio="none"
      :class="{ tape }"
      :style="[boxStyle, featherStyle]"
    >
      <g>
        <g>
          <path
            v-for="(_, unit) in region.units"
            :key="`unit-${unit}`"
            :ref="el => (unitEls[unit] = el as SVGPathElement)"
            class="vintage-unit"
            @pointerenter="showTip(unit, $event)"
            @pointermove="showTip(unit, $event)"
            @pointerdown="showTip(unit, $event)"
          />
        </g>
        <g class="incoming">
          <path
            v-for="(_, unit) in region.units"
            :key="`incoming-${unit}`"
            :ref="el => (incomingEls[unit] = el as SVGPathElement)"
            class="vintage-unit"
          />
        </g>
        <g class="borders">
          <path
            v-for="arc in borderArcs"
            :key="arc"
            :ref="el => setArcEl(arc, el as SVGPathElement | null)"
            class="border"
            :d="arcPath(region, arc)"
          />
          <path
            v-for="index in slideSlots"
            :key="`slide-${index}`"
            :ref="el => (slideEls[index - 1] = el as SVGPathElement)"
            class="border slide"
          />
        </g>
      </g>
    </svg>
    <TransitionGroup tag="div" name="vintage-label" class="labels" aria-hidden="true">
      <span
        v-for="label in placedLabels"
        :key="`${label.unit}:${label.lines.join(' ')}`"
        class="vintage-label"
        :class="label.style"
        :style="{ left: `${label.left}%`, top: `${label.top}%`, fontSize: `${label.sizePx}px` }"
      >
        <span v-for="line in label.lines" :key="line">{{ line }}</span>
      </span>
    </TransitionGroup>
    <span
      v-if="tip"
      class="vintage-tip map-caption"
      :style="{ left: `${tip.x}px`, top: `${tip.y}px` }"
    >
      {{ tip.name }}
    </span>
  </div>
</template>
<script lang="ts" setup>
import gsap from 'gsap'
import { clamp01 } from '~~/lib/number'
import { prefersReducedMotion } from '~~/lib/motion'
import { readServerNow } from '~~/lib/use-server-now'
import { bleedBox, useMapPanTrack, useMapViewBox } from '~~/lib/use-map-viewbox'
import { useIsPhone } from '~~/lib/use-viewport'
import {
  arcPath,
  passFrameAt,
  placeLabels,
  sceneAt,
  shapePath,
  slideLine,
  slideOverrides,
  slideTrack,
  stepToward,
  polylinePath,
  type ArcOverrides,
  type PassFrame,
  type SlideTrack,
  type VintagePass,
  type VintageScene,
} from '~~/lib/vintage'
import type { VintageRegion, VintageStep, VintageUnitLook } from '~~/types/vintage.types'

/** Vintage's map: a region's units, borders and names at one scene, or
 *  mid-way through a pass between two — seeked off the server clock. */
const props = defineProps<{
  region: VintageRegion
  labelled: boolean
  pass: VintagePass
  /** Server time the pass starts; unset holds it on `pass.from`. */
  startsAt?: number
  /** Hover or tap a unit to read its name. */
  interactive?: boolean
  /** The tape wobbles while the rewind beat plays. */
  tape?: boolean
}>()

const emit = defineEmits<{ scene: [scene: number] }>()

const root = ref<HTMLElement>()
const { boxStyle, frameStyle, size } = useMapPanTrack(root)
const { viewBox, toScreenPercent } = useMapViewBox()
const isPhone = useIsPhone()

const fieldBox = computed(() => (viewBox.value?.w ? bleedBox(viewBox.value) : undefined))

/** The data is clipped to a box around the region; the field fades out well
 *  inside that clip so its straight edges never show. A CSS mask, not an SVG
 *  one: an SVG mask with a blur re-rasterizes with every animated frame. */
const featherStyle = computed(() => {
  const field = fieldBox.value
  if (!field) return {}
  const [x, y, w, h] = props.region.frame
  const span = (from: number, length: number, origin: number, extent: number, frame: number) => {
    const at = (value: number) => `${(((value - origin) / extent) * 100).toFixed(2)}%`
    const margin = frame * FEATHER_MARGIN
    const soft = frame * FEATHER_SOFTNESS
    return `transparent ${at(from - margin - soft)}, #000 ${at(from - margin + soft)}, #000 ${at(from + length + margin - soft)}, transparent ${at(from + length + margin + soft)}`
  }
  const mask = `linear-gradient(to right, ${span(x, w, field.x, field.w, w)}), linear-gradient(to bottom, ${span(y, h, field.y, field.h, h)})`
  return {
    maskImage: mask,
    WebkitMaskImage: mask,
    maskComposite: 'intersect',
    WebkitMaskComposite: 'source-in',
  }
})
const FEATHER_MARGIN = 0.1
const FEATHER_SOFTNESS = 0.07

const unitEls: SVGPathElement[] = []
const incomingEls: SVGPathElement[] = []
const slideEls: SVGPathElement[] = []
const arcEls = new Map<number, SVGPathElement>()
const arcLengths = new Map<number, number>()
const setArcEl = (arc: number, el: SVGPathElement | null) => {
  if (!el) return arcEls.delete(arc)
  arcEls.set(arc, el)
}

/** Every arc the pass can show, so no path is ever created mid-animation. */
const borderArcs = computed(() => {
  const low = Math.min(props.pass.from, props.pass.to)
  const high = Math.max(props.pass.from, props.pass.to)
  const arcs = new Set(sceneAt(props.region, low).borders)
  for (let step = low; step < high; step++) {
    for (const arc of props.region.steps[step].draw) arcs.add(arc)
    for (const arc of props.region.steps[step].erase) arcs.add(arc)
  }
  return [...arcs]
})

const slideSlots = computed(() => {
  const low = Math.min(props.pass.from, props.pass.to)
  const high = Math.max(props.pass.from, props.pass.to)
  let most = 0
  for (let step = low; step < high; step++)
    most = Math.max(most, props.region.steps[step].slides.length)
  return most
})

const sceneCache = new Map<number, VintageScene>()
const sceneOf = (index: number) => {
  let scene = sceneCache.get(index)
  if (!scene) sceneCache.set(index, (scene = sceneAt(props.region, index)))
  return scene
}

/** A shape's outline never changes, so its path string is built once. */
const shapeCache = new Map<number, string>()
const shapeD = (shape: number) => {
  let d = shapeCache.get(shape)
  if (d === undefined) shapeCache.set(shape, (d = shapePath(props.region, shape)))
  return d
}

const paintLook = (
  el: SVGPathElement | undefined,
  unit: number,
  shape: number,
  era: number,
  overrides?: ArcOverrides
) => {
  if (!el) return
  if (shape < 0) {
    el.style.display = 'none'
    return
  }
  const wash = props.region.eras[era]?.wash
  el.style.display = ''
  el.setAttribute('d', overrides ? shapePath(props.region, shape, overrides) : shapeD(shape))
  el.setAttribute(
    'class',
    `vintage-unit tone-${props.region.units[unit].tone}${wash ? ` wash-${wash}` : ''}`
  )
  if (wash) el.dataset.wash = wash
  else delete el.dataset.wash
}

const showArc = (arc: number, drawn: number) => {
  const el = arcEls.get(arc)
  if (!el) return
  if (drawn >= 1) {
    el.style.opacity = '1'
    el.style.strokeDasharray = ''
    el.style.strokeDashoffset = ''
    return
  }
  if (drawn <= 0) {
    el.style.opacity = '0'
    return
  }
  let length = arcLengths.get(arc)
  if (length === undefined) arcLengths.set(arc, (length = el.getTotalLength()))
  el.style.opacity = '1'
  el.style.strokeDasharray = `${length} ${length}`
  el.style.strokeDashoffset = `${length * (1 - drawn)}`
}

const labelScene = ref(props.pass.from)
const placedLabels = computed(() => {
  const vb = viewBox.value
  if (!props.labelled || !vb?.w || !size.w) return []
  const looks = sceneOf(labelScene.value).looks
  return placeLabels(props.region, looks, size.w / vb.w, isPhone.value ? 10 : 12).flatMap(label => {
    const at = toScreenPercent(label.at[0], label.at[1])
    return at ? [{ ...label, ...at }] : []
  })
})

/** What the DOM shows right now, so a new scene repaints only what differs. */
let shownScene: number | undefined
let paintedLooks: VintageUnitLook[] = []
let paintedBorders = new Set<number>()

interface StepInFlight {
  key: string
  step: VintageStep
  tracks: SlideTrack[]
  sliding: Set<number>
  /** Units whose before-outline runs along a sliding border — their fill
   *  bends with the line every frame. */
  bending: Set<number>
}
let inFlight: StepInFlight | undefined

/** Ends the step in flight; returns the arcs it touched, which the next
 *  scene must repaint whatever state the last frame left them in. */
const settleStep = (): Set<number> => {
  if (!inFlight) return new Set()
  const touched = new Set([...inFlight.step.erase, ...inFlight.step.draw])
  for (const [unit] of inFlight.step.units) {
    if (unitEls[unit]) unitEls[unit].style.opacity = '1'
    if (incomingEls[unit]) incomingEls[unit].style.display = 'none'
  }
  for (const el of slideEls) if (el) el.style.display = 'none'
  for (const [unit] of inFlight.step.units) paintedLooks[unit] = [-2, -2]
  inFlight = undefined
  return touched
}

const paintScene = (index: number) => {
  const touched = settleStep()
  const scene = sceneOf(index)
  scene.looks.forEach(([shape, era], unit) => {
    const painted = paintedLooks[unit]
    if (painted && painted[0] === shape && painted[1] === era) return
    paintLook(unitEls[unit], unit, shape, era)
    if (unitEls[unit]) unitEls[unit].style.opacity = '1'
    paintedLooks[unit] = [shape, era]
  })
  for (const arc of borderArcs.value) {
    const want = scene.borders.has(arc)
    if (touched.has(arc) || want !== paintedBorders.has(arc)) showArc(arc, want ? 1 : 0)
  }
  paintedBorders = new Set(scene.borders)
  labelScene.value = index
  shownScene = index
  emit('scene', index)
}

const beginStep = (index: number, next: number): StepInFlight => {
  const step = stepToward(props.region, index, next)
  const tracks = step.slides.map(slide => slideTrack(props.region, slide))
  const sliding = new Set(
    step.slides.flatMap(({ from, to }) => [...from, ...to].map(a => (a < 0 ? ~a : a)))
  )
  const fromArcs = new Set(step.slides.flatMap(({ from }) => from.map(a => (a < 0 ? ~a : a))))
  const bending = new Set(
    step.units
      .filter(
        ([, beforeShape]) =>
          beforeShape >= 0 &&
          props.region.shapes[beforeShape].rings.some(ring =>
            ring.some(a => fromArcs.has(a < 0 ? ~a : a))
          )
      )
      .map(([unit]) => unit)
  )
  for (const [unit, , , afterShape, afterEra] of step.units) {
    const incoming = incomingEls[unit]
    paintLook(incoming, unit, afterShape, afterEra)
    if (incoming) incoming.style.opacity = '0'
  }
  for (const arc of sliding) showArc(arc, 0)
  return { key: `${index}>${next}`, step, tracks, sliding, bending }
}

/** A time-lapse, not a sequence of beats: every part of a step runs at a
 *  steady rate and overlaps its neighbours, so the map never stops to start. */
const linear = (progress: number, from: number, to: number) =>
  clamp01((progress - from) / (to - from))
const glide = gsap.parseEase('sine.inOut')

const paintStep = (index: number, next: number, progress: number) => {
  const key = `${index}>${next}`
  if (inFlight?.key !== key) {
    settleStep()
    inFlight = beginStep(index, next)
  }
  const { step, tracks, sliding, bending } = inFlight

  const erase = linear(progress, 0, 0.7)
  const draw = linear(progress, 0.3, 1)
  const fade = linear(progress, 0.1, 0.9)
  const slide = glide(linear(progress, 0.05, 0.95))

  for (const arc of step.erase) if (!sliding.has(arc)) showArc(arc, 1 - erase)
  for (const arc of step.draw) if (!sliding.has(arc)) showArc(arc, draw)

  const overrides: ArcOverrides = new Map()
  tracks.forEach((track, slot) => {
    slideOverrides(track, slide, overrides)
    const el = slideEls[slot]
    if (!el) return
    el.style.display = ''
    el.setAttribute('d', polylinePath(slideLine(track, slide)))
  })

  for (const [unit, beforeShape, beforeEra] of step.units) {
    const base = unitEls[unit]
    if (bending.has(unit)) paintLook(base, unit, beforeShape, beforeEra, overrides)
    if (base) base.style.opacity = beforeShape >= 0 ? String(1 - fade * fade) : '0'
    const incoming = incomingEls[unit]
    if (incoming) incoming.style.opacity = String(fade)
  }
  if (progress >= 0.5) labelScene.value = next
}

const frameNow = (): PassFrame => {
  if (props.startsAt === undefined) return { scene: props.pass.from, progress: 0, done: true }
  const frame = passFrameAt(props.pass, readServerNow() - props.startsAt)
  if (reduced && frame.next !== undefined) return { ...frame, progress: frame.progress > 0 ? 1 : 0 }
  return frame
}

const reduced = import.meta.client && prefersReducedMotion()
let raf = 0
const tick = () => {
  raf = 0
  if (!unitEls.length) return
  const frame = frameNow()
  if (shownScene !== frame.scene || (inFlight && frame.next === undefined)) paintScene(frame.scene)
  if (frame.next !== undefined) paintStep(frame.scene, frame.next, frame.progress)
  if (!frame.done) raf = requestAnimationFrame(tick)
}

const restart = () => {
  if (raf) cancelAnimationFrame(raf)
  shownScene = undefined
  inFlight = undefined
  paintedLooks = []
  paintedBorders = new Set()
  arcLengths.clear()
  nextTick(() => {
    // Measured and built up front, inside the lead: a first getTotalLength or
    // path string mid-rewind is a dropped frame.
    for (const arc of borderArcs.value) {
      showArc(arc, 0)
      const el = arcEls.get(arc)
      if (el) arcLengths.set(arc, el.getTotalLength())
    }
    const low = Math.min(props.pass.from, props.pass.to)
    const high = Math.max(props.pass.from, props.pass.to)
    for (let step = low; step < high; step++)
      for (const [, beforeShape, , afterShape] of props.region.steps[step].units) {
        if (beforeShape >= 0) shapeD(beforeShape)
        if (afterShape >= 0) shapeD(afterShape)
      }
    raf = requestAnimationFrame(tick)
  })
}

watch(() => [props.pass, props.startsAt, fieldBox.value !== undefined], restart, {
  immediate: true,
})
onBeforeUnmount(() => raf && cancelAnimationFrame(raf))

const tip = ref<{ name: string; x: number; y: number }>()
const showTip = (unit: number, event: PointerEvent) => {
  if (!props.interactive || !props.labelled || shownScene === undefined || !root.value) return
  const [shape, era] = sceneOf(labelScene.value).looks[unit]
  if (shape < 0) return
  const box = root.value.getBoundingClientRect()
  tip.value = {
    name: props.region.eras[era].name,
    x: event.clientX - box.left,
    y: event.clientY - box.top,
  }
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/ink' as *;

// Both boxes come inline from useMapPanTrack, pinned to the map's painted
// rect; these are only the pre-measurement fallback.
.vintage-field {
  inset: 0;
  position: absolute;
  pointer-events: none;

  svg {
    position: absolute;
    display: block;
  }
}

.vintage-unit {
  transition: none;
}

.tape {
  animation: tape-wobble 0.18s steps(2) infinite;
}

@keyframes tape-wobble {
  50% {
    transform: translateX(1.5px) skewX(-0.3deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tape {
    animation: none;
  }
}

.interactive .vintage-unit {
  pointer-events: visiblePainted;
}

.incoming .vintage-unit {
  pointer-events: none;
}

.border {
  fill: none;
  stroke: ink(0.78);
  // Screen pixels at every zoom; never derive this from the camera.
  stroke-width: 1px;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.slide {
  stroke: ink(0.95);
  stroke-width: 1.3px;
}

.labels {
  position: absolute;
  inset: 0;
}

.vintage-label {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
  white-space: nowrap;
  color: ink(0.86);
  transform: translate(-50%, -50%);
  text-shadow:
    0 0 2px var(--background-color),
    0 0 4px var(--background-color);

  &.empire {
    font-variant: small-caps;
    letter-spacing: 0.14em;
    text-transform: lowercase;
  }

  &.colony {
    font-style: italic;
  }
}

.vintage-label-enter-active,
.vintage-label-leave-active {
  transition: opacity var(--motion-base) var(--ease-smooth);
}
.vintage-label-enter-from,
.vintage-label-leave-to {
  opacity: 0;
}

.vintage-tip {
  position: absolute;
  padding: 0.3rem 0.8rem;
  font-size: 1.3rem;
  white-space: nowrap;
  transform: translate(-50%, calc(-100% - 1.2rem));
  pointer-events: none;
}

@media (max-width: $tablet) {
  .border {
    stroke-width: 0.8px;
  }

  .slide {
    stroke-width: 1.1px;
  }
}
</style>
