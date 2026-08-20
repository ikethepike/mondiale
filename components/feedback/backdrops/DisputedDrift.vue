<template>
  <div class="disputed-drift" aria-hidden="true">
    <div v-for="island in islands" :key="island.key" class="island" :style="island.style">
      <!-- eslint-disable vue/no-v-html -- SVG forged locally by lib/flags/forge -->
      <span class="claimant left" v-html="island.left" />
      <span class="claimant right" v-html="island.right" />
      <!-- eslint-enable vue/no-v-html -->
      <svg class="land" :viewBox="`0 0 ${ISLAND_W} ${ISLAND_H}`">
        <defs>
          <clipPath :id="`coast-${island.key}`">
            <path :d="island.coast" />
          </clipPath>
        </defs>
        <path class="coast" :d="island.coast" />
        <g :clip-path="`url(#coast-${island.key})`">
          <path class="border ambient-loop" :d="island.border" :style="island.borderStyle" />
        </g>
      </svg>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { forgeFlag } from '~~/lib/flags/forge'
import { seededRandom } from '~~/lib/random'

/** An island, a dashed border down it, a forged flag either side. */
const props = defineProps<{ seed: number }>()

const ISLANDS = 3
const ISLAND_W = 200
const ISLAND_H = 130

const coastline = (random: () => number): string => {
  const STEPS = 150
  const cx = ISLAND_W / 2
  const cy = ISLAND_H / 2

  const lobes = Array.from({ length: 3 }, (_, index) => ({
    frequency: index + 2,
    amplitude: (0.22 - index * 0.05) * (0.6 + random()),
    phase: random() * Math.PI * 2,
  }))
  const octaves = Array.from({ length: 3 }, (_, index) => ({
    frequency: 7 * 2 ** index,
    amplitude: 0.09 / 2 ** index,
    phase: random() * Math.PI * 2,
  }))

  const points: [number, number][] = []
  for (let step = 0; step < STEPS; step++) {
    const angle = (step / STEPS) * Math.PI * 2
    let radius = 1
    for (const lobe of lobes)
      radius += Math.sin(angle * lobe.frequency + lobe.phase) * lobe.amplitude
    for (const octave of octaves) {
      radius += Math.sin(angle * octave.frequency + octave.phase) * octave.amplitude
    }
    radius = Math.max(0.45, radius)
    points.push([
      cx + Math.cos(angle) * radius * (ISLAND_W * 0.4),
      cy + Math.sin(angle) * radius * (ISLAND_H * 0.36),
    ])
  }
  return `${points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')} z`
}

const borderLine = (random: () => number): string => {
  const STEPS = 9
  let x = ISLAND_W / 2 + (random() - 0.5) * 12
  const points: [number, number][] = []
  for (let step = 0; step <= STEPS; step++) {
    x += (random() - 0.5) * 15
    points.push([x, (step / STEPS) * ISLAND_H])
  }
  return points
    .map(([px, py], index) => `${index === 0 ? 'M' : 'L'} ${px.toFixed(1)},${py.toFixed(1)}`)
    .join(' ')
}

const ANCHORS: [number, number][] = [
  [4, 6],
  [62, 4],
  [30, 62],
]

const islands = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: ISLANDS }, (_, index) => {
    const size = 26 + random() * 12
    const [anchorX, anchorY] = ANCHORS[index] ?? [10, 10]
    return {
      key: `island-${index}`,
      coast: coastline(random),
      border: borderLine(random),
      left: forgeFlag(`disputed-${props.seed}-${index}-a`).svg,
      right: forgeFlag(`disputed-${props.seed}-${index}-b`).svg,
      style: {
        left: `${(anchorX + random() * 10 - 5).toFixed(1)}%`,
        top: `${(anchorY + random() * 10 - 5).toFixed(1)}%`,
        width: `${size.toFixed(1)}rem`,
        transform: `rotate(${(random() * 14 - 7).toFixed(1)}deg)`,
        opacity: (0.5 + random() * 0.4).toFixed(2),
      } as Record<string, string>,
      borderStyle: {
        animationDelay: `${(-random() * 12).toFixed(2)}s`,
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/backdrop' as *;
@use '~/assets/scss/rules/ink' as *;

.disputed-drift {
  @include backdrop-field(0.55, 1.12);
  overflow: hidden;
}

.island {
  position: absolute;
  aspect-ratio: 200 / 130;
}

.land {
  width: 100%;
  height: 100%;
  display: block;
  position: relative;
  overflow: visible;
}

.coast {
  fill: ink(0.1);
  stroke: ink(0.4);
  stroke-width: 1.6;
  stroke-linejoin: round;
}

.border {
  fill: none;
  stroke: var(--hior-ange);
  stroke-width: 2.2;
  stroke-dasharray: 7 5;
  stroke-linecap: round;
  animation: border-crawl 9s linear infinite;
}

@keyframes border-crawl {
  to {
    stroke-dashoffset: -24;
  }
}

.claimant {
  top: 50%;
  width: 19%;
  position: absolute;
  transform: translateY(-50%);
  z-index: -1;

  :deep(svg) {
    width: 100%;
    height: auto;
    display: block;
    border-radius: 0.2rem;
  }
}

.left {
  left: 22%;
}

.right {
  right: 22%;
}
</style>
