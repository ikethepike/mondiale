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

/** Two routes hopping across the card at once — a dot lands, a line reaches to
 *  the next, repeat. Hops are distance-clamped so a route never doubles back on
 *  itself or leaps the whole width in one stride. */
const props = defineProps<{ seed: number }>()

const RUNS = 2
const STOPS = 9
const MIN_HOP = 34
const MAX_HOP = 92
const W = 400
const H = 260
/** Seconds per hop — the pace the whole effect is read at. */
const HOP = 0.62

const runs = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: RUNS }, (_, runIndex) => {
    const stops: { x: number; y: number }[] = [
      { x: 20 + random() * 60, y: runIndex === 0 ? 30 + random() * 50 : 150 + random() * 60 },
    ]
    while (stops.length < STOPS) {
      const from = stops[stops.length - 1]!
      let placed = false
      for (let attempt = 0; attempt < 24 && !placed; attempt++) {
        // Bias rightward so a run reads as travel rather than a wander.
        const angle = (random() - 0.5) * 1.9
        const reach = MIN_HOP + random() * (MAX_HOP - MIN_HOP)
        const x = from.x + Math.cos(angle) * reach
        const y = from.y + Math.sin(angle) * reach
        if (x < 12 || x > W - 12 || y < 12 || y > H - 12) continue
        // Never land on top of a stop already placed.
        if (stops.some(s => Math.hypot(s.x - x, s.y - y) < MIN_HOP * 0.8)) continue
        stops.push({ x, y })
        placed = true
      }
      if (!placed) break
    }
    // The second run starts half a hop later, so the two interleave.
    const offset = runIndex * HOP * 0.5
    return {
      key: `run-${runIndex}`,
      stops: stops.map((stop, index) => ({
        ...stop,
        r: index === 0 || index === stops.length - 1 ? 3.4 : 2.2,
        style: { '--at': `${(offset + index * HOP).toFixed(2)}s` } as Record<string, string>,
      })),
      hops: stops.slice(1).map((stop, index) => {
        const from = stops[index]!
        return {
          d: `M ${from.x.toFixed(1)},${from.y.toFixed(1)} L ${stop.x.toFixed(1)},${stop.y.toFixed(1)}`,
          style: { '--at': `${(offset + index * HOP + HOP * 0.35).toFixed(2)}s` } as Record<
            string,
            string
          >,
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
  animation: stroke-draw 0.45s var(--ease-smooth) var(--at, 0s) forwards;
}

.stop {
  fill: var(--soft-blue);
  opacity: 0;
  animation: stop-land 0.4s var(--ease-out-expressive) var(--at, 0s) forwards;
}

@media (prefers-reduced-motion: reduce) {
  .hop {
    stroke-dashoffset: 0;
    animation: none;
  }

  .stop {
    opacity: 0.9;
    animation: none;
  }
}

@keyframes stop-land {
  from {
    opacity: 0;
    scale: 0.3;
  }
  to {
    opacity: 0.9;
    scale: 1;
  }
}
</style>
