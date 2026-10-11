<template>
  <div class="vintage-timebar" :class="{ interactive, disabled, marked: !!marker }">
    <div
      ref="track"
      class="track"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
    >
      <svg
        v-if="curve"
        class="curve"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path :d="curve" />
      </svg>
      <span
        v-for="([from, to], index) in band ?? []"
        :key="`band-${index}`"
        class="band"
        :style="{ left: `${at(from - 0.5)}%`, width: `${at(to + 0.5) - at(from - 0.5)}%` }"
      />
      <button
        v-for="year in steps ?? []"
        :key="`step-${year}`"
        type="button"
        class="step"
        :class="{ lit: year === highlight }"
        :style="{ left: `${at(year)}%` }"
        :aria-label="`Changes in ${year}`"
        :tabindex="stepsSelectable ? 0 : -1"
        @click="emit('select', year)"
      />
      <span
        v-if="interactive && modelValue !== undefined"
        class="needle"
        :class="{ dragging: dragAt !== undefined }"
        :style="{ left: `${dragAt ?? at(modelValue)}%` }"
      >
        <span class="readout">
          <button
            type="button"
            class="nudge"
            aria-label="One year earlier"
            :disabled="disabled"
            @pointerdown.stop
            @click="nudge(-1)"
          >
            ‹
          </button>
          {{ modelValue }}
          <button
            type="button"
            class="nudge"
            aria-label="One year later"
            :disabled="disabled"
            @pointerdown.stop
            @click="nudge(1)"
          >
            ›
          </button>
        </span>
      </span>
      <span
        v-else-if="marker"
        class="needle marker"
        :class="{ masked: marker.year === undefined }"
        :style="{ left: `${marker.year === undefined ? 50 : at(marker.year)}%` }"
      >
        <span class="readout">{{ marker.label }}</span>
      </span>
      <input
        v-if="interactive"
        type="range"
        :min="range[0]"
        :max="range[1]"
        step="1"
        :value="modelValue ?? Math.round((range[0] + range[1]) / 2)"
        :disabled="disabled"
        aria-label="The year this map shows"
        @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
      />
    </div>
    <div v-if="pawns?.length" class="pawns" :style="{ height: `${(rows + 1) * 3.4}rem` }">
      <span
        v-for="pawn in stackedPawns"
        :key="pawn.player.id"
        class="pawn-stop"
        :style="{ left: `${at(pawn.year)}%`, top: `${pawn.row * 3.4}rem` }"
      >
        <PlayerPawn class="pawn" :player="pawn.player" />
        <small v-if="pawn.label">{{ pawn.label }}</small>
      </span>
    </div>
    <div class="scale" aria-hidden="true">
      <span v-for="year in decades" :key="year" :style="{ left: `${at(year)}%` }">{{ year }}</span>
    </div>
  </div>
</template>
<script lang="ts" setup>
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import { clamp } from '~~/lib/number'
import type { Player } from '~~/types/player.type'

/** Vintage's ruler of years: the guess slider during play, and on the
 *  scorecard the band that matched, the steps, and every seat's guess. */
const props = defineProps<{
  range: [number, number]
  modelValue?: number
  interactive?: boolean
  disabled?: boolean
  /** Years that show exactly the dealt map. */
  band?: [number, number][]
  /** Years the map changed. */
  steps?: number[]
  stepsSelectable?: boolean
  highlight?: number
  /** Sovereign states per year from `range[0]` — the shape of history behind the ruler. */
  states?: number[]
  pawns?: { player: Player; year: number; label?: string }[]
  /** A read-only year on the ruler: the replay's year, or a masked one (no
   *  `year`) while the rewind keeps the date hidden. */
  marker?: { year?: number; label: string }
}>()

const emit = defineEmits<{ 'update:modelValue': [year: number]; select: [year: number] }>()

const track = ref<HTMLElement>()
/** Where the needle stands mid-drag, in percent — it follows the finger
 *  continuously and only the readout snaps to whole years. */
const dragAt = ref<number>()
/** How far from the needle the pointer took hold — grabbing the year label
 *  off-centre must not make the needle jump under the finger. */
let grabOffset = 0
const pick = (year: number) => {
  const next = clamp(Math.round(year), props.range[0], props.range[1])
  if (next !== props.modelValue) emit('update:modelValue', next)
}
const dragTo = (event: PointerEvent) => {
  const box = track.value?.getBoundingClientRect()
  if (!box?.width) return
  const share = clamp((event.clientX - grabOffset - box.left) / box.width, 0, 1)
  dragAt.value = share * 100
  pick(props.range[0] + share * (props.range[1] - props.range[0]))
}
const startDrag = (event: PointerEvent) => {
  if (!props.interactive || props.disabled) return
  const box = track.value?.getBoundingClientRect()
  const onHandle = (event.target as Element | null)?.closest('.readout')
  grabOffset =
    onHandle && box && props.modelValue !== undefined
      ? event.clientX - (box.left + (box.width * at(props.modelValue)) / 100)
      : 0
  track.value?.setPointerCapture(event.pointerId)
  dragTo(event)
}
const moveDrag = (event: PointerEvent) => {
  if (dragAt.value !== undefined) dragTo(event)
}
const endDrag = () => {
  dragAt.value = undefined
  grabOffset = 0
}
const nudge = (by: number) => {
  if (props.modelValue !== undefined && !props.disabled) pick(props.modelValue + by)
}

const at = (year: number) =>
  clamp(((year - props.range[0]) / Math.max(1, props.range[1] - props.range[0])) * 100, 0, 100)

/** Guesses closer than this share of the ruler stack into rows. */
const PAWN_CROWD = 5
const stackedPawns = computed(() => {
  const placed: { left: number; row: number }[] = []
  return [...(props.pawns ?? [])]
    .sort((a, b) => a.year - b.year)
    .map(pawn => {
      const left = at(pawn.year)
      let row = 0
      while (placed.some(other => other.row === row && Math.abs(other.left - left) < PAWN_CROWD))
        row++
      placed.push({ left, row })
      return { ...pawn, row }
    })
})
const rows = computed(() => Math.max(0, ...stackedPawns.value.map(pawn => pawn.row)))

const DECADE_STEP = 20
const decades = computed(() => {
  const first = Math.ceil(props.range[0] / DECADE_STEP) * DECADE_STEP
  const years: number[] = []
  for (let year = first; year <= props.range[1]; year += DECADE_STEP) years.push(year)
  return years
})

const curve = computed(() => {
  const states = props.states
  if (!states?.length) return undefined
  const most = Math.max(...states, 1)
  const points = states.map((count, index) => {
    const x = at(props.range[0] + index)
    const y = 40 - (count / most) * 38
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  return `M0,40 L${points.join(' L')} L100,40 Z`
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.vintage-timebar {
  width: 100%;
  display: grid;
  gap: 0.4rem;

  &.interactive,
  &.marked {
    padding-top: 3.4rem;
  }

  pointer-events: auto;
  font-variant-numeric: tabular-nums;
}

.track {
  position: relative;
  height: 4.4rem;
  border-bottom: 1px solid ink(0.55);
}

.curve {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;

  path {
    fill: ink(0.09);
  }
}

.band {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--soft-mint) 55%, transparent);
  border-inline: 1px solid color-mix(in srgb, var(--soft-mint) 100%, black 25%);
  animation: fade-in var(--motion-slow) var(--ease-out-expressive) both;
}

.step {
  position: absolute;
  bottom: 0;
  width: 0.6rem;
  height: 1.2rem;
  padding: 0;
  border: 0;
  background: none;
  transform: translateX(-50%);
  cursor: pointer;

  &::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 0;
    width: 1px;
    height: 100%;
    background: ink(0.45);
  }

  &.lit::after {
    width: 2px;
    background: ink(0.95);
  }
}

.needle {
  position: absolute;
  top: -0.2rem;
  bottom: -0.4rem;
  width: 2px;
  background: ink(0.95);
  transform: translateX(-50%);
  pointer-events: none;
  transition: left var(--motion-quick) var(--ease-smooth);

  &.dragging {
    transition: none;

    .readout {
      cursor: grabbing;
      transform: translate(-50%, -0.4rem) scale(1.12);
    }
  }

  .readout {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    transition: transform var(--motion-quick) var(--ease-smooth);
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translate(-50%, -0.4rem);
    padding: 0.1rem 0.8rem;
    font-size: 2rem;
    border-radius: 0.6rem;
    color: var(--background-color);
    background: ink(0.95);
  }
}

.marker {
  transition: left var(--motion-base) var(--ease-smooth);

  &.masked {
    width: 0;
    background: none;

    .readout {
      letter-spacing: 0.3em;
      color: ink(0.55);
      background: var(--background-color);
      border: 1px solid ink(0.25);
    }
  }
}

.nudge {
  padding: 0 0.4rem;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 1.8rem;
  line-height: 1;
  cursor: pointer;
  pointer-events: auto;
  opacity: 0.7;

  &:hover {
    opacity: 1;
  }
}

.interactive .track {
  cursor: ew-resize;
  touch-action: none;
}

.interactive .needle:not(.marker) .readout {
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
}

// Keyboard and screen readers only: the track owns the pointer, so the
// needle can follow a finger between whole years.
input[type='range'] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  pointer-events: none;
}

.disabled {
  .needle:not(.marker) {
    opacity: 0.35;
  }

  input[type='range'] {
    cursor: not-allowed;
  }
}

.pawns {
  position: relative;
}

.pawn-stop {
  position: absolute;
  top: 0;
  display: grid;
  justify-items: center;
  transform: translateX(-50%);
  animation: fade-in var(--motion-slow) var(--ease-out-expressive) both;

  .pawn {
    width: 1.8rem;
    height: 1.8rem;
  }

  small {
    font-size: 1.1rem;
    color: ink(0.7);
    white-space: nowrap;
  }
}

.scale {
  position: relative;
  height: 1.6rem;
  font-size: 1.1rem;
  color: ink(0.6);

  span {
    position: absolute;
    transform: translateX(-50%);
  }
}
</style>
