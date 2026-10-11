<template>
  <BriefingCard
    class="government-briefing"
    :class="{ recap: challenge.state.recap }"
    :participants="participants"
    :ready="challenge.state.ready"
    :cta="challenge.state.recap ? 'Back to the chamber' : 'I understand'"
    :sent="sent"
    @ready="emit('ready')"
  >
    <span class="eyebrow">{{ chamberLabel }}</span>
    <h2>{{ challenge.state.recap ? 'Same rules, new chamber' : 'Who governs here?' }}</h2>
    <p v-if="!challenge.state.recap" class="lede">
      Three questions about one parliament. Each one scores on its own, and the next one builds on
      its answer.
    </p>

    <ol class="steps">
      <li v-for="(step, index) in STEPS" :key="step.beat" class="step">
        <figure v-if="!challenge.state.recap" class="demo" :class="step.beat" aria-hidden="true">
          <svg v-if="step.beat === 'party'" viewBox="0 0 120 64">
            <g
              v-for="tile in PARTY_TILES"
              :key="tile.x"
              class="tile"
              :class="{ truth: tile.truth }"
            >
              <rect :x="tile.x" y="10" width="26" height="40" rx="5" />
              <circle :cx="tile.x + 13" cy="24" r="6" />
              <rect class="label" :x="tile.x + 5" y="36" width="16" height="4" rx="2" />
            </g>
          </svg>
          <svg v-else viewBox="0 0 200 104">
            <circle
              v-for="(seat, seatIndex) in DEMO_SEATS"
              :key="seatIndex"
              class="dot"
              :class="step.beat === 'seats' ? seatsDemoClass(seatIndex) : sidesDemoClass(seatIndex)"
              :cx="seat.x * 2"
              :cy="seat.y"
              r="5.2"
              :style="{ '--delay': `${demoDelay(step.beat, seatIndex)}ms` }"
            />
            <line class="majority" x1="100" y1="2" x2="100" y2="102" />
          </svg>
        </figure>
        <div class="step-text">
          <h3>
            <span class="step-index">{{ index + 1 }}</span>
            {{ step.title }}
          </h3>
          <p v-if="!challenge.state.recap">{{ step.body }}</p>
          <span class="step-terms">
            {{ BEAT_SECONDS[step.beat] }}s · {{ BEAT_POINTS[step.beat] }} pts
          </span>
        </div>
      </li>
    </ol>
  </BriefingCard>
</template>

<script setup lang="ts">
import BriefingCard from '~/components/challenge/BriefingCard.vue'
import { hemicycleSeats } from '~/components/challenge/individual/ring'
import { countryName } from '~~/lib/country'
import { BEAT_POINTS, BEAT_SECONDS, type GovernmentBeat } from '~~/lib/government'
import { chainContenders } from '~~/lib/player'
import { useGameStore } from '~~/store/game.store'
import type { GovernmentChallenge } from '~~/types/challenges/group-modes.type'

/** Government's rules card: one worked step per beat, or a one-line recap once the table has played a chamber. */
const props = defineProps<{
  challenge: GovernmentChallenge
  sent: boolean
}>()
const emit = defineEmits<{ ready: [] }>()

const gameStore = useGameStore()
const participants = computed(() => (gameStore.game ? chainContenders(gameStore.game) : []))

const chamberLabel = computed(() => {
  const country = countryName(props.challenge.country)
  return props.challenge.chamber ? `${country} — the ${props.challenge.chamber}` : country
})

const STEPS: { beat: GovernmentBeat; title: string; body: string }[] = [
  {
    beat: 'party',
    title: 'Which party governs?',
    body: 'Pick the party leading the government from its rivals in the same chamber.',
  },
  {
    beat: 'seats',
    title: 'How many seats does it hold?',
    body: 'The chamber is drawn without colours. Choose the block that matches its share of the house.',
  },
  {
    beat: 'sides',
    title: 'Who else is with it?',
    body: 'Sort the other big parties: With the government, or Against it. Parties that back it without ministers count as With.',
  },
]

const PARTY_TILES = [0, 1, 2, 3].map(index => ({ x: 3 + index * 29, truth: index === 2 }))

const DEMO_DOTS = 36
const DEMO_SEATS = hemicycleSeats(DEMO_DOTS, 3)
const GOVERNMENT_DOTS = 13
const BACKING_DOTS = 7

const demoDelay = (beat: GovernmentBeat, index: number) =>
  beat === 'seats' ? index * 60 : Math.max(0, index - GOVERNMENT_DOTS) * 100

const seatsDemoClass = (index: number) => (index < GOVERNMENT_DOTS ? 'fills' : undefined)
const sidesDemoClass = (index: number) => {
  if (index < GOVERNMENT_DOTS) return 'government'
  if (index < GOVERNMENT_DOTS + BACKING_DOTS) return 'backing'
  return 'opposition'
}
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/_ink.scss' as *;
@use '~/assets/scss/rules/_breakpoints.scss' as *;

.government-briefing {
  gap: 1.2rem;
  max-width: min(78rem, calc(100% - 2.4rem));
  color: var(--dark-blue);

  @media (max-width: $tablet) {
    gap: 0.9rem;
    padding: 1.6rem 1.4rem;
  }

  &.recap {
    max-width: min(40rem, calc(100% - 2.4rem));
  }

  .eyebrow {
    margin-bottom: -0.6rem;
  }
}

.lede {
  max-width: 46rem;
  margin: 0;
  font-size: 15px;
  line-height: 1.4;
  opacity: 0.8;

  @media (max-width: $tablet) {
    display: none;
  }
}

.steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.4rem;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  text-align: left;

  @media (max-width: $tablet) {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.8rem;
  }

  .recap & {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.6rem;
  }
}

.step {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 0.8rem;
  padding: 1.2rem;
  border: 1px solid ink(0.14);
  border-radius: 12px;
  background: milk(0.6);
  animation: row-land var(--motion-base) var(--ease-out-expressive) backwards;

  @for $index from 1 through 3 {
    &:nth-child(#{$index}) {
      animation-delay: #{($index - 1) * 90}ms;
    }
  }

  @media (max-width: $tablet) {
    grid-template-columns: 92px minmax(0, 1fr);
    grid-template-rows: auto;
    align-items: center;
    gap: 1.2rem;
    padding: 1rem;
  }

  .recap & {
    grid-template-columns: minmax(0, 1fr);
    padding: 0.8rem 1.2rem;
  }
}

.step-text {
  display: grid;
  gap: 0.4rem;
  align-content: start;

  h3 {
    display: flex;
    align-items: baseline;
    gap: 0.7rem;
    margin: 0;
    font-size: 16px;
    line-height: 1.25;
  }

  p {
    margin: 0;
    font-size: 14px;
    line-height: 1.4;
    opacity: 0.8;
  }
}

.step-index {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--dark-blue);
  color: milk();
  font-size: 12px;
}

.step-terms {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.6;
}

.demo {
  display: grid;
  place-items: center;
  margin: 0;
  aspect-ratio: 2 / 1;

  svg {
    width: 100%;
    max-width: 200px;
    overflow: visible;
  }
}

.tile {
  rect:not(.label) {
    fill: milk();
    stroke: ink(0.25);
    stroke-width: 1;
  }

  circle,
  .label {
    fill: ink(0.25);
  }

  &.truth {
    animation: tile-pick 3.6s var(--ease-smooth) infinite;
  }
}

@keyframes tile-pick {
  0%,
  30% {
    transform: none;
  }
  45%,
  85% {
    transform: translateY(-4px);
  }
  100% {
    transform: none;
  }
}

.tile.truth rect:not(.label) {
  animation: tile-stroke 3.6s var(--ease-smooth) infinite;
}

@keyframes tile-stroke {
  0%,
  30%,
  100% {
    stroke: ink(0.25);
    stroke-width: 1;
  }
  45%,
  85% {
    stroke: var(--dark-blue);
    stroke-width: 2;
  }
}

.dot {
  fill: ink(0.18);
}

.majority {
  stroke: ink(0.5);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.seats .dot.fills {
  animation: dot-fill 4s var(--ease-smooth) infinite;
  animation-delay: var(--delay);
}

@keyframes dot-fill {
  0%,
  10% {
    fill: ink(0.18);
  }
  25%,
  80% {
    fill: ink(0.88);
  }
  95%,
  100% {
    fill: ink(0.18);
  }
}

.sides {
  .dot.government {
    fill: ink(0.88);
  }

  .dot.backing {
    fill: transparent;
    stroke: ink(0.88);
    stroke-width: 2;
    animation: dot-back 4s var(--ease-smooth) infinite;
    animation-delay: var(--delay);
  }
}

@keyframes dot-back {
  0%,
  15% {
    stroke: ink(0.18);
  }
  35%,
  85% {
    stroke: ink(0.88);
  }
  100% {
    stroke: ink(0.18);
  }
}

@media (prefers-reduced-motion: reduce) {
  .step,
  .tile.truth,
  .tile.truth rect:not(.label),
  .seats .dot.fills,
  .sides .dot.backing {
    animation: none;
  }

  .seats .dot.fills {
    fill: ink(0.88);
  }

  .tile.truth rect:not(.label) {
    stroke: var(--dark-blue);
    stroke-width: 2;
  }
}
</style>
