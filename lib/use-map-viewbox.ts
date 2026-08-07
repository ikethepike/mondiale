import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, type Ref } from 'vue'

/** The world map's nominal design frame (mirror of data/map.gen's MAP_VIEWBOX). */
export const WORLD_MAP_WIDTH = 2000
export const WORLD_MAP_HEIGHT = 1001

export interface MapViewBox {
  x: number
  y: number
  w: number
  h: number
}

/**
 * How far the camera may pan, per axis as a fraction of that axis's view
 * dimension, before the reactive tier commits. In between, pan-tracked
 * overlays ride a compositor transform — pure pan frames never touch Vue.
 */
export const COMMIT_DRIFT = 0.2

/**
 * How far past the viewport a pan-tracked overlay paints, per side, as a
 * fraction of the viewport's own dimension on each axis. Must exceed
 * COMMIT_DRIFT per axis (each axis's drift budget is measured against its
 * own dimension — see use-map-viewbox.test.ts), or a fast pan slides the
 * painted edge into view before the next commit repaints it.
 */
export const OVERLAY_BLEED = 0.25
/** The bleed as a CSS inset — the first-frame fallback, before the map's
 *  painted rect has been measured (see `overlayBox`). */
export const OVERLAY_BLEED_INSET = `${-OVERLAY_BLEED * 100}%`

/** `box` grown by the bleed on every side — the viewBox a bled overlay draws. */
export const bleedBox = (box: MapViewBox): MapViewBox => ({
  x: box.x - box.w * OVERLAY_BLEED,
  y: box.y - box.h * OVERLAY_BLEED,
  w: box.w * (1 + OVERLAY_BLEED * 2),
  h: box.h * (1 + OVERLAY_BLEED * 2),
})

/** A screen-space box in CSS pixels, viewport-relative (a DOMRect's shape). */
export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The map's PAINTED rect grown by the bleed per side — the box a bled overlay
 * must occupy for its `bleedBox` viewBox to land on the map's own projection.
 *
 * Anchoring to the painted rect (not to whatever containing block the overlay
 * happens to inherit) is the whole fix: an overlay is a SIBLING of the map, so
 * it sees neither `.game-map`'s recede `transform: scale(.8)` nor a harness
 * that offsets the map's box. Both displaced the ghost off its own countries.
 *
 * Pairs with `bleedBox`: same fraction, same centre, so aspect is preserved and
 * the svg's `preserveAspectRatio="none"` is an exact identity rather than a
 * stretch.
 */
export const overlayBox = (rect: ScreenRect) => ({
  left: rect.x - rect.width * OVERLAY_BLEED,
  top: rect.y - rect.height * OVERLAY_BLEED,
  width: rect.width * (1 + OVERLAY_BLEED * 2),
  height: rect.height * (1 + OVERLAY_BLEED * 2),
})

// --- The singleton poller -----------------------------------------------------
// One rAF loop no matter how many overlays are mounted. It reads the map svg's
// viewBox attribute each frame (unchanged frames cost one string compare) and
// splits what it sees into two tiers: `currentBox` is per-frame and
// non-reactive; `committedBox` is the reactive echo every consumer computes
// against, refreshed on zoom frames, on spent pan-drift budget, and at settle.

const committedBox = ref<MapViewBox>()
let currentBox: MapViewBox | undefined
let drifted = false
let lastRaw = ''
let frame: number | undefined
let mapSvg: SVGSVGElement | null = null

/**
 * The map svg's painted rect, re-read every frame it moves. Deliberately
 * `getBoundingClientRect` on the SVG, not `clientWidth` on a wrapper: it
 * returns the POST-transform box, so the recede scale and any containing-block
 * offset both land in one read. Per-frame on purpose — the recede is a CSS
 * transition, so a resize-gated measurement would lag it for its whole run.
 *
 * (GameMap's own `measureMapRect` reads the UNtransformed wrapper, because the
 * camera's aspect must not follow a mid-recede scale. Opposite needs, opposite
 * measurements — both correct for their purpose.)
 */
const paintedRect = ref<ScreenRect>()

interface PanTracked {
  el: HTMLElement
  size: { w: number; h: number }
}
const tracked = new Set<PanTracked>()

/** The pan ride-along converts map-space drift to pixels with this size, so it
 *  must be the PAINTED size — `clientWidth` is pre-transform and would drift the
 *  slide by the recede's scale factor. */
const measureTracked = (item: PanTracked) => {
  const rect = paintedRect.value
  item.size.w = rect ? rect.width : item.el.clientWidth
  item.size.h = rect ? rect.height : item.el.clientHeight
}

const readPaintedRect = () => {
  if (!mapSvg?.isConnected) return
  const rect = mapSvg.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const previous = paintedRect.value
  if (
    previous &&
    previous.x === rect.x &&
    previous.y === rect.y &&
    previous.width === rect.width &&
    previous.height === rect.height
  ) {
    return
  }
  paintedRect.value = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  for (const item of tracked) measureTracked(item)
}

/** Slide every tracked overlay by the pan since the last commit — compositor
 *  work only, no layout and no Vue. */
const applyPanTransforms = () => {
  const base = committedBox.value
  if (!base?.w || !currentBox) return
  for (const item of tracked) {
    const dx = (-(currentBox.x - base.x) / base.w) * item.size.w
    const dy = (-(currentBox.y - base.y) / base.h) * item.size.h
    item.el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
  }
}

const commit = () => {
  if (!currentBox) return
  committedBox.value = currentBox
  drifted = false
  if (!tracked.size) return
  // Clear the ride-along transforms only after Vue has patched the consumers
  // against the fresh box, so the reset and the re-layout share one paint.
  void nextTick(() => {
    for (const item of tracked) item.el.style.transform = ''
  })
}

const readViewBox = () => {
  frame = requestAnimationFrame(readViewBox)
  if (!mapSvg?.isConnected) mapSvg = document.querySelector('.game-map svg')
  // Before the viewBox early-out: the map's box moves on its own (recede
  // transition, resize, a harness offset) while the camera holds perfectly
  // still, and an overlay anchored to a stale rect drifts off the map.
  readPaintedRect()
  const attribute = mapSvg?.getAttribute('viewBox') ?? ''
  if (attribute === lastRaw) {
    // The camera held still for a frame: land any outstanding pan drift.
    if (drifted) commit()
    return
  }
  lastRaw = attribute
  const raw = attribute.split(/\s+/).map(Number)
  if (raw.length !== 4 || !raw.every(Number.isFinite)) return
  currentBox = { x: raw[0]!, y: raw[1]!, w: raw[2]!, h: raw[3]! }
  const base = committedBox.value
  // Zooms re-lay-out every frame (glyphs and radii counter-scale through the
  // box); pans stay on the compositor until the drift budget is spent.
  if (
    !base?.w ||
    currentBox.w !== base.w ||
    Math.abs(currentBox.x - base.x) > base.w * COMMIT_DRIFT ||
    Math.abs(currentBox.y - base.y) > base.h * COMMIT_DRIFT
  ) {
    commit()
  } else {
    drifted = true
    applyPanTransforms()
  }
}

const remeasureAll = () => {
  for (const item of tracked) measureTracked(item)
}

/**
 * Poller lifetime as a token ledger, not a bare counter. Vue runs
 * onBeforeUnmount even for a consumer torn down before it ever mounted (an
 * out-in view swap racing a v-if), so a counter can be pushed to zero by an
 * orphan release while mounted overlays still depend on the poller — the
 * empire ghost then paints a frozen camera while the map tweens on. A token
 * pairs every release with its own claim: orphan and double releases are
 * no-ops, and start/stop fire exactly on the 0↔1 edges.
 */
export const createCameraLedger = (start: () => void, stop: () => void) => {
  const tokens = new Set<symbol>()
  return {
    claim: (): symbol => {
      const token = Symbol('camera-poller')
      tokens.add(token)
      if (tokens.size === 1) start()
      return token
    },
    release: (token: symbol | undefined): void => {
      if (token === undefined || !tokens.delete(token)) return
      if (!tokens.size) stop()
    },
  }
}

const ledger = createCameraLedger(
  () => {
    // Force a fresh read — the camera may have moved while nobody polled — and
    // drop any drift carried over from a mid-pan unmount, or the first frame
    // could commit a dead camera before the svg is even queryable.
    lastRaw = ''
    drifted = false
    currentBox = undefined
    paintedRect.value = undefined
    window.addEventListener('resize', remeasureAll)
    frame = requestAnimationFrame(readViewBox)
  },
  () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
    window.removeEventListener('resize', remeasureAll)
  }
)

/**
 * The camera as of the last polled frame — for imperative readers (interval
 * tickers, one-shot measurements) that must see the true camera between
 * reactive commits. Requires a mounted `useMapViewBox` subscriber to be live.
 */
export const currentViewBox = (): MapViewBox | undefined => currentBox ?? committedBox.value

/**
 * The live game-map camera — the one way an overlay tracks pans and zooms.
 * `viewBox` recomputes layouts on zoom frames and every COMMIT_DRIFT of pan;
 * between commits a `useMapPanTrack`ed container rides the compositor, so
 * chips never stutter behind the camera and pan frames stay render-free.
 *
 * `toScreenPercent` lands a map-space point in viewport percent;
 * `cameraScale` counter-scales strokes and glyphs so zoom never balloons them.
 */
export const useMapViewBox = () => {
  let token: symbol | undefined
  onMounted(() => (token ??= ledger.claim()))
  onBeforeUnmount(() => {
    ledger.release(token)
    token = undefined
  })

  const toScreenPercent = (x: number, y: number): { left: number; top: number } | undefined => {
    const vb = committedBox.value
    if (!vb?.w || !vb.h) return undefined
    return { left: ((x - vb.x) / vb.w) * 100, top: ((y - vb.y) / vb.h) * 100 }
  }

  /** 1 at the full world frame, shrinking as the camera dives. */
  const cameraScale = computed(() => (committedBox.value?.w ?? WORLD_MAP_WIDTH) / WORLD_MAP_WIDTH)

  return { viewBox: committedBox, toScreenPercent, cameraScale }
}

/**
 * Ride a full-viewport overlay along with pans between commits: the poller
 * translates the element on the compositor each pan frame and clears the
 * transform in the same paint as each commit's re-layout. Overlays that draw
 * up to their edges pair this with OVERLAY_BLEED / `bleedBox` so the slide
 * never reveals unpainted ground.
 *
 * Returns the element's cached px `size` (kept fresh across resizes) so
 * layout math can use pixels without reading `window` or layout per compute.
 * Reactive on purpose: the mount-time measurement lands after the first
 * render, and a consumer's computed must re-run when it does — it only
 * mutates at mount/resize, so the poller's per-frame proxy reads stay cheap.
 *
 * `boxStyle` is the overlay's own box, pinned to the map's PAINTED rect (see
 * `overlayBox`). Bled overlays bind it instead of a bare `inset` so they stay
 * registered with the map through the recede scale and any containing-block
 * offset — never their own parent's box, which is a different element.
 */
export const useMapPanTrack = (el: Ref<HTMLElement | undefined>) => {
  const size = reactive({ w: 0, h: 0 })
  let item: PanTracked | undefined
  let token: symbol | undefined
  onMounted(() => {
    token ??= ledger.claim()
    if (!el.value) return
    item = { el: el.value, size }
    tracked.add(item)
    measureTracked(item)
  })
  onBeforeUnmount(() => {
    if (item) tracked.delete(item)
    item = undefined
    ledger.release(token)
    token = undefined
  })

  const pinned = (box: { left: number; top: number; width: number; height: number }) => ({
    position: 'fixed' as const,
    inset: 'auto',
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  })

  /** The BLED svg box — pairs with a `bleedBox` viewBox. */
  const boxStyle = computed(() => {
    const rect = paintedRect.value
    // Until the map is measurable, fall back to the old containing-block
    // inset: right whenever the boxes already agree, and only ever a frame.
    if (!rect) return { inset: OVERLAY_BLEED_INSET }
    return pinned(overlayBox(rect))
  })

  /** The map's painted rect exactly — for layers positioned in PERCENT of the
   *  unbled camera box (`toScreenPercent`), which the bleed would rescale. */
  const frameStyle = computed(() => {
    const rect = paintedRect.value
    if (!rect) return {}
    return pinned({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })
  })

  return { size, boxStyle, frameStyle }
}
