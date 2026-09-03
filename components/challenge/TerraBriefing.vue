<template>
  <section class="terra-briefing briefing-card pane tr decorator-bottom">
    <span class="eyebrow">Terra Incognita</span>
    <h2>The atlas is failing</h2>

    <figure class="demo">
      <svg viewBox="0 0 320 120" aria-hidden="true">
        <defs>
          <radialGradient id="terra-demo-fade" cx="50%" cy="50%" r="50%">
            <stop offset="30%" stop-color="#fff" />
            <stop offset="82%" stop-color="#000" />
          </radialGradient>
          <mask id="terra-demo-mask">
            <rect width="320" height="120" fill="url(#terra-demo-fade)" />
          </mask>
        </defs>
        <!-- A spotlight on one border: land on both sides, the neighbours'
             borders leaving through the tripoints, everything fading to
             nothing well inside the card. Only the A|B line ever melts. -->
        <g mask="url(#terra-demo-mask)">
          <rect class="land" width="320" height="120" />
          <path v-for="(branch, index) in BRANCHES" :key="index" class="line" :d="branch" />
          <path class="line border" pathLength="1" :d="BORDER" />
        </g>
        <text class="name" x="112" y="66">A</text>
        <text class="name" x="212" y="66">B</text>
      </svg>
      <p class="query"><span>A or B?</span></p>
      <figcaption>
        A border dissolves and two countries read as one. Name the one that vanished
        <em>or</em> the one that grew.
      </figcaption>
    </figure>

    <ul class="briefing-points">
      <li>One country goes every {{ cadenceSeconds }} seconds after a short hold.</li>
      <li>A name still on the map costs a point.</li>
      <li>{{ challenge.collapseThreshold }} missing at once and the world starts to come apart.</li>
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

/** A deterministic jitter, so the border is the same on every seat and every
 *  render — random enough to read as a real simplified boundary, never a
 *  smooth curve, which no border on the map is. */
const jitter = (seed: number) => {
  let state = seed
  return () => {
    state = (state * 9301 + 49297) % 233280
    return state / 233280 - 0.5
  }
}

/** A border as the map draws one: short straight runs between vertices that
 *  wander sideways, from one end of the figure to the other. */
const wander = (
  from: [number, number],
  to: [number, number],
  steps: number,
  sway: number,
  seed: number
): [number, number][] => {
  const random = jitter(seed)
  const points: [number, number][] = [from]
  let drift = 0
  for (let step = 1; step < steps; step++) {
    const along = step / steps
    drift = Math.max(-sway, Math.min(sway, drift + random() * sway))
    const x = from[0] + (to[0] - from[0]) * along
    const y = from[1] + (to[1] - from[1]) * along
    // Sway across the line's own direction.
    const dx = to[1] - from[1]
    const dy = from[0] - to[0]
    const length = Math.hypot(dx, dy) || 1
    points.push([x + (dx / length) * drift, y + (dy / length) * drift])
  }
  points.push(to)
  return points
}

const toPath = (points: [number, number][]) =>
  points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')

// The A|B border runs top to bottom through the spotlight; the neighbours'
// borders leave it at two tripoints and fade out with the mask.
const borderPoints = wander([158, -4], [164, 124], 22, 9, 11)
const BORDER = toPath(borderPoints)
const BRANCHES = [
  toPath(wander(borderPoints[5]!, [330, 8], 14, 7, 23)),
  toPath(wander(borderPoints[16]!, [-10, 118], 14, 7, 37)),
]
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
    gap: 0.3rem;
    font-size: 1.3rem;
    line-height: 1.3;
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
    width: min(24rem, 100%);
    overflow: visible;
  }

  figcaption {
    font-size: 1.3rem;
    line-height: 1.3;

    em {
      font-style: normal;
      font-weight: bold;
    }
  }
}

// The map's own language: the land wash and hairline ink, fading to nothing
// well inside the figure so the eye lands on the one line that matters.
.land {
  fill: var(--map-not-highlight);
  stroke: none;
}

.line {
  fill: none;
  stroke: ink(1);
  stroke-width: 1.4;
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
  height: 1.6rem;
  font-size: 1.15rem;
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
