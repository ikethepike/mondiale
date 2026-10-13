<template>
  <div ref="root" class="map-year-labels" aria-hidden="true">
    <span
      v-for="chip in chips"
      :key="chip.isoCode"
      class="chip map-caption"
      :class="{ accented: chip.color, sonar: chip.icon === 'sonar' }"
      :style="{
        left: `${chip.left}%`,
        top: `${chip.top}%`,
        '--i': chip.index,
        '--chip-accent': chip.color,
      }"
    >
      <template v-if="chip.pulse">
        <span :key="`ping-${chip.pulse}`" class="ripple" />
        <span :key="`echo-${chip.pulse}`" class="ripple echo" />
      </template>
      <SonarGlyph v-if="chip.icon === 'sonar'" />
      <span v-if="chip.label">{{ chip.label }}</span>
    </span>
  </div>
</template>
<script lang="ts" setup>
import SonarGlyph from '~/components/challenge/SonarGlyph.vue'
import { labelAnchorFor } from '~~/lib/label-anchor'
import { mapRegionCentre } from '~~/lib/sunset-window'
import { useMapPanTrack, useMapViewBox } from '~~/lib/use-map-viewbox'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Reveal-time map annotations: small pills pinned to country centres through
 * the live camera viewBox (the city-dot technique — no map-engine changes).
 * Chips that would collide with an already-placed neighbour are skipped, so
 * dense clusters stay legible.
 */
const props = withDefaults(
  defineProps<{
    /** `icon: 'sonar'` marks a ping; a changing `pulse` key ripples the chip
     *  once (a reading arriving). */
    entries: {
      isoCode: ISOCountryCode
      label: string
      color?: string
      icon?: 'sonar'
      pulse?: string
    }[]
    /** Collision radius. Sequence users (Border Chain) tighten it — a skipped
     *  number breaks the count where a skipped year is just less clutter. */
    minGapPx?: number
  }>(),
  { minGapPx: 44 }
)

const { viewBox } = useMapViewBox()
// Pans between commits slide the whole layer on the compositor — the O(n²)
// collision layout below re-runs only when the camera box actually commits.
const root = ref<HTMLElement>()
const { size } = useMapPanTrack(root)

const chips = computed(() => {
  const vb = viewBox.value
  if (!vb?.w || !size.w) return []
  const width = size.w
  const height = size.h

  const placed: { x: number; y: number }[] = []
  const result: {
    isoCode: ISOCountryCode
    label: string
    color?: string
    icon?: 'sonar'
    pulse?: string
    left: number
    top: number
    index: number
  }[] = []
  for (const entry of props.entries) {
    const anchor = labelAnchorFor(entry.isoCode)?.point
    const centre = anchor ? { x: anchor[0], y: anchor[1] } : mapRegionCentre(entry.isoCode)
    const left = ((centre.x - vb.x) / vb.w) * 100
    const top = ((centre.y - vb.y) / vb.h) * 100
    if (left < 2 || left > 98 || top < 4 || top > 96) continue

    const px = { x: (left / 100) * width, y: (top / 100) * height }
    if (placed.some(point => Math.hypot(point.x - px.x, point.y - px.y) < props.minGapPx)) continue
    placed.push(px)
    result.push({ ...entry, left, top, index: result.length })
  }
  return result
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

  // Attributed chips (manhunt's dragnet marks) wear their player's colour
  // as the border — the board's identity language, no name needed.
  &.accented {
    border-width: 0.2rem;
    border-color: var(--chip-accent);
  }

  &.sonar {
    --sonar-color: var(--chip-accent);
    gap: 0.25rem;
    display: inline-flex;
    align-items: center;
    padding-inline: 0.45rem 0.6rem;
  }
}

.ripple {
  inset: -0.2rem;
  opacity: 0;
  position: absolute;
  border-radius: 1.4rem;
  border: 0.2rem solid var(--chip-accent, currentColor);
  animation: probe-ping 0.9s var(--ease-out-expressive) 0.45s forwards;

  &.echo {
    animation-delay: 0.65s;
  }
}

// chip-in comes from rules/_animations.scss

@media (prefers-reduced-motion: reduce) {
  .chip {
    animation: none;
    opacity: 1;
  }

  .ripple {
    display: none;
  }
}
</style>
