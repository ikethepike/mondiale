<template>
  <div class="pyramid-timeline">
    <button
      class="play"
      type="button"
      :aria-label="playing ? 'Pause the sweep' : 'Play the sweep'"
      @click="toggle"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path v-if="playing" d="M4 3h3v10H4zM9 3h3v10H9z" />
        <path v-else d="M4 2.5v11l9.5-5.5z" />
      </svg>
    </button>
    <span class="edge">{{ PYRAMID_YEARS[0] }}</span>
    <div class="track">
      <div class="fill" :style="{ width: `${fraction * 100}%` }" />
      <span
        v-for="(year, index) in PYRAMID_YEARS"
        :key="year"
        class="tick"
        :style="{ left: `${(index / last) * 100}%` }"
      />
      <input
        type="range"
        min="0"
        :max="last"
        step="0.01"
        :value="modelValue"
        :aria-label="`Scrub between ${PYRAMID_YEARS[0]} and ${PYRAMID_YEARS.at(-1)}`"
        @input="onScrub"
      />
    </div>
    <span class="edge">{{ PYRAMID_YEARS.at(-1) }}</span>
  </div>
</template>

<script lang="ts" setup>
/** The pyramid's sixty years as a scrubbable track: it sweeps on its own until
 *  the player grabs it, and the play button hands it back to the sweep. */
import { prefersReducedMotion } from '~~/lib/motion'
import { PYRAMID_YEARS } from '~~/lib/pyramids'

const SWEEP_MS = 11000
const HOLD_MS = 1100

const props = defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [frame: number] }>()

const last = PYRAMID_YEARS.length - 1
const fraction = computed(() => props.modelValue / last)

const playing = ref(false)
let raf: number | undefined
let previous: number | undefined
let heldFor = 0

const tick = (now: number) => {
  const step = previous === undefined ? 0 : now - previous
  previous = now
  if (props.modelValue >= last) {
    heldFor += step
    if (heldFor >= HOLD_MS * 2) {
      heldFor = 0
      emit('update:modelValue', 0)
    }
  } else if (props.modelValue <= 0 && heldFor < HOLD_MS) {
    heldFor += step
  } else {
    heldFor = 0
    emit('update:modelValue', Math.min(last, props.modelValue + (step / SWEEP_MS) * last))
  }
  raf = requestAnimationFrame(tick)
}

const stop = () => {
  playing.value = false
  if (raf !== undefined) cancelAnimationFrame(raf)
  raf = undefined
}

const play = () => {
  stop()
  playing.value = true
  previous = undefined
  heldFor = 0
  raf = requestAnimationFrame(tick)
}

const toggle = () => (playing.value ? stop() : play())

const onScrub = (event: Event) => {
  stop()
  emit('update:modelValue', Number((event.target as HTMLInputElement).value))
}

onMounted(() => {
  if (prefersReducedMotion()) emit('update:modelValue', last)
  else play()
})
onBeforeUnmount(stop)

defineExpose({ stop })
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.pyramid-timeline {
  gap: 1rem;
  width: 100%;
  display: flex;
  align-items: center;
  pointer-events: auto;
}

.play {
  flex: none;
  width: 3.4rem;
  height: 3.4rem;
  display: grid;
  cursor: pointer;
  place-items: center;
  border-radius: 999px;
  color: milk(0.95);
  background: var(--dark-blue);
  border: none;

  svg {
    width: 1.4rem;
    height: 1.4rem;
    fill: currentColor;
  }
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
  height: 2.4rem;
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

.fill {
  left: 0;
  height: 0.3rem;
  position: absolute;
  border-radius: 999px;
  background: var(--dark-blue);
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
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 999px;
    background: var(--dark-blue);
    border: 0.25rem solid milk(0.95);
    box-shadow: 0 0 0 0.1rem ink(0.35);
  }
  &::-moz-range-thumb {
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 999px;
    background: var(--dark-blue);
    border: 0.25rem solid milk(0.95);
    box-shadow: 0 0 0 0.1rem ink(0.35);
  }
}
</style>
