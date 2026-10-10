<template>
  <div ref="root" class="sunset-veil" :class="{ settled }" aria-hidden="true">
    <div v-if="pool && litStyle" class="dusk">
      <svg class="outside" :viewBox="viewBoxAttr" preserveAspectRatio="none" :style="litStyle">
        <path v-for="code in outsideCodes" :key="code" :d="pathFor(code)" />
      </svg>
      <div class="twilight" :style="twilightStyle" />
    </div>
    <div ref="plane" class="plane" :style="planeStyle">
      <div class="night-land" :style="{ '--feather': `${featherPx}px` }">
        <div ref="inverse" class="inverse">
          <svg
            v-if="landStyle && sweep"
            class="land"
            :viewBox="viewBoxAttr"
            preserveAspectRatio="none"
            :style="landStyle"
          >
            <path v-for="code in landCodes" :key="code" :data-id="code" :d="pathFor(code)" />
          </svg>
        </div>
      </div>
      <div class="band" />
    </div>
    <svg
      v-if="litStyle && next.length && !settled"
      :key="next.join()"
      class="next"
      :viewBox="viewBoxAttr"
      preserveAspectRatio="none"
      :style="litStyle"
    >
      <path v-for="code in next" :key="code" :d="pathFor(code)" />
    </svg>
    <svg
      v-if="litStyle && lit.length"
      class="lit"
      :viewBox="viewBoxAttr"
      preserveAspectRatio="none"
      :style="litStyle"
    >
      <g v-for="code in lit" :key="code" :data-id="code">
        <path :d="pathFor(code)" />
      </g>
    </svg>
  </div>
</template>
<script lang="ts" setup>
import { MAP_PATHS, type MapCode } from '~~/data/map.gen'
import type { MapBox } from '~~/lib/geo'
import {
  SEA_OPAQUE_VW,
  settledMidPx,
  SUNSET_POOL_CLEAR,
  SUNSET_SETTLE_MS,
  SUNSET_VEIL_BOW,
  SUNSET_VEIL_FEATHER,
  twilightPool,
  veilCodes,
  veilKeyframes,
  veilMidPx,
  veilPlaneSize,
  veilTransforms,
} from '~~/lib/sunset-veil'
import { mapPaintedRect, useMapViewBox } from '~~/lib/use-map-viewbox'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Sunset Blitz's night: the world past the window already in dusk, then ONE
 * moving plane (the sea's gradient, the darkened land, the terminator's glow)
 * played as compositor animations. The land is a static svg of the map's own
 * outlines, counter-animated inside the plane so it stays pinned to the map
 * while the plane's mask reveals it behind the line — the base map is never
 * touched, so it rasters once.
 */
const props = defineProps<{
  field: readonly ISOCountryCode[]
  frame: MapBox
  /** The terminator over time; undefined parks the night off-screen east. */
  sweep?: { duskAt: (elapsedSeconds: number) => number; startTime: number; duration: number }
  lit: readonly ISOCountryCode[]
  /** The countries the night takes next — they breathe until named or gone. */
  next: readonly ISOCountryCode[]
  settled: boolean
}>()

const root = ref<HTMLElement>()
const plane = ref<HTMLElement>()
const inverse = ref<HTMLElement>()
const { viewBox } = useMapViewBox()

const rootRect = ref({ x: 0, y: 0, width: 0, height: 0 })
const measure = () => {
  const rect = root.value?.getBoundingClientRect()
  if (rect) rootRect.value = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

// The map's outlines exactly as drawn — whatever LOD tier the base map shows.
// The observer catches the HD tier landing after we snapshot.
const paths = shallowRef(new Map<string, string>())
const snapshot = () => {
  const next = new Map<string, string>()
  for (const path of document.querySelectorAll<SVGPathElement>('.game-map path[data-id]')) {
    next.set(path.id, path.getAttribute('d') ?? '')
  }
  paths.value = next
}
const pathFor = (code: MapCode) => paths.value.get(code) ?? MAP_PATHS[code]

let observer: MutationObserver | undefined
let resizeObserver: ResizeObserver | undefined
let pending: number | undefined
onMounted(() => {
  measure()
  snapshot()
  resizeObserver = new ResizeObserver(measure)
  if (root.value) resizeObserver.observe(root.value)
  window.addEventListener('resize', measure)
  place()
  const layer = document.querySelector('#map-world-layer')
  if (!layer) return
  observer = new MutationObserver(() => {
    pending ??= requestAnimationFrame(() => {
      pending = undefined
      snapshot()
    })
  })
  observer.observe(layer, { subtree: true, attributes: true, attributeFilter: ['d'] })
})
onBeforeUnmount(() => {
  observer?.disconnect()
  resizeObserver?.disconnect()
  window.removeEventListener('resize', measure)
  if (pending) cancelAnimationFrame(pending)
  stopSweep()
})

const viewport = computed(() => ({ width: rootRect.value.width, height: rootRect.value.height }))
const planeSize = computed(() => veilPlaneSize(viewport.value))
const featherPx = computed(() => viewport.value.width * SUNSET_VEIL_FEATHER)

// The plane's origin sits on the map's vertical centre — the line's midpoint
const originY = computed(() => {
  const rect = mapPaintedRect.value
  return rect ? rect.y + rect.height / 2 - rootRect.value.y : viewport.value.height / 2
})
const planeTop = computed(() => originY.value - planeSize.value.height / 2)

const planeStyle = computed(() => ({
  top: `${planeTop.value}px`,
  width: `${planeSize.value.width}px`,
  height: `${planeSize.value.height}px`,
  '--settle': `${SUNSET_SETTLE_MS}ms`,
  '--bow': `${SUNSET_VEIL_BOW * 100}vw`,
  '--sea-night': `${SEA_OPAQUE_VW * 100}vw`,
}))

const parkedMidPx = () => viewport.value.width * 2
const midPxFor = (dusk: number) => {
  const vb = viewBox.value
  const rect = mapPaintedRect.value
  if (!vb?.w || !rect) return parkedMidPx()
  return veilMidPx(vb, dusk, rect) - rootRect.value.x
}
const sweepElapsed = (sweep: NonNullable<typeof props.sweep>) =>
  Math.min(sweep.duration, Math.max(0, (performance.now() - sweep.startTime) / 1000))

// The transform is written here and by the animations only — never bound in
// the template, where every patch would reset it under a running animation
const place = () => {
  if (!plane.value || !inverse.value) return
  const midPx = props.settled
    ? settledMidPx(viewport.value)
    : props.sweep
      ? midPxFor(props.sweep.duskAt(sweepElapsed(props.sweep)))
      : parkedMidPx()
  const { plane: planeTransform, inverse: inverseTransform } = veilTransforms(midPx)
  plane.value.style.transform = planeTransform
  inverse.value.style.transform = inverseTransform
}

let animations: Animation[] = []
const stopSweep = () => {
  for (const animation of animations) animation.cancel()
  animations = []
}

const playSweep = () => {
  stopSweep()
  const sweep = props.sweep
  if (!sweep || props.settled || !plane.value || !inverse.value) return
  const frames = veilKeyframes(elapsed => midPxFor(sweep.duskAt(elapsed)), sweep.duration)
  const timing: KeyframeAnimationOptions = { duration: sweep.duration * 1000, fill: 'forwards' }
  animations = [
    plane.value.animate(frames.plane, timing),
    inverse.value.animate(frames.inverse, timing),
  ]
  // One start time on the document timeline — the clock the view grades by
  for (const animation of animations) animation.startTime = sweep.startTime
}

watch(
  [() => props.sweep, viewport, mapPaintedRect, viewBox],
  () => {
    if (props.settled) return place()
    if (props.sweep) return playSweep()
    place()
  },
  { flush: 'post' }
)

watch(
  () => props.settled,
  settled => {
    if (!settled || !plane.value) return
    // Hold the night where it stands, then let the transition carry it home
    const from = veilTransforms(
      props.sweep ? midPxFor(props.sweep.duskAt(sweepElapsed(props.sweep))) : parkedMidPx()
    )
    stopSweep()
    plane.value.style.transform = from.plane
    inverse.value!.style.transform = from.inverse
    void getComputedStyle(plane.value).transform
    place()
  },
  { flush: 'post' }
)

const viewBoxAttr = computed(() => {
  const vb = viewBox.value
  return vb ? `${vb.x} ${vb.y} ${vb.w} ${vb.h}` : undefined
})
/** A screen box as inline placement inside the counter-transformed frame. */
const placed = (box: { x: number; y: number; width: number; height: number }, top: number) => ({
  left: `${box.x - rootRect.value.x}px`,
  top: `${box.y - rootRect.value.y - top}px`,
  width: `${box.width}px`,
  height: `${box.height}px`,
})
const landStyle = computed(() => {
  const rect = mapPaintedRect.value
  return rect && viewBox.value?.w ? placed(rect, planeTop.value) : undefined
})
const litStyle = computed(() => {
  const rect = mapPaintedRect.value
  return rect && viewBox.value?.w ? placed(rect, 0) : undefined
})

// Every shape the camera can see, lit ones included: the lit layer paints
// over them opaquely, and dropping one would re-raster this whole layer on
// every guess — the cost this overlay exists to avoid. The svg itself waits
// for the sweep, so the camera's opening flight, which commits every frame,
// never re-lays-out a plane parked off-screen.
const landCodes = computed(() => (viewBox.value?.w ? veilCodes(viewBox.value) : []))

const fieldSet = computed(() => new Set<string>(props.field))
const outsideCodes = computed(() => landCodes.value.filter(code => !fieldSet.value.has(code)))

// The world past the window is dusk from the moment the sweep is set — the
// camera is still by then, so the layer rasters once
const pool = computed(() => {
  const vb = viewBox.value
  const rect = mapPaintedRect.value
  return props.sweep && vb?.w && rect ? twilightPool(vb, props.frame, rect) : undefined
})
const twilightStyle = computed(() => {
  if (!pool.value) return undefined
  const { cx, cy, rx, ry } = pool.value
  const mask = `radial-gradient(${rx}px ${ry}px at ${cx - rootRect.value.x}px ${cy - rootRect.value.y}px, transparent ${SUNSET_POOL_CLEAR * 100}%, #000 100%)`
  return { maskImage: mask, WebkitMaskImage: mask }
})
</script>
<style lang="scss" scoped>
.sunset-veil {
  inset: 0;
  overflow: hidden;
  position: absolute;
  pointer-events: none;
}

.dusk {
  inset: 0;
  position: absolute;
  animation: fade-in 1.2s var(--ease-smooth) both;
  will-change: opacity;
}

.twilight {
  inset: 0;
  position: absolute;
  background: hsla(216, 50%, 7%, 0.82);
}

.outside path {
  fill: var(--night-land);
  stroke: var(--night-stroke);
  stroke-width: 1.1px;
  vector-effect: non-scaling-stroke;
}

// The night's plane: left edge on the terminator, origin at the line's
// midpoint so the tilt pivots there. Oversized past the viewport so the tilt
// never swings a corner into view (lib/sunset-veil sizes it).
.plane {
  left: 0;
  overflow: hidden;
  position: absolute;
  transform-origin: left center;
  border-radius: var(--bow) 0 0 var(--bow) / 50% 0 0 50%;
  // A burning horizon on the water: gold into rose into night
  background: linear-gradient(
    90deg,
    hsla(35, 95%, 62%, 0) 0,
    hsla(35, 95%, 58%, 0.55) 2vw,
    hsla(2, 65%, 45%, 0.55) 8vw,
    hsla(216, 50%, 7%, 0.85) 20vw,
    var(--night-page) var(--sea-night)
  );
  will-change: transform;
}

.night-land {
  inset: 0;
  position: absolute;
  mask-image: linear-gradient(90deg, transparent 0, #000 var(--feather));
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 var(--feather));
}

// The plane's exact inverse: everything inside stays pinned to the map
.inverse {
  inset: 0;
  position: absolute;
  transform-origin: left center;
  will-change: transform;
}

.settled {
  .plane,
  .inverse {
    transition: transform var(--settle) var(--ease-smooth);
  }

  .band {
    opacity: 0;
  }
}

// The visible front: a short golden lead, the afterglow tail over the land
// the line just crossed, then the night itself rolling in behind
.band {
  inset: 0;
  position: absolute;
  background: linear-gradient(
    90deg,
    hsla(35, 95%, 62%, 0) 0,
    hsla(42, 98%, 70%, 0.6) 4vw,
    hsla(30, 92%, 58%, 0.4) 7vw,
    hsla(12, 75%, 48%, 0.35) 12vw,
    hsla(340, 55%, 35%, 0.4) 20vw,
    hsla(216, 50%, 7%, 0.68) 34vw,
    hsla(216, 50%, 7%, 0.85) 64vw
  );
  transition: opacity var(--settle) var(--ease-smooth);
}

svg {
  display: block;
  position: absolute;
  overflow: visible;
}

.land path {
  fill: var(--night-land);
  stroke: var(--night-stroke);
  stroke-width: 1.1px;
  vector-effect: non-scaling-stroke;
}

// Breathes on opacity alone, on its own layer: the outline rasters once per
// turn of the night, never per frame
.next {
  will-change: opacity;
  animation: next-breath 1.4s ease-in-out infinite alternate;

  path {
    fill: hsla(45, 96%, 72%, 0.22);
    stroke: var(--night-amber);
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
  }
}

@keyframes next-breath {
  from {
    opacity: 0.45;
  }

  to {
    opacity: 1;
  }
}

// A named country holds the light above the night, flaring once as it
// ignites. The glow is a filter on the lit group: this layer only re-rasters
// when a guess lands, so the blur is paid per guess, never per frame.
.lit g {
  filter: drop-shadow(0 0 0.5rem hsla(45, 96%, 65%, 0.75));
  animation: sunset-ignite 0.7s var(--ease-smooth);

  path {
    fill: hsl(45, 90%, 74%);
    stroke: hsla(38, 90%, 42%, 0.9);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }
}

@keyframes sunset-ignite {
  from {
    filter: drop-shadow(0 0 1.6rem hsla(45, 96%, 62%, 1));
  }
}

@media (prefers-reduced-motion: reduce) {
  .lit g,
  .next,
  .dusk {
    animation: none;
  }
}
</style>
