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
      :style="boxStyle"
    >
      <defs>
        <filter :id="`${uid}-feather`" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur :stdDeviation="feather.blur" />
        </filter>
        <mask
          :id="`${uid}-fade`"
          maskUnits="userSpaceOnUse"
          :x="fieldBox.x"
          :y="fieldBox.y"
          :width="fieldBox.w"
          :height="fieldBox.h"
        >
          <rect v-bind="feather.rect" fill="white" :filter="`url(#${uid}-feather)`" />
        </mask>
      </defs>
      <g :mask="`url(#${uid}-fade)`">
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
        <g class="borders" :style="{ strokeWidth: stroke }">
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
import { EASE, prefersReducedMotion } from '~~/lib/motion'
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
import type { VintageRegion } from '~~/types/vintage.types'

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
}>()

const emit = defineEmits<{ scene: [scene: number] }>()

const root = ref<HTMLElement>()
const { boxStyle, frameStyle, size } = useMapPanTrack(root)
const { viewBox, toScreenPercent } = useMapViewBox()
const isPhone = useIsPhone()

const fieldBox = computed(() => (viewBox.value?.w ? bleedBox(viewBox.value) : undefined))

/** The data is clipped to a box around the region; the field fades out well
 *  inside that clip so its straight edges never show. */
const uid = useId()
const feather = computed(() => {
  const [x, y, w, h] = props.region.frame
  const margin = 0.12
  return {
    blur: w * 0.05,
    rect: {
      x: x - w * margin,
      y: y - h * margin,
      width: w * (1 + 2 * margin),
      height: h * (1 + 2 * margin),
    },
  }
})
const stroke = computed(() => `${(viewBox.value?.w ?? 600) * 0.0016}px`)

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
  el.setAttribute('d', shapePath(props.region, shape, overrides))
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

let shownScene: number | undefined
let stepInFlight = false
const trackCache = new Map<string, SlideTrack[]>()

const paintScene = (index: number) => {
  const scene = sceneOf(index)
  scene.looks.forEach(([shape, era], unit) => {
    paintLook(unitEls[unit], unit, shape, era)
    const base = unitEls[unit]
    if (base) base.style.opacity = '1'
    if (incomingEls[unit]) incomingEls[unit].style.display = 'none'
  })
  for (const arc of borderArcs.value) showArc(arc, scene.borders.has(arc) ? 1 : 0)
  for (const el of slideEls) if (el) el.style.display = 'none'
  labelScene.value = index
  shownScene = index
  stepInFlight = false
  emit('scene', index)
}

const ease = gsap.parseEase(EASE.cross)
const phase = (progress: number, from: number, to: number) =>
  ease(clamp01((progress - from) / (to - from)))

const paintStep = (index: number, next: number, progress: number) => {
  const step = stepToward(props.region, index, next)
  const key = `${index}>${next}`
  let tracks = trackCache.get(key)
  if (!tracks)
    trackCache.set(key, (tracks = step.slides.map(slide => slideTrack(props.region, slide))))

  const erase = phase(progress, 0, 0.45)
  const slide = phase(progress, 0.2, 0.8)
  const draw = phase(progress, 0.45, 1)
  const fade = phase(progress, 0.25, 0.85)

  const sliding = new Set(
    step.slides.flatMap(({ from, to }) => [...from, ...to].map(a => (a < 0 ? ~a : a)))
  )
  for (const arc of step.erase) if (!sliding.has(arc)) showArc(arc, 1 - erase)
  for (const arc of step.draw) if (!sliding.has(arc)) showArc(arc, draw)
  for (const arc of sliding) showArc(arc, 0)

  const overrides: ArcOverrides = new Map()
  tracks.forEach((track, slot) => {
    slideOverrides(track, slide, overrides)
    const el = slideEls[slot]
    if (!el) return
    el.style.display = ''
    el.setAttribute('d', polylinePath(slideLine(track, slide)))
  })

  for (const [unit, beforeShape, beforeEra, afterShape, afterEra] of step.units) {
    const base = unitEls[unit]
    if (tracks.length) paintLook(base, unit, beforeShape, beforeEra, overrides)
    if (base) base.style.opacity = String(beforeShape >= 0 ? 1 - fade : 0)
    const incoming = incomingEls[unit]
    paintLook(incoming, unit, afterShape, afterEra)
    if (incoming) incoming.style.opacity = String(fade)
  }
  if (progress >= 0.5) labelScene.value = next
  stepInFlight = true
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
  if (shownScene !== frame.scene || (stepInFlight && frame.next === undefined))
    paintScene(frame.scene)
  if (frame.next !== undefined) paintStep(frame.scene, frame.next, frame.progress)
  if (!frame.done) raf = requestAnimationFrame(tick)
}

const restart = () => {
  if (raf) cancelAnimationFrame(raf)
  shownScene = undefined
  trackCache.clear()
  arcLengths.clear()
  nextTick(() => (raf = requestAnimationFrame(tick)))
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

.interactive .vintage-unit {
  pointer-events: visiblePainted;
}

.incoming .vintage-unit {
  pointer-events: none;
}

.border {
  fill: none;
  stroke: ink(0.78);
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.slide {
  stroke: ink(0.95);
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
    0 0 3px var(--background-color),
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
</style>
