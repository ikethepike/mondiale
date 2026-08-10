<template>
  <div class="night-lights">
    <div
      v-for="light in placed"
      :key="light.key"
      class="light"
      :class="light.state"
      :style="{ left: `${light.left}%`, top: `${light.top}%` }"
    >
      <span class="glow" :style="{ width: `${light.size}rem`, height: `${light.size}rem` }">
        <span v-if="light.badge" class="badge">{{ light.badge }}</span>
      </span>
      <span v-if="light.label" class="label">
        {{ light.label }}
        <span v-if="light.sublabel" class="sublabel">{{ light.sublabel }}</span>
      </span>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { MAP_PROJECTION } from '~~/data/map.gen'
import { projectRobinson } from '~~/lib/geo'
import { useMapViewBox } from '~~/lib/use-map-viewbox'

/**
 * The nocturne modes' point layer: warm dots pinned in screen space from
 * projected coordinates, tracking the live camera. City Nocturne's lit cities
 * and the Star Chart's pulsing stars are the same drawing — one home, so a
 * retune of the glow or the label lands in both.
 *
 * `state` is the whole visual language: `pulsing` is an unanswered subject
 * (anonymous, breathing), `lit` is one the player got, `missed` is one the
 * reveal surfaces cold. The layer stays pointer-inert per the challenge-shell
 * contract, and the night skin fades it mid-gesture rather than letting it
 * trail the pan (templates/_nocturne-night.scss).
 */
export interface NightLight {
  key: string
  lat: number
  lng: number
  state: 'pulsing' | 'lit' | 'missed'
  /** Glow diameter in rem; the default reads at world framing. */
  size?: number
  label?: string
  sublabel?: string
  /** A mark inside the dot — the Star Chart's index and initial aid. */
  badge?: string
}

const DEFAULT_SIZE = 1

const props = defineProps<{ lights: NightLight[] }>()

const { viewBox, toScreenPercent } = useMapViewBox()

const placed = computed(() => {
  // Read the box so the layout recomputes on every camera commit — the
  // projection itself goes through the shared `toScreenPercent`.
  if (!viewBox.value?.w) return []
  return props.lights.flatMap(light => {
    const point = projectRobinson({ lat: light.lat, lng: light.lng }, MAP_PROJECTION)
    const screen = toScreenPercent(point.x, point.y)
    return screen ? [{ ...light, size: light.size ?? DEFAULT_SIZE, ...screen }] : []
  })
})
</script>
<style lang="scss" scoped>
.night-lights {
  inset: 0;
  position: absolute;
  pointer-events: none;
  transition: opacity 0.15s var(--ease-smooth);
}

.light {
  position: absolute;
  transform: translate(-50%, -50%);

  .glow {
    width: 1rem;
    height: 1rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--night-amber);
    box-shadow:
      0 0 0.6rem 0.2rem hsla(45, 96%, 65%, 0.9),
      0 0 2.4rem 0.8rem hsla(38, 90%, 55%, 0.45);
    animation: ignite 0.5s var(--ease-smooth);
  }

  .badge {
    font-size: 0.9rem;
    font-weight: bold;
    line-height: 1;
    color: hsla(216, 58%, 8%, 0.9);
  }

  .label {
    left: 50%;
    top: 100%;
    position: absolute;
    transform: translateX(-50%);
    margin-top: 0.5rem;
    font-size: 1.3rem;
    text-align: center;
    white-space: nowrap;
    color: hsla(45, 96%, 85%, 0.95);
    text-shadow: 0 0.1rem 0.8rem hsla(216, 58%, 5%, 0.9);

    .sublabel {
      display: block;
      opacity: 0.7;
      font-size: 1rem;
      line-height: 1.2;
    }
  }
}

// An unanswered subject: cool white, breathing, and deliberately unnamed —
// the position is the entire question.
.light.pulsing {
  .glow {
    background: hsla(210, 100%, 96%, 1);
    box-shadow:
      0 0 0.5rem 0.15rem hsla(205, 100%, 90%, 0.9),
      0 0 2rem 0.7rem hsla(205, 90%, 75%, 0.35);
    animation:
      ignite 0.5s var(--ease-smooth),
      star-pulse 2.4s var(--ease-smooth) 0.5s infinite;
  }

  .badge {
    color: hsla(216, 58%, 20%, 0.75);
  }
}

// A subject the reveal surfaces cold: dim, unmistakably not yours.
.light.missed {
  .glow {
    background: hsla(216, 30%, 55%, 0.8);
    box-shadow: 0 0 0.8rem 0.2rem hsla(216, 40%, 45%, 0.5);
  }

  .label {
    color: hsla(216, 30%, 75%, 0.8);
  }
}

@keyframes ignite {
  from {
    opacity: 0;
    transform: scale(0.2);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

// The star's breath. Scale only — the glow's spread would reflow on a filter.
@keyframes star-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.45);
    opacity: 0.75;
  }
}

@media (prefers-reduced-motion: reduce) {
  .light .glow,
  .light.pulsing .glow {
    animation: none;
  }
}
</style>
