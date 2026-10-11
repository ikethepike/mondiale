<template>
  <div
    ref="root"
    class="map-pins"
    :style="[frameStyle, { '--pin-growth': growth }]"
    aria-hidden="true"
  >
    <svg v-if="link" class="pin-link">
      <mask :id="`${uid}-draw`" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
        <line class="link-draw" v-bind="link" pathLength="1" />
      </mask>
      <g :mask="`url(#${uid}-draw)`">
        <line class="link-halo" v-bind="link" />
        <line class="link-dash" v-bind="link" />
      </g>
    </svg>

    <div
      v-for="pin in placed"
      :key="pin.key"
      class="pin"
      :class="[pin.tone, { 'after-link': link && pin.tone === 'answer' }]"
      :style="{ left: `${pin.left}%`, top: `${pin.top}%` }"
    >
      <svg viewBox="0 0 48 64">
        <defs>
          <radialGradient :id="`${uid}-${pin.tone}-head`" cx="35%" cy="30%" r="75%">
            <stop class="head-light" offset="0" />
            <stop class="head-base" offset="0.45" />
            <stop class="head-dark" offset="1" />
          </radialGradient>
          <linearGradient :id="`${uid}-${pin.tone}-steel`" x1="0" x2="1">
            <stop class="steel-edge" offset="0" />
            <stop class="steel-shine" offset="0.5" />
            <stop class="steel-shade" offset="1" />
          </linearGradient>
          <radialGradient :id="`${uid}-${pin.tone}-shadow`">
            <stop class="shadow-core" offset="0" />
            <stop class="shadow-edge" offset="1" />
          </radialGradient>
        </defs>
        <g class="shadow">
          <line class="needle-shadow" x1="16" y1="62" x2="33" y2="60" />
          <ellipse cx="37" cy="59.5" rx="9" ry="3.6" :fill="`url(#${uid}-${pin.tone}-shadow)`" />
        </g>
        <ellipse class="ripple" cx="16" cy="62" rx="6" ry="2.4" />
        <g class="fall">
          <g class="wobble">
            <line
              class="needle"
              x1="16"
              y1="62"
              x2="26.5"
              y2="22"
              :stroke="`url(#${uid}-${pin.tone}-steel)`"
            />
            <circle class="head" cx="28" cy="17" r="11" :fill="`url(#${uid}-${pin.tone}-head)`" />
            <ellipse class="glint" cx="24" cy="12" rx="4" ry="2.5" transform="rotate(-30 24 12)" />
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { MAP_PROJECTION } from '~~/data/map.gen'
import { projectRobinson } from '~~/lib/geo'
import { clamp } from '~~/lib/number'
import { useMapPanTrack, useMapViewBox } from '~~/lib/use-map-viewbox'
import { useGameStore } from '~~/store/game.store'

/** The pin-drop marks: the player's glass-head pin and the truth's, tip-anchored in screen space. */

const PIN_GROWTH_EXPONENT = 0.3
const PIN_MAX_GROWTH = 1.6

const gameStore = useGameStore()
const uid = useId()
const { viewBox, toScreenPercent, cameraScale } = useMapViewBox()
const root = ref<HTMLElement>()
const { frameStyle } = useMapPanTrack(root)

const growth = computed(() =>
  clamp((1 / cameraScale.value) ** PIN_GROWTH_EXPONENT, 1, PIN_MAX_GROWTH)
)

const anchored = computed(() =>
  (
    [
      ['guess', gameStore.map.pin],
      ['answer', gameStore.map.pinAnswer],
    ] as const
  ).flatMap(([tone, latLng]) =>
    latLng
      ? [
          {
            tone,
            key: `${tone}:${latLng.lat}:${latLng.lng}`,
            point: projectRobinson(latLng, MAP_PROJECTION),
          },
        ]
      : []
  )
)

const placed = computed(() => {
  if (!viewBox.value?.w) return []
  return anchored.value.flatMap(pin => {
    const screen = toScreenPercent(pin.point.x, pin.point.y)
    return screen ? [{ ...pin, ...screen }] : []
  })
})

const link = computed(() => {
  const guess = placed.value.find(pin => pin.tone === 'guess')
  const answer = placed.value.find(pin => pin.tone === 'answer')
  if (!guess || !answer) return undefined
  return {
    x1: `${guess.left}%`,
    y1: `${guess.top}%`,
    x2: `${answer.left}%`,
    y2: `${answer.top}%`,
  }
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.map-pins {
  --pin-size: 4.6rem;
  --fall: 0.5s;
  --link-draw: 0.65s;

  inset: 0;
  position: absolute;
  pointer-events: none;
}

.pin-link {
  inset: 0;
  width: 100%;
  height: 100%;
  position: absolute;
  overflow: visible;

  line {
    fill: none;
    stroke-linecap: round;
  }
}

.link-draw {
  stroke: #fff;
  stroke-width: 12px;
  stroke-dasharray: 1;
  animation: link-draw var(--link-draw) var(--ease-smooth) both;
}

.link-halo {
  stroke: milk(0.9);
  stroke-width: 5px;
}

.link-dash {
  stroke: ink(1, 41%);
  stroke-width: 2.2px;
  stroke-dasharray: 8px 6px;
}

.pin {
  --drop-delay: 0s;

  position: absolute;
  aspect-ratio: 48 / 64;
  height: calc(var(--pin-size) * var(--pin-growth, 1));
  translate: calc(-100% / 3) -96.875%;

  &.after-link {
    --drop-delay: calc(var(--link-draw) - 0.1s);
  }

  svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }

  .shadow,
  .ripple,
  .fall,
  .wobble {
    transform-box: view-box;
    transform-origin: 16px 62px;
  }
}

.guess {
  --pin-light: #{flame(1, 78%)};
  --pin-base: #{flame()};
  --pin-dark: #{flame(1, 42%)};
}

.answer {
  --pin-light: #{ink(1, 66%)};
  --pin-base: #{ink(1, 41%)};
  --pin-dark: #{ink(1, 27%)};
}

.head-light {
  stop-color: var(--pin-light);
}
.head-base {
  stop-color: var(--pin-base);
}
.head-dark {
  stop-color: var(--pin-dark);
}
.steel-edge {
  stop-color: #8592a3;
}
.steel-shine {
  stop-color: #e9edf2;
}
.steel-shade {
  stop-color: #6b7686;
}
.shadow-core {
  stop-color: ink(0.32);
}
.shadow-edge {
  stop-color: ink(0);
}

.needle {
  stroke-width: 2.4;
  stroke-linecap: round;
}

.needle-shadow {
  stroke: ink(0.18);
  stroke-width: 1.6;
  stroke-linecap: round;
}

.head {
  stroke: var(--pin-dark);
  stroke-opacity: 0.5;
  stroke-width: 0.6;
}

.glint {
  fill: #fff;
  opacity: 0.75;
}

.ripple {
  fill: none;
  opacity: 0;
  stroke: var(--pin-base);
  stroke-width: 1.4;
}

.fall {
  animation: pin-fall var(--fall) cubic-bezier(0.55, 0, 0.9, 0.4) var(--drop-delay) both;
}

.wobble {
  animation: pin-wobble 1s cubic-bezier(0.3, 0.7, 0.4, 1)
    calc(var(--drop-delay) + var(--fall) - 0.02s) both;
}

.shadow {
  animation: pin-shadow var(--fall) cubic-bezier(0.55, 0, 0.9, 0.4) var(--drop-delay) both;
}

.ripple {
  animation: pin-ripple 0.8s var(--ease-out-expressive)
    calc(var(--drop-delay) + var(--fall) - 0.04s) both;
}

@keyframes link-draw {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes pin-fall {
  0% {
    opacity: 0;
    transform: translate(-10px, -70px);
  }
  25% {
    opacity: 1;
  }
  100% {
    transform: none;
  }
}

@keyframes pin-wobble {
  0% {
    transform: rotate(-16deg);
  }
  28% {
    transform: rotate(10deg);
  }
  52% {
    transform: rotate(-5deg);
  }
  74% {
    transform: rotate(2deg);
  }
  100% {
    transform: none;
  }
}

@keyframes pin-shadow {
  0% {
    opacity: 0;
    transform: translate(-8px, 0) scale(0.4);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

@keyframes pin-ripple {
  0% {
    opacity: 0.9;
    transform: scale(0.2);
  }
  100% {
    opacity: 0;
    transform: scale(3.2);
  }
}

@media (max-width: $tablet) {
  .map-pins {
    --pin-size: 3.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .map-pins * {
    animation: none !important;
  }

  .ripple {
    display: none;
  }
}
</style>
