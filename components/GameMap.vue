<template>
  <div ref="wrapper" :class="[`game-map`, status, { solo, 'show-labels': labels }]">
    <!--
      Pan/zoom is viewBox-native (see the camera section in the script):
      repainting one viewport's worth of culled base-tier geometry per frame
      is cheaper and sharper than CSS-transform-scaling a giant raster layer,
      which forces endless tile re-rasterization at map scale.
    -->
    <svg
      ref="svg"
      version="1.1"
      viewBox="0 0 2000 1001"
      preserveAspectRatio="xMidYMid slice"
      style="stroke-linejoin: round; stroke: currentColor; fill: none"
      :class="{ 'has-highlights': highlights.length > 0 }"
    >
      <!--
        Client-only: serializing ~300KB of path data into the SSR payload and
        hydrating 220 heavy attributes costs more than the map appearing one
        tick after mount (it sits behind the lobby on first paint anyway).
      -->
      <template v-if="mountedMap">
        <path
          v-for="(d, code) in MAP_PATHS"
          :id="code"
          :key="code"
          :style="{ fill: countryColors[code], '--stroke-base': strokeWidths[code] }"
          :class="{ 'highlighted-country': highlights.includes(code) }"
          :data-id="code"
          :d="d"
          @click="handleClick(code)"
        />
      <!--
        Micro-states (Vatican, Monaco…) are sub-pixel at world zoom; the dot is
        their click target and disappears once the real shape becomes legible.
        No id attribute — path#ISO must keep resolving to the true geometry.
        Visibility is toggled with direct DOM writes (not reactive state) so
        wheel/camera zoom never forces a re-render of the 220 country paths.
      -->
      <!-- Invisible tap halos: micro-states get ~14px of click slop at any zoom -->
      <circle
        v-for="(spot, code) in MICRO_COUNTRIES"
        :key="`hit-${code}`"
        class="micro-hit"
        :data-id="code"
        :cx="spot?.x"
        :cy="spot?.y"
        r="12"
        @click="handleClick(code)"
      />
      <circle
        v-for="(spot, code) in MICRO_COUNTRIES"
        :key="`dot-${code}`"
        class="micro-marker"
        :style="{ fill: countryColors[code] }"
        :class="{ 'highlighted-country': highlights.includes(code) }"
        :data-id="code"
        :data-footprint="spot?.footprint"
        :cx="spot?.x"
        :cy="spot?.y"
        r="3.5"
        @click="handleClick(code)"
      />
      <!-- Physical-geography overlay: rivers draw themselves in as lines,
           seas/lakes/ranges wash in as soft areas (water game modes) -->
      <path
        v-if="feature"
        ref="featureEl"
        :key="feature.d.slice(0, 40)"
        class="map-feature"
        :class="feature.kind"
        :d="feature.d"
      />
      </template>
    </svg>
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import { MAP_PATHS, MAP_BOUNDS, MAP_REGIONS, MICRO_COUNTRIES, type MapCode } from '~~/data/map.gen'
import { prefersReducedMotion } from '~~/lib/motion'
import { type MapTint, useGameStore } from '~~/store/game.store'
import type { MapClickEvent } from '~~/types/events.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { CountryColorGrouping, MapFeatureOverlay } from '~~/types/map.type'

// Micro-territories (Hong Kong, Singapore, Andorra…) are smaller than the
// 1-unit stroke itself at world zoom, so they'd render as solid ink blobs.
// Their stroke is capped to their own footprint (--stroke-base); the actual
// width also shrinks with zoom (--stroke-zoom) so coastlines stay hairlines
// instead of ink rivers when zoomed in. Both combine in CSS via min().
const strokeWidths: Partial<Record<string, string>> = {}
for (const [code, [, , width, height]] of Object.entries(MAP_BOUNDS)) {
  const footprint = Math.max(width, height)
  if (footprint > 0 && footprint < 8) strokeWidths[code] = String(Math.max(0.2, footprint / 8))
}

const props = defineProps({
  highlighted: {
    type: Array as PropType<Array<ISOCountryCode | string>>,
    default: () => [],
  },
  status: {
    type: String as PropType<'correct' | 'incorrect'>,
    default: undefined,
  },
  highlightCountry: {
    type: String as PropType<ISOCountryCode>,
    default: undefined,
  },
  countryGroupings: {
    type: Array as PropType<CountryColorGrouping[]>,
    default: undefined,
  },
  /** Shapes-only: countries without an inline fill disappear entirely. */
  solo: {
    type: Boolean,
    default: false,
  },
  /** Show ISO acronym labels over countries. */
  labels: {
    type: Boolean,
    default: false,
  },
  /** Animate the viewBox to frame these countries together. */
  focusCountries: {
    type: Array as PropType<ISOCountryCode[]>,
    default: () => [],
  },
  /**
   * Countries whose CENTERS the frame should include — context around the
   * focus without letting a giant neighbour (Russia…) blow the shot out to
   * half the planet the way a full bbox would.
   */
  focusContext: {
    type: Array as PropType<ISOCountryCode[]>,
    default: () => [],
  },
  /** Soft verdict fills for traversal guesses. */
  tints: {
    type: Object as PropType<{ [isoCode in ISOCountryCode]?: MapTint }>,
    default: () => ({}),
  },
  /** Physical-geography overlay (rivers, seas, ranges) for the water modes. */
  feature: {
    type: Object as PropType<MapFeatureOverlay>,
    default: undefined,
  },
})

// Deliberately soft washes — feedback, not verdict-shouting
const TINT_COLORS: { [tint in MapTint]: string } = {
  optimal: 'hsla(170.5, 34.7%, 55.1%, 0.65)',
  inefficient: 'hsla(29.7, 79.9%, 66.7%, 0.6)',
  stray: 'hsla(9.8, 81.3%, 60.2%, 0.42)',
  endpoint: 'hsla(215.7, 76.4%, 31.6%, 0.45)',
}

const countryColors = computed(() => {
  const outputVector: { [isoCode in ISOCountryCode | string]: string } = {}

  if (props.countryGroupings) {
    for (const { countries, color } of props.countryGroupings) {
      for (const country of countries) {
        outputVector[country] = color
      }
    }
  }

  for (const [isoCode, tint] of Object.entries(props.tints)) {
    if (tint) outputVector[isoCode] = TINT_COLORS[tint]
  }

  return outputVector
})

const clicked = ref<ISOCountryCode | undefined>(undefined)
const highlights = computed(() =>
  [...props.highlighted, props.highlightCountry, clicked.value].filter(Boolean)
)

// --- Camera: one viewBox drives everything ----------------------------------
// Gestures and reveal tweens all write the viewBox directly, repainting one
// viewport's worth of culled base-tier geometry per frame — measured well
// under a frame budget even CPU-throttled. The alternative (CSS-transform
// zoom of a cached raster layer) breaks down at map scale: the browser
// endlessly re-rasterizes tiles of a giant layer, which reads as shimmer and
// stutter. Nothing here is reactive — Vue must never diff 220 paths a frame.
const WORLD_VIEW = { x: 0, y: 0, width: 2000, height: 1001 }
const MAX_ZOOM = 40
/**
 * The viewBox is kept at the SCREEN's aspect ratio, not the world's, and the
 * svg fills the viewport — so the map is edge-to-edge on any window and
 * "running out of world" shows coastlines, never a straight clip line.
 */
let viewAspect = WORLD_VIEW.width / WORLD_VIEW.height
/** What is rendered right now. (Synced to worldFitView() once measurable.) */
const viewState = { ...WORLD_VIEW }
/** Where gestures want the camera — viewState eases toward it every frame. */
const targetView = { ...WORLD_VIEW }

const measureViewAspect = () => {
  const rect = svg.value?.getBoundingClientRect()
  if (rect?.width && rect.height) viewAspect = rect.width / rect.height
}

/** The fully-zoomed-out camera: full world width, vertically centered. */
const worldFitView = () => {
  const height = WORLD_VIEW.width / viewAspect
  return {
    x: 0,
    y: WORLD_VIEW.height / 2 - height / 2,
    width: WORLD_VIEW.width,
    height,
  }
}

const writeViewBox = () => {
  svg.value?.setAttribute(
    'viewBox',
    `${viewState.x} ${viewState.y} ${viewState.width} ${viewState.height}`
  )
}

const clampView = (view: typeof WORLD_VIEW) => {
  view.width = Math.min(WORLD_VIEW.width, Math.max(WORLD_VIEW.width / MAX_ZOOM, view.width))
  view.height = view.width / viewAspect
  view.x = Math.min(WORLD_VIEW.width - view.width, Math.max(0, view.x))

  // Vertical headroom: at a world-fit (wide-screen) zoom the strict [0, world-
  // height] clamp leaves almost no room to pan, pinning the far north (Belarus,
  // Scandinavia) and far south to the screen edges — right under the overlay
  // cards, so they can't be reached or clicked. Allow panning ~40% of the
  // view's height past the world edges so the whole map can slide down (north
  // into the clear centre) or up. The overshoot only ever reveals the parchment
  // background, never a hard clip line, so usability is unharmed.
  if (view.height >= WORLD_VIEW.height) {
    // View taller than the world — centre it, plus the same slack either way.
    view.y = WORLD_VIEW.height / 2 - view.height / 2
  } else {
    const margin = view.height * 0.4
    view.y = Math.min(WORLD_VIEW.height - view.height + margin, Math.max(-margin, view.y))
  }
}

const tweenToView = (target: typeof WORLD_VIEW) => {
  // The reveal camera owns the shot: halt any gesture glide first.
  loopRunning = false
  momentum.x = 0
  momentum.y = 0
  // Suspend hover/transitions for the duration — same as manual gestures.
  wrapper.value?.classList.add('is-interacting')
  gsap.to(viewState, {
    ...target,
    duration: prefersReducedMotion() ? 0 : 1.1,
    ease: 'power2.inOut',
    overwrite: 'auto',
    onUpdate: () => {
      writeViewBox()
      cullPass()
    },
    onComplete: () => {
      Object.assign(targetView, viewState)
      wrapper.value?.classList.remove('is-interacting')
      updateEffectiveZoom()
    },
  })
}

/** Aspect-corrected, padded frame around boxes (and center points of others). */
const frameForBoxes = (
  boxes: [number, number, number, number][],
  centers: [number, number, number, number][]
) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y, width, height] of boxes) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + width)
    maxY = Math.max(maxY, y + height)
  }
  for (const [x, y, width, height] of centers) {
    minX = Math.min(minX, x + width / 2)
    minY = Math.min(minY, y + height / 2)
    maxX = Math.max(maxX, x + width / 2)
    maxY = Math.max(maxY, y + height / 2)
  }
  if (minX === Infinity) return worldFitView()

  const pad = Math.max((maxX - minX) * 0.35, (maxY - minY) * 0.35, 60)
  let x = minX - pad
  let y = minY - pad
  let width = maxX - minX + pad * 2
  let height = maxY - minY + pad * 2

  // Keep the world's aspect ratio so shapes never distort
  if (width / height > viewAspect) {
    const grow = width / viewAspect - height
    y -= grow / 2
    height += grow
  } else {
    const grow = height * viewAspect - width
    x -= grow / 2
    width += grow
  }
  return { x, y, width, height }
}

const frameFocus = () => {
  if (!svg.value) return

  // The camera may fly anywhere — everything must be drawable on arrival.
  uncullAll()

  const boxes = [
    ...props.focusCountries.map(isoCode => MAP_BOUNDS[isoCode]).filter(Boolean),
    ...(props.feature?.bounds ? [props.feature.bounds] : []),
  ]
  const target = boxes.length
    ? frameForBoxes(
        boxes,
        props.focusContext.map(isoCode => MAP_BOUNDS[isoCode]).filter(Boolean)
      )
    : worldFitView()
  tweenToView(target)
}

watch(
  () => [props.focusCountries, props.focusContext, props.feature],
  () => nextTick(frameFocus)
)

// --- Feature overlay draw-in ------------------------------------------------
const featureEl = ref<SVGPathElement>()

// A stray tap mid-round would leave a country glowing under the feature —
// the tap-to-highlight state belongs to find mode, not the water modes
watch(
  () => props.feature,
  () => (clicked.value = undefined)
)
watch(
  () => [props.feature, featureEl.value] as const,
  ([feature, element]) => {
    if (!feature || !element || feature.kind !== 'line') return
    // Rivers pipe in over a couple of seconds — real-length dash units, the
    // pathLength trick breaks under px-valued writes (see ViewSilhouette)
    const length = element.getTotalLength()
    element.style.strokeDasharray = `${length}`
    element.style.strokeDashoffset = prefersReducedMotion() ? '0' : `${length}`
    element.style.transition = 'none'
    requestAnimationFrame(() => {
      element.style.transition = 'stroke-dashoffset 2.6s ease-out'
      element.style.strokeDashoffset = '0'
    })
  },
  { flush: 'post' }
)

// --- ISO acronym labels (easy-mode traversal aid), built once on demand ----
let labelsBuilt = false
const ensureLabels = () => {
  if (labelsBuilt || !svg.value) return

  const namespace = 'http://www.w3.org/2000/svg'
  for (const [code, [x, y, width, height]] of Object.entries(MAP_BOUNDS)) {
    // Microstates can't fit a readable label — skip the clutter
    if (width < 14 && height < 14) continue

    const label = document.createElementNS(namespace, 'text')
    label.textContent = code
    label.setAttribute('x', String(x + width / 2))
    label.setAttribute('y', String(y + height / 2))
    label.classList.add('country-label')
    svg.value.appendChild(label)
  }
  labelsBuilt = true
}

watch(
  () => props.labels,
  value => {
    if (value) nextTick(ensureLabels)
  }
)

const emit = defineEmits(['countryClick'])

const svg = ref<SVGElement>()
const wrapper = ref<HTMLElement>()

const handleClick = (isoCode: string) => {
  emit('countryClick', isoCode)
  const mapClickEvent: MapClickEvent = new CustomEvent('mapClick', {
    detail: { isoCode },
  })
  document.dispatchEvent(mapClickEvent)
}

// --- Micro-state dot markers ------------------------------------------------
// A dot stands in for a country until its true geometry would be legible on
// screen; the Vatican-class specks keep their dot at any reachable zoom.
// Deliberately NOT reactive: zoom changes every frame during tweens and wheel
// zoom, and routing that through refs would re-render every country path.
const LEGIBLE_FOOTPRINT_PX = 8

// Runs at gesture/tween settle: stroke, dot and LOD updates change raster
// CONTENT, which is worth exactly one repaint — never one per motion frame.
/** ~44px tap diameter — finger-sized, per platform guidelines. */
const HIT_SLOP_PX = 22
/** Past this zoom the halo renders as a visible ring marking the tap area. */
const RING_ZOOM = 4

const updateEffectiveZoom = () => {
  if (!wrapper.value || !svg.value) return
  const effectiveZoom = WORLD_VIEW.width / viewState.width
  const pxPerUnit = svg.value.getBoundingClientRect().width / viewState.width
  svg.value.classList.toggle('deep-zoom', effectiveZoom >= RING_ZOOM)
  svg.value.style.setProperty('--stroke-zoom', String(1 / Math.max(1, effectiveZoom)))
  const dotRadius = 3.5 / Math.max(1, effectiveZoom)
  svg.value.querySelectorAll<SVGCircleElement>('.micro-marker').forEach(dot => {
    const footprint = Number(dot.dataset.footprint) || 0
    dot.style.display = footprint * effectiveZoom < LEGIBLE_FOOTPRINT_PX ? '' : 'none'
    dot.setAttribute('r', String(dotRadius))
  })
  // Tap halos keep a constant on-screen slop no matter the zoom
  svg.value.querySelectorAll<SVGCircleElement>('.micro-hit').forEach(halo => {
    halo.setAttribute('r', String(dotRadius + HIT_SLOP_PX / Math.max(1, pxPerUnit)))
  })
  applyLod(effectiveZoom)
}

// --- Level of detail & viewport culling --------------------------------------
// Runs only at settle. Visibility is judged per RING box (MAP_REGIONS), not
// the whole-country bbox — RU/US antimeridian fragments stretch their bbox
// across the map and would drag their huge HD geometry into every view.
// Countries far outside the view are display:none'd entirely so the raster
// and hit-test workload tracks what is on screen, not the whole planet.
// All of it is direct d/display writes: Vue's vnode diff never sees them.
const LOD_ZOOM_IN = 3
const LOD_ZOOM_OUT = 2.4
const CULL_ZOOM = 2
/** Cull margin in viewports, so small pans don't reveal blanked countries. */
const CULL_MARGIN = 1
let hdPaths: Record<string, string> | undefined
let hdLoading = false
const hdApplied = new Set<string>()
const culled = new Set<string>()

const loadHdTier = () => {
  if (hdPaths || hdLoading) return
  hdLoading = true
  import('~~/data/map-hd.gen').then(module => {
    hdPaths = module.MAP_PATHS_HD
    updateEffectiveZoom()
  })
}

/** Cached path elements — 220 querySelector calls per frame add up. */
const pathEls = new Map<string, SVGPathElement>()
const cachePathEls = () => {
  pathEls.clear()
  svg.value?.querySelectorAll<SVGPathElement>('path[data-id]').forEach(path => {
    pathEls.set(path.id, path)
  })
}

const intersectsAnyRegion = (
  code: string,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  for (const [rx, ry, rw, rh] of MAP_REGIONS[code as MapCode] ?? []) {
    if (rx < x + width && rx + rw > x && ry < y + height && ry + rh > y) return true
  }
  return false
}

/** Show every country again — reveals/fly-ins must never target a culled path. */
const uncullAll = () => {
  if (!culled.size) return
  for (const code of culled) {
    const path = pathEls.get(code)
    if (path) path.style.display = ''
  }
  culled.clear()
}

/**
 * Cheap enough to run every motion frame (box tests + rare display writes):
 * since motion repaints the viewport anyway, toggling display mid-gesture
 * only changes how much the next frame has to paint.
 */
const cullPass = () => {
  if (WORLD_VIEW.width / viewState.width < CULL_ZOOM) {
    uncullAll()
    return
  }
  const marginX = viewState.width * CULL_MARGIN
  const marginY = viewState.height * CULL_MARGIN
  for (const code of Object.keys(MAP_BOUNDS)) {
    const nearView = intersectsAnyRegion(
      code,
      viewState.x - marginX,
      viewState.y - marginY,
      viewState.width + marginX * 2,
      viewState.height + marginY * 2
    )
    if (nearView !== culled.has(code)) continue
    const path = pathEls.get(code)
    if (!path) continue
    path.style.display = nearView ? '' : 'none'
    if (nearView) culled.delete(code)
    else culled.add(code)
  }
}

const applyLod = (effectiveZoom: number) => {
  if (!svg.value) return
  cullPass()
  if (effectiveZoom >= LOD_ZOOM_IN) loadHdTier()

  if (effectiveZoom < LOD_ZOOM_OUT) {
    for (const code of hdApplied)
      pathEls.get(code)?.setAttribute('d', MAP_PATHS[code as MapCode])
    hdApplied.clear()
    return
  }
  if (!hdPaths || effectiveZoom < LOD_ZOOM_IN) return // hysteresis band: keep as-is

  for (const code of Object.keys(MAP_BOUNDS)) {
    const path = pathEls.get(code)
    if (!path) continue
    // Every un-culled country swaps together: mixing tiers puts differently-
    // simplified copies of a SHARED border side by side, which reads as
    // double borders around small countries (Liechtenstein inside CH/AT).
    // The cull margin means neighbours arrive already-HD when panning.
    const wantHd = !culled.has(code)
    const hasHd = hdApplied.has(code)
    if (wantHd === hasHd) continue
    path.setAttribute('d', wantHd ? hdPaths[code as MapCode] : MAP_PATHS[code as MapCode])
    if (wantHd) hdApplied.add(code)
    else hdApplied.delete(code)
  }
}

// --- Gestures: wheel zoom, drag pan, pinch — all viewBox-native --------------
// rAF-batched writes; hover/fill-transitions suspended while a gesture is
// live (.is-interacting) so pointer churn never triggers extra repaints.
let gestureTimer: ReturnType<typeof setTimeout> | undefined
const beginGesture = () => {
  gsap.killTweensOf(viewState)
  if (!loopRunning) Object.assign(targetView, viewState)
  wrapper.value?.classList.add('is-interacting')
  clearTimeout(gestureTimer)
}
const settleSoon = () => {
  clearTimeout(gestureTimer)
  gestureTimer = setTimeout(() => {
    wrapper.value?.classList.remove('is-interacting')
    updateEffectiveZoom()
  }, 180)
}

// The gesture loop eases the rendered view toward targetView every frame and
// carries pan momentum after release — this is where the "zip" lives. It
// re-arms the settle timer while moving so strokes/LOD/dots update once the
// glide actually ends.
const ZOOM_SMOOTHING = 0.35
const MOMENTUM_DECAY_MS = 260
const momentum = { x: 0, y: 0 } // units per ms
let loopRunning = false
let lastFrameAt = 0

const gestureLoop = (now: number) => {
  if (!loopRunning) return // a reveal tween took the camera over
  const dt = Math.min(48, now - lastFrameAt || 16)
  lastFrameAt = now

  if (Math.hypot(momentum.x, momentum.y) * dt > viewState.width / 4000) {
    targetView.x += momentum.x * dt
    targetView.y += momentum.y * dt
    const decay = Math.exp(-dt / MOMENTUM_DECAY_MS)
    momentum.x *= decay
    momentum.y *= decay
  } else {
    momentum.x = 0
    momentum.y = 0
  }

  clampView(targetView)
  const ease = prefersReducedMotion() ? 1 : ZOOM_SMOOTHING
  viewState.x += (targetView.x - viewState.x) * ease
  viewState.y += (targetView.y - viewState.y) * ease
  viewState.width += (targetView.width - viewState.width) * ease
  viewState.height = viewState.width / viewAspect
  writeViewBox()
  cullPass()

  const converged =
    Math.abs(targetView.width - viewState.width) < viewState.width / 4000 &&
    Math.hypot(targetView.x - viewState.x, targetView.y - viewState.y) < viewState.width / 4000 &&
    !momentum.x &&
    !momentum.y
  if (converged) {
    Object.assign(viewState, targetView)
    writeViewBox()
    loopRunning = false
    settleSoon()
    return
  }
  settleSoon() // keep postponing content updates until the motion ends
  requestAnimationFrame(gestureLoop)
}

const startLoop = () => {
  if (loopRunning) return
  loopRunning = true
  lastFrameAt = 0
  requestAnimationFrame(gestureLoop)
}

/** Pointer position → map units, via live rects (ancestor transforms & all). */
const unitsAt = (clientX: number, clientY: number) => {
  const rect = (svg.value as SVGElement).getBoundingClientRect()
  return {
    x: viewState.x + ((clientX - rect.left) / rect.width) * viewState.width,
    y: viewState.y + ((clientY - rect.top) / rect.height) * viewState.height,
  }
}

/** Retarget the camera so `anchor` (under the cursor) stays put as it zooms. */
const zoomAround = (clientX: number, clientY: number, factor: number) => {
  const anchor = unitsAt(clientX, clientY)
  const width = Math.min(
    WORLD_VIEW.width,
    Math.max(WORLD_VIEW.width / MAX_ZOOM, targetView.width / factor)
  )
  const scale = width / viewState.width
  targetView.x = anchor.x - (anchor.x - viewState.x) * scale
  targetView.y = anchor.y - (anchor.y - viewState.y) * scale
  targetView.width = width
  targetView.height = width / viewAspect
}

const onWheel = (event: WheelEvent) => {
  event.preventDefault()
  beginGesture()
  zoomAround(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0035))
  startLoop()
}

type TrackedPointer = {
  x: number
  y: number
  startX: number
  startY: number
  active: boolean
  velocityX: number
  velocityY: number
  movedAt: number
}
const pointers = new Map<number, TrackedPointer>()
let pinchStart: { distance: number; width: number } | undefined

const onPointerDown = (event: PointerEvent) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  momentum.x = 0
  momentum.y = 0
  pointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    velocityX: 0,
    velocityY: 0,
    movedAt: event.timeStamp,
  })
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), width: targetView.width }
  }
}

const onPointerMove = (event: PointerEvent) => {
  const pointer = pointers.get(event.pointerId)
  if (!pointer) return
  const previous = { x: pointer.x, y: pointer.y, at: pointer.movedAt }
  pointer.x = event.clientX
  pointer.y = event.clientY
  pointer.movedAt = event.timeStamp

  // A few px of jitter must stay a click — only then does the drag begin
  // (and capture the pointer; capturing at pointerdown would retarget the
  // browser's click event away from the country paths).
  if (!pointer.active && pointers.size < 2) {
    if (Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) < 3) return
    pointer.active = true
    try {
      wrapper.value?.setPointerCapture(event.pointerId)
    } catch {
      // synthetic events (tests) have no active pointer to capture
    }
  }

  beginGesture()
  if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()]
    const distance = Math.hypot(a.x - b.x, a.y - b.y)
    if (distance > 0) {
      const pinchWidth = Math.min(
        WORLD_VIEW.width,
        Math.max(WORLD_VIEW.width / MAX_ZOOM, pinchStart.width * (pinchStart.distance / distance))
      )
      zoomAround((a.x + b.x) / 2, (a.y + b.y) / 2, targetView.width / pinchWidth)
    }
  } else if (pointers.size === 1) {
    const rect = (svg.value as SVGElement).getBoundingClientRect()
    const unitsPerPx = viewState.width / rect.width
    targetView.x -= (pointer.x - previous.x) * unitsPerPx
    targetView.y -= (pointer.y - previous.y) * unitsPerPx
    const dt = Math.max(1, pointer.movedAt - previous.at)
    // Blend for a stable read of the release velocity (in units/ms)
    pointer.velocityX = 0.8 * (-(pointer.x - previous.x) * unitsPerPx) / dt + 0.2 * pointer.velocityX
    pointer.velocityY = 0.8 * (-(pointer.y - previous.y) * unitsPerPx) / dt + 0.2 * pointer.velocityY
  }
  startLoop()
}

const onPointerUp = (event: PointerEvent) => {
  const pointer = pointers.get(event.pointerId)
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinchStart = undefined
  if (pointers.size || !pointer) return

  // Fling: carry the release velocity into the gesture loop's momentum,
  // unless the pointer lingered (a hold-then-release shouldn't glide).
  const stale = event.timeStamp - pointer.movedAt > 80
  if (pointer.active && !stale && !prefersReducedMotion()) {
    momentum.x = pointer.velocityX
    momentum.y = pointer.velocityY
    startLoop()
  }
  settleSoon()
}

const mountedMap = ref(false)

onMounted(async () => {
  if (!svg.value || !wrapper.value) {
    console.warn('Unable to instantiate map ref')
    return
  }

  // Render the client-only geometry, then wait for it to exist in the DOM
  // before anything below queries paths or dots.
  mountedMap.value = true
  await nextTick()
  cachePathEls()

  // Adopt the screen's aspect ratio (edgeless full-bleed map) and keep it
  // across window resizes, preserving the camera's center point.
  measureViewAspect()
  Object.assign(viewState, worldFitView())
  Object.assign(targetView, viewState)
  writeViewBox()
  window.addEventListener('resize', () => {
    const centerY = viewState.y + viewState.height / 2
    measureViewAspect()
    for (const view of [viewState, targetView]) {
      view.height = view.width / viewAspect
      view.y = centerY - view.height / 2
      clampView(view)
    }
    writeViewBox()
    updateEffectiveZoom()
  })

  wrapper.value.addEventListener('wheel', onWheel) // non-passive: it owns the scroll
  wrapper.value.addEventListener('pointerdown', onPointerDown)
  wrapper.value.addEventListener('pointermove', onPointerMove)
  wrapper.value.addEventListener('pointerup', onPointerUp)
  wrapper.value.addEventListener('pointercancel', onPointerUp)
  updateEffectiveZoom()

  // Fetch the HD tier while nothing else is happening, so the first zoom
  // finds it already in cache instead of waiting on the chunk.
  if ('requestIdleCallback' in window) requestIdleCallback(loadHdTier, { timeout: 8000 })
  else setTimeout(loadHdTier, 4000)

  // Pan to any country if set
  moveToCountry()

  if (props.labels) ensureLabels()
  if (props.focusCountries.length) frameFocus()
})

const moveToCountry = () => {
  if (!wrapper.value || !svg.value) {
    return console.warn('Map not initialized yet')
  }

  // When a focus frame is active (silhouette/traversal reveals) that camera
  // owns the shot — the fly-in would fight it.
  if (props.focusCountries.length) return

  const { highlightCountry } = props
  if (!highlightCountry) return

  // Frame the LARGEST ring, not the whole-country bbox: RU/US antimeridian
  // fragments would otherwise zoom the camera out to the whole planet.
  const mainland = MAP_REGIONS[highlightCountry]?.[0] ?? MAP_BOUNDS[highlightCountry]
  if (!mainland) {
    return console.warn(`Country does not exist: ${highlightCountry}`)
  }
  tweenToView(frameForBoxes([mainland], []))
}

const gameStore = useGameStore()

watch(() => props.highlightCountry, moveToCountry)
watch(
  () => gameStore.map.reveal,
  reveal => {
    // Reveal cleared between rounds: return the camera to the world view.
    if (!reveal) tweenToView(worldFitView())
  }
)
</script>

<style lang="scss" scoped>
.game-map {
  height: 100vh;
  overflow: hidden;
  // The map owns its touch gestures (drag pan, pinch zoom) entirely.
  touch-action: none;
  overscroll-behavior: none;
}

// Edgeless: the svg fills the viewport and the viewBox is kept at the
// SCREEN's aspect ratio (see measureViewAspect), so the rendered map always
// reaches every window edge — content ends in coastlines, never a clip line.
svg {
  width: 100%;
  height: 100%;
  display: block;
}

// Halos that give micro-state dots a finger-sized tap target. Invisible at
// world zoom (twelve rings would clutter the map); once zoomed in they show
// as a faint ring so the player can SEE where the tappable area is.
.micro-hit {
  fill: none;
  stroke: none;
  cursor: pointer;
  pointer-events: all;
}

.deep-zoom .micro-hit {
  opacity: 0.3;
  stroke: currentColor;
  stroke-width: calc(1.5px * var(--stroke-zoom, 1));
  stroke-dasharray: calc(3px * var(--stroke-zoom, 1)) calc(3px * var(--stroke-zoom, 1));
}

path[id],
.micro-marker {
  cursor: pointer;
  fill: var(--map-not-highlight);
  transition:
    fill var(--motion-slow),
    filter var(--motion-base);
}

// Physical-geography overlay (water modes). Widths ride the same zoom
// compensation as country borders so rivers stay readable, never ink floods.
.map-feature {
  pointer-events: none;

  &.line {
    fill: none;
    stroke: hsl(215.7, 76.4%, 41%);
    stroke-width: calc(2.4px * var(--stroke-zoom, 1));
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 calc(1.5px * var(--stroke-zoom, 1)) hsla(215.7, 76.4%, 60%, 0.5));
  }

  &.area {
    stroke: hsl(215.7, 76.4%, 35%);
    stroke-width: calc(1.2px * var(--stroke-zoom, 1));
    fill: hsla(199, 68%, 62%, 0.38);
    animation: feature-wash var(--motion-slow) var(--ease-out-expressive) 1;
  }
}

@keyframes feature-wash {
  0% {
    fill-opacity: 0;
    stroke-opacity: 0;
  }
}

// Stroke width = 1 map unit at world zoom, capped to a micro-territory's own
// footprint (--stroke-base, inline) so tiny countries never drown in their own
// outline, and scaled down with zoom (--stroke-zoom, set from script) so
// coastlines stay hairlines instead of ink rivers when zoomed in close.
path[id] {
  stroke-width: calc(1px * min(var(--stroke-base, 1), var(--stroke-zoom, 1)));
}

// Mid-gesture, hover hit-testing against dense coastline paths and the fill
// transitions it triggers would repaint the vector layer and drop frames —
// countries aren't clickable while zooming/panning anyway.
.is-interacting {
  path[id],
  .micro-marker,
  .micro-hit {
    pointer-events: none;
    transition: none;
  }
}

.micro-marker {
  stroke: none;
}

path[id]:hover,
.micro-marker:hover {
  fill: rgba(lemonchiffon, 0.3);
}

.has-highlights {
  path[data-id],
  .micro-marker {
    fill: var(--map-not-highlight);
  }
  path.highlighted-country,
  .micro-marker.highlighted-country {
    fill: lemonchiffon;
    // filter: drop-shadow(0px 0px 2px #000);
  }
}

.game-map.correct {
  path[data-id]:not(.highlighted-country),
  .micro-marker:not(.highlighted-country) {
    fill: var(--soft-mint);
  }
}

.game-map.incorrect {
  path[data-id]:not(.highlighted-country),
  .micro-marker:not(.highlighted-country) {
    fill: var(--hior-ange);
  }
}

// Shapes-only mode (traversal): countries without an inline tint fill vanish
// entirely; guessed/endpoint shapes keep a soft ink stroke so they read as land
.solo path[data-id],
.solo .micro-marker {
  fill: transparent;
  stroke: transparent;
}
.solo path.highlighted-country {
  stroke: hsla(215.7, 76.4%, 21.6%, 0.55);
}
// Solo hides non-participating countries entirely — their tap halos must
// not linger as ghost rings (linking challenges are solo AND deep-zoomed,
// which is precisely when .deep-zoom .micro-hit would draw them). Note the
// descendant chain: 'solo' sits on the wrapper, 'deep-zoom' on the svg.
.solo .deep-zoom .micro-hit {
  opacity: 0;
  stroke: none;
}

// ISO acronym labels (easy-mode traversal aid). The <text> nodes are created
// at runtime, so they never receive the scoped-style attribute — the rules
// must go through :deep() or they simply don't apply (which left raw stroked
// labels permanently visible once built).
:deep(.country-label) {
  display: none;
  stroke: none;
  opacity: 0.65;
  font-size: 11px;
  text-anchor: middle;
  font-family: inherit;
  pointer-events: none;
  fill: var(--dark-blue);
  dominant-baseline: middle;
}
.show-labels :deep(.country-label) {
  display: block;
}
</style>
