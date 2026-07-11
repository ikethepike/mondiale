<template>
  <div class="map-year-labels" aria-hidden="true">
    <span
      v-for="chip in chips"
      :key="chip.isoCode"
      class="chip map-caption"
      :style="{ left: `${chip.left}%`, top: `${chip.top}%`, '--i': chip.index }"
    >
      {{ chip.label }}
    </span>
  </div>
</template>
<script lang="ts" setup>
import { mapRegionCentre } from '~~/lib/challenges/final-challenge'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Reveal-time map annotations: small pills pinned to country centres through
 * the live camera viewBox (the city-dot technique — no map-engine changes).
 * Chips that would collide with an already-placed neighbour are skipped, so
 * dense clusters stay legible.
 */
const props = defineProps<{ entries: { isoCode: ISOCountryCode; label: string }[] }>()

const TICK_MS = 150
const MIN_GAP_PX = 44

const viewBox = ref<{ x: number; y: number; w: number; h: number }>()
let ticker: ReturnType<typeof setInterval> | undefined
let mapSvg: SVGSVGElement | null = null

const readViewBox = () => {
  mapSvg ??= document.querySelector('.game-map svg')
  const raw = mapSvg?.getAttribute('viewBox')?.split(/\s+/).map(Number)
  if (raw?.length === 4 && raw.every(Number.isFinite)) {
    viewBox.value = { x: raw[0]!, y: raw[1]!, w: raw[2]!, h: raw[3]! }
  }
}

const chips = computed(() => {
  const vb = viewBox.value
  if (!vb?.w || typeof window === 'undefined') return []
  const width = window.innerWidth
  const height = window.innerHeight

  const placed: { x: number; y: number }[] = []
  const result: { isoCode: ISOCountryCode; label: string; left: number; top: number; index: number }[] =
    []
  for (const entry of props.entries) {
    const centre = mapRegionCentre(entry.isoCode)
    const left = ((centre.x - vb.x) / vb.w) * 100
    const top = ((centre.y - vb.y) / vb.h) * 100
    if (left < 2 || left > 98 || top < 4 || top > 96) continue

    const px = { x: (left / 100) * width, y: (top / 100) * height }
    if (placed.some(point => Math.hypot(point.x - px.x, point.y - px.y) < MIN_GAP_PX)) continue
    placed.push(px)
    result.push({ ...entry, left, top, index: result.length })
  }
  return result
})

onMounted(() => {
  readViewBox()
  ticker = setInterval(readViewBox, TICK_MS)
})

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})
</script>
<style lang="scss" scoped>
.map-year-labels {
  inset: 0;
  position: absolute;
  pointer-events: none;
}

.chip {
  opacity: 0;
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 0.15rem 0.7rem;
  font-size: 1.15rem;
  font-weight: bold;
  animation: chip-in 0.35s var(--ease-smooth) forwards;
  animation-delay: calc(var(--i) * 60ms + 300ms);
}

@keyframes chip-in {
  from {
    opacity: 0;
    transform: translate(-50%, -20%);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chip {
    animation: none;
    opacity: 1;
  }
}
</style>
