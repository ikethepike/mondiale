<template>
  <div class="scale-plot">
    <div class="track" :class="tone">
      <span
        v-for="(marker, index) in plotted"
        :key="index"
        class="marker"
        :class="marker.tone ?? 'primary'"
        :style="{ left: `${positionOf(marker.amount)}%` }"
      >
        <span v-if="marker.display" class="marker-value">{{ marker.display }}</span>
        <span class="marker-arrow" aria-hidden="true" />
      </span>
    </div>
    <div class="poles">
      <span class="pole least">{{ leastLabel }}</span>
      <span class="pole most">{{ mostLabel }}</span>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { clamp } from '~~/lib/number'
import type { ScaleTone } from '~~/types/challenge.type'
interface ScaleMarker {
  amount: number
  display?: string
  tone?: 'primary' | 'muted' | 'missed'
}

const props = withDefaults(
  defineProps<{
    amount?: number
    min: number
    max: number
    /** Flip the plotted side without changing the number (rarely needed). */
    invert?: boolean
    /** How the track is painted — the stat's own verdict, see `ScaleTone`. */
    tone?: ScaleTone
    /** Pole labels — left = least, right = most. */
    leastLabel: string
    mostLabel: string
    /** Pre-formatted value to show at the marker. Omit to show no marker label
     *  (e.g. when a bigger value is already displayed above the plot). */
    display?: string
    /** Plot several values on one track (comparisons). Supersedes `amount`. */
    markers?: ScaleMarker[]
  }>(),
  {
    amount: undefined,
    invert: false,
    tone: 'neutral',
    display: undefined,
    markers: undefined,
  }
)

const positionOf = (amount: number) => {
  const span = props.max - props.min
  if (span <= 0) return 50
  const raw = ((amount - props.min) / span) * 100
  const clamped = clamp(raw, 0, 100)
  return props.invert ? 100 - clamped : clamped
}

const plotted = computed<ScaleMarker[]>(
  () =>
    props.markers ??
    (props.amount !== undefined ? [{ amount: props.amount, display: props.display }] : [])
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
.scale-plot {
  width: 100%;
  max-width: 32rem;
  margin: 0.6rem auto 0;
}

// The verdict ramp: alert at the bad pole, calm at the good one. `positive`
// runs it left-to-right (the "most" pole is the good end), `inverted` mirrors
// it. Declared once as tokens so the two tones can never drift apart.
$scale-bad: flame(0.35);
$scale-mid: hsla(36, 60%, 85%, 0.5);
$scale-good: hsla(170.5, 24.7%, 55%, 0.55);

.track {
  position: relative;
  height: 0.6rem;
  border-radius: 0.6rem;
  border: 1px solid ink(0.12);
}

// No verdict to paint — a plain ink ramp that reads as "more to the right".
// The default, so a stat that never declared a tone can't imply one.
.track.neutral {
  background: linear-gradient(to right, ink(0.06), ink(0.28));
}

.track.positive {
  background: linear-gradient(to right, $scale-bad, $scale-mid 50%, $scale-good);
}

.track.inverted {
  background: linear-gradient(to right, $scale-good, $scale-mid 50%, $scale-bad);
}

.marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.marker-value {
  position: absolute;
  bottom: 1.1rem;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--dark-blue);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.marker-arrow {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  background: var(--soft-blue);
  border: 2px solid var(--sour-milk);
  box-shadow: 0 1px 4px ink(0.35);
}

.marker.muted {
  opacity: 0.7;
}

.marker.missed .marker-arrow {
  background: var(--hior-ange);
}

.poles {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 1.1rem;
  color: var(--dark-blue);
  opacity: 0.6;
}

.pole.most {
  text-align: right;
}
</style>
