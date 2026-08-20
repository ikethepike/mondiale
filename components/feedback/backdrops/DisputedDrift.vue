<template>
  <div class="disputed-drift" aria-hidden="true">
    <div v-for="island in islands" :key="island.key" class="island" :style="island.style">
      <!-- One flag each side of the line, forged from the island's own seed so
           the same rock always draws the same two claimants. -->
      <!-- eslint-disable-next-line vue/no-v-html -- SVG forged locally by lib/flags/forge -->
      <span class="claimant left" v-html="island.left" />
      <!-- eslint-disable-next-line vue/no-v-html -- SVG forged locally by lib/flags/forge -->
      <span class="claimant right" v-html="island.right" />
      <svg class="land" :viewBox="`0 0 ${ISLAND_W} ${ISLAND_H}`">
        <defs>
          <!-- The border is clipped to the coast: a line that runs on past the
               shore is a line drawn on the sea. -->
          <clipPath :id="`coast-${island.key}`">
            <path :d="island.coast" />
          </clipPath>
        </defs>
        <path class="coast" :d="island.coast" />
        <!-- The border runs the island's full height, wandering the way a
             surveyed line does rather than ruling straight down. -->
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

/**
 * The disputed card's ground: an island with a line drawn down it and a flag
 * planted either side.
 *
 * Earlier passes drew the real recognition outlines and came out blank — the
 * median disputed territory is 3x2 units on a 2000-unit map, and three of them
 * are bare rocks with zero-sized bounds. This draws the SITUATION instead, and
 * says it plainly: one piece of land, two claimants, a border neither agrees
 * on. The flags are forged (lib/flags/forge) rather than real, because a real
 * pair would name the countries and every disputed round is a question about
 * exactly that.
 */
const props = defineProps<{ seed: number }>()

const ISLANDS = 3
const ISLAND_W = 200
const ISLAND_H = 130

/**
 * A closed coastline.
 *
 * Two passes, because one does not give you a coast. The first lays down the
 * broad form — a handful of low-frequency lobes, which is what makes an island
 * long or kidney-shaped rather than round. The second adds detail at three
 * halving scales, the way a real coast is rough at every zoom: headlands carry
 * coves, coves carry rocks.
 *
 * Drawn as straight segments on purpose. Smoothing every point through a
 * quadratic — the obvious move, and the first thing tried here — rounds off
 * exactly the detail this generates, and turns a rocky island back into a lump.
 */
const coastline = (random: () => number): string => {
  const STEPS = 150
  const cx = ISLAND_W / 2
  const cy = ISLAND_H / 2

  // The broad form: three lobes at low frequency, random phase.
  const lobes = Array.from({ length: 3 }, (_, index) => ({
    frequency: index + 2,
    amplitude: (0.22 - index * 0.05) * (0.6 + random()),
    phase: random() * Math.PI * 2,
  }))
  // The roughness: each octave half the size and twice the frequency.
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

/** The line down the middle — surveyed, so it bends and doubles back. */
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

/**
 * Where the three sit. Fixed anchors with a little jitter, not free scatter:
 * three random points in a box collide about as often as they spread, and a
 * seed that overlapped two islands read as one shapeless mass while the bottom
 * half of the card sat empty.
 */
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
@use '~/assets/scss/rules/ink' as *;

.disputed-drift {
  inset: 0;
  z-index: 0;
  overflow: hidden;
  position: absolute;
  pointer-events: none;
  opacity: 0.55;
  mask-image: radial-gradient(ellipse 56% 50% at 50% 50%, transparent 44%, black 88%);
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

// Dashed because it is not agreed. A solid line would be a settled border,
// which is the one thing none of these has.
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
  // The flags sit UNDER the coast outline, planted in their half rather than
  // floating over the island.
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
