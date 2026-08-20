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

const RUNS = 3
const STOPS = 9
const MIN_HOP = 34
const MAX_HOP = 92
const W = 400
const H = 260
/** Seconds per hop — the pace the whole effect is read at. */
const HOP = 0.5
/** How long a line takes to zip across; the dot lands as it arrives. */
const DRAW = 0.26

const runs = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: RUNS }, (_, runIndex) => {
    // Each run starts in its own corner and travels its own way across, so
    // the two never set off side by side.
    const origins: { x: number; y: number; heading: number }[] = [
      { x: 24 + random() * 40, y: 26 + random() * 44, heading: 0.55 },
      { x: W - 24 - random() * 40, y: H - 26 - random() * 44, heading: Math.PI - 0.55 },
      { x: 24 + random() * 40, y: H - 30 - random() * 40, heading: -0.5 },
    ]
    const origin = origins[runIndex] ?? origins[0]!
    const stops: { x: number; y: number }[] = [{ x: origin.x, y: origin.y }]
    while (stops.length < STOPS) {
      const from = stops[stops.length - 1]!
      let placed = false
      for (let attempt = 0; attempt < 24 && !placed; attempt++) {
        // Held near the run's own heading, so it crosses the card instead of
        // milling around where it started.
        const angle = origin.heading + (random() - 0.5) * 1.5
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
    const offset = runIndex * HOP * 0.45
    return {
      key: `run-${runIndex}`,
      // A hop's line zips out first; its far dot lands as the line arrives.
      // The very first dot has no line before it, so it opens the run.
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
  // Paints its own ground: the shell's backdrop blur is ~90% of the frame
  // budget at 4x throttle, and an opaque field makes it unnecessary.
  background: var(--sour-milk);
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 0.85;
}

.route-drift > * {
  mask-image: radial-gradient(ellipse 50% 44% at 50% 50%, transparent 36%, black 82%);
}

.hop {
  fill: none;
  stroke: var(--soft-blue);
  stroke-width: 1.8;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  vector-effect: non-scaling-stroke;
  animation: stroke-draw 0.26s linear var(--at, 0s) forwards;
}

.stop {
  fill: var(--soft-blue);
  opacity: 0;
  // Without fill-box a circle scales from the SVG origin and visibly slides
  // toward it as it grows.
  transform-box: fill-box;
  transform-origin: center;
  animation: stop-land 0.28s var(--ease-out-expressive) var(--at, 0s) forwards;
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
    scale: 0.2;
  }
  60% {
    opacity: 1;
    scale: 1.35;
  }
  to {
    opacity: 0.9;
    scale: 1;
  }
}
</style>
