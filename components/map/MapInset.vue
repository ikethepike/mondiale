<template>
  <g
    v-if="visible"
    class="map-inset"
    :class="{ 'is-entering': entering }"
    :style="{ '--inset-px': unitsPerPixel }"
  >
    <!-- Leader line from the subject on the map to the nearest corner of the
         box, so the eye can follow it without the line crossing the box. -->
    <line class="map-inset-leader" :x1="subject.x" :y1="subject.y" :x2="anchor.x" :y2="anchor.y" />
    <circle class="map-inset-tether" :cx="subject.x" :cy="subject.y" :r="tetherRadius" />

    <!-- Opaque backing: the mirrored world is drawn over the live map, so
         without this the two overlap and neither reads. -->
    <rect
      class="map-inset-backing"
      :x="box.x"
      :y="box.y"
      :width="box.width"
      :height="box.height"
      :rx="frameRadius"
    />

    <!-- A nested viewport onto the world layer. `overflow: hidden` clips it to
         the box; the <use> clone lands in a shadow tree, so nothing that walks
         the main SVG (pathEls, culling, the LOD swap) ever sees it. -->
    <svg
      class="map-inset-viewport"
      :x="box.x"
      :y="box.y"
      :width="box.width"
      :height="box.height"
      :viewBox="`${region.x} ${region.y} ${region.width} ${region.height}`"
      preserveAspectRatio="xMidYMid slice"
      :style="{ '--stroke-zoom': insetStrokeZoom }"
    >
      <use href="#map-world-layer" />
    </svg>

    <!-- Sits above the viewport so the whole box is one target: clicking flies
         the camera to exactly the region the box was showing, so the gesture
         reads as the window expanding to fill the screen. -->
    <rect
      class="map-inset-frame"
      :x="box.x"
      :y="box.y"
      :width="box.width"
      :height="box.height"
      :rx="frameRadius"
      @click="emit('zoom', [region.x, region.y, region.width, region.height])"
    />
    <!-- Above the box: it is anchored to the bottom of the view, so a label
         beneath it would fall off the screen. -->
    <text
      v-if="inset.label"
      class="map-inset-label"
      :x="box.x + box.width / 2"
      :y="box.y - labelOffset"
    >
      {{ inset.label }}
    </text>
  </g>
</template>

<script lang="ts" setup>
import { gsap } from 'gsap'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { prefersReducedMotion } from '~~/lib/motion'
import type { MapInset } from '~~/types/map.type'

const props = defineProps<{
  inset: MapInset
  /** Live camera box in map space: [x, y, width, height]. */
  view: [number, number, number, number]
  /** Phone presentation: a larger box parked on a fixed top rail (the footer
   *  owns the bottom of a phone screen), with no cursor-dodge — there is no
   *  hovering pointer on touch. */
  compact?: boolean
}>()

const emit = defineEmits<{
  /** The box was clicked: fly the camera to this region, in map space. */
  zoom: [region: [number, number, number, number]]
}>()

/** Default zoom past which the subject is legible unaided. */
const DEFAULT_HIDE_AT_ZOOM = 6
const WORLD_WIDTH = 2000
const WORLD_HEIGHT = 1001
/** The box, as a fraction of the current view — so it holds its screen size.
 *  Compact (phone) screens get a much larger share: 20% of 360px is a stamp. */
const BOX_WIDTH_FRACTION = 0.2
const COMPACT_BOX_WIDTH_FRACTION = 0.42
const BOX_ASPECT = 3 / 4
const EDGE_PAD_FRACTION = 0.04

const entering = ref(false)

/**
 * Which half of the screen the cursor is in. The box parks in the other one, so
 * it never sits under the country you are reaching for. Only the SIDE is
 * tracked, not the position: a box that follows the pointer is a box that never
 * holds still, and the flip only ever fires when you cross the centre line.
 *
 * The line is a dead ZONE, not a point. Without it, a cursor drifting along the
 * middle of the screen retriggers the flip every few pixels and the box paces
 * back and forth. You have to commit to a side before the box yields it.
 */
const CENTRE_DEAD_ZONE = 0.08
const pointerSide = ref<'left' | 'right' | undefined>(undefined)

const onPointerMove = (event: PointerEvent) => {
  const host = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  if (!host) return
  const fraction = (event.clientX - host.left) / host.width
  if (fraction < 0.5 - CENTRE_DEAD_ZONE) pointerSide.value = 'left'
  else if (fraction > 0.5 + CENTRE_DEAD_ZONE) pointerSide.value = 'right'
}

/**
 * The box's horizontal position, as 0 (left rail) → 1 (right rail). Tweened
 * rather than assigned so the box glides across instead of teleporting, and so
 * the leader line, its anchor corner and the label all follow it continuously —
 * they are all derived from `box.x`.
 *
 * A gsap tween on one number, rather than a CSS transition: `x` and `width` on
 * an SVG <rect> are geometry attributes, and only Chromium animates them.
 */
const slide = reactive({ value: 0 })
const SLIDE_SECONDS = 0.55

const zoom = computed(() => WORLD_WIDTH / props.view[2])
const visible = computed(() => zoom.value < (props.inset.hideAtZoom ?? DEFAULT_HIDE_AT_ZOOM))

/** Centre of the thing being magnified, in map space. */
const subject = computed(() => {
  const [x, y, width, height] = props.inset.bounds
  return { x: x + width / 2, y: y + height / 2 }
})

/**
 * The region the inset shows: the subject, filling a good share of the box,
 * plus enough surrounding world to place it. Always at the box's aspect ratio
 * so `slice` never crops asymmetrically.
 *
 * Sized from the SUBJECT, never from the box. Deriving it from the box and a
 * magnification cap looks equivalent and is not — a 520-unit box at 6x shows
 * 87 units of world, which for a 12-unit territory is half a continent with the
 * subject lost somewhere in the middle.
 *
 * The floor is what stops a coastline from becoming a single straight edge, and
 * it is a fraction of the subject rather than a constant: at a flat 6 units,
 * Bassas da India (0.4 units) occupies 6% of the box and reads as empty ocean.
 */
const SUBJECT_SHARE_OF_BOX = 0.35
/** Never magnify past this: a rock is not more informative at 10,000x. */
const MIN_REGION_WIDTH = 0.6

const region = computed(() => {
  const [, , width, height] = props.inset.bounds
  const subjectWidth = Math.max(width, height / BOX_ASPECT)
  const regionWidth = Math.max(subjectWidth / SUBJECT_SHARE_OF_BOX, MIN_REGION_WIDTH)
  const regionHeight = regionWidth * BOX_ASPECT

  return {
    x: subject.value.x - regionWidth / 2,
    y: subject.value.y - regionHeight / 2,
    width: regionWidth,
    height: regionHeight,
  }
})

/**
 * Place the box on the same side of the view as its subject — a short leader
 * line is easy to follow, a long one crosses half the world and every caption
 * on the way. Always along the bottom: the top of the screen belongs to the
 * prompt, and the footer buttons occupy only the centre.
 *
 * `bottom` is measured against the WORLD's lower edge when the view overhangs
 * it, so the box never floats out over blank parchment.
 */
/** The two rails the box parks on, and the row it sits in. The bottom edge is
 *  measured against the WORLD's lower edge when the view overhangs it — on a
 *  portrait phone at world zoom that lands the box mid-screen, just under the
 *  map band and clear of the footer chrome. */
const rails = computed(() => {
  const [viewX, viewY, viewWidth, viewHeight] = props.view
  const width = viewWidth * (props.compact ? COMPACT_BOX_WIDTH_FRACTION : BOX_WIDTH_FRACTION)
  const height = width * BOX_ASPECT
  const padX = viewWidth * EDGE_PAD_FRACTION
  const padY = viewHeight * EDGE_PAD_FRACTION

  const bottom = Math.min(viewY + viewHeight, WORLD_HEIGHT)
  return {
    width,
    height,
    padX,
    padY,
    y: bottom - height - padY,
    left: viewX + padX,
    right: viewX + viewWidth - width - padX,
  }
})

/** 0 = left rail, 1 = right rail. The tween chases this; `box` reads `slide`. */
const targetSlide = computed(() => {
  const { width, padX, padY, y, left, right } = rails.value
  const [viewX, , viewWidth] = props.view

  // Same side as the subject (a short leader line is easy to follow), but yield
  // to the cursor: the box must not sit under the country you are reaching for.
  const covers = (x: number) =>
    subject.value.x > x - padX && subject.value.x < x + width + padX && subject.value.y > y - padY

  const subjectLeft = subject.value.x < viewX + viewWidth / 2
  // No hovering pointer exists on touch — compact mode never dodges.
  const dodge = props.compact ? undefined : pointerSide.value
  const preferLeft = dodge ? dodge === 'right' : subjectLeft

  const wanted = preferLeft ? left : right
  const settled = covers(wanted) ? (preferLeft ? right : left) : wanted
  return settled === left ? 0 : 1
})

const box = computed(() => {
  const { width, height, y, left, right } = rails.value
  return { x: left + (right - left) * slide.value, y, width, height }
})

// Declared after `targetSlide` so the watcher can read it: `const` bindings in
// a setup block are not hoisted.
watch(targetSlide, next => {
  gsap.to(slide, {
    value: next,
    duration: prefersReducedMotion() ? 0 : SLIDE_SECONDS,
    ease: 'power3.inOut',
    overwrite: true,
  })
})

let host: HTMLElement | null = null
onMounted(() => {
  entering.value = true
  requestAnimationFrame(() => (entering.value = false))

  // Start on the correct rail; only later moves are animated.
  slide.value = targetSlide.value

  if (!props.compact) {
    host = document.querySelector('.game-map')
    host?.addEventListener('pointermove', onPointerMove as EventListener, { passive: true })
  }
})
onBeforeUnmount(() => {
  gsap.killTweensOf(slide)
  host?.removeEventListener('pointermove', onPointerMove as EventListener)
})

/** The box corner nearest the subject — where the leader line lands. */
const anchor = computed(() => {
  const { x, y, width, height } = box.value
  return {
    x: subject.value.x < x + width / 2 ? x : x + width,
    y: subject.value.y < y + height / 2 ? y : y + height,
  }
})

/**
 * The world layer inside the inset inherits `--stroke-zoom` from the outer SVG,
 * where it means `1 / cameraZoom`. But the inset magnifies far harder than the
 * camera, so those strokes come out as thick black slabs. Recompute it for the
 * inset's own scale: coastlines stay hairlines however deep the magnification.
 */
const insetStrokeZoom = computed(() => {
  const magnification = box.value.width / region.value.width
  const effectiveZoom = (WORLD_WIDTH / props.view[2]) * magnification
  return String(1 / Math.max(1, effectiveZoom))
})

// Stroke widths and radii are authored in screen pixels, then converted to map
// units against the live camera, so they hold their size at any zoom.
const unitsPerPixel = computed(() => props.view[2] / WORLD_WIDTH)
const tetherRadius = computed(() => 3 * unitsPerPixel.value)
const frameRadius = computed(() => 6 * unitsPerPixel.value)
const labelOffset = computed(() => 22 * unitsPerPixel.value)
</script>

<style lang="scss" scoped>
.map-inset {
  pointer-events: none;
  color: hsl(215.7, 76.4%, 41%);
  transition: opacity var(--motion-base) var(--ease-out-expressive);

  &.is-entering {
    opacity: 0;
  }
}

// --inset-px converts screen pixels to map units against the live camera.
// NOT --stroke-zoom: that is clamped to 1 (it only ever thins strokes when
// zoomed in), so anything sized by it grows with the camera instead of holding
// its size. The chrome here is authored in pixels and must stay that way.
.map-inset-leader {
  stroke: currentColor;
  stroke-width: calc(1.5px * var(--inset-px, 1));
  stroke-dasharray: calc(4px * var(--inset-px, 1)) calc(3px * var(--inset-px, 1));
  opacity: 0.75;
}

.map-inset-tether {
  fill: currentColor;
}

// Matches the map's own parchment so the inset reads as a window, not a card.
.map-inset-backing {
  fill: var(--background-color);
}

// --stroke-zoom is set inline, from the inset's own magnification.
.map-inset-viewport {
  overflow: hidden;
}

// The frame doubles as the click target: the group is pointer-events: none, so
// only this rect opts back in. `fill: none` would leave the interior dead, and
// a transparent fill is the standard SVG way to make a shape hit-testable.
.map-inset-frame {
  fill: transparent;
  cursor: zoom-in;
  stroke: currentColor;
  pointer-events: all;
  stroke-width: calc(2px * var(--inset-px, 1));
  filter: drop-shadow(0 0 calc(3px * var(--inset-px, 1)) hsla(215.7, 76.4%, 21.6%, 0.35));
  transition: stroke-width var(--motion-base) var(--ease-out-expressive);

  &:hover {
    stroke-width: calc(3.5px * var(--inset-px, 1));
  }
}

.map-inset-label {
  fill: var(--dark-blue);
  font-size: calc(13px * var(--inset-px, 1));
  text-anchor: middle;
  font-variant: small-caps;
  letter-spacing: 0.04em;
  paint-order: stroke;
  stroke: var(--background-color);
  stroke-width: calc(3px * var(--inset-px, 1));
  stroke-linejoin: round;
}
</style>
