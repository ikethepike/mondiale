<template>
  <section class="terra-briefing briefing-card pane tr decorator-bottom">
    <span class="eyebrow">Terra Incognita</span>
    <h2>The atlas is failing</h2>

    <figure class="demo">
      <svg viewBox="0 0 320 150" aria-hidden="true">
        <defs>
          <radialGradient id="terra-demo-fade" cx="50%" cy="50%" r="55%">
            <stop offset="55%" stop-color="#fff" />
            <stop offset="100%" stop-color="#000" />
          </radialGradient>
          <mask id="terra-demo-mask">
            <rect width="320" height="150" fill="url(#terra-demo-fade)" />
          </mask>
        </defs>
        <g mask="url(#terra-demo-mask)">
          <path class="land" :d="COAST" />
          <path class="line" :d="NORTH" />
          <path class="line" :d="EAST" />
          <path class="line border" pathLength="1" :d="BORDER" />
          <path class="line" :d="COAST" />
        </g>
        <text class="name" x="92" y="92">A</text>
        <text class="name" x="206" y="92">B</text>
      </svg>
      <p class="query"><span>A or B?</span></p>
      <figcaption>
        One border dissolves and two countries read as one. Name the one that vanished
        <em>or</em> the one that grew — either puts the line back.
      </figcaption>
    </figure>

    <ul class="briefing-points">
      <li>
        The map holds still for a moment, then loses one country every
        {{ cadenceSeconds }} seconds.
      </li>
      <li>Naming a country that is still on the map costs a point.</li>
      <li>
        Let {{ challenge.collapseThreshold }} stand missing at once and the world starts to come
        apart.
      </li>
    </ul>

    <!-- The table, pawn by pawn: colour = briefed and ready, faded = still
         reading. The clock starts for everyone when the row is full. -->
    <div class="ready-row">
      <div
        v-for="playerId in participants"
        :key="playerId"
        class="ready-seat"
        :class="{ waiting: !ready.includes(playerId) }"
      >
        <PlayerPawn class="ready-pawn" :player="gameStore.game?.players[playerId]" />
        <span class="seat-name">{{ seatName(playerId) }}</span>
      </div>
    </div>

    <ButtonFilled v-if="!sent && !spectating" @click="emit('ready')">I'm ready</ButtonFilled>
    <p v-else class="briefing-waiting">
      {{ spectating ? 'The table is reading the rules…' : 'Waiting for the rest of the table…' }}
    </p>
  </section>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import { seatLabel } from '~~/lib/player'
import { useKeyboardSkip } from '~~/lib/use-keyboard-skip'
import { useGameStore } from '~~/store/game.store'
import type { TerraIncognitaChallenge } from '~~/types/challenges/group-modes.type'

/**
 * Terra Incognita's briefing card: the rules, a worked example of a border
 * melting, and the ready click. The click is an ack — the server starts the
 * one clock when the whole table has clicked (or the cap forces it).
 */
const props = defineProps<{
  challenge: TerraIncognitaChallenge
  /** Seats that have dismissed their card. */
  ready: string[]
  /** Whose readiness the round waits on. */
  participants: string[]
  /** This seat has already clicked. */
  sent: boolean
  /** The booth: no click to offer, only the row to watch. */
  spectating: boolean
}>()
const emit = defineEmits<{ ready: [] }>()

const gameStore = useGameStore()
const cadenceSeconds = computed(() => Math.round(props.challenge.cadenceMs / 1000))
const seatName = (playerId: string) =>
  seatLabel(gameStore.game?.players, playerId, gameStore.seatId)

useKeyboardSkip(
  () => !props.sent,
  () => emit('ready')
)

/** Catmull-Rom through the points as cubic Béziers — an organic coast from a
 *  handful of vertices. */
const smooth = (points: [number, number][], closed: boolean): string => {
  const count = points.length
  const at = (index: number) => points[((index % count) + count) % count]!
  let d = `M${at(0)[0]} ${at(0)[1]}`
  const last = closed ? count : count - 1
  for (let index = 0; index < last; index++) {
    const p0 = closed || index > 0 ? at(index - 1) : at(index)
    const p1 = at(index)
    const p2 = at(index + 1)
    const p3 = closed || index + 2 < count ? at(index + 2) : at(index + 1)
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`
  }
  return closed ? `${d}Z` : d
}

// One stretch of coast, cut by three borders. Only the middle one — between
// A and B — ever melts; the other two stay, so the fusion reads against
// borders that survive, exactly as it does on the real map.
const COAST = smooth(
  [
    [6, 66],
    [34, 30],
    [80, 16],
    [136, 24],
    [190, 10],
    [250, 20],
    [304, 46],
    [314, 96],
    [284, 136],
    [222, 146],
    [156, 134],
    [96, 146],
    [40, 132],
    [10, 104],
  ],
  true
)
const NORTH = smooth(
  [
    [6, 66],
    [60, 58],
    [118, 50],
    [150, 44],
    [204, 52],
    [258, 42],
    [304, 46],
  ],
  false
)
const EAST = smooth(
  [
    [258, 42],
    [248, 78],
    [262, 108],
    [284, 136],
  ],
  false
)
const BORDER = smooth(
  [
    [150, 44],
    [140, 70],
    [162, 96],
    [148, 118],
    [156, 134],
  ],
  false
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

// Layout and scrolling come from the shared .briefing-card template; only
// the atlas flavour lives here.
.terra-briefing {
  color: var(--dark-blue);
  border-color: var(--dark-blue);

  h2 {
    margin: 0;
  }

  .briefing-points {
    font-size: 1.45rem;
  }
}

.demo {
  width: 100%;
  margin: 0;
  display: flex;
  gap: 0.4rem;
  align-items: center;
  flex-flow: column nowrap;

  svg {
    width: min(26rem, 100%);
    overflow: visible;
  }

  figcaption {
    font-size: 1.35rem;
    line-height: 1.35;

    em {
      font-style: normal;
      font-weight: bold;
    }
  }
}

// The map's own language: the land wash and hairline ink, fading out toward
// the card's edges so the figure reads as a fragment of an atlas, not a pair
// of blobs on paper.
.land {
  fill: var(--map-not-highlight);
  stroke: none;
}

.line {
  fill: none;
  stroke: ink(0.85);
  stroke-width: 1.1;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.name {
  fill: var(--dark-blue);
  font-size: 1.3rem;
  font-weight: 600;
  text-anchor: middle;
  paint-order: stroke;
  stroke: #{milk()};
  stroke-width: 0.35rem;
  stroke-linejoin: round;
}

// The question lands as the border goes, in the gauge's ember — the same hue
// the round's alarm wears.
.query {
  margin: 0;
  height: 1.8rem;
  font-size: 1.2rem;
  font-weight: bold;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ember(1, 45%);

  span {
    opacity: 0;
    display: inline-block;
    animation: demo-ask 7s var(--ease-smooth) infinite;
  }
}

// The loop: the border holds, wipes out, the question lands over the fused
// land, then the border draws itself back and it starts again.
.border {
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  animation: demo-melt 7s var(--ease-smooth) infinite;
}

@keyframes demo-melt {
  0%,
  18% {
    stroke-dashoffset: 0;
  }
  36%,
  78% {
    stroke-dashoffset: 1;
  }
  94%,
  100% {
    stroke-dashoffset: 0;
  }
}

@keyframes demo-ask {
  0%,
  34% {
    opacity: 0;
  }
  42%,
  76% {
    opacity: 1;
  }
  84%,
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .border {
    animation: none;
    stroke-dasharray: 0.04 0.03;
  }

  .query span {
    animation: none;
    opacity: 1;
  }
}
</style>
