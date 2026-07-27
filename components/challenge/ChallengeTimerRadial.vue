<template>
  <div
    class="radial-timer"
    :class="{ sweeping, low, critical }"
    role="timer"
    :aria-label="`${seconds} seconds left`"
  >
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <!-- The dial face: same cream chip surface as the map captions. -->
      <circle class="disc" cx="24" cy="24" r="23" />
      <!-- Compass-bezel ticks: minor marks every 30°, cardinals longer. -->
      <g class="ticks">
        <line
          v-for="tick in TICKS"
          :key="tick.angle"
          :x1="tick.x1"
          :y1="tick.y1"
          :x2="tick.x2"
          :y2="tick.y2"
          :class="{ cardinal: tick.cardinal }"
        />
      </g>
      <!-- Remaining time, as an arc draining clockwise from north. -->
      <circle
        class="arc"
        cx="24"
        cy="24"
        :r="ARC_RADIUS"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="dashOffset"
      />
    </svg>
    <span class="seconds">{{ seconds }}</span>
  </div>
</template>
<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { clamp01 } from '~~/lib/number'
import { prefersReducedMotion } from '~~/lib/motion'

/**
 * The round clock: one radial element carrying both the draining arc and the
 * seconds, in the pole-arrow stroke language — a compass bezel over the map.
 * `value` of `total` seconds, same contract as ChallengeTimer. Hosts mount it
 * and position it via the shared `.round-clock` rules in main.scss so the
 * clock sits in the same corner in every timed mode.
 */
const props = defineProps<{ value: number; total: number }>()

const ARC_RADIUS = 17.5
const CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS

// Bezel geometry, precomputed: a tick every 30°, the cardinals reaching
// deeper — the compass-rose read without lettering the directions.
const TICKS = Array.from({ length: 12 }, (_, i) => {
  const angle = i * 30
  const cardinal = angle % 90 === 0
  const radians = (angle * Math.PI) / 180
  const outer = 21.6
  const inner = cardinal ? 19.2 : 20.2
  return {
    angle,
    cardinal,
    x1: 24 + Math.sin(radians) * inner,
    y1: 24 - Math.cos(radians) * inner,
    x2: 24 + Math.sin(radians) * outer,
    y2: 24 - Math.cos(radians) * outer,
  }
})

// Timed modes decrement once more on the tick that fires onTimeout, so
// `value` reaches -1. Clamp both the numeral and the arc.
const seconds = computed(() => Math.max(0, props.value))

// Hosts tick `value` in whole seconds, so the arc interpolates against the
// wall clock between ticks — a per-second CSS transition stalls and restarts
// as the interval drifts. Until the first tick, `value` is taken as exact.
const smoothSeconds = ref(props.value)
let tickAt = 0
let frameHandle: number | undefined
watch(
  () => props.value,
  () => {
    tickAt = performance.now()
    smoothSeconds.value = props.value
  }
)
const frame = () => {
  if (tickAt) {
    const elapsed = Math.min(1, (performance.now() - tickAt) / 1000)
    smoothSeconds.value = props.value - elapsed
  }
  frameHandle = requestAnimationFrame(frame)
}

const fraction = computed(() =>
  props.total ? clamp01(smoothSeconds.value / props.total) : 0
)

// Entrance: the arc sweeps in from empty to the current fraction, pulling the
// eye to the clock as the round settles; after the sweep it drains linearly,
// frame by frame.
const entered = ref(false)
const sweeping = ref(true)
let sweepTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  requestAnimationFrame(() => {
    entered.value = true
  })
  sweepTimer = setTimeout(() => {
    sweeping.value = false
  }, 1000)
  // Reduced motion keeps the arc stepping in whole seconds.
  if (!prefersReducedMotion()) {
    frameHandle = requestAnimationFrame(frame)
  }
})
onBeforeUnmount(() => {
  if (sweepTimer) clearTimeout(sweepTimer)
  if (frameHandle) cancelAnimationFrame(frameHandle)
})

const dashOffset = computed(() =>
  entered.value ? CIRCUMFERENCE * (1 - fraction.value) : CIRCUMFERENCE
)

// Time-expiring cues, subtle by design: the ink warms at 10s, and the final
// 5 seconds add a once-per-second breath on the numeral.
const low = computed(() => seconds.value <= 10 && fraction.value < 1)
const critical = computed(() => seconds.value <= 5 && fraction.value < 1)
</script>
<style lang="scss" scoped>
// Sized through custom properties so the shared .round-clock placement rules
// (and future hosts) can scale the dial without fighting scoped specificity.
// No `position` of its own: the dial stacks svg and numeral in one grid cell,
// so a host's placement class (e.g. .round-clock) fully owns positioning.
// Every colour reads through a custom property so themed surfaces (the night
// console) can dress the dial without reaching into scoped internals.
.radial-timer {
  width: var(--clock-size, 6.4rem);
  height: var(--clock-size, 6.4rem);
  display: grid;
  place-items: center;
  color: var(--clock-ink, var(--dark-blue));
  animation: clock-in var(--motion-slow) var(--ease-out-expressive) both;

  svg {
    grid-area: 1 / 1;
    width: 100%;
    height: 100%;
  }
}

.disc {
  fill: var(--clock-disc-fill, hsla(36, 100%, 98%, 0.88));
  stroke: var(--clock-disc-stroke, hsla(215.7, 76.4%, 21.6%, 0.25));
  stroke-width: 1;
}

// The bezel shares the thin-outline stroke language of the stat glyphs.
.ticks line {
  stroke: currentColor;
  stroke-width: 1;
  stroke-linecap: round;
  opacity: 0.25;

  &.cardinal {
    opacity: 0.45;
  }
}

.arc {
  fill: none;
  stroke: var(--clock-arc, var(--soft-blue));
  stroke-width: 2.5;
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: center;
  // No dashoffset transition here: after the sweep the script retargets the
  // offset every frame, and a transition would trail behind it.
  transition: stroke var(--motion-base) var(--ease-smooth);
}

// The entrance sweep gets the expressive easing; after it the arc drains
// frame-by-frame against the wall clock.
.radial-timer.sweeping .arc {
  transition:
    stroke-dashoffset 0.9s var(--ease-out-expressive),
    stroke var(--motion-base) var(--ease-smooth);
}

.seconds {
  z-index: 1;
  grid-area: 1 / 1;
  font-size: var(--clock-seconds-size, 2rem);
  font-weight: bold;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  transition: color var(--motion-base) var(--ease-smooth);
}

// The ink warms as time runs low…
.radial-timer.low {
  .arc {
    stroke: var(--clock-warn, var(--hior-ange));
  }
  .seconds {
    color: var(--clock-warn, var(--hior-ange));
  }
}

// …and the last five seconds breathe, once per tick.
.radial-timer.critical .seconds {
  animation: clock-breath 1s var(--ease-smooth) infinite;
}

@keyframes clock-in {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
}

@keyframes clock-breath {
  0%,
  100% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.12);
  }
}

@media (prefers-reduced-motion: reduce) {
  .radial-timer,
  .radial-timer.critical .seconds {
    animation: none;
  }
  .arc {
    transition: none;
  }
}
</style>
