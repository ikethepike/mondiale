<template>
  <div ref="root" class="sunset-veil" :class="{ settled }" aria-hidden="true">
    <div class="plane" :style="planeStyle">
      <div class="night-land" :style="{ '--feather': `${featherPx}px` }">
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
        <path :d="pathFor(code)" />
      </g>
    </svg>
  </div>
</template>
<script lang="ts" setup>
import { MAP_PATHS, type MapCode } from '~~/data/map.gen'
import {
  settledMidPx,
  SUNSET_SETTLE_MS,
  SUNSET_VEIL_FEATHER,
  veilCodes,
  veilMidPx,
  veilPlaneSize,
  veilTransforms,
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
 * Lit countries paint on their own layer above everything; their glow is a
 * filter on that layer, which only re-rasters when a guess lands.
 */
const props = defineProps<{
  /** The terminator in map-space dusk coordinates; undefined parks the night off-screen east. */
  dusk?: number
  lit: readonly ISOCountryCode[]
  settled: boolean
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
  mask-image: linear-gradient(90deg, transparent 0, #000 var(--feather));
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 var(--feather));
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

.land path {
  fill: var(--night-land);
  stroke: var(--night-stroke);
  stroke-width: 1.1px;
  vector-effect: non-scaling-stroke;
}

// A named country holds the light above the night, flaring once as it
// ignites. The glow is a filter on the lit group: this layer only re-rasters
// when a guess lands, so the blur is paid per guess, never per frame.
.lit g {
  filter: drop-shadow(0 0 0.5rem hsla(45, 96%, 65%, 0.75));
  animation: sunset-ignite 0.7s var(--ease-smooth);

  path {
    fill: hsla(45, 90%, 74%, 0.95);
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
  .lit g {
    animation: none;
  }
}
</style>
