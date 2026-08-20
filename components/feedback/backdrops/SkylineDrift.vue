<template>
  <div class="skyline-drift" aria-hidden="true">
    <!-- Two ranks: the far one paler and slower, so the band has depth rather
         than reading as one flat cut-out. -->
    <svg
      v-for="rank in ranks"
      :key="rank.key"
      class="rank ambient-loop"
      :class="rank.class"
      :style="rank.style"
      :viewBox="`0 0 ${RANK_WIDTH * 2} 120`"
      preserveAspectRatio="none"
    >
      <!-- Twice through: at -50% the second copy lands exactly where the
           first began, so the pan loops with no seam. -->
      <g v-for="pass in 2" :key="pass" :transform="`translate(${(pass - 1) * RANK_WIDTH} 0)`">
        <g
          v-for="(tower, index) in rank.towers"
          :key="index"
          class="tower-group"
          :style="{ '--rise-delay': `${(index * 0.035).toFixed(2)}s` }"
        >
          <path class="tower" :d="tower.d" />
          <rect
            v-if="tower.antenna"
            class="tower"
            :x="tower.x + tower.width / 2 - 0.7"
            :y="120 - tower.height - tower.antenna"
            width="1.4"
            :height="tower.antenna"
          />
          <rect
            v-for="(window, windowIndex) in tower.windows"
            :key="windowIndex"
            class="window"
            :x="window.x"
            :y="window.y"
            :width="window.w"
            :height="window.h"
            :style="{ opacity: window.lit }"
          />
        </g>
      </g>
    </svg>
  </div>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/** A skyline along the bottom edge — the 2D twin of the board's capital gate
 *  marker. Generated, so it is no city in particular: a real one is what the
 *  capital round asks a player to name. */
const props = defineProps<{ seed: number }>()

const RANK_WIDTH = 1200

type Window = { x: number; y: number; w: number; h: number; lit: string }
type Tower = {
  x: number
  width: number
  height: number
  antenna: number
  windows: Window[]
  d: string
}

/**
 * The shapes a skyline is actually made of. A real one is mostly slabs with a
 * few of everything else, which is what the weights encode — an even mix reads
 * as a novelty skyline, and slabs alone read as a bar chart.
 */
type TowerKind = 'slab' | 'setback' | 'spire' | 'dome' | 'pitched'
const KINDS: [TowerKind, number][] = [
  ['slab', 0.46],
  ['setback', 0.2],
  ['spire', 0.12],
  ['dome', 0.1],
  ['pitched', 0.12],
]

const pickKind = (random: () => number, tall: boolean): TowerKind => {
  // The back rank is the low-rise city behind the towers: no spires there.
  const pool = tall ? KINDS : KINDS.filter(([kind]) => kind !== 'spire')
  const total = pool.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [kind, weight] of pool) {
    roll -= weight
    if (roll <= 0) return kind
  }
  return 'slab'
}

/** One tower's silhouette, bottom-anchored on the 120-unit baseline. */
const silhouette = (
  kind: TowerKind,
  x: number,
  width: number,
  height: number,
  random: () => number
): string => {
  const top = 120 - height
  const right = x + width
  switch (kind) {
    case 'setback': {
      // Steps in as it rises — the pre-war tower, and the one shape that makes
      // a row of boxes look like a city rather than a chart.
      const inset = width * (0.16 + random() * 0.12)
      const shoulder = top + height * (0.28 + random() * 0.2)
      return `M ${x},120 L ${x},${shoulder} L ${x + inset},${shoulder} L ${x + inset},${top} L ${right - inset},${top} L ${right - inset},${shoulder} L ${right},${shoulder} L ${right},120 z`
    }
    case 'spire': {
      // Tapers to a point: the mast that gives a skyline its high note.
      const shoulder = top + height * (0.3 + random() * 0.15)
      const taper = width * 0.3
      return `M ${x},120 L ${x},${shoulder} L ${x + taper},${top} L ${right - taper},${top} L ${right},${shoulder} L ${right},120 z`
    }
    case 'dome': {
      // The civic building — a capital has a parliament, and a dome is the one
      // roof nobody mistakes for an office block.
      const shoulder = top + width * 0.42
      return `M ${x},120 L ${x},${shoulder} A ${width / 2},${width * 0.46} 0 0 1 ${right},${shoulder} L ${right},120 z`
    }
    case 'pitched': {
      // Low, roofed, older: the fabric a downtown actually stands in.
      const eaves = top + height * 0.26
      return `M ${x},120 L ${x},${eaves} L ${x + width / 2},${top} L ${right},${eaves} L ${right},120 z`
    }
    default:
      return `M ${x},120 L ${x},${top} L ${right},${top} L ${right},120 z`
  }
}

/** One rank of towers, tiled twice so the slow drift never shows an end. */
const buildRank = (random: () => number, tall: boolean): Tower[] => {
  const towers: Tower[] = []
  let x = 0
  while (x < RANK_WIDTH) {
    const kind = pickKind(random, tall)
    // Clamps per type, so the shapes stay recognisable: a dome is wide and
    // squat whatever the roll, a spire is narrow and tall, and nothing is
    // allowed to be a square blob.
    const width =
      kind === 'dome'
        ? 26 + random() * 22
        : kind === 'spire'
          ? 12 + random() * 12
          : kind === 'pitched'
            ? 18 + random() * 20
            : 14 + random() * 30
    const base = tall ? 34 : 20
    const span = tall ? 66 : 42
    const height =
      kind === 'spire'
        ? base + span * (0.72 + random() * 0.28)
        : kind === 'dome' || kind === 'pitched'
          ? base * 0.5 + span * (0.16 + random() * 0.28)
          : base + random() * span
    const windows: Window[] = []
    // Window grid, inset from the edges so the tower keeps its silhouette.
    const columns = Math.max(1, Math.floor((width - 6) / 7))
    // Keep windows out of whatever the roof is doing — a dome and a pitch are
    // not glazed, and a spire's taper would leave them hanging in the air.
    const roofless = kind === 'slab' || kind === 'setback' ? 8 : height * 0.42
    const rows = Math.max(1, Math.floor((height - roofless) / 9))
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        // Most windows are dark; a lit minority is what reads as night.
        if (random() > 0.42) continue
        windows.push({
          x: x + 4 + column * 7,
          y: 120 - height + roofless + row * 9,
          w: 3.4,
          h: 4.4,
          lit: (0.35 + random() * 0.65).toFixed(2),
        })
      }
    }
    towers.push({
      x,
      width,
      height,
      // A mast belongs on a flat top; a spire already is one.
      antenna: (kind === 'slab' || kind === 'setback') && random() > 0.82 ? 6 + random() * 14 : 0,
      windows,
      d: silhouette(kind, x, width, height, random),
    })
    x += width + 3 + random() * 9
  }
  return towers
}

const ranks = computed(() => {
  const random = seededRandom(props.seed)
  return [
    {
      key: 'far',
      class: 'far',
      towers: buildRank(random, false),
      style: { animationDuration: '150s' } as Record<string, string>,
    },
    {
      key: 'near',
      class: 'near',
      towers: buildRank(random, true),
      style: { animationDuration: '96s' } as Record<string, string>,
    },
  ]
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.skyline-drift {
  inset: 0;
  z-index: 0;
  overflow: hidden;
  position: absolute;
  pointer-events: none;
  // Only the bottom edge is masked away, not the middle: the band sits BELOW
  // the copy rather than behind it, so it needs no centre clearing.
  mask-image: linear-gradient(to bottom, transparent 34%, black 62%);
}

.rank {
  left: 0;
  bottom: 0;
  width: 200%;
  display: block;
  position: absolute;
  animation: skyline-pan 120s linear infinite;
}

.far {
  height: 26%;
  opacity: 0.3;
}

.near {
  height: 38%;
  opacity: 0.55;
}

.tower-group {
  // Each tower rises on its own beat, so the skyline builds rather than
  // switching on.
  transform-box: view-box;
  animation: tower-rise 0.9s var(--ease-out-expressive) var(--rise-delay, 0s) backwards;
}

.tower {
  fill: ink(0.55);
}

@media (prefers-reduced-motion: reduce) {
  .tower-group {
    animation: none;
  }
}

@keyframes tower-rise {
  from {
    // The viewBox height, so a tower starts genuinely off-stage.
    transform: translateY(130px);
  }
}

.window {
  fill: var(--night-amber);
}

// Resting state is a full band; the pan only slides it.
@keyframes skyline-pan {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(-50%, 0, 0);
  }
}
</style>
