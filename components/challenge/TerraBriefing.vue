<template>
  <section class="terra-briefing briefing-card pane tr decorator-bottom">
    <span class="eyebrow">Terra Incognita</span>
    <h2>The atlas is failing</h2>

    <figure class="demo">
      <svg viewBox="0 0 240 124" aria-hidden="true">
        <path class="land" :d="LAND_A" />
        <path class="land" :d="LAND_B" />
        <path class="coast" :d="COAST_A" />
        <path class="coast" :d="COAST_B" />
        <path class="border" pathLength="1" :d="BORDER" />
        <text class="name" x="58" y="68">A</text>
        <text class="name" x="170" y="68">B</text>
        <text class="query" x="120" y="118">A or B?</text>
      </svg>
      <figcaption>
        A border dissolves and two countries read as one. Name the one that vanished
        <em>or</em> the one that grew — either puts the border back.
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

    <ButtonFilled @click="emit('ready')">I'm ready — start the clock</ButtonFilled>
  </section>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import { useKeyboardSkip } from '~~/lib/use-keyboard-skip'
import type { TerraIncognitaChallenge } from '~~/types/challenges/group-modes.type'

/**
 * Terra Incognita's ready card: the rules, a worked example of a border
 * melting, and the click that starts the clock. The round's schedule runs
 * from that click, so nobody loses the opening losses to reading time.
 */
const props = defineProps<{ challenge: TerraIncognitaChallenge }>()
const emit = defineEmits<{ ready: [] }>()

const cadenceSeconds = computed(() => Math.round(props.challenge.cadenceMs / 1000))

useKeyboardSkip(
  () => true,
  () => emit('ready')
)

// Two invented countries. The shared border is one cubic, and each land fill
// closes along it (B along the reversed curve) so the two fills meet exactly
// where the stroke wipes out.
const BORDER = 'M110 28 C122 50 98 74 118 100'
const COAST_A = 'M118 100 L82 110 L32 98 L14 64 L22 30 L70 16 L110 28'
const COAST_B = 'M110 28 L160 12 L214 30 L226 70 L200 106 L152 114 L118 100'
const LAND_A = `${COAST_A} C122 50 98 74 118 100 Z`
const LAND_B = `${COAST_B} C98 74 122 50 110 28 Z`
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
  gap: 0.8rem;
  align-items: center;
  flex-flow: column nowrap;

  svg {
    width: min(22rem, 100%);
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

.land {
  fill: var(--map-not-highlight);
  stroke: none;
}

.coast,
.border {
  fill: none;
  stroke: var(--dark-blue);
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.name,
.query {
  fill: var(--dark-blue);
  font-weight: bold;
  text-anchor: middle;
}

.name {
  font-size: 1.5rem;
}

.query {
  opacity: 0;
  font-size: 1.15rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

// The loop: the border holds, wipes out, the question lands over the fused
// land, then the border draws itself back and it starts again.
.border {
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  animation: demo-melt 7s var(--ease-smooth) infinite;
}

.query {
  animation: demo-ask 7s var(--ease-smooth) infinite;
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

  .query {
    animation: none;
    opacity: 1;
  }
}
</style>
