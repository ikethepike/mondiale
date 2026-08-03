import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

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
 * The live game-map camera, read per frame — the one way an overlay tracks
 * pans and zooms. Interval sampling makes chips visibly stutter behind a
 * camera move; unchanged frames cost one string compare and no reactivity.
 *
 * `toScreenPercent` lands a map-space point in viewport percent;
 * `cameraScale` counter-scales strokes and glyphs so zoom never balloons them.
 */
export const useMapViewBox = () => {
  const viewBox = ref<MapViewBox>()
  let frame: number | undefined
  let mapSvg: SVGSVGElement | null = null
  let lastRaw = ''

  const readViewBox = () => {
    frame = requestAnimationFrame(readViewBox)
    mapSvg ??= document.querySelector('.game-map svg')
    const attribute = mapSvg?.getAttribute('viewBox') ?? ''
    if (attribute === lastRaw) return
    lastRaw = attribute
    const raw = attribute.split(/\s+/).map(Number)
    if (raw.length === 4 && raw.every(Number.isFinite)) {
      viewBox.value = { x: raw[0]!, y: raw[1]!, w: raw[2]!, h: raw[3]! }
    }
  }

  onMounted(readViewBox)
  onBeforeUnmount(() => {
    if (frame !== undefined) cancelAnimationFrame(frame)
  })

  const toScreenPercent = (x: number, y: number): { left: number; top: number } | undefined => {
    const vb = viewBox.value
    if (!vb?.w || !vb.h) return undefined
    return { left: ((x - vb.x) / vb.w) * 100, top: ((y - vb.y) / vb.h) * 100 }
  }

  /** 1 at the full world frame, shrinking as the camera dives. */
  const cameraScale = computed(() => (viewBox.value?.w ?? WORLD_MAP_WIDTH) / WORLD_MAP_WIDTH)

  return { viewBox, toScreenPercent, cameraScale }
}

