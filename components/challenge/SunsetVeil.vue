<template>
  <div ref="root" class="sunset-veil" :class="{ settled }" aria-hidden="true">
    <div class="plane" :style="planeStyle">
      <div class="night-land" :class="roll" :style="{ '--feather': `${featherPx}px` }">
        <div class="inverse" :style="inverseStyle">
          <svg
            v-if="landStyle"
            class="land"
            :viewBox="viewBoxAttr"
            preserveAspectRatio="none"
            :style="landStyle"
          >
            <path v-for="code in landCodes" :key="code" :data-id="code" :d="pathFor(code)" />
          </svg>
        </div>
      </div>
      <div v-if="roll === 'timed'" class="inverse" :style="inverseStyle">
        <svg
          v-if="landStyle"
          class="land"
          :viewBox="viewBoxAttr"
          preserveAspectRatio="none"
          :style="landStyle"
        >
          <path v-for="code in settledCodes" :key="code" :data-id="code" :d="pathFor(code)" />
        </svg>
        <template v-for="beat in dusks" :key="beat.code">
          <svg
            class="dusk amber"
            :viewBox="beat.viewBox"
            preserveAspectRatio="none"
            :style="beat.style"
          >
            <path :d="pathFor(beat.code)" />
          </svg>
          <svg
            class="dusk night"
            :viewBox="beat.viewBox"
            preserveAspectRatio="none"
            :style="beat.style"
            @animationend="settle(beat.code)"
          >
            <path :d="pathFor(beat.code)" />
          </svg>
        </template>
      </div>
      <div class="band" />
    </div>
    <svg
      v-if="litStyle && lit.length"
      class="lit"
      :viewBox="viewBoxAttr"
      preserveAspectRatio="none"
      :style="litStyle"
    >
      <g v-for="code in lit" :key="code" :data-id="code">
        <path class="halo" :d="pathFor(code)" />
        <path class="body" :d="pathFor(code)" />
      </g>
    </svg>
  </div>
</template>
<script lang="ts" setup>
import { MAP_PATHS, type MapCode } from '~~/data/map.gen'
import {
  boxToScreen,
  duskWestCoordinate,
  settledMidPx,
  SUNSET_DUSK_MS,
  SUNSET_SETTLE_MS,
  SUNSET_VEIL_FEATHER,
  veilCodes,
  veilMidPx,
  veilPlaneSize,
  veilTransforms,
  visibleRegionBox,
} from '~~/lib/sunset-veil'
import { mapPaintedRect, useMapViewBox } from '~~/lib/use-map-viewbox'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Sunset Blitz's night: ONE moving plane (the sea's gradient, the darkened
 * land, the terminator's glow) driven by a single compositor transform. The
 * land is a static svg of the map's own outlines, counter-transformed inside
 * the plane so it stays pinned to the map while the plane's mask reveals it
 * behind the line — the base map is never touched, so it rasters once.
 *
 * `roll` picks how land darkens: `spatial` (the mask's feather is the whole
 * dusk) or `timed` (each country runs its own amber→night beat once the line
 * clears its western edge, as two composited fades, with the masked land as
 * a floor where the sea is already full night). Lit countries paint on their
 * own layer above everything.
 */
export type SunsetRoll = 'spatial' | 'timed'

const props = defineProps<{
  /** The terminator in map-space dusk coordinates; undefined parks the night off-screen east. */
  dusk?: number
  lit: readonly ISOCountryCode[]
  settled: boolean
  roll: SunsetRoll
}>()

const root = ref<HTMLElement>()
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
})

const viewport = computed(() => ({ width: rootRect.value.width, height: rootRect.value.height }))
const plane = computed(() => veilPlaneSize(viewport.value))
const featherPx = computed(() => viewport.value.width * SUNSET_VEIL_FEATHER)

// The plane's origin sits on the map's vertical centre — the line's midpoint
const originY = computed(() => {
  const rect = mapPaintedRect.value
  return rect ? rect.y + rect.height / 2 - rootRect.value.y : viewport.value.height / 2
})
const planeTop = computed(() => originY.value - plane.value.height / 2)

const midPx = computed(() => {
  const vb = viewBox.value
  const rect = mapPaintedRect.value
  if (props.settled) return settledMidPx(viewport.value)
  if (props.dusk === undefined || !vb?.w || !rect) return viewport.value.width * 2
  return veilMidPx(vb, props.dusk, rect) - rootRect.value.x
})
const transforms = computed(() => veilTransforms(midPx.value))
const planeStyle = computed(() => ({
  top: `${planeTop.value}px`,
  width: `${plane.value.width}px`,
  height: `${plane.value.height}px`,
  transform: transforms.value.plane,
  '--settle': `${SUNSET_SETTLE_MS}ms`,
  '--dusk': `${SUNSET_DUSK_MS}ms`,
}))
const inverseStyle = computed(() => ({ transform: transforms.value.inverse }))

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

const litSet = computed(() => new Set<string>(props.lit))
const onScreen = computed(() => (viewBox.value?.w ? veilCodes(viewBox.value) : []))

// --- The timed roll: each country's own dusk ---------------------------------
const started = new Set<MapCode>()
const dusks = ref<{ code: MapCode; viewBox: string; style: Record<string, string> }[]>([])
const settledCodes = ref(new Set<MapCode>())

const settle = (code: MapCode) => {
  dusks.value = dusks.value.filter(dusk => dusk.code !== code)
  if (!litSet.value.has(code)) settledCodes.value.add(code)
}

watch(
  () => [props.dusk, props.settled, onScreen.value] as const,
  ([dusk, settled]) => {
    if (props.roll !== 'timed') return
    const vb = viewBox.value
    const rect = mapPaintedRect.value
    if (!vb?.w || !rect) return
    for (const code of onScreen.value) {
      if (started.has(code) || litSet.value.has(code)) continue
      if (settled) {
        started.add(code)
        settledCodes.value.add(code)
        continue
      }
      if (dusk === undefined || duskWestCoordinate(code) < dusk) continue
      started.add(code)
      const box = visibleRegionBox(code, vb)
      dusks.value.push({
        code,
        viewBox: box.join(' '),
        style: placed(boxToScreen(box, vb, rect), planeTop.value),
      })
    }
  },
  { immediate: true }
)

// A country lit mid-dusk (typed while its tail was still in the day) leaves
// the night's layers at once
watch(litSet, lit => {
  for (const code of lit) {
    settledCodes.value.delete(code as MapCode)
    started.add(code as MapCode)
  }
  dusks.value = dusks.value.filter(dusk => !lit.has(dusk.code))
})

const landCodes = computed(() => onScreen.value.filter(code => !litSet.value.has(code)))
</script>
<style lang="scss" scoped>
.sunset-veil {
  inset: 0;
  overflow: hidden;
  position: absolute;
  pointer-events: none;
}

// The night's plane: left edge on the terminator, origin at the line's
// midpoint so the tilt pivots there. Oversized past the viewport so the tilt
// never swings a corner into view (lib/sunset-veil sizes it).
.plane {
  left: 0;
  overflow: hidden;
  position: absolute;
  transform-origin: left center;
  border-radius: 5vw 0 0 5vw / 50% 0 0 50%;
  // A burning horizon on the water: gold into rose into night
  background: linear-gradient(
    90deg,
    hsla(35, 95%, 62%, 0) 0,
    hsla(35, 95%, 58%, 0.55) 2vw,
    hsla(2, 65%, 45%, 0.55) 8vw,
    hsla(216, 50%, 7%, 0.85) 20vw,
    var(--night-page) 38vw
  );
  transition: transform 0.12s linear;
  will-change: transform;
}

.night-land {
  inset: 0;
  position: absolute;

  &.spatial {
    mask-image: linear-gradient(90deg, transparent 0, #000 var(--feather));
    -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 var(--feather));
  }

  // The timed roll's floor: where the sea has gone full night, so has every
  // shape under it — a giant whose western edge the line has yet to clear
  // can't sit unseen under the plane
  &.timed {
    mask-image: linear-gradient(90deg, transparent 34vw, #000 38vw);
    -webkit-mask-image: linear-gradient(90deg, transparent 34vw, #000 38vw);
  }
}

// The plane's exact inverse: everything inside stays pinned to the map
.inverse {
  inset: 0;
  position: absolute;
  transform-origin: left center;
  transition: transform 0.12s linear;
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

.land path,
.dusk.night path {
  fill: var(--night-land);
  stroke: var(--night-stroke);
  stroke-width: 1.1px;
  vector-effect: non-scaling-stroke;
}

.dusk.amber path {
  fill: hsl(30, 62%, 60%);
  stroke: hsla(30, 62%, 40%, 0.6);
  stroke-width: 1.1px;
  vector-effect: non-scaling-stroke;
}

// A country's own dusk, as two composited fades: amber blooms and passes,
// the night rises under it
.dusk {
  opacity: 0;
  will-change: opacity;

  &.amber {
    animation: dusk-amber var(--dusk) var(--ease-smooth) forwards;
  }

  &.night {
    animation: dusk-night var(--dusk) var(--ease-smooth) forwards;
  }
}

@keyframes dusk-amber {
  0% {
    opacity: 0;
  }
  18% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes dusk-night {
  0%,
  18% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

// A named country holds the light above the night: a warm fill in a soft
// halo, flaring once as it ignites
.lit {
  .halo {
    fill: none;
    stroke: hsla(45, 96%, 65%, 0.45);
    stroke-width: 10px;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    animation: sunset-ignite 0.7s var(--ease-smooth);
  }

  .body {
    fill: hsla(45, 90%, 74%, 0.95);
    stroke: hsla(38, 90%, 42%, 0.9);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }
}

@keyframes sunset-ignite {
  from {
    stroke: hsla(45, 96%, 62%, 1);
    stroke-width: 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lit .halo {
    animation: none;
  }

  .dusk.amber {
    animation: none;
  }

  .dusk.night {
    animation-duration: 0.01s;
  }
}
</style>
