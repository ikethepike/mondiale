<template>
  <div
    ref="wrapper"
    :class="[`game-map`, status, { solo, landmass, 'show-labels': labels || !!countryLabels }]"
  >
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
        <!--
          Everything geographic lives in one id'd group so the magnifier inset
          can mirror it with a single <use>. The clone lands in a shadow tree,
          so querySelectorAll('path[data-id]') — and therefore pathEls and the
          LOD swap — never sees the duplicates.

          It does, however, mirror `display: none`, so `cullPass` suspends
          itself whenever an inset is on screen (see the note there).

          Markers and pins stay OUTSIDE: they are indicators, not terrain, and
          magnifying them would blow the ring up to fill the inset.
        -->
        <g id="map-world-layer">
          <path
            v-for="(d, code) in MAP_PATHS"
            :id="code"
            :key="code"
            :style="{
              fill: countryColors[code],
              '--stroke-base': strokeWidths[code],
              '--chain-index': chainIndices[code],
            }"
            :class="{
              'highlighted-country': highlights.includes(code),
              'dimmed-country': dimmedSet.has(code),
              'pulsing-country': pulsingSet.has(code),
              'unselectable-country': unselectableSet.has(code),
            }"
            :data-id="code"
            :d="d"
            @click="handleClick(code, $event)"
          />
          <!--
        Micro-states (Vatican, Monaco…) are sub-pixel at world zoom; the dot is
        their click target and disappears once the real shape becomes legible.
        No id attribute — path#ISO must keep resolving to the true geometry.
        Visibility is toggled with direct DOM writes (not reactive state) so
        wheel/camera zoom never forces a re-render of the 220 country paths.
      -->
          <!-- Invisible tap halos: micro-states get click slop — finger-sized
               on touch, tighter on mouse where it grows with zoom (see
               updateEffectiveZoom). A halo whose country carries state (highlight, tint,
               grouping) renders as a filled disc in that colour — the real
               shape is a few pixels at best, so the disc IS the readable
               "is Monaco lit?" signal. -->
          <circle
            v-for="(spot, code) in microCountries"
            :key="`hit-${code}`"
            class="micro-hit"
            :class="{ 'stated-halo': microHaloFills[code] }"
            :style="{ '--halo-state': microHaloFills[code] }"
            :data-id="code"
            :cx="spot?.x"
            :cy="spot?.y"
            r="12"
            @click="handleClick(code, $event)"
          />
          <circle
            v-for="(spot, code) in microCountries"
            :key="`dot-${code}`"
            class="micro-marker"
            :style="{ fill: countryColors[code] }"
            :class="{
              'highlighted-country': highlights.includes(code),
              'dimmed-country': dimmedSet.has(code),
              'pulsing-country': pulsingSet.has(code),
            }"
            :data-id="code"
            :data-footprint="spot?.footprint"
            :cx="spot?.x"
            :cy="spot?.y"
            r="3.5"
            @click="handleClick(code, $event)"
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
        </g>

        <!-- The magnifier: a nested viewport onto the world layer above, with a
             leader line back to the region it shows. Hidden once the player has
             zoomed in far enough to see the thing unaided. -->
        <MapInset
          v-if="inset"
          :inset="inset"
          :view="viewBoxState"
          :compact="isPhone"
          @zoom="flyToRegion"
        />

        <!-- A ringed marker for features too small to see. Rockall spans about
             300 metres, so its outline renders as nothing at world zoom; the
             marker carries the location instead. -->
        <g
          v-if="feature?.marker"
          class="feature-marker"
          :transform="`translate(${feature.marker.x} ${feature.marker.y})`"
        >
          <g class="feature-marker-scale">
            <circle class="feature-marker-pulse" r="6" />
            <circle class="feature-marker-ring" r="6" />
            <circle class="feature-marker-dot" r="2" />
          </g>
        </g>
        <!-- Overland route legs (manhunt's escape trail): solid bowed arcs —
             the walked journey, distinct from the sailed one below. -->
        <path
          v-for="(arc, index) in landRouteArcs"
          :key="`land-route-${index}`"
          class="map-land-route"
          :d="arc.d"
        />
        <!-- Water crossings (chain strait hops, manhunt sea passages): a bowed
             dashed arc, dashes drifting toward the destination, with a sail
             chip at the crown so the line reads as "sailed", not "borders". -->
        <g v-for="(arc, index) in seaLinkArcs" :key="`sea-link-${index}`">
          <path class="map-sea-link" :d="arc.d" />
          <g
            v-if="showSailChips"
            class="map-sea-chip"
            :transform="`translate(${arc.mid.x} ${arc.mid.y})`"
          >
            <g class="map-sea-chip-scale">
              <circle class="chip-disc" r="10" />
              <!-- The cargo ship from the shared stat-glyph stroke language,
                   centred from its 24×24 box (artwork centre ≈ 12, 14.75). -->
              <g class="chip-ship" transform="translate(-10.2 -12.5) scale(0.85)">
                <path v-for="(d, shipIndex) in SEA_CHIP_SHIP" :key="shipIndex" :d="d" />
              </g>
            </g>
          </g>
        </g>
        <!-- Pin-landmark: the guess, then on reveal the truth and a line between. -->
        <line
          v-if="pinPoint && pinAnswerPoint"
          class="map-pin-link"
          :x1="pinPoint.x"
          :y1="pinPoint.y"
          :x2="pinAnswerPoint.x"
          :y2="pinAnswerPoint.y"
        />
        <g v-if="pinPoint" class="map-pin" :transform="`translate(${pinPoint.x} ${pinPoint.y})`">
          <g class="map-pin-scale">
            <circle class="map-pin-halo" r="13" />
            <circle class="map-pin-dot" r="4.5" />
          </g>
        </g>
        <g
          v-if="pinAnswerPoint"
          class="map-pin answer"
          :transform="`translate(${pinAnswerPoint.x} ${pinAnswerPoint.y})`"
        >
          <g class="map-pin-scale">
            <circle class="map-pin-halo" r="13" />
            <circle class="map-pin-dot" r="4.5" />
          </g>
        </g>
      </template>
    </svg>
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import {
  MAP_PATHS,
  MAP_BOUNDS,
  MAP_PROJECTION,
  MAP_REGIONS,
  MICRO_COUNTRIES,
  type MapCode,
} from '~~/data/map.gen'
import { largestRing, poleOfInaccessibility } from '~~/lib/outline'
import { STRAIT_CROSSINGS } from '~~/data/straits.gen'
import {
  WORLD_BOX,
  countryLatLng,
  invertRobinson,
  isLabelableBox,
  labelBoxFor,
  mainlandBox,
  projectRobinson,
  type LatLng,
} from '~~/lib/geo'
import { DEPARTMENT_GLYPHS } from '~~/lib/stat-glyphs'
import { prefersReducedMotion } from '~~/lib/motion'
import { clamp } from '~~/lib/number'
import { type MapTint, useGameStore } from '~~/store/game.store'
import type { MapClickEvent } from '~~/types/events.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import MapInset from '~/components/map/MapInset.vue'
import { useIsCoarsePointer, useIsPhone } from '~~/lib/use-viewport'
import type {
  CountryColorGrouping,
  MapFeatureOverlay,
  MapInset as MapInsetType,
} from '~~/types/map.type'

// Phone-width screens get the compact magnifier presentation.
const isPhone = useIsPhone()
const isCoarsePointer = useIsCoarsePointer()

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
  /** Chrome berth in CSS px: the camera fits its subject into the band
   *  between `top` and `bottom` instead of the full viewport, so a view's
   *  header card (a flag, a photo) never sits on the subject. */
  berth: {
    type: Object as PropType<{ top?: number; bottom?: number }>,
    default: undefined,
  },
  /** With solo: continents stay as one silhouette — uniform fill, no strokes,
   *  so internal borders vanish and an overlay reads against real coastlines. */
  landmass: {
    type: Boolean,
    default: false,
  },
  /** Show ISO acronym labels over countries. */
  labels: {
    type: Boolean,
    default: false,
  },
  /** Written names over countries, keyed by the country they sit on — NOT
   *  necessarily that country's own name (errata mislabels one on purpose).
   *  Rendered instead of the acronyms, and rebuilt whenever the set changes. */
  countryLabels: {
    type: Object as PropType<Partial<Record<ISOCountryCode, string>>>,
    default: undefined,
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
  /** Frame tightness for a mode whose subject IS the feature (water modes):
   *  the pad floor that over-zooms a small subject relaxes to this. */
  framePad: {
    type: Object as PropType<{ scale?: number; floor?: number }>,
    default: undefined,
  },
  /** Magnifying inset for a subject too small to see at world zoom. */
  inset: {
    type: Object as PropType<MapInsetType>,
    default: undefined,
  },
  /** Strait hops to draw as dashed sea arcs, as sorted "A-B" pair keys into
   *  STRAIT_CROSSINGS (Border Chain). */
  seaLinks: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
  /** Countries faded to half strength — off the current board (Border Chain
   *  on a continental variant). */
  dimmed: {
    type: Array as PropType<ISOCountryCode[]>,
    default: () => [],
  },
  /** Action affordance: countries the player may act on right now, drawn as
   *  a stroke ring — never a fill. Fills carry knowledge; strokes carry you.
   *  (Manhunt's legal hops, Border Chain's easy-mode open moves.) */
  ringed: {
    type: Array as PropType<ISOCountryCode[]>,
    default: () => [],
  },
  /** Directed 'FROM>TO' overland legs drawn as solid route arcs — the
   *  journey language (manhunt's escape trail). Water legs belong in
   *  `seaLinks` instead. */
  landRoutes: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
  /** Countries whose coastline hums the sea-blue — "you can sail from
   *  here". A standing whisper, not an affordance list (manhunt's hideout
   *  while sea passages remain). */
  seaGlow: {
    type: Array as PropType<ISOCountryCode[]>,
    default: () => [],
  },
  /** Countries whose fill breathes toward yellow — the live Border Chain
   *  head, the one square players act on. */
  pulsing: {
    type: Array as PropType<ISOCountryCode[]>,
    default: () => [],
  },
  /** Countries this game never lets anyone select (benched micro-nations):
   *  clicks are swallowed and their dot markers/tap halos don't render, so
   *  the exclusion holds across every view in one place. */
  unselectable: {
    type: Array as PropType<ISOCountryCode[]>,
    default: () => [],
  },
  /** Stagger country fills by their countryGroupings position — the Border
   *  Chain reveal replays the walked path arriving in sequence. */
  staggered: {
    type: Boolean,
    default: false,
  },
})

// Deliberately soft washes — feedback, not verdict-shouting. JS needs the
// literals; `stray`/`hot` mirror flame() and `endpoint` mirrors ink() in
// rules/_ink.scss — keep the hues in step (the walkColor rule, lib/chain.ts).
const TINT_COLORS: { [tint in MapTint]: string } = {
  optimal: 'hsla(170.5, 34.7%, 55.1%, 0.65)',
  inefficient: 'hsla(29.7, 79.9%, 66.7%, 0.6)',
  stray: 'hsla(9.8, 81.3%, 60.2%, 0.42)',
  endpoint: 'hsla(215.7, 76.4%, 31.6%, 0.45)',
  // Hot & cold warmth — hues match the probe-trail chips
  hot: 'hsla(9.8, 81.3%, 60.2%, 0.55)',
  warm: 'hsla(29.7, 79.9%, 66.7%, 0.55)',
  cold: 'hsla(197.6, 51.2%, 55%, 0.4)',
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

const dimmedSet = computed(() => new Set<string>(props.dimmed))
const pulsingSet = computed(() => new Set<string>(props.pulsing))
const unselectableSet = computed(() => new Set<string>(props.unselectable))

/** Micro-state dots and tap halos, minus any the game has benched. */
const microCountries = computed(() =>
  Object.fromEntries(
    Object.entries(MICRO_COUNTRIES).filter(([code]) => !unselectableSet.value.has(code))
  )
)

/** State colour per micro country, driving the halo's filled-disc treatment. */
const microHaloFills = computed<Partial<Record<string, string>>>(() => {
  const fills: Partial<Record<string, string>> = {}
  for (const code of Object.keys(MICRO_COUNTRIES)) {
    const explicit = countryColors.value[code]
    if (explicit) fills[code] = explicit
    else if (highlights.value.includes(code)) fills[code] = 'lemonchiffon'
  }
  return fills
})

/** Grouping position per country, staggering fill arrival along the chain. */
const chainIndices = computed<Partial<Record<string, number>>>(() => {
  if (!props.staggered || !props.countryGroupings || prefersReducedMotion()) return {}
  const indices: Partial<Record<string, number>> = {}
  props.countryGroupings.forEach(({ countries }, index) => {
    for (const country of countries) indices[country] ??= index
  })
  return indices
})

/**
 * Dashed sailing arcs across water. Named strait pairs cross at their
 * validated coastline points; any other pair (manhunt's sea passages span
 * whole seas) falls back to a centroid-to-centroid arc. Each bows gently
 * poleward like a rhumb-line sketch on a chart, its dashes drift from origin
 * to destination (the direction of travel), and a small sail chip sits at
 * the arc's crown naming the crossing for what it is.
 */
/** The sea chip's ship — the trade department's cargo-ship emblem, reused so
 *  the map speaks the same glyph language as the stat cards. */
const SEA_CHIP_SHIP = DEPARTMENT_GLYPHS['department.trade'].paths ?? []

/** One gently north-bowed arc between a directed or sorted pair key.
 *  'FROM>TO' keys carry travel direction; legacy 'A-B' keys stay sorted. */
const arcForPair = (pair: string): { d: string; mid: { x: number; y: number } } | undefined => {
  const directed = pair.includes('>')
  const [a, b] = (directed ? pair.split('>') : pair.split('-')) as ISOCountryCode[]
  const sortedKey = a < b ? `${a}-${b}` : `${b}-${a}`
  const known = STRAIT_CROSSINGS[sortedKey]
  let crossing: { from: LatLng; to: LatLng } | undefined
  if (known) {
    // A stored crossing's `from` belongs to the sorted-first country —
    // swap it when the travel direction runs the other way.
    const runsBackward = directed && a !== (a < b ? a : b)
    crossing = runsBackward ? { from: known.to, to: known.from } : known
  } else {
    const from = countryLatLng(a)
    const to = countryLatLng(b)
    crossing = from && to ? { from, to } : undefined
  }
  if (!crossing) return undefined
  // A crossing hugging the antimeridian would draw across the whole world.
  if (Math.abs(crossing.from.lng - crossing.to.lng) > 180) return undefined
  const from = projectRobinson(crossing.from, MAP_PROJECTION)
  const to = projectRobinson(crossing.to, MAP_PROJECTION)
  const chordX = to.x - from.x
  const chordY = to.y - from.y
  const length = Math.hypot(chordX, chordY) || 1
  // Control point: perpendicular to the chord, always bowing map-north.
  let perpX = -chordY / length
  let perpY = chordX / length
  if (perpY > 0) {
    perpX = -perpX
    perpY = -perpY
  }
  const bow = length * 0.14
  const controlX = (from.x + to.x) / 2 + perpX * bow
  const controlY = (from.y + to.y) / 2 + perpY * bow
  return {
    d: `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`,
    // The quadratic's own midpoint (t = 0.5) — the crown of the arc.
    mid: {
      x: (from.x + 2 * controlX + to.x) / 4,
      y: (from.y + 2 * controlY + to.y) / 4,
    },
  }
}

const seaLinkArcs = computed(() =>
  props.seaLinks.map(arcForPair).filter((arc): arc is NonNullable<typeof arc> => !!arc)
)

/** Overland legs: same bow, solid stroke, no chip — walked, not sailed. */
const landRouteArcs = computed(() =>
  props.landRoutes.map(arcForPair).filter((arc): arc is NonNullable<typeof arc> => !!arc)
)

// ringed/seaGlow change on every hover crossing — as template bindings they
// re-diff all 220 paths per change (measured: pan p95 doubled). Applied as
// direct classList writes instead, the micro-dot discipline: reactivity never
// touches the path list.
const applyCountryClass = (
  className: string,
  previous: ReadonlySet<string>,
  next: ReadonlySet<string>
) => {
  const host = svg.value
  if (!host) return
  for (const iso of previous) {
    if (next.has(iso)) continue
    for (const el of host.querySelectorAll(`[data-id="${iso}"]`)) el.classList.remove(className)
  }
  for (const iso of next) {
    if (previous.has(iso)) continue
    for (const el of host.querySelectorAll(`[data-id="${iso}"]`)) el.classList.add(className)
  }
}
let appliedRinged: ReadonlySet<string> = new Set()
let appliedSeaGlow: ReadonlySet<string> = new Set()
watch(
  () => props.ringed,
  ringed => {
    const next = new Set(ringed)
    applyCountryClass('ringed-country', appliedRinged, next)
    appliedRinged = next
  },
  { flush: 'post' }
)
watch(
  () => props.seaGlow,
  seaGlow => {
    const next = new Set(seaGlow)
    applyCountryClass('sea-glow-country', appliedSeaGlow, next)
    appliedSeaGlow = next
  },
  { flush: 'post' }
)
onMounted(() => {
  appliedRinged = new Set(props.ringed)
  appliedSeaGlow = new Set(props.seaGlow)
  applyCountryClass('ringed-country', new Set(), appliedRinged)
  applyCountryClass('sea-glow-country', new Set(), appliedSeaGlow)
})

/** The sail chip earns its place on a lone arc (a hover preview, a walked
 *  leg); on a fanned-out reach the dashes already say water, and a chip per
 *  arc is chart junk. */
const showSailChips = computed(() => seaLinkArcs.value.length <= 3)

// Evaluated lazily, so reading `gameStore` (declared further down) is safe.
const pinPoint = computed(() =>
  gameStore.map.pin ? projectRobinson(gameStore.map.pin, MAP_PROJECTION) : undefined
)
const pinAnswerPoint = computed(() =>
  gameStore.map.pinAnswer ? projectRobinson(gameStore.map.pinAnswer, MAP_PROJECTION) : undefined
)

// --- Camera: one viewBox drives everything ----------------------------------
// Gestures and reveal tweens all write the viewBox directly, repainting one
// viewport's worth of culled base-tier geometry per frame — measured well
// under a frame budget even CPU-throttled. The alternative (CSS-transform
// zoom of a cached raster layer) breaks down at map scale: the browser
// endlessly re-rasterizes tiles of a giant layer, which reads as shimmer and
// stutter. Nothing here is reactive — Vue must never diff 220 paths a frame.
const WORLD_VIEW = { ...WORLD_BOX }
const MAX_ZOOM = 40
/**
 * How far past a world edge the camera may be dragged, as a fraction of that
 * axis's world dimension. Vertical slack (≈350 units) slides the high Arctic —
 * Hans Island sits at y≈87 of 1001 — out from under the overlay cards even
 * when they reach a third of the way down the screen; horizontal slack
 * (≈300 units) frees edge-hugging subjects (Alaska, New Zealand) to be pulled
 * toward the centre. The overshoot only ever reveals the parchment background.
 */
const VERTICAL_OVERSCROLL = 0.35
const HORIZONTAL_OVERSCROLL = 0.15
/** Deep-zoom cap on either axis's slack: a view a few dozen units across must
 *  never drift more than a fraction of itself off the map. */
const OVERSCROLL_VIEW_FRACTION = 0.4
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

/** The map's screen box, measured at mount/resize/gesture-start — reading it
 *  per frame or per pointer event forces layout inside the camera loop.
 *  Measured on the WRAPPER, not the svg: the svg fills it exactly, but wears
 *  the recede scale transition — a mid-recede measurement must never stick. */
let mapScreenRect: DOMRect | undefined
/** Clamp bounds derived from rect + berth — arithmetic-only in the frame loop. */
let clampCache: { maxWidth: number; centerFraction: number } | undefined

const measureMapRect = () => {
  const rect = wrapper.value?.getBoundingClientRect()
  if (rect?.width && rect.height) {
    mapScreenRect = rect
    viewAspect = rect.width / rect.height
    clampCache = undefined
  }
  return mapScreenRect
}
/** The cached screen box, measuring lazily before the first gesture. */
const mapRect = () => mapScreenRect ?? measureMapRect()

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

/** The berth as a zoom-out factor plus where the clear band's centre sits
 *  (as a fraction of viewport height). No berth → identity. Nonsense berths
 *  (band under 35% of the screen) are ignored rather than obeyed. */
const berthMetrics = () => {
  const top = props.berth?.top ?? 0
  const bottom = props.berth?.bottom ?? 0
  const viewportHeight = mapRect()?.height ?? 0
  const band = viewportHeight - top - bottom
  if (!top && !bottom) return { scale: 1, centerFraction: 0.5 }
  if (!viewportHeight || band < viewportHeight * 0.35) return { scale: 1, centerFraction: 0.5 }
  return { scale: viewportHeight / band, centerFraction: (top + band / 2) / viewportHeight }
}

/**
 * Re-aim a fitted view so its `content` box lands inside the berth band:
 * recentred on the band's centre, and zoomed out ONLY when the content's
 * projected height genuinely overflows the band (a wide world on a tall
 * phone already fits — it just needs to move).
 */
const berthedView = (view: typeof WORLD_VIEW, content: { y: number; height: number }) => {
  const { scale: bandScale, centerFraction } = berthMetrics()
  if (bandScale === 1 && centerFraction === 0.5) return view
  const viewportHeight = mapRect()?.height ?? 0
  const bandHeightPx = viewportHeight / bandScale
  const contentHeightPx = viewportHeight * (content.height / view.height)
  const scale = Math.max(1, contentHeightPx / bandHeightPx)
  const width = view.width * scale
  const height = view.height * scale
  return {
    x: view.x + view.width / 2 - width / 2,
    y: content.y + content.height / 2 - centerFraction * height,
    width,
    height,
  }
}

/** The resting camera: the world fit, honouring any berth. */
const restView = () => berthedView(worldFitView(), WORLD_VIEW)

/**
 * A reactive echo of the camera, for the few overlays that must lay themselves
 * out in map space (the inset and its leader line). `viewState` itself is
 * deliberately non-reactive — it is written every frame by gsap and by every
 * wheel tick — so this snapshot is only refreshed when the box has actually
 * moved enough to matter, keeping camera work free of Vue re-renders.
 */
const viewBoxState = shallowRef<[number, number, number, number]>([
  viewState.x,
  viewState.y,
  viewState.width,
  viewState.height,
])
/** Below this, a re-layout would be invisible. In SCREEN pixels: a fixed
 *  map-unit epsilon goes sub-pixel the moment the camera dives, which had the
 *  echo (and the inset render behind it) firing every single pan frame. */
const VIEW_ECHO_PX = 1.5

const echoViewBox = () => {
  const [x, y, width] = viewBoxState.value
  const epsilon = (viewState.width / (mapRect()?.width ?? WORLD_VIEW.width)) * VIEW_ECHO_PX
  if (
    Math.abs(x - viewState.x) < epsilon &&
    Math.abs(y - viewState.y) < epsilon &&
    Math.abs(width - viewState.width) < epsilon
  ) {
    return
  }
  viewBoxState.value = [viewState.x, viewState.y, viewState.width, viewState.height]
}

const writeViewBox = () => {
  svg.value?.setAttribute(
    'viewBox',
    `${viewState.x} ${viewState.y} ${viewState.width} ${viewState.height}`
  )
  if (props.inset) echoViewBox()
}

const clampView = (view: typeof WORLD_VIEW, minWidth = WORLD_VIEW.width / MAX_ZOOM) => {
  // A berth may rest the camera wider than the world so the subject can sit
  // inside the clear band — the zoom-out ceiling follows the actual rest.
  // Cached: this runs every gesture frame, and the berth chain behind it
  // only moves with the rect or the berth props.
  clampCache ??= {
    maxWidth: Math.max(WORLD_VIEW.width, restView().width),
    centerFraction: berthMetrics().centerFraction,
  }
  const { maxWidth, centerFraction } = clampCache
  view.width = clamp(view.width, minWidth, maxWidth)
  view.height = view.width / viewAspect
  // Horizontal slack mirrors the vertical below: a strict clamp pins subjects
  // at the world's edges to the screen's, and — wider than the world (berth
  // rest, wide screens at world fit) — killed side-to-side panning outright,
  // the only legal x being dead centre.
  const marginX = Math.min(
    WORLD_VIEW.width * HORIZONTAL_OVERSCROLL,
    view.width * OVERSCROLL_VIEW_FRACTION
  )
  const overhang = (WORLD_VIEW.width - view.width) / 2
  view.x = clamp(
    view.x,
    Math.min(0, overhang) - marginX,
    Math.max(WORLD_VIEW.width - view.width, overhang) + marginX
  )

  // Vertical headroom: a strict [0, world-height] clamp pins the far north
  // (Svalbard, Hans Island at y≈87 of 1001) and the far south to the screen
  // edges — right under the overlay captions, where they can't be read or
  // clicked. Allow a little overscroll so the poles can be slid into the clear
  // centre. The overshoot only ever reveals the parchment background.
  //
  // Sized against the WORLD, not the view. A fraction of view height sounds
  // equivalent but is not: a wide screen makes the view taller than the world
  // (1280x800 → a 2000x1250 viewBox), and 40% of that is 500 units — a full
  // half-world of slack in each direction, enough to drag the planet entirely
  // off screen.
  // …but at a deep zoom the view is only a few dozen units tall, and a
  // world-height slack would let it drift far off the map. Take whichever
  // bound is tighter.
  const margin = Math.min(
    WORLD_VIEW.height * VERTICAL_OVERSCROLL,
    view.height * OVERSCROLL_VIEW_FRACTION
  )

  if (view.height >= WORLD_VIEW.height) {
    // View taller than the world. Hard-centring here (the old behaviour) killed
    // vertical panning outright on any wide screen, which is precisely where
    // the caption overlaps the Arctic. A berth shifts the resting centre so
    // the world hangs in the clear band.
    const centred = WORLD_VIEW.height / 2 - centerFraction * view.height
    view.y = Math.min(centred + margin, Math.max(centred - margin, view.y))
  } else {
    view.y = Math.min(WORLD_VIEW.height - view.height + margin, Math.max(-margin, view.y))
  }
}

const tweenToView = (target: typeof WORLD_VIEW) => {
  // A reveal in flight owns the camera outright. Clearing `reveal` between
  // rounds queues a world-fit tween on the same frame the next gate's reveal
  // starts — it would drag the camera off the tight crop and the reveal, being
  // a .to() toward a fixed frame, would then run inward from the world.
  if (revealLocked) return
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
  if (minX === Infinity) return restView()

  // The flat floor keeps a small subject from filling the screen. A mode whose
  // subject IS the feature relaxes it, or the pad outgrows the thing it frames.
  const padScale = props.framePad?.scale ?? 0.35
  const padFloor = props.framePad?.floor ?? 60
  const pad = Math.max((maxX - minX) * padScale, (maxY - minY) * padScale, padFloor)
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

  // This frame skips `clampView`, so honour its zoom floor here: a sub-unit
  // subject (Lake Chad spans 2.6) would otherwise ask for a view no camera can
  // hold. Grow about the centre so the subject stays put as it loosens.
  const minWidth = WORLD_VIEW.width / MAX_ZOOM
  if (width < minWidth) {
    const grow = minWidth / width
    x += width / 2 - (width * grow) / 2
    y += height / 2 - (height * grow) / 2
    width *= grow
    height *= grow
  }
  return berthedView({ x, y, width, height }, { y: minY - pad, height: maxY - minY + pad * 2 })
}

/**
 * A country's box for framing. Antimeridian fragments stretch the whole-country
 * bbox across the map for RU/US/NZ/FJ-class countries — framing one would
 * world-fit the camera — so those fall back to the mainland ring. Labels want
 * a stricter rule and take `labelBoxFor` instead.
 */
const frameBoxFor = (isoCode: ISOCountryCode) => {
  const bounds = MAP_BOUNDS[isoCode]
  return bounds && bounds[2] > WORLD_VIEW.width / 2
    ? mainlandBox(MAP_REGIONS[isoCode], bounds)
    : bounds
}

const frameFocus = () => {
  if (!svg.value) return

  // The camera may fly anywhere — everything must be drawable on arrival.
  uncullAll()

  const boxes = [
    ...props.focusCountries.map(frameBoxFor).filter(Boolean),
    ...(props.feature?.bounds ? [props.feature.bounds] : []),
  ]
  const target = boxes.length
    ? frameForBoxes(boxes, props.focusContext.map(frameBoxFor).filter(Boolean))
    : restView()
  tweenToView(target)
}

// A new subject reclaims the camera even from a player who had taken it.
watch(
  () => [props.focusCountries, props.focusContext, props.feature],
  () => {
    cameraTaken = false
    nextTick(frameFocus)
  }
)

// A berth arriving or leaving re-aims the camera the same way a focus does —
// but only while the framing is still automatic. Once the player has panned
// or zoomed, chrome growing under the map (guess chips landing, the keyboard
// rising) must not snatch the camera back to the subject.
watch(
  () => [props.berth?.top, props.berth?.bottom],
  () => {
    clampCache = undefined
    if (!cameraTaken) nextTick(frameFocus)
  }
)

/**
 * Fly to the region the magnifier was showing, so clicking the box reads as it
 * expanding to fill the screen.
 *
 * The region is deliberately tiny — Hans Island's is under a map unit — and
 * `clampView` floors the view at `WORLD_VIEW.width / MAX_ZOOM`, so a rock lands
 * at a sane 50-unit shot rather than a pixel. A little context around it keeps
 * the subject from bleeding off every edge.
 */
const INSET_ZOOM_CONTEXT = 1.6

const flyToRegion = ([x, y, width, height]: [number, number, number, number]) => {
  if (!svg.value) return
  uncullAll()

  const centerX = x + width / 2
  const centerY = y + height / 2

  // Resolve the final size FIRST, then centre on it. `clampView` widens a view
  // that is tighter than MAX_ZOOM but leaves x/y where they were, so centring
  // beforehand would strand a sub-unit subject — Hans Island's region is 0.8
  // units wide — in the top-left corner of a 50-unit shot.
  let targetWidth = Math.max(width, height * viewAspect) * INSET_ZOOM_CONTEXT
  targetWidth = Math.min(WORLD_VIEW.width, Math.max(WORLD_VIEW.width / MAX_ZOOM, targetWidth))
  const targetHeight = targetWidth / viewAspect

  const target = {
    x: centerX - targetWidth / 2,
    y: centerY - targetHeight / 2,
    width: targetWidth,
    height: targetHeight,
  }
  clampView(target)
  tweenToView(target)
}

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

// --- Country labels --------------------------------------------------------
// Two registers through one builder: ISO acronyms over everything (the
// easy-mode traversal aid) and written names over a named few (errata's
// mislabelled stage). Text nodes are appended to the svg root and take no part
// in hit-testing, so a label never intercepts the country click beneath it.
//
// Keyed rather than latched: errata deals a new label set per gate, and a
// build-once flag would leave the previous round's names on the map.
/**
 * Where a country's name hangs, and how much room it has there. The pole of
 * inaccessibility, not the box centre: a box centre lands on the NEIGHBOUR for
 * any country that curves around another (Norway, Sweden, Chile, Croatia,
 * Vietnam), and errata's stage IS the labels.
 *
 * Memoized because the acronym register asks for all ~219 at once — a measured
 * ~180ms sweep that must happen exactly one time.
 */
const anchorCache = new Map<string, { point: [number, number]; radius: number } | undefined>()
const labelAnchorFor = (code: MapCode) => {
  const cached = anchorCache.get(code)
  if (cached !== undefined || anchorCache.has(code)) return cached

  const path = MAP_PATHS[code]
  const ring = path ? largestRing(path) : undefined
  const anchor = ring ? poleOfInaccessibility(ring) : undefined
  const box = labelBoxFor(MAP_BOUNDS[code], MAP_REGIONS[code])
  // No ring data (a code drawn from EXTRA_MAP_CODES): the box centre is all
  // there is, and its inscribed radius is unknown — call it half the shorter
  // side, which is what a rectangle would hold.
  const resolved =
    anchor ??
    (box
      ? {
          point: [box[0] + box[2] / 2, box[1] + box[3] / 2] as [number, number],
          radius: Math.min(box[2], box[3]) / 2,
        }
      : undefined)
  anchorCache.set(code, resolved)
  return resolved
}

let builtLabelKey: string | undefined
const ensureLabels = () => {
  if (!svg.value) return
  const named = props.countryLabels
  const key = named ? JSON.stringify(named) : props.labels ? 'acronyms' : ''
  if (key === builtLabelKey) return

  svg.value.querySelectorAll('.country-label').forEach(label => label.remove())
  svg.value.querySelector('.country-label-leaders')?.remove()
  // A fresh set has not been laid out for this camera yet, so it goes back
  // behind the settle gate — a new errata gate must not flash its names at the
  // outgoing stage's zoom.
  svg.value.classList.remove('labels-settled')
  builtLabelKey = key
  if (!key) return

  const namespace = 'http://www.w3.org/2000/svg'
  // Leaders live in one group BENEATH the text, so a hairline never crosses a
  // glyph. Appended first for that reason.
  const leaders = document.createElementNS(namespace, 'g')
  leaders.classList.add('country-label-leaders')
  svg.value.appendChild(leaders)

  const codes = named ? Object.keys(named) : Object.keys(MAP_BOUNDS)
  for (const code of codes) {
    // Labelability is still judged on the box — the errata dealer tests the
    // same predicate, and the two must agree about what can be dealt.
    if (!isLabelableBox(labelBoxFor(MAP_BOUNDS[code as MapCode], MAP_REGIONS[code as MapCode])))
      continue
    const anchor = labelAnchorFor(code as MapCode)
    if (!anchor) continue

    const label = document.createElementNS(namespace, 'text')
    label.textContent = named ? (named[code as ISOCountryCode] ?? '') : code
    label.dataset.anchorX = String(anchor.point[0])
    label.dataset.anchorY = String(anchor.point[1])
    label.dataset.room = String(anchor.radius)
    label.setAttribute('x', String(anchor.point[0]))
    label.setAttribute('y', String(anchor.point[1]))
    label.classList.add('country-label')
    if (named) label.classList.add('country-label-name')
    svg.value.appendChild(label)
  }
  placeLabels()
  // Guarantee a settle even when the camera never moves (labels toggled on a
  // parked map): the settle is what sizes them and lifts the gate.
  settleSoon()
}

/** Offsets a crowded label tries, nearest first. Vertical before horizontal —
 *  the cartographic convention, and it keeps a name over its own latitude. */
/** Directions a crowded label tries, nearest first. Vertical before horizontal —
 *  the cartographic convention, and it keeps a name over its own latitude. */
const LABEL_NUDGES: [number, number][] = [
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0],
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
]
/** Gap kept between two labels, in CSS px. */
const LABEL_GUTTER_PX = 3
/**
 * How far a label may travel from its country, in CSS px — the cap that keeps
 * this a nudge and not a re-homing.
 *
 * In SCREEN pixels on purpose. An errata stage can frame a whole continent (a
 * lineup may hold Russia), and a cap in map units that looks modest there is
 * half of Europe. What the reader judges is whether the name is near the
 * country, which is a distance on their screen.
 */
const LABEL_MAX_SHIFT_PX = 28
/**
 * Names get further to travel than acronyms, because they cannot be dropped.
 * A stage that frames a continent (an errata lineup may hold Russia) packs its
 * small countries into a few dozen pixels, and 28px of room cannot separate
 * six of them. The leader line is what makes the extra distance readable.
 */
const LABEL_MAX_NAME_SHIFT_PX = 64
/** Candidate spacing along each direction, as a share of the label's height. */
const LABEL_STEP_FRACTION = 0.7

/**
 * De-overlap the labels, and give a name that had to leave its own country a
 * line back to it.
 *
 * Re-run at every settle, not once at build: a label's size in USER units
 * changes with the zoom, so who collides with whom is a property of the camera,
 * not of the label set.
 *
 * The two registers want opposite things when a label cannot be placed cleanly.
 * A written name is the question — it may never be dropped, so it takes its
 * least-bad slot and a leader line makes it unambiguous. An ISO acronym is a
 * traversal aid, and an aid may omit: it is dropped, because at world view
 * Europe alone would otherwise become a fan of hairlines.
 */
const placeLabels = () => {
  if (!svg.value) return
  const leaders = svg.value.querySelector('.country-label-leaders')
  if (!leaders) return
  const labels = [...svg.value.querySelectorAll<SVGTextElement>('.country-label')]
  if (!labels.length) return

  leaders.textContent = ''
  const unitsPerPx = userUnitsPerPixel()
  const gutter = LABEL_GUTTER_PX * unitsPerPx
  const shiftCap = (named: boolean) =>
    (named ? LABEL_MAX_NAME_SHIFT_PX : LABEL_MAX_SHIFT_PX) * unitsPerPx

  // Biggest country first: it keeps its natural spot and the small ones move.
  const ordered = labels
    .map(label => ({ label, room: Number(label.dataset.room) || 0 }))
    .sort((a, b) => b.room - a.room)

  type Box = { x: number; y: number; width: number; height: number }
  const placed: Box[] = []
  /** Overlap area against everything already placed — 0 means a clean slot. */
  const overlap = (box: Box) =>
    placed.reduce((total, other) => {
      const wide =
        Math.min(box.x + box.width, other.x + other.width) - Math.max(box.x, other.x) + gutter
      const tall =
        Math.min(box.y + box.height, other.y + other.height) - Math.max(box.y, other.y) + gutter
      return total + (wide > 0 && tall > 0 ? wide * tall : 0)
    }, 0)

  for (const { label, room } of ordered) {
    label.style.display = ''
    const anchorX = Number(label.dataset.anchorX)
    const anchorY = Number(label.dataset.anchorY)
    label.setAttribute('x', String(anchorX))
    label.setAttribute('y', String(anchorY))
    const size = label.getBBox()
    const boxAt = (x: number, y: number): Box => ({
      x: x - size.width / 2,
      y: y - size.height / 2,
      width: size.width,
      height: size.height,
    })

    // Walk outward in small steps and take the first clean slot, so a label
    // moves the least it can rather than the first amount that happens to work.
    const isName = label.classList.contains('country-label-name')
    let chosen: [number, number] = [anchorX, anchorY]
    let best = overlap(boxAt(anchorX, anchorY))
    if (best > 0) {
      const step = Math.max(size.height * LABEL_STEP_FRACTION, gutter)
      const maxShift = shiftCap(isName)
      search: for (let distance = step; distance <= maxShift; distance += step) {
        for (const [dx, dy] of LABEL_NUDGES) {
          const x = anchorX + dx * distance
          const y = anchorY + dy * distance
          const score = overlap(boxAt(x, y))
          if (score < best) {
            best = score
            chosen = [x, y]
          }
          if (best === 0) break search
        }
      }
    }

    // Still colliding after the cap: the aid stands down, the question does not.
    if (best > 0 && !isName) {
      label.style.display = 'none'
      continue
    }

    label.setAttribute('x', String(chosen[0]))
    label.setAttribute('y', String(chosen[1]))
    placed.push(boxAt(chosen[0], chosen[1]))

    // A name that left its own land has to say where it belongs. `room` is the
    // inscribed radius, so a shift past it means the anchor is no longer under
    // the label. Acronyms never draw one — see the note above.
    const shift = Math.hypot(chosen[0] - anchorX, chosen[1] - anchorY)
    if (!isName || shift <= Math.max(room, size.height / 2)) continue
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', String(chosen[0]))
    line.setAttribute(
      'y1',
      String(chosen[1] + (anchorY > chosen[1] ? size.height / 2 : -size.height / 2))
    )
    line.setAttribute('x2', String(anchorX))
    line.setAttribute('y2', String(anchorY))
    leaders.appendChild(line)
  }
}

watch(
  [() => props.labels, () => props.countryLabels],
  () => {
    nextTick(ensureLabels)
  },
  { deep: true }
)

const emit = defineEmits(['countryClick'])

const svg = ref<SVGElement>()
const wrapper = ref<HTMLElement>()

/**
 * The pointer's position in the SVG's own viewBox coordinates. Routed through
 * getScreenCTM so it survives viewBox scaling, letterboxing, and any CSS
 * transform — a getBoundingClientRect ratio would be wrong on all three.
 */
const viewBoxPoint = (event: MouseEvent): { x: number; y: number } | undefined => {
  const element = svg.value as SVGSVGElement | undefined
  const matrix = element?.getScreenCTM?.()
  if (!element || !matrix) return undefined
  const point = element.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const { x, y } = point.matrixTransform(matrix.inverse())
  return { x, y }
}

/**
 * How many viewBox units one CSS pixel spans. The same reasoning as
 * `viewBoxPoint`: a getBoundingClientRect ratio is wrong under letterboxing
 * and any CSS transform, and the rendered matrix is the only ground truth.
 * Anything that must come out a fixed size ON SCREEN — label type, the gap
 * between labels, how far one may be nudged — is measured through this.
 */
const userUnitsPerPixel = (): number => {
  const scale = (svg.value as SVGSVGElement | undefined)?.getScreenCTM?.()?.a
  return scale ? 1 / scale : 1
}

// --- Hover relay -------------------------------------------------------------
// One delegated listener on the wrapper (never per-path bindings — Vue must
// not diff 220 paths for a pointer move). Views subscribe like mapClick;
// deduped so resting on a country fires once, and mouse-only — hover is not
// a touch idiom.
let hoveredId: string | undefined
const onPointerOver = (event: PointerEvent) => {
  if (event.pointerType && event.pointerType !== 'mouse') return
  // Mid-gesture the paths are pointer-inert anyway — don't churn views with
  // enter/exit noise from whatever the camera slides under the cursor.
  if (wrapper.value?.classList.contains('is-interacting')) return
  const target = event.target as Element | null
  const isoCode = target?.getAttribute?.('data-id') ?? undefined
  if (isoCode === hoveredId) return
  hoveredId = isoCode
  // Same booth guard as handleClick: hover previews are view logic too
  if (gameStore.watching) return
  document.dispatchEvent(new CustomEvent('mapHover', { detail: { isoCode } }))
}

const handleClick = (isoCode: string, event?: MouseEvent) => {
  // Benched countries are not click targets anywhere — swallowing the click
  // here gates every listener (views, atlas, document mapClick) at once.
  if (unselectableSet.value.has(isoCode)) return

  // The booth's mounted views listen for mapClick like any view, but the map
  // sits OUTSIDE their inert wrapper — a watcher's tap must not drive the
  // followed racer's guess logic. Swallowed at the one dispatch source.
  if (gameStore.watching) return

  emit('countryClick', isoCode)

  // Pin-the-landmark scores the exact point, not the country, so carry the
  // click's lat/lng alongside the code. Existing listeners simply ignore it.
  const point = event ? viewBoxPoint(event) : undefined
  const latLng = point ? invertRobinson(point.x, point.y, MAP_PROJECTION) : undefined

  const mapClickEvent: MapClickEvent = new CustomEvent('mapClick', {
    detail: { isoCode, ...(latLng ? { latLng } : {}) },
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
/** Mouse pointers don't need finger-sized slop: at world zoom a 44px disc
 *  around Monaco swallows the whole Riviera. The halo starts tight and grows
 *  with zoom until it reaches the finger cap. */
const FINE_SLOP_PX = 8
/** Past this zoom the halo renders as a visible ring marking the tap area. */
const RING_ZOOM = 4

const updateEffectiveZoom = () => {
  if (!wrapper.value || !svg.value) return
  const effectiveZoom = WORLD_VIEW.width / viewState.width
  const pxPerUnit = (mapRect()?.width ?? viewState.width) / viewState.width
  svg.value.classList.toggle('deep-zoom', effectiveZoom >= RING_ZOOM)
  svg.value.style.setProperty('--stroke-zoom', String(1 / Math.max(1, effectiveZoom)))
  // User units per CSS pixel. `--stroke-zoom` is a share of the FRAME, so a
  // font sized from it comes out `22 * cssWidth / 2000` px — 14px on the 1280px
  // desktop it was tuned on and 4.4px on a 402px phone. Labels want real screen
  // pixels, so they ride this instead.
  svg.value.style.setProperty('--screen-unit', String(userUnitsPerPixel()))
  const dotRadius = 3.5 / Math.max(1, effectiveZoom)
  svg.value.querySelectorAll<SVGCircleElement>('.micro-marker').forEach(dot => {
    const footprint = Number(dot.dataset.footprint) || 0
    dot.style.display = footprint * effectiveZoom < LEGIBLE_FOOTPRINT_PX ? '' : 'none'
    dot.setAttribute('r', String(dotRadius))
  })
  // Tap halos: touch keeps the full finger-sized on-screen slop at any zoom;
  // fine pointers scale up from a tight world-view halo to the same cap.
  const slopPx = isCoarsePointer.value
    ? HIT_SLOP_PX
    : clamp(FINE_SLOP_PX * effectiveZoom, FINE_SLOP_PX, HIT_SLOP_PX)
  svg.value.querySelectorAll<SVGCircleElement>('.micro-hit').forEach(halo => {
    halo.setAttribute('r', String(dotRadius + slopPx / Math.max(1, pxPerUnit)))
  })
  applyLod(effectiveZoom)
  // Overlap is a property of the camera, not the label set: a label's size in
  // user units moves with the zoom, so the solve belongs at every settle.
  placeLabels()
  svg.value.classList.add('labels-settled')
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
/** The margin also buys skipped passes: nothing culled can reach the screen
 *  before the camera has drifted this fraction of a viewport (or rescaled
 *  by CULL_ZOOM_DRIFT), so in between the box tests are pure waste. */
const CULL_PAN_DRIFT = 0.25
const CULL_ZOOM_DRIFT = 0.1
let lastCullView: { x: number; y: number; width: number } | undefined
/** Every country code, hoisted — Object.keys allocates 219 strings a call. */
const MAP_CODES = Object.keys(MAP_BOUNDS) as MapCode[]
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

const intersectsAnyRegion = (code: string, x: number, y: number, width: number, height: number) => {
  for (const [rx, ry, rw, rh] of MAP_REGIONS[code as MapCode] ?? []) {
    if (rx < x + width && rx + rw > x && ry < y + height && ry + rh > y) return true
  }
  return false
}

/** Show every country again — reveals/fly-ins must never target a culled path. */
const uncullAll = () => {
  lastCullView = undefined // the DOM no longer matches any past pass
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
  // The magnifier mirrors this layer with <use>, which reflects the live DOM —
  // including `display: none`. Culling a country out of the main viewport also
  // erases it from the inset, and since the two zoom windows overlap (culling
  // from 2x, the inset hides at 6x) the inset's context blinks in and out as
  // the camera moves. Keep everything drawn while it is on screen; the inset
  // only exists at low zoom, where almost nothing is culled anyway.
  if (props.inset || WORLD_VIEW.width / viewState.width < CULL_ZOOM) {
    uncullAll()
    return
  }
  if (
    lastCullView &&
    Math.abs(viewState.x - lastCullView.x) < viewState.width * CULL_PAN_DRIFT &&
    Math.abs(viewState.y - lastCullView.y) < viewState.height * CULL_PAN_DRIFT &&
    Math.abs(viewState.width - lastCullView.width) < lastCullView.width * CULL_ZOOM_DRIFT
  ) {
    return
  }
  lastCullView = { x: viewState.x, y: viewState.y, width: viewState.width }
  const marginX = viewState.width * CULL_MARGIN
  const marginY = viewState.height * CULL_MARGIN
  for (const code of MAP_CODES) {
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
    for (const code of hdApplied) pathEls.get(code)?.setAttribute('d', MAP_PATHS[code as MapCode])
    hdApplied.clear()
    return
  }
  if (!hdPaths || effectiveZoom < LOD_ZOOM_IN) return // hysteresis band: keep as-is

  for (const code of MAP_CODES) {
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
/** True once the player pans/zooms by hand; the subject watcher resets it.
 *  While set, berth changes stop re-framing — the view is theirs. */
let cameraTaken = false
const beginGesture = () => {
  cameraTaken = true
  gsap.killTweensOf(viewState)
  if (!loopRunning) {
    Object.assign(targetView, viewState)
    // A fresh gesture is the moment layout could have shifted under us —
    // remeasure once here, never per event or per frame.
    measureMapRect()
  }
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

/** Pointer position → map units, via the gesture-cached screen rect.
 *  No rect (unmeasurable, zero-size window) → the view centre, so a zoom
 *  anchored on it degrades to a plain centred zoom. */
const unitsAt = (clientX: number, clientY: number) => {
  const rect = mapRect()
  if (!rect) {
    return { x: viewState.x + viewState.width / 2, y: viewState.y + viewState.height / 2 }
  }
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
  if (revealLocked) return // the zoom-out reveal owns the camera
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
  if (revealLocked) return // the zoom-out reveal owns the camera
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
    const rect = mapRect()
    if (!rect) return // zero-size window: no sane px→unit ratio, skip the step
    const unitsPerPx = viewState.width / rect.width
    targetView.x -= (pointer.x - previous.x) * unitsPerPx
    targetView.y -= (pointer.y - previous.y) * unitsPerPx
    const dt = Math.max(1, pointer.movedAt - previous.at)
    // Blend for a stable read of the release velocity (in units/ms)
    pointer.velocityX =
      (0.8 * (-(pointer.x - previous.x) * unitsPerPx)) / dt + 0.2 * pointer.velocityX
    pointer.velocityY =
      (0.8 * (-(pointer.y - previous.y) * unitsPerPx)) / dt + 0.2 * pointer.velocityY
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
  measureMapRect()
  Object.assign(viewState, restView())
  Object.assign(targetView, viewState)
  writeViewBox()
  window.addEventListener('resize', () => {
    const centerY = viewState.y + viewState.height / 2
    measureMapRect()
    for (const view of [viewState, targetView]) {
      view.height = view.width / viewAspect
      view.y = centerY - view.height / 2
      clampView(view)
    }
    writeViewBox()
    updateEffectiveZoom()
  })

  wrapper.value.addEventListener('wheel', onWheel) // non-passive: it owns the scroll
  wrapper.value.addEventListener('pointerover', onPointerOver)
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

  if (props.labels || props.countryLabels) ensureLabels()
  if (props.focusCountries.length) frameFocus()
})

/**
 * Zoom-Out gate: open extreme-tight on a country's coastline, then ease out to
 * its normal frame over `durationSeconds` so players race to name it before the
 * shape is obvious. Reduced motion snaps straight to the recognisable frame.
 */
let zoomOutTween: gsap.core.Tween | undefined
// While a reveal is animating it owns the camera — manual wheel/pinch zoom is
// locked out so the player can't cheat the reveal by zooming out early.
let revealLocked = false
const startZoomOut = (isoCode: MapCode, durationSeconds: number) => {
  if (!wrapper.value || !svg.value) return
  const mainland = mainlandBox(MAP_REGIONS[isoCode], MAP_BOUNDS[isoCode])
  if (!mainland) return console.warn(`Zoom-out: country not on map: ${isoCode}`)

  // The country's full (recognisable) frame is the END; the START is a tight
  // crop centred on it. A fixed fraction of the frame alone breaks for huge
  // countries — 18% of Russia's bbox is still half the planet — so the start is
  // also capped to an absolute deep zoom, giving every country a comparably
  // tight sliver regardless of its size. Sized against the frame's LARGER
  // dimension: on a portrait screen the frame is tall, and a width-based crop
  // would span enough latitude to show the whole country plus its neighbours.
  const wide = frameForBoxes([mainland], [])
  const cx = wide.x + wide.width / 2
  const cy = wide.y + wide.height / 2
  const TIGHT_FRACTION = 0.13
  const TIGHT_MAX_SPAN = WORLD_VIEW.width / 18 // absolute deep-zoom ceiling
  const TIGHT_MIN_SPAN = WORLD_VIEW.width / 200 // geometry-legibility floor
  /** At least one axis must show less than this much of the country. */
  const COUNTRY_MAX_VISIBLE = 0.6
  const wideSpan = Math.max(wide.width, wide.height)
  let startSpan = Math.min(wideSpan * TIGHT_FRACTION, TIGHT_MAX_SPAN)
  // Small countries (The Gambia) are dwarfed by the frame's minimum padding, so
  // a fraction of THAT frame still contains them whole and the shape gives the
  // answer away at the first frame. Shrink until one axis crops the country —
  // one is enough: a crop across the narrow axis hides the outline just as well.
  const [, , mainlandWidth, mainlandHeight] = mainland
  const shrink = Math.max(
    (mainlandWidth * COUNTRY_MAX_VISIBLE) / (startSpan * Math.min(1, viewAspect)),
    (mainlandHeight * COUNTRY_MAX_VISIBLE) / (startSpan * Math.min(1, 1 / viewAspect))
  )
  startSpan = Math.max(startSpan * Math.min(1, shrink), TIGHT_MIN_SPAN)
  const startWidth = startSpan * Math.min(1, viewAspect)
  const startHeight = startWidth / viewAspect
  const tightView = {
    x: cx - startWidth / 2,
    y: cy - startHeight / 2,
    width: startWidth,
    height: startHeight,
  }

  // A tight crop can hold several borders at once (The Gambia inside Senegal):
  // fade the neighbours' ink so the crop reads as ONE country being asked
  // about, not a border collage. Cleared when the gate ends (watcher below).
  svg.value.classList.add('zoom-out-reveal')
  pathEls.get(isoCode)?.classList.add('zoom-out-target')

  loopRunning = false
  momentum.x = 0
  momentum.y = 0
  wrapper.value.classList.add('is-interacting')

  // Not just `zoomOutTween`: clearing `reveal` between rounds starts an
  // anonymous world-fit tween on `viewState` that would otherwise keep writing
  // the camera every frame and drag it back off the crop we are about to set.
  gsap.killTweensOf(viewState)
  // Claim the camera before touching it, so a watcher flushed later in this
  // same tick can't start a competing tween through `tweenToView`.
  revealLocked = true

  if (prefersReducedMotion()) {
    Object.assign(viewState, wide)
    writeViewBox()
    cullPass()
    Object.assign(targetView, viewState)
    wrapper.value.classList.remove('is-interacting')
    updateEffectiveZoom()
    // Nothing is animating: hand the camera back, or the next round's
    // world-fit tween would be silently dropped.
    revealLocked = false
    return
  }

  const startView = { ...tightView }
  // The crop may sit deeper than the manual-gesture MAX_ZOOM floor (a portrait
  // screen needs a narrower width for the same latitude span) — clamp only to
  // the world bounds, not the zoom floor. Manual zoom is locked for the whole
  // reveal, so the camera can't be left stranded past the gesture limit.
  clampView(startView, startWidth)
  Object.assign(viewState, startView)
  writeViewBox()
  // The reveal starts deeply zoomed, so run the LOD pass now (and periodically
  // through the tween) to load + swap in the HD geometry — otherwise the whole
  // reveal renders the blocky low-detail tier and only sharpens at the very end.
  updateEffectiveZoom()
  let sinceLod = 0
  zoomOutTween = gsap.to(viewState, {
    ...wide,
    duration: durationSeconds,
    // Linger on the tight crop, then accelerate the reveal — the country stays
    // hard to place for most of the clock, rewarding an early guess.
    ease: 'power2.in',
    overwrite: 'auto',
    onUpdate: () => {
      writeViewBox()
      // Refresh LOD a few times a second (not every frame — the swap is cheap
      // but the full scan isn't) so neighbours entering the crop arrive HD and
      // the tier steps back down as it eases past the threshold.
      if ((sinceLod += 1) >= 8) {
        sinceLod = 0
        updateEffectiveZoom()
      }
    },
    onComplete: () => {
      revealLocked = false
      Object.assign(targetView, viewState)
      wrapper.value?.classList.remove('is-interacting')
      updateEffectiveZoom()
    },
  })
}

const moveToCountry = () => {
  if (!wrapper.value || !svg.value) {
    return console.warn('Map not initialized yet')
  }

  // When a focus frame is active (silhouette/traversal reveals) that camera
  // owns the shot — the fly-in would fight it.
  if (props.focusCountries.length) return

  const { highlightCountry } = props
  if (!highlightCountry) return

  // Frame the mainland, not the whole-country bbox: RU/US antimeridian
  // fragments would otherwise zoom the camera out to the whole planet.
  const mainland = mainlandBox(MAP_REGIONS[highlightCountry], MAP_BOUNDS[highlightCountry])
  if (!mainland) {
    return console.warn(`Country does not exist: ${highlightCountry}`)
  }
  tweenToView(frameForBoxes([mainland], []))
}

const gameStore = useGameStore()

// Registered before the two reveal-driven watchers below: Vue flushes watchers
// in creation order, and answering a zoom-out gate clears `map.zoomOut` and
// sets `map.reveal` in the same tick. Releasing the camera first lets the
// result fly-to through; the reverse order would see `revealLocked` still set
// and silently drop it.
watch(
  () => gameStore.map.zoomOut,
  zoomOut => {
    if (zoomOut) startZoomOut(zoomOut.isoCode as MapCode, zoomOut.durationSeconds)
    else {
      zoomOutTween?.kill()
      revealLocked = false
      svg.value?.classList.remove('zoom-out-reveal')
      svg.value?.querySelector('.zoom-out-target')?.classList.remove('zoom-out-target')
    }
  },
  { immediate: true }
)
watch(() => props.highlightCountry, moveToCountry)
watch(
  () => gameStore.map.reveal,
  reveal => {
    // Reveal cleared between rounds: return the camera to the world view.
    if (!reveal) tweenToView(restView())
  }
)
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
.game-map {
  height: var(--viewport-height);
  overflow: hidden;
  touch-action: none;
  overscroll-behavior: none;
  // The map never sizes or paints outside its own box — let the browser skip
  // invalidating anything else when the vector layer repaints mid-gesture.
  contain: layout paint;
}

// Receded: the world is still there, just faint and set back, so a full-screen
// overlay can own the eye. The slight scale-down does the depth work that
// opacity alone cannot — it reads as distance rather than as a dimmer switch.
// Slow both ways, so the reveal is the map coming into focus, not snapping on.
.game-map svg {
  transform-origin: center;
  transition:
    opacity var(--motion-slow) var(--ease-smooth),
    transform var(--motion-slow) var(--ease-smooth);
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

// A micro country carrying state: the halo fills with the country's own
// colour so its status reads at ANY zoom — the true shape never will.
.micro-hit.stated-halo {
  opacity: 1;
  fill: var(--halo-state);
  fill-opacity: 0.45;
  stroke: var(--halo-state);
  stroke-width: calc(1.5px * var(--stroke-zoom, 1));
  stroke-dasharray: none;
}

// Benched countries: part of the terrain, never a target — no hand cursor,
// no hit-testing (handleClick also swallows them, belt and braces).
path[id].unselectable-country {
  cursor: default;
  pointer-events: none;
}

path[id],
.micro-marker {
  cursor: pointer;
  fill: var(--map-not-highlight);
  transition:
    fill var(--motion-slow),
    opacity var(--motion-slow),
    filter var(--motion-base);
  // Zero unless the map runs staggered (--chain-index set per path): then the
  // walked chain's fills arrive in sequence, one hop after another.
  transition-delay: calc(var(--chain-index, 0) * 60ms);

  // Off the current board (a continental variant) — visibly not in play.
  // Not element opacity: neighbouring dimmed countries repaint their shared
  // border, and two 50% strokes stack back to near-solid ink. Fills never
  // overlap, so fill-opacity dims them safely; the stroke gets a solid
  // pre-blended colour that overdraws itself without accumulating.
  &.dimmed-country {
    fill-opacity: 0.5;
    stroke: color-mix(in srgb, currentColor 50%, var(--background-color));
  }

  // The chain head breathes ember → yellow; frames without a fill fall back
  // to the inline grouping colour, so the pulse rides whatever the view set.
  @media (prefers-reduced-motion: no-preference) {
    &.pulsing-country {
      animation: pulse-fill 1.8s ease-in-out infinite;
    }
  }
}

@keyframes pulse-fill {
  50% {
    fill: hsla(45, 85%, 55%, 0.92);
  }
}

// The guess wears the accent orange; the revealed answer takes the map's own
// blue, the hue the feature markers already use.
.map-pin {
  pointer-events: none;
  color: var(--hior-ange);

  &.answer {
    color: ink(1, 41%);
  }
}

.map-pin-scale {
  transform: scale(var(--stroke-zoom, 1));
}

.map-pin-halo {
  fill: var(--background-color);
  stroke: currentColor;
  stroke-width: 3px;
}

.map-pin-dot {
  fill: currentColor;
}

.map-pin-link {
  fill: none;
  pointer-events: none;
  stroke: ink(1, 41%);
  stroke-width: calc(2.5px * var(--stroke-zoom, 1));
  stroke-dasharray: calc(9px * var(--stroke-zoom, 1)) calc(7px * var(--stroke-zoom, 1));
}

// The action ring: a stroke, never a fill — "you may act here". Ember, the
// "you" accent (the pulsing head shares it), so it can never be mistaken
// for the map's dark border ink.
path.ringed-country,
.micro-marker.ringed-country {
  stroke: ember(1, 45%);
  stroke-width: calc(2.5px * var(--stroke-zoom, 1));
  stroke-linejoin: round;
}

// The sailing whisper: the hideout's coast hums sea-blue while passages
// remain — a signal that boats exist, never a list of where they go.
path.sea-glow-country {
  stroke: ink(1, 41%);
  stroke-width: calc(2px * var(--stroke-zoom, 1));
  stroke-dasharray: calc(1.5px * var(--stroke-zoom, 1)) calc(3px * var(--stroke-zoom, 1));
  stroke-linecap: round;
}

.map-land-route {
  fill: none;
  pointer-events: none;
  stroke: hsla(215.7, 40%, 30%, 0.8);
  stroke-width: calc(2px * var(--stroke-zoom, 1));
  stroke-linecap: round;
}

.map-sea-link {
  fill: none;
  pointer-events: none;
  stroke: ink(0.75, 41%);
  stroke-width: calc(2px * var(--stroke-zoom, 1));
  stroke-linecap: round;
  stroke-dasharray: calc(5px * var(--stroke-zoom, 1)) calc(6px * var(--stroke-zoom, 1));
  // The dashes drift from origin to destination — slow enough to read as a
  // current, not a marquee. One cycle = one dash+gap, so the loop is seamless.
  animation: sea-drift 1.6s linear infinite;
}

@keyframes sea-drift {
  to {
    stroke-dashoffset: calc(-11px * var(--stroke-zoom, 1));
  }
}

// The sail chip at the arc's crown: same cream-disc language as the walk
// numbers (MapYearLabels), sized in screen pixels via --stroke-zoom.
.map-sea-chip {
  pointer-events: none;
}

.map-sea-chip-scale {
  transform: scale(var(--stroke-zoom, 1));
}

.chip-disc {
  fill: milk(0.95);
  stroke: ink(0.6, 41%);
  stroke-width: 1;
}

.chip-ship {
  fill: none;
  stroke: ink(1, 30%);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (prefers-reduced-motion: reduce) {
  .map-sea-link {
    animation: none;
  }
}

// Marks a contested territory that is too small to draw. Sized in screen
// pixels via --stroke-zoom, so it stays legible from world view down to a
// deep zoom on a nine-metre rock.
.feature-marker {
  pointer-events: none;
  color: ink(1, 41%);
}

.feature-marker-scale {
  transform: scale(var(--stroke-zoom, 1));
}

.feature-marker-ring {
  fill: hsla(199, 68%, 62%, 0.45);
  stroke: currentColor;
  stroke-width: 2px;
  filter: drop-shadow(0 0 3px ink(0.6, 60%));
}

.feature-marker-dot {
  fill: currentColor;
}

// A single outward pulse on arrival, so the eye finds it.
.feature-marker-pulse {
  fill: none;
  stroke: currentColor;
  transform-origin: center;
  animation: feature-marker-pulse 1.4s var(--ease-out-expressive) 2;
}

@keyframes feature-marker-pulse {
  0% {
    opacity: 0.8;
    stroke-width: 2px;
    transform: scale(0.6);
  }

  100% {
    opacity: 0;
    stroke-width: 0.5px;
    transform: scale(3.2);
  }
}

// Physical-geography overlay (water modes). Widths ride the same zoom
// compensation as country borders so rivers stay readable, never ink floods.
.map-feature {
  pointer-events: none;

  &.line {
    fill: none;
    stroke: ink(1, 41%);
    stroke-width: calc(2.4px * var(--stroke-zoom, 1));
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 calc(1.5px * var(--stroke-zoom, 1)) ink(0.5, 60%));
  }

  &.area {
    stroke: ink(1, 35%);
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
  // While the camera is the animation, trade anti-aliased coastlines for
  // cheap rasterization — 130k HD-tier vertices repaint every pan frame.
  // shape-rendering inherits, so one rule covers every path and marker;
  // settle removes the class and the same repaint that restores strokes/LOD
  // brings the crisp edges back.
  svg {
    shape-rendering: optimizeSpeed;
  }

  path[id],
  .micro-marker,
  .micro-hit {
    pointer-events: none;
    transition: none;
  }

  // The sailing dashes hold their drift while the camera is the animation.
  .map-sea-link {
    animation-play-state: paused;
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

// Zoom-Out gate: neighbours keep only a whisper of their land tint and ink so
// a tight crop reads as ONE country being asked about — several borders (and
// landmasses) can share the opening frame.
.zoom-out-reveal {
  path[data-id]:not(.zoom-out-target),
  .micro-marker {
    stroke-opacity: 0.35;
    fill-opacity: 0.6;
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
  stroke: ink(0.55);
}
// Solo + landmass: the continents stay as one quiet silhouette. A uniform
// fill with no strokes makes internal borders vanish — adjacent countries
// share topology arcs, so same-fill polygons fuse seamlessly and only the
// coastlines read. The ghosts-of-empires backdrop.
.solo.landmass path[data-id] {
  fill: hsla(36, 28%, 88%, 1);
  stroke: transparent;
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
// Written names are read at region zoom, where a font sized in user units
// would balloon with the camera. `--screen-unit` is user units per CSS pixel,
// so these numbers ARE screen pixels at any zoom and any viewport.
//
// Not `--stroke-zoom`: that is a share of the FRAME, which made the size ride
// the viewport width — 14px on a 1280px desktop, 4.4px on a 402px phone.
// Strokes want the frame; text wants the screen.
//
// Haloed with paint-order so a name stays readable over a tinted country.
:deep(.country-label-name) {
  opacity: 1;
  font-weight: 600;
  paint-order: stroke;
  stroke: #{milk()};
  stroke-linejoin: round;
  font-size: calc(13px * var(--screen-unit, 1));
  stroke-width: calc(3.6px * var(--screen-unit, 1));
}
// Both registers are laid out at settle — placement depends on the camera. Until
// the first one lands they are sized from the PREVIOUS frame's zoom, which reads
// as a flash of oversized overlapping text mid-fly-in, so they wait it out.
:deep(.country-label),
:deep(.country-label-leaders) {
  opacity: 0;
}
.show-labels :deep(.labels-settled .country-label),
.show-labels :deep(.labels-settled .country-label-leaders) {
  opacity: 1;
  transition: opacity var(--motion-base) var(--ease-out-expressive);
}
.show-labels :deep(.labels-settled .country-label) {
  opacity: 0.65;
}
.show-labels :deep(.labels-settled .country-label-name) {
  opacity: 1;
}
// The hairline back to the country a displaced name belongs to. Thin and quiet:
// it only has to be followable, and it crosses countries the reader is judging.
:deep(.country-label-leaders line) {
  fill: none;
  stroke: var(--dark-blue);
  stroke-linecap: round;
  opacity: 0.45;
  stroke-width: calc(1px * var(--screen-unit, 1));
}
</style>
