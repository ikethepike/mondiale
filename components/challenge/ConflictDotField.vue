<template>
  <div class="conflict-dot-field" aria-hidden="true">
    <!-- Mirrors the live camera viewBox each frame (the chip technique), with
         preserveAspectRatio=none so map coordinates land exactly where the
         map draws them. Dot radius counter-scales so zoom never balloons it. -->
    <svg
      v-if="viewBox"
      :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
      preserveAspectRatio="none"
    >
      <circle
        v-for="dot in dots"
        :key="`${dot.x}:${dot.y}`"
        class="dot"
        :cx="dot.x"
        :cy="dot.y"
        :r="dotRadius"
        :style="{ '--o': dot.opacity, '--i': dot.index }"
      />
    </svg>
    <span
      v-for="chip in chips"
      :key="chip.label"
      class="chip map-caption"
      :style="{ left: `${chip.left}%`, top: `${chip.top}%` }"
    >
      {{ chip.label }}
    </span>
  </div>
</template>
<script lang="ts" setup>
import { CONFLICT_ERAS, type ConflictField } from '~~/types/vendor/ucdp/ucdp.types'

/**
 * A country's recorded conflict history as dots in map space, arriving one era
 * wave at a time. One hue; only opacity steps with recency. Each wave enters
 * with a single staggered fade and then holds still — the dots sit over the
 * tappable map, so nothing may keep moving.
 */
const props = defineProps<{
  field: ConflictField
  /** How many of the field's era waves are visible. */
  shownWaves: number
  /** Reveal turns the label off — the dots stay, the scaffolding goes. */
  showChip?: boolean
}>()

const viewBox = ref<{ x: number; y: number; w: number; h: number }>()
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

/** ~0.16% of the visible width — reads as a pinpoint at any camera height. */
const dotRadius = computed(() => (viewBox.value?.w ?? 2000) * 0.0016)

/** Older waves sit back; the newest carries the ink. */
const waveOpacity = (wave: number) => {
  const waves = props.field.eras.length
  return waves === 1 ? 0.9 : 0.28 + (wave / (waves - 1)) * 0.62
}

const dots = computed(() =>
  props.field.eras.slice(0, props.shownWaves).flatMap((era, wave) =>
    era.points.map(([x, y], index) => ({
      x,
      y,
      opacity: waveOpacity(wave),
      index: Math.min(index, 40),
    }))
  )
)

/** One label, for the wave that's currently landing — wave centroids sit
 *  nearly on top of each other, so stacked chips would just collide. */
const chips = computed(() => {
  const vb = viewBox.value
  const era = props.field.eras[props.shownWaves - 1]
  if (!vb?.w || !era || props.showChip === false) return []
  const [sumX, sumY] = era.points.reduce(([x, y], point) => [x + point[0], y + point[1]], [0, 0])
  const left = ((sumX / era.points.length - vb.x) / vb.w) * 100
  const top = ((sumY / era.points.length - vb.y) / vb.h) * 100
  if (left < 4 || left > 96 || top < 6 || top > 94) return []
  return [{ label: CONFLICT_ERAS[era.era] ?? '', left, top }]
})

onMounted(readViewBox)

onBeforeUnmount(() => {
  if (frame !== undefined) cancelAnimationFrame(frame)
})
</script>
<style lang="scss" scoped>
.conflict-dot-field {
  inset: 0;
  position: absolute;
  pointer-events: none;

  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
}

.dot {
  opacity: 0;
  fill: var(--hior-ange);
  animation: dot-in 0.4s ease-out forwards;
  animation-delay: calc(var(--i) * 30ms);
}

@keyframes dot-in {
  to {
    opacity: var(--o);
  }
}

.chip {
  opacity: 0;
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 0.15rem 0.7rem;
  font-size: 1.15rem;
  font-weight: bold;
  animation: chip-in 0.35s var(--ease-smooth) forwards;
  animation-delay: 300ms;
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
  .dot,
  .chip {
    animation: none;
  }
  .dot {
    opacity: var(--o);
  }
  .chip {
    opacity: 1;
  }
}
</style>
