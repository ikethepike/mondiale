<template>
  <svg
    class="route-drift"
    viewBox="0 0 2000 1001"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <g class="ambient-loop">
      <path v-for="link in links" :key="link.key" class="link" :d="link.d" :style="link.style" />
    </g>
    <circle v-for="node in nodes" :key="node.key" class="node" :cx="node.x" :cy="node.y" r="4" />
  </svg>
</template>
<script lang="ts" setup>
import { MAP_BOUNDS } from '~~/data/map.gen'
import { BORDERS } from '~~/data/borders.gen'
import { sampleMany } from '~~/lib/arrays'
import { seededRandom } from '~~/lib/random'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The navigation card's ground: the land-border graph, as a graph.
 *
 * Real neighbours joined by real arcs — which is exactly what a border run
 * traverses — but drawn as a lattice with no country named, so it reads as
 * connectivity rather than as a route anybody could copy.
 */
const props = defineProps<{ seed: number }>()

const LINKS = 90

// The bounds box centre, which is already in map space — precise enough for a
// lattice nobody reads a route off, and free.
const bounds = MAP_BOUNDS as Record<string, [number, number, number, number] | undefined>
const centreOf = (isoCode: ISOCountryCode) => {
  const box = bounds[isoCode]
  if (!box) return undefined
  return { x: box[0] + box[2] / 2, y: box[1] + box[3] / 2 }
}

const edges = computed(() => {
  const seen = new Set<string>()
  const out: { from: ISOCountryCode; to: ISOCountryCode }[] = []
  for (const [from, neighbours] of Object.entries(BORDERS) as [
    ISOCountryCode,
    ISOCountryCode[],
  ][]) {
    for (const to of neighbours ?? []) {
      const key = [from, to].sort().join('-')
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ from, to })
    }
  }
  return out
})

const drawn = computed(() => {
  const random = seededRandom(props.seed)
  return sampleMany(edges.value, LINKS, random).flatMap((edge, index) => {
    const from = centreOf(edge.from)
    const to = centreOf(edge.to)
    if (!from || !to) return []
    // Bow each link so a dense lattice reads as arcs rather than as a mesh.
    const midX = (from.x + to.x) / 2
    const midY = (from.y + to.y) / 2 - (12 + random() * 26)
    return [
      {
        key: `${index}-${edge.from}-${edge.to}`,
        from,
        to,
        d: `M ${from.x},${from.y} Q ${midX},${midY} ${to.x},${to.y}`,
        style: {
          animationDelay: `${(-random() * 12).toFixed(2)}s`,
          animationDuration: `${(8 + random() * 8).toFixed(2)}s`,
          opacity: (0.2 + random() * 0.4).toFixed(2),
        } as Record<string, string>,
      },
    ]
  })
})

const links = computed(() => drawn.value)
const nodes = computed(() =>
  drawn.value
    .slice(0, 40)
    .map((link, index) => ({ key: `n${index}`, x: link.from.x, y: link.from.y }))
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.route-drift {
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 0.7;
  mask-image: radial-gradient(ellipse 48% 42% at 50% 50%, transparent 32%, black 78%);
}

.link {
  fill: none;
  stroke: var(--soft-blue);
  stroke-width: 1.6;
  animation: route-pulse 12s ease-in-out infinite;
}

.node {
  fill: ink(0.3);
}

@keyframes route-pulse {
  0%,
  100% {
    stroke-width: 1.2;
  }
  50% {
    stroke-width: 2.6;
  }
}
</style>
