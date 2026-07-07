<template>
  <div
    ref="wrapper"
    :class="[`game-map`, status, { solo, 'show-labels': labels }]"
    data-zoom-on-wheel="zoom-amount: 0.01; max-scale: 40;"
    data-pan-on-drag="button: left;"
  >
    <svg
      ref="svg"
      version="1.1"
      viewBox="0 0 2000 1001"
      style="stroke-linejoin: round; stroke: currentColor; fill: none"
      :class="{ 'has-highlights': highlights.length > 0 }"
    >
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
        r="2.5"
        @click="handleClick(code)"
      />
    </svg>
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import { MAP_PATHS, MAP_BOUNDS, MICRO_COUNTRIES } from '~~/data/map.gen'
import { prefersReducedMotion } from '~~/lib/motion'
import { type MapTint, useGameStore } from '~~/store/game.store'
import type { MapClickEvent } from '~~/types/events.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { CountryColorGrouping } from '~~/types/map.type'

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

// --- Camera: animate the viewBox to frame the focus countries together -----
// The tween writes the viewBox attribute directly instead of going through
// reactive state: a ref would re-render and diff all 220 country paths on
// every animation frame, which phones cannot afford.
const WORLD_VIEW = { x: 0, y: 0, width: 2000, height: 1001 }
const viewState = { ...WORLD_VIEW }
const applyViewBox = () => {
  svg.value?.setAttribute(
    'viewBox',
    `${viewState.x} ${viewState.y} ${viewState.width} ${viewState.height}`
  )
}

const frameFocus = () => {
  if (!svg.value) return

  const target = { ...WORLD_VIEW }
  if (props.focusCountries.length) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const isoCode of props.focusCountries) {
      const box = MAP_BOUNDS[isoCode]
      if (!box) continue
      minX = Math.min(minX, box[0])
      minY = Math.min(minY, box[1])
      maxX = Math.max(maxX, box[0] + box[2])
      maxY = Math.max(maxY, box[1] + box[3])
    }

    for (const isoCode of props.focusContext) {
      const box = MAP_BOUNDS[isoCode]
      if (!box) continue
      minX = Math.min(minX, box[0] + box[2] / 2)
      minY = Math.min(minY, box[1] + box[3] / 2)
      maxX = Math.max(maxX, box[0] + box[2] / 2)
      maxY = Math.max(maxY, box[1] + box[3] / 2)
    }

    if (minX !== Infinity) {
      const pad = Math.max((maxX - minX) * 0.35, (maxY - minY) * 0.35, 60)
      let x = minX - pad
      let y = minY - pad
      let width = maxX - minX + pad * 2
      let height = maxY - minY + pad * 2

      // Keep the world's aspect ratio so shapes never distort
      const aspect = WORLD_VIEW.width / WORLD_VIEW.height
      if (width / height > aspect) {
        const grow = width / aspect - height
        y -= grow / 2
        height += grow
      } else {
        const grow = height * aspect - width
        x -= grow / 2
        width += grow
      }

      Object.assign(target, { x, y, width, height })
    }
  }

  gsap.to(viewState, {
    ...target,
    duration: prefersReducedMotion() ? 0 : 1.1,
    ease: 'power2.inOut',
    overwrite: 'auto',
    onUpdate: () => {
      applyViewBox()
      updateEffectiveZoom()
    },
  })
}

watch(
  () => [props.focusCountries, props.focusContext],
  () => nextTick(frameFocus)
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

// Hysteresis: recomputing stroke width invalidates style on all 220 paths,
// so only bother once zoom has moved meaningfully since the last update.
let appliedZoom = 0
const updateEffectiveZoom = () => {
  if (!wrapper.value || !svg.value) return
  const effectiveZoom = (WORLD_VIEW.width / viewState.width) * $getScale(wrapper.value)
  if (Math.abs(effectiveZoom - appliedZoom) / (appliedZoom || 1) < 0.15) return
  appliedZoom = effectiveZoom
  svg.value.style.setProperty('--stroke-zoom', String(1 / Math.max(1, effectiveZoom)))
  svg.value.querySelectorAll<SVGCircleElement>('.micro-marker').forEach(dot => {
    const footprint = Number(dot.dataset.footprint) || 0
    dot.style.display = footprint * effectiveZoom < LEGIBLE_FOOTPRINT_PX ? '' : 'none'
    dot.setAttribute('r', String(2.5 / Math.max(1, effectiveZoom)))
  })
}

onMounted(async () => {
  if (!svg.value || !wrapper.value) {
    console.warn('Unable to instantiate map ref')
    return
  }

  wrapper.value.addEventListener(
    'wheel',
    () => requestAnimationFrame(updateEffectiveZoom),
    { passive: true }
  )
  updateEffectiveZoom()

  // Pan to any country if set
  moveToCountry()

  if (props.labels) ensureLabels()
  if (props.focusCountries.length) frameFocus()
})

const { $pan, $zoom, $resetScale, $getScale } = useNuxtApp()
const pastMove = ref<{ x: number; y: number } | undefined>()
const moveToCountry = async () => {
  if (!wrapper.value || !svg.value) {
    return console.warn('Map not initialized yet')
  }

  svg.value.style.transition = `none`

  // When a focus frame is active (silhouette/traversal reveals) the viewBox
  // camera owns the shot — the pan/zoom fly-in would fight it and shove the
  // map out of view.
  if (props.focusCountries.length) return

  const { highlightCountry } = props
  if (!highlightCountry) return

  const countryPath = svg.value.querySelector(`#${highlightCountry}`)
  if (!countryPath) {
    return console.warn(`Country does not exist: ${highlightCountry}`)
  }

  if (pastMove.value) {
    $pan(wrapper.value, pastMove.value.x * -1, pastMove.value.y * -1)
  }
  $resetScale(wrapper.value)

  const position = countryPath.getBoundingClientRect()
  const calculatedPosition = {
    x: position.x / 2,
    y: position.y / 2,
  }

  // National overrides
  switch (highlightCountry) {
    case 'US':
      calculatedPosition.x = position.x - position.x / 2
      calculatedPosition.y = position.y - position.y / 2
      break
    case 'RU':
      calculatedPosition.x = position.x / 2
      calculatedPosition.y = position.y / 2
      break
    case 'BR':
      calculatedPosition.x = position.x / 2
      calculatedPosition.y = position.y / 2
      break
  }

  pastMove.value = { ...calculatedPosition }
  $pan(wrapper.value, calculatedPosition.x, calculatedPosition.y)

  let zoom = 3
  // Large countries
  if ([position.width, position.height].some(dimension => dimension > 180)) {
    zoom = 2
  }

  // Tiny countries
  if ([position.width, position.height].some(dimension => dimension < 50)) {
    zoom = 8
  }

  $zoom(wrapper.value, zoom, {
    minScale: 1,
    maxScale: 40,
    origin: {
      clientX: calculatedPosition.x,
      clientY: calculatedPosition.y,
    },
  })
  updateEffectiveZoom()
}

const gameStore = useGameStore()

watch(() => props.highlightCountry, moveToCountry)
watch(
  () => gameStore.map.reveal,
  () => {
    if (!wrapper.value) return
    $resetScale(wrapper.value)
    updateEffectiveZoom()
  }
)
</script>

<style lang="scss" scoped>
.game-map {
  height: 100vh;
  overflow: auto;
}

svg {
  width: 100%;
  // Let the compositor scale the cached raster during pan/zoom gestures
  // instead of repainting half a million path vertices every frame.
  will-change: transform;
}

path[id],
.micro-marker {
  cursor: pointer;
  fill: var(--map-not-highlight);
  transition:
    fill var(--motion-slow),
    filter var(--motion-base);
}

// Stroke width = 1 map unit at world zoom, capped to a micro-territory's own
// footprint (--stroke-base, inline) so tiny countries never drown in their own
// outline, and scaled down with zoom (--stroke-zoom, set from script) so
// coastlines stay hairlines instead of ink rivers when zoomed in close.
path[id] {
  stroke-width: calc(1px * min(var(--stroke-base, 1), var(--stroke-zoom, 1)));
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
