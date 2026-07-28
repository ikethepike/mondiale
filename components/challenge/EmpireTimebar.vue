<template>
  <div class="empire-timebar" :class="{ low }">
    <!-- The ChallengeConsole anatomy: input and bare-faced clock share one
         row; only the empire-timeline strip beneath is new. -->
    <div v-if="$slots.default" class="console-row">
      <div class="console-input">
        <slot />
      </div>
      <ChallengeTimerRadial
        v-if="clockTotal"
        class="console-clock"
        :value="clockValue ?? 0"
        :total="clockTotal"
      />
    </div>
    <div class="bar-line">
      <span class="edge">{{ formatEventYear(years[0]) }}</span>
      <div class="track">
        <div ref="fillEl" class="fill" />
        <span
          v-for="(year, index) in years"
          :key="year"
          class="tick"
          :style="{ left: `${(index / (years.length - 1)) * 100}%` }"
        />
        <input
          v-if="interactive"
          ref="rangeEl"
          type="range"
          min="0"
          max="1000"
          step="1"
          :aria-label="`Scrub the extent between ${formatEventYear(years[0])} and ${formatEventYear(years[years.length - 1])}`"
          @input="onInput"
        />
      </div>
      <span class="edge">{{ formatEventYear(years[years.length - 1]) }}</span>
      <ChallengeTimerRadial
        v-if="clockTotal && !$slots.default"
        class="console-clock"
        :value="clockValue ?? 0"
        :total="clockTotal"
      />
    </div>
  </div>
</template>
<script lang="ts" setup>
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import { formatEventYear } from '~~/lib/timeline'
import { clamp01 } from '~~/lib/number'

/**
 * The empire round's one footer element, every beat: a console pill holding
 * the slotted input, the round clock, and the empire's own timeline as a
 * progress track — the sweep's position ticking along its keyframe years.
 * At reveal the same track turns interactive and becomes the scrubber, so
 * the footer never jumps size or position between phases.
 *
 * Progress arrives per animation frame via `setT` and is written straight to
 * the fill's style — the GameMap discipline, no reactive churn.
 */
const props = defineProps<{
  /** Keyframe years, oldest first. */
  years: number[]
  /** Reveal mode: the track scrubs, emitting `scrub` with t ∈ [0, K−1]. */
  interactive?: boolean
  /** Round-clock pair; omit clockTotal to hide the radial (reveal). */
  clockValue?: number
  clockTotal?: number
}>()

const emit = defineEmits<{ scrub: [t: number] }>()

const fillEl = ref<HTMLElement>()
const rangeEl = ref<HTMLInputElement>()
let scrubbing = false

/** ChallengeConsole's warming-border contract over the final fifth. */
const low = computed(
  () =>
    Boolean(props.clockTotal) &&
    (props.clockValue ?? 0) / (props.clockTotal || 1) <= 0.2 &&
    (props.clockValue ?? 0) / (props.clockTotal || 1) < 1
)

const setT = (t: number) => {
  const fraction = clamp01(t / Math.max(1, props.years.length - 1))
  if (fillEl.value) fillEl.value.style.width = `${fraction * 100}%`
  if (rangeEl.value && !scrubbing) rangeEl.value.value = String(Math.round(fraction * 1000))
}

const onInput = () => {
  scrubbing = true
  const fraction = Number(rangeEl.value?.value ?? 0) / 1000
  if (fillEl.value) fillEl.value.style.width = `${fraction * 100}%`
  emit('scrub', fraction * (props.years.length - 1))
  scrubbing = false
}

defineExpose({ setT })
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
// The NightConsole card's anatomy and dimensions, in the day skin: same
// padding, radius, width and clock scale — parchment glass instead of night
// glass, plus the empire-timeline strip.
.empire-timebar {
  gap: 0.6rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
  padding: 1.2rem 1.6rem;
  border-radius: 1.4rem;
  pointer-events: auto;
  backdrop-filter: blur(0.6rem);
  background: milk(0.88);
  border: 0.1rem solid ink(0.2);
  box-shadow: 0 0.4rem 2.4rem ink(0.15);
  width: min(44rem, calc(100vw - 3.2rem));
  transition: border-color 2s var(--ease-smooth);

  &.low {
    border-color: var(--hior-ange);
  }

  --clock-size: 5.2rem;
  --clock-seconds-size: 1.7rem;
  --clock-disc-fill: transparent;
  --clock-disc-stroke: transparent;
}

.console-row {
  gap: 1rem;
  width: 100%;
  display: flex;
  align-items: center;
}

.console-input {
  flex: 1;
  gap: 0.8rem;
  display: flex;
  min-width: 0;
  align-items: center;

  // The slotted guess input sheds its own pill — the card is the pill.
  :deep(.guess-form) {
    flex: 1;
    min-width: 0;
    border: none;
    background: none;
    backdrop-filter: none;
  }
  :deep(form) {
    flex: 1;
    min-width: 0;
  }
  :deep(input) {
    width: 100%;
    border: none;
    outline: none;
    background: none;
    font: inherit;
    font-size: 1.5rem;
    color: var(--dark-blue);
    padding: 0.4rem 1.2rem;

    &::placeholder {
      opacity: 0.5;
    }
  }

  // Suggestions open upward — the card hugs the bottom edge.
  :deep(.suggestions) {
    top: auto;
    bottom: 100%;
    margin: 0 0 0.6rem;
  }
}

.console-clock {
  flex: none;
}

.bar-line {
  gap: 1rem;
  width: 100%;
  display: flex;
  align-items: center;
}

.edge {
  font-size: 1.15rem;
  font-weight: 600;
  white-space: nowrap;
  color: var(--dark-blue);
  font-variant-numeric: tabular-nums;
}

.track {
  flex: 1;
  height: 1.6rem;
  display: flex;
  position: relative;
  align-items: center;

  &::before {
    content: '';
    left: 0;
    right: 0;
    height: 0.2rem;
    position: absolute;
    border-radius: 999px;
    background: ink(0.25);
  }
}

// The empire's own clock: aged red ink filling toward dissolution.
.fill {
  left: 0;
  width: 0%;
  height: 0.3rem;
  position: absolute;
  border-radius: 999px;
  background: hsl(16, 52%, 40%);
}

.tick {
  width: 0.5rem;
  height: 0.5rem;
  position: absolute;
  border-radius: 999px;
  transform: translateX(-50%);
  background: ink(0.4);
  pointer-events: none;
}

input[type='range'] {
  inset: 0;
  width: 100%;
  margin: 0;
  cursor: pointer;
  appearance: none;
  position: absolute;
  background: transparent;
  touch-action: none;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    background: var(--dark-blue);
    border: 0.25rem solid milk(0.95);
    box-shadow: 0 0 0 0.1rem ink(0.35);
  }
  &::-moz-range-thumb {
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 999px;
    background: var(--dark-blue);
    border: 0.25rem solid milk(0.95);
    box-shadow: 0 0 0 0.1rem ink(0.35);
  }
}

.bar-clock {
  flex-shrink: 0;
  --clock-size: 3.6rem;
  --clock-seconds-size: 1.3rem;
}
</style>
