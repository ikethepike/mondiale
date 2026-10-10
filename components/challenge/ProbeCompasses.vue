<template>
  <div ref="root" class="probe-compasses" :style="frameStyle" aria-hidden="true">
    <div
      v-for="compass in placed"
      :key="compass.key"
      class="compass"
      :class="[compass.warmth, compass.trend, { found: compass.degrees === undefined }]"
      :style="{
        left: `${compass.left}%`,
        top: `${compass.top}%`,
        '--heading': `${compass.degrees ?? 0}deg`,
      }"
    >
      <span
        :key="`ping-${compass.replays}`"
        class="pings"
        :class="{ flare: compass.trend === 'closest' && !compass.replays }"
      >
        <span class="ping" />
        <span v-if="compass.trend === 'closest' && !compass.replays" class="ping echo" />
      </span>
      <span class="shadow" />

      <span v-if="compass.degrees === undefined" class="dial bullseye">
        <span v-for="ring in 3" :key="ring" class="burst" :style="{ '--ring': ring }" />
        <svg viewBox="-20 -20 40 40">
          <circle class="target-ring" r="15" />
          <circle class="target-ring" r="9.5" />
          <circle class="target-core" r="4.5" />
        </svg>
        <span class="check">✓</span>
      </span>

      <span v-else class="dial">
        <svg class="wedge" viewBox="-20 -20 40 40">
          <path :d="WEDGE_PATH" />
        </svg>
        <svg class="rose" viewBox="-20 -20 40 40">
          <line
            v-for="tick in 8"
            :key="tick"
            class="tick"
            :class="{ north: tick === 1 }"
            x1="0"
            :y1="tick === 1 ? -18.5 : -18"
            x2="0"
            :y2="tick % 2 ? -14.5 : -16"
            :transform="`rotate(${(tick - 1) * 45})`"
          />
        </svg>
        <svg
          :key="`needle-${compass.replays}`"
          class="needle"
          :class="{ nudge: compass.replays }"
          viewBox="-20 -20 40 40"
        >
          <path class="tail" d="M0 12.5 L3.2 0 L-3.2 0 Z" />
          <path class="tip" d="M0 -13.5 L3.2 0 L-3.2 0 Z" />
          <circle class="pin" r="1.9" />
        </svg>
      </span>

      <span class="km">{{ compass.label }}</span>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { MAP_PROJECTION } from '~~/data/map.gen'
import { projectRobinson } from '~~/lib/geo'
import type { HotColdProbe } from '~~/lib/hot-cold'
import { formatKm } from '~~/lib/number'
import { useMapPanTrack, useMapViewBox } from '~~/lib/use-map-viewbox'

/** Hot & Cold's probe marks: a compass at each clicked point, needle on the target's heading. */
const props = defineProps<{ probes: HotColdProbe[] }>()

const WEDGE_RADIUS = 17.5
const WEDGE_HALF_ANGLE = Math.PI / 8
const WEDGE_PATH = `M0 0 L${-WEDGE_RADIUS * Math.sin(WEDGE_HALF_ANGLE)} ${-WEDGE_RADIUS * Math.cos(WEDGE_HALF_ANGLE)} A${WEDGE_RADIUS} ${WEDGE_RADIUS} 0 0 1 ${WEDGE_RADIUS * Math.sin(WEDGE_HALF_ANGLE)} ${-WEDGE_RADIUS * Math.cos(WEDGE_HALF_ANGLE)} Z`

const { viewBox, toScreenPercent } = useMapViewBox()
const root = ref<HTMLElement>()
const { frameStyle } = useMapPanTrack(root)

const anchored = computed(() =>
  props.probes.flatMap(probe => {
    if (!probe.origin) return []
    const label = probe.degrees === undefined ? 'Found!' : formatKm(probe.distanceKm)
    return [
      { ...probe, key: probe.isoCode, label, point: projectRobinson(probe.origin, MAP_PROJECTION) },
    ]
  })
)

const placed = computed(() => {
  if (!viewBox.value?.w) return []
  return anchored.value.flatMap(compass => {
    const screen = toScreenPercent(compass.point.x, compass.point.y)
    return screen ? [{ ...compass, ...screen }] : []
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.probe-compasses {
  inset: 0;
  position: absolute;
  pointer-events: none;
}

.compass {
  --dial-size: 3.2rem;
  --warmth: #{flame()};
  --warmth-wash: #{flame(0.35)};
  --land: 0.45s;
  --land-delay: 0.05s;
  --needle-delay: 0.12s;
  --needle-spin: 0.85s;
  --settled: calc(var(--needle-delay) + var(--needle-spin) * 0.85);
  --reveal: 0.3s;
  --burst: 0.9s;

  position: absolute;
  width: var(--dial-size);
  height: var(--dial-size);
  transform: translate(-50%, -50%);

  &.warm {
    --warmth: #{ember()};
    --warmth-wash: #{ember(0.35)};
  }
  &.cold {
    --warmth: var(--soft-blue);
    --warmth-wash: color-mix(in srgb, var(--soft-blue) 32%, transparent);
  }
}

.pings,
.shadow,
.dial,
.km {
  position: absolute;
}

.pings {
  inset: 0;
}

.ping {
  inset: 0;
  opacity: 0;
  position: absolute;
  border-radius: 50%;
  border: 0.2rem solid var(--warmth);
  animation: probe-ping 0.7s var(--ease-out-expressive) forwards;

  &.echo {
    animation-delay: 0.18s;
  }
}

.compass.colder .ping {
  border-color: var(--soft-blue);
}

.pings.flare::before {
  content: '';
  inset: -0.6rem;
  opacity: 0;
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, flame(0.5), flame(0) 70%);
  animation: probe-flare var(--burst) var(--ease-out-expressive) var(--land-delay) forwards;
}

.shadow {
  left: 12%;
  right: 12%;
  bottom: -0.35rem;
  height: 0.7rem;
  border-radius: 50%;
  background: radial-gradient(ellipse, ink(0.35), ink(0) 70%);
  animation: probe-shadow var(--land) var(--ease-out-expressive) var(--land-delay) both;
}

.dial {
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: milk(0.92);
  border: 0.18rem solid var(--warmth);
  box-shadow: 0 0.1rem 0.4rem ink(0.18);
  animation: probe-drop var(--land) var(--ease-out-expressive) var(--land-delay) both;

  svg {
    inset: 0;
    width: 100%;
    height: 100%;
    position: absolute;
    overflow: visible;
  }
}

.wedge {
  rotate: var(--heading);
  animation: probe-wedge var(--reveal) var(--ease-out-expressive) var(--settled) both;

  path {
    fill: var(--warmth-wash);
  }
}

.tick {
  stroke: ink(0.35);
  stroke-width: 1.1;
  stroke-linecap: round;

  &.north {
    stroke: ink(0.75);
    stroke-width: 1.8;
  }
}

.needle {
  rotate: var(--heading);
  animation: needle-find var(--needle-spin) cubic-bezier(0.2, 0.6, 0.35, 1) var(--needle-delay) both;

  &.nudge {
    animation: needle-nudge var(--land) var(--ease-smooth) both;
  }

  .tip {
    fill: var(--warmth);
  }
  .tail {
    fill: ink(0.28);
  }
  .pin {
    fill: milk();
    stroke: ink(0.7);
    stroke-width: 1;
  }
}

.km {
  left: 50%;
  top: 100%;
  translate: -50% 0;
  margin-top: 0.3rem;
  padding: 0.05rem 0.5rem;
  font-size: 0.95rem;
  font-weight: bold;
  white-space: nowrap;
  color: var(--warmth);
  @include caption-surface(0.6rem);
  animation: row-land var(--reveal) var(--ease-out-expressive) var(--settled) both;
}

.compass.found {
  --dial-size: 3.7rem;
  z-index: 1;

  .dial {
    background: milk();
    border-width: 0.22rem;
    animation: probe-found var(--motion-slow) var(--ease-out-expressive) var(--land-delay) both;
  }

  .target-ring {
    fill: none;
    stroke: flame(0.55);
    stroke-width: 2.2;
  }
  .target-core {
    fill: flame();
  }

  .burst {
    inset: 0;
    opacity: 0;
    position: absolute;
    border-radius: 50%;
    border: 0.2rem solid flame();
    animation: probe-burst var(--burst) var(--ease-out-expressive) forwards;
    animation-delay: calc(0.15s + var(--ring) * 90ms);
  }

  .check {
    z-index: 1;
    color: milk();
    font-size: 1.05rem;
    font-weight: bold;
    line-height: 1;
    animation: probe-check 0.35s var(--ease-out-expressive) 0.45s both;
  }

  .km {
    color: flame(1, 45%);
    animation-delay: var(--motion-slow);
  }
}

@keyframes probe-ping {
  0% {
    opacity: 0.9;
    transform: scale(0.2);
  }
  100% {
    opacity: 0;
    transform: scale(3);
  }
}

@keyframes probe-flare {
  0% {
    opacity: 0;
    transform: scale(0.4);
  }
  35% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: scale(1.8);
  }
}

@keyframes probe-shadow {
  0% {
    opacity: 0;
    transform: scale(1.8);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes probe-drop {
  0% {
    opacity: 0;
    transform: translateY(-0.8rem) scale(0.3);
  }
  60% {
    opacity: 1;
    transform: translateY(0) scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes needle-find {
  0% {
    rotate: calc(var(--heading) - 540deg);
  }
  70% {
    rotate: calc(var(--heading) + 14deg);
  }
  82% {
    rotate: calc(var(--heading) - 6deg);
  }
  92% {
    rotate: calc(var(--heading) + 2deg);
  }
  100% {
    rotate: var(--heading);
  }
}

@keyframes needle-nudge {
  0%,
  100% {
    rotate: var(--heading);
  }
  25% {
    rotate: calc(var(--heading) - 10deg);
  }
  55% {
    rotate: calc(var(--heading) + 7deg);
  }
  80% {
    rotate: calc(var(--heading) - 3deg);
  }
}

@keyframes probe-wedge {
  0% {
    opacity: 0;
    scale: 0.6;
  }
  100% {
    opacity: 1;
    scale: 1;
  }
}

@keyframes probe-found {
  0% {
    opacity: 0;
    transform: scale(0.3);
  }
  55% {
    opacity: 1;
    transform: scale(1.22);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes probe-burst {
  0% {
    opacity: 0.85;
    transform: scale(0.6);
  }
  100% {
    opacity: 0;
    transform: scale(2.6);
  }
}

@keyframes probe-check {
  0% {
    opacity: 0;
    transform: scale(0.2);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (max-width: $tablet) {
  .compass {
    --dial-size: 2.3rem;

    &.found {
      --dial-size: 2.7rem;
    }
  }

  .km {
    margin-top: 0.2rem;
    padding: 0 0.35rem;
    font-size: 0.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .compass * {
    animation: none !important;
  }

  .pings,
  .burst {
    display: none;
  }
}
</style>
