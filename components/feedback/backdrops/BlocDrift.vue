<template>
  <svg
    class="bloc-drift"
    viewBox="0 0 400 260"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <g v-for="bloc in blocs" :key="bloc.key">
      <path class="hull" :d="bloc.hull" :style="bloc.style" />
      <circle
        v-for="(seat, index) in bloc.seats"
        :key="index"
        class="seat"
        :class="{ shared: seat.shared }"
        :cx="seat.x"
        :cy="seat.y"
        :r="seat.r"
        :style="seat.style"
      />
    </g>
  </svg>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/** Overlapping memberships: rosters of members, drawn as enclosing hulls. */
const props = defineProps<{ seed: number }>()

const BLOCS = 4
const W = 400
const H = 260

type Seat = { x: number; y: number; r: number; shared: boolean; style: Record<string, string> }

const hullAround = (seats: { x: number; y: number }[], pad: number): string => {
  const cx = seats.reduce((sum, s) => sum + s.x, 0) / seats.length
  const cy = seats.reduce((sum, s) => sum + s.y, 0) / seats.length
  const ordered = [...seats].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  )
  const points = ordered.map(s => {
    const angle = Math.atan2(s.y - cy, s.x - cx)
    return [s.x + Math.cos(angle) * pad, s.y + Math.sin(angle) * pad] as const
  })
  let d = `M ${((points[0]![0] + points[points.length - 1]![0]) / 2).toFixed(1)},${((points[0]![1] + points[points.length - 1]![1]) / 2).toFixed(1)}`
  for (let i = 0; i < points.length; i++) {
    const cur = points[i]!
    const next = points[(i + 1) % points.length]!
    d += ` Q ${cur[0].toFixed(1)},${cur[1].toFixed(1)} ${((cur[0] + next[0]) / 2).toFixed(1)},${((cur[1] + next[1]) / 2).toFixed(1)}`
  }
  return `${d} z`
}

const blocs = computed(() => {
  const random = seededRandom(props.seed)
  const anchors: [number, number][] = [
    [W * 0.28, H * 0.32],
    [W * 0.62, H * 0.28],
    [W * 0.44, H * 0.66],
    [W * 0.78, H * 0.62],
  ]
  const placed: { x: number; y: number }[] = []
  return Array.from({ length: BLOCS }, (_, index) => {
    const [ax, ay] = anchors[index]!
    const spread = 34 + random() * 22
    const count = 5 + Math.floor(random() * 4)
    const seats: Seat[] = Array.from({ length: count }, (_, seatIndex) => {
      const angle = (seatIndex / count) * Math.PI * 2 + random() * 0.7
      const reach = spread * (0.45 + random() * 0.55)
      const x = ax + Math.cos(angle) * reach
      const y = ay + Math.sin(angle) * reach * 0.8
      const shared = placed.some(p => Math.hypot(p.x - x, p.y - y) < 26)
      placed.push({ x, y })
      return {
        x,
        y,
        r: 2.4 + random() * 1.8,
        shared,
        style: {
          '--at': `${(index * 0.28 + seatIndex * 0.06 + 0.3).toFixed(2)}s`,
        } as Record<string, string>,
      }
    })
    return {
      key: `bloc-${index}`,
      seats,
      hull: hullAround(seats, 11 + random() * 6),
      style: { '--at': `${(index * 0.28).toFixed(2)}s` } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.bloc-drift {
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 0.8;
  mask-image: radial-gradient(ellipse 50% 44% at 50% 50%, transparent 34%, black 80%);
}

.hull {
  fill: hsla(197.6, 51.2%, 41.8%, 0.07);
  stroke: var(--soft-blue);
  stroke-width: 1.4;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  vector-effect: non-scaling-stroke;
  animation: stroke-draw 0.9s var(--ease-smooth) var(--at, 0s) both;
}

.seat {
  fill: ink(0.4);
  transform-box: fill-box;
  transform-origin: center;
  animation: seat-in 0.32s var(--ease-out-expressive) var(--at, 0s) backwards;
}

.shared {
  fill: var(--hior-ange);
}

@media (prefers-reduced-motion: reduce) {
  .hull {
    stroke-dashoffset: 0;
    animation: none;
  }

  .seat {
    animation: none;
  }
}

@keyframes seat-in {
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
