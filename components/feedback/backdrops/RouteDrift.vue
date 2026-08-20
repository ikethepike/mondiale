<template>
  <svg
    class="route-drift"
    viewBox="0 0 400 260"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <g v-for="run in runs" :key="run.key">
      <path
        v-for="(hop, index) in run.hops"
        :key="`l${index}`"
        class="hop"
        :d="hop.d"
        pathLength="1"
        :style="hop.style"
      />
      <circle
        v-for="(stop, index) in run.stops"
        :key="`d${index}`"
        class="stop"
        :cx="stop.x"
        :cy="stop.y"
        :r="stop.r"
        :style="stop.style"
      />
    </g>
  </svg>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/** Two chains hopping across the card: a dot lands, a line reaches on. */
const props = defineProps<{ seed: number }>()

const RUNS = 2
const STOPS = 14
const MIN_HOP = 46
const MAX_HOP = 104
const W = 400
const H = 260
const HOP = 0.34
const DRAW = 0.3

const runs = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: RUNS }, (_, runIndex) => {
    const origins: { x: number; y: number; heading: number }[] = [
      { x: 40 + random() * 60, y: 30 + random() * 50, heading: random() * Math.PI * 2 },
      { x: W - 40 - random() * 60, y: H - 30 - random() * 50, heading: random() * Math.PI * 2 },
    ]
    const origin = origins[runIndex] ?? origins[0]!
    const stops: { x: number; y: number }[] = [{ x: origin.x, y: origin.y }]
    let heading = origin.heading
    while (stops.length < STOPS) {
      const from = stops[stops.length - 1]!
      let placed = false
      for (let attempt = 0; attempt < 80 && !placed; attempt++) {
        const from2 = stops[stops.length - 1]!
        const inward = Math.atan2(H / 2 - from2.y, W / 2 - from2.x)
        const bias = attempt > 30 ? inward : heading
        const angle = bias + (random() - 0.5) * (attempt > 30 ? 1.2 : 2.4)
        const reach = MIN_HOP + random() * (MAX_HOP - MIN_HOP)
        const x = from.x + Math.cos(angle) * reach
        const y = from.y + Math.sin(angle) * reach
        if (x < 12 || x > W - 12 || y < 12 || y > H - 12) continue
        if (stops.some(s => Math.hypot(s.x - x, s.y - y) < MIN_HOP * 0.6)) continue
        stops.push({ x, y })
        heading = angle
        placed = true
      }
      if (!placed) break
    }
    const offset = runIndex * HOP * 0.45
    return {
      key: `run-${runIndex}`,
      stops: stops.map((stop, index) => ({
        ...stop,
        r: index === 0 || index === stops.length - 1 ? 3.4 : 2.2,
        style: {
          '--at': `${(offset + Math.max(0, index - 1) * HOP + (index === 0 ? 0 : DRAW)).toFixed(2)}s`,
        } as Record<string, string>,
      })),
      hops: stops.slice(1).map((stop, index) => {
        const from = stops[index]!
        return {
          d: `M ${from.x.toFixed(1)},${from.y.toFixed(1)} L ${stop.x.toFixed(1)},${stop.y.toFixed(1)}`,
          style: { '--at': `${(offset + index * HOP).toFixed(2)}s` } as Record<string, string>,
        }
      }),
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.route-drift {
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 0.85;
  mask-image: radial-gradient(ellipse 50% 44% at 50% 50%, transparent 36%, black 82%);
}

.hop {
  fill: none;
  stroke: var(--soft-blue);
  stroke-width: 1.8;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  vector-effect: non-scaling-stroke;
  animation: stroke-draw 0.34s var(--ease-smooth) var(--at, 0s) both;
}

.stop {
  fill: var(--soft-blue);
  transform-box: fill-box;
  transform-origin: center;
  animation: stop-land 0.3s var(--ease-out-expressive) var(--at, 0s) backwards;
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
    scale: 0.3;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}
</style>
