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
/** The bleed as a CSS inset — same constant, for the overlay's own box. */
export const OVERLAY_BLEED_INSET = `${-OVERLAY_BLEED * 100}%`

/** `box` grown by the bleed on every side — the viewBox a bled overlay draws. */
export const bleedBox = (box: MapViewBox): MapViewBox => ({
  x: box.x - box.w * OVERLAY_BLEED,
  y: box.y - box.h * OVERLAY_BLEED,
  w: box.w * (1 + OVERLAY_BLEED * 2),
  h: box.h * (1 + OVERLAY_BLEED * 2),
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
let subscribers = 0

interface PanTracked {
  el: HTMLElement
  size: { w: number; h: number }
}
const tracked = new Set<PanTracked>()

const measureTracked = (item: PanTracked) => {
  item.size.w = item.el.clientWidth
  item.size.h = item.el.clientHeight
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

const subscribe = () => {
  subscribers += 1
  if (subscribers > 1) return
  // Force a fresh read — the camera may have moved while nobody polled — and
  // drop any drift carried over from a mid-pan unmount, or the first frame
  // could commit a dead camera before the svg is even queryable.
  lastRaw = ''
  drifted = false
  currentBox = undefined
  window.addEventListener('resize', remeasureAll)
  frame = requestAnimationFrame(readViewBox)
}

const unsubscribe = () => {
  subscribers -= 1
  if (subscribers > 0) return
  if (frame !== undefined) cancelAnimationFrame(frame)
  frame = undefined
  window.removeEventListener('resize', remeasureAll)
}

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
  onMounted(subscribe)
  onBeforeUnmount(unsubscribe)

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
 */
export const useMapPanTrack = (el: Ref<HTMLElement | undefined>) => {
  const size = reactive({ w: 0, h: 0 })
  let item: PanTracked | undefined
  onMounted(() => {
    subscribe()
    if (!el.value) return
    item = { el: el.value, size }
    tracked.add(item)
    measureTracked(item)
  })
  onBeforeUnmount(() => {
    if (item) tracked.delete(item)
    item = undefined
    unsubscribe()
  })
  return { size }
}
