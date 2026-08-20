<template>
  <div class="route-drift" aria-hidden="true">
    <svg
      v-for="run in runs"
      :key="run.key"
      class="run"
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="none"
    >
      <path
        v-for="(hop, index) in run.hops"
        :key="`l${index}`"
        class="hop"
        :d="hop.d"
        pathLength="1"
        :style="hop.style"
      />
    </svg>
    <span v-for="stop in dots" :key="stop.key" class="stop" :style="stop.style" />
  </div>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/** Two chains hopping across the card: a dot lands, a line reaches on. */
const props = defineProps<{ seed: number }>()

const RUNS = 2
const STOPS = 13
const MIN_HOP = 9
const MAX_HOP = 19
const W = 100
const H = 100
const HOP = 0.32
const DRAW = 0.28

const runs = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: RUNS }, (_, runIndex) => {
    const start =
      runIndex === 0
        ? { x: 12 + random() * 16, y: 14 + random() * 18 }
        : { x: W - 12 - random() * 16, y: H - 14 - random() * 18 }
    const stops = [start]
    let heading = random() * Math.PI * 2
    while (stops.length < STOPS) {
      const from = stops[stops.length - 1]!
      let placed = false
      for (let attempt = 0; attempt < 90 && !placed; attempt++) {
        const inward = Math.atan2(H / 2 - from.y, W / 2 - from.x)
        const bias = attempt > 40 ? inward : heading
        const angle = bias + (random() - 0.5) * (attempt > 40 ? 1.1 : 2.2)
        const reach = MIN_HOP + random() * (MAX_HOP - MIN_HOP)
        const x = from.x + Math.cos(angle) * reach
        const y = from.y + Math.sin(angle) * reach
        if (x < 5 || x > W - 5 || y < 5 || y > H - 5) continue
        if (stops.some(s => Math.hypot(s.x - x, s.y - y) < MIN_HOP * 0.7)) continue
        stops.push({ x, y })
        heading = angle
        placed = true
      }
      if (!placed) break
    }
    const offset = runIndex * HOP * 0.5
    return {
      key: `run-${runIndex}`,
      stops: stops.map((stop, index) => ({
        key: `${runIndex}-${index}`,
        style: {
          left: `${stop.x.toFixed(2)}%`,
          top: `${stop.y.toFixed(2)}%`,
          '--size': index === 0 || index === stops.length - 1 ? '2.4' : '1.7',
          '--at': `${(offset + Math.max(0, index - 1) * HOP + (index === 0 ? 0 : DRAW)).toFixed(2)}s`,
        } as Record<string, string>,
      })),
      hops: stops.slice(1).map((stop, index) => {
        const from = stops[index]!
        return {
          d: `M ${from.x.toFixed(2)},${from.y.toFixed(2)} L ${stop.x.toFixed(2)},${stop.y.toFixed(2)}`,
          style: { '--at': `${(offset + index * HOP).toFixed(2)}s` } as Record<string, string>,
        }
      }),
    }
  })
})

const dots = computed(() => runs.value.flatMap(run => run.stops))
</script>
<style lang="scss" scoped>
.route-drift {
  inset: 0;
  z-index: 0;
  overflow: hidden;
  position: absolute;
  pointer-events: none;
  opacity: 0.9;
  mask-image: radial-gradient(ellipse 46% 40% at 50% 50%, transparent 32%, black 78%);
}

.run {
  inset: 0;
  width: 100%;
  height: 100%;
  position: absolute;
  overflow: visible;
}

.hop {
  fill: none;
  stroke: var(--soft-blue);
  stroke-width: 0.36;
  stroke-linecap: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: stroke-draw 0.3s var(--ease-smooth) var(--at, 0s) both;
}

.stop {
  display: block;
  position: absolute;
  border-radius: 50%;
  translate: -50% -50%;
  width: calc(var(--size) * 0.75vmin);
  height: calc(var(--size) * 0.75vmin);
  background: var(--soft-blue);
  animation: stop-land 0.28s var(--ease-out-expressive) var(--at, 0s) backwards;
}

@media (prefers-reduced-motion: reduce) {
  .hop {
    stroke-dashoffset: 0;
    animation: none;
  }

  .stop {
    animation: none;
  }
}

@keyframes stop-land {
  from {
    opacity: 0;
    scale: 0.2;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}
</style>
