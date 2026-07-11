<template>
  <div class="scale-plot">
    <div class="track">
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
interface ScaleMarker {
  amount: number
  display?: string
  tone?: 'primary' | 'muted' | 'missed'
}

const props = defineProps<{
  amount?: number
  min: number
  max: number
  /** Flip the plotted side without changing the number (rarely needed). */
  invert?: boolean
  /** Pole labels — left = least, right = most. */
  leastLabel: string
  mostLabel: string
  /** Pre-formatted value to show at the marker. Omit to show no marker label
   *  (e.g. when a bigger value is already displayed above the plot). */
  display?: string
  /** Plot several values on one track (comparisons). Supersedes `amount`. */
  markers?: ScaleMarker[]
}>()

const positionOf = (amount: number) => {
  const span = props.max - props.min
  if (span <= 0) return 50
  const raw = ((amount - props.min) / span) * 100
  const clamped = Math.max(0, Math.min(100, raw))
  return props.invert ? 100 - clamped : clamped
}

const plotted = computed<ScaleMarker[]>(
  () =>
    props.markers ??
    (props.amount !== undefined ? [{ amount: props.amount, display: props.display }] : [])
)
</script>
<style lang="scss" scoped>
.scale-plot {
  width: 100%;
  max-width: 32rem;
  margin: 0.6rem auto 0;
}

.track {
  position: relative;
  height: 0.6rem;
  border-radius: 0.6rem;
  // A muted gradient from the "least" to the "most" pole hue.
  background: linear-gradient(
    to right,
    hsla(9.8, 81.3%, 60.2%, 0.35),
    hsla(36, 60%, 85%, 0.5) 50%,
    hsla(170.5, 24.7%, 55%, 0.55)
  );
  border: 1px solid hsla(215.7, 76.4%, 21.6%, 0.12);
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
  box-shadow: 0 1px 4px hsla(215.7, 76.4%, 21.6%, 0.35);
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
