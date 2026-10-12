<template>
  <div ref="root" class="probe-zones" :style="frameStyle" aria-hidden="true">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <polygon
        v-for="zone in drawn"
        :key="zone.key"
        class="zone"
        :class="{ latest: zone.latest }"
        :points="zone.points"
        :style="{ '--zone': zone.color, '--zone-wash': zone.wash }"
      />
    </svg>
  </div>
</template>
<script lang="ts" setup>
import { MAP_PROJECTION } from '~~/data/map.gen'
import { projectRobinson } from '~~/lib/geo'
import { probeZone, warmthFraction, type HotColdProbe } from '~~/lib/hot-cold'
import { useMapPanTrack, useMapViewBox } from '~~/lib/use-map-viewbox'
import { warmthColor } from '~~/lib/warmth'

/** Hot & Cold's search zones: where each probe says the target can be. */
const props = defineProps<{ probes: HotColdProbe[] }>()

const { viewBox, toScreenPercent } = useMapViewBox()
const root = ref<HTMLElement>()
const { frameStyle } = useMapPanTrack(root)

const zones = computed(() =>
  props.probes.flatMap((probe, index) => {
    if (!probe.origin || probe.degrees === undefined) return []
    const ring = probeZone(probe.origin, probe.distanceKm, probe.degrees)
    if (!ring.length) return []
    const fraction = warmthFraction(probe.distanceKm)
    return [
      {
        key: probe.isoCode,
        latest: index === props.probes.length - 1,
        color: warmthColor(fraction),
        wash: warmthColor(fraction, 0.16),
        ring: ring.map(point => projectRobinson(point, MAP_PROJECTION)),
      },
    ]
  })
)

const drawn = computed(() => {
  if (!viewBox.value?.w) return []
  return zones.value.flatMap(zone => {
    const points = zone.ring.flatMap(({ x, y }) => {
      const screen = toScreenPercent(x, y)
      return screen ? [`${screen.left},${screen.top}`] : []
    })
    return points.length > 2 ? [{ ...zone, points: points.join(' ') }] : []
  })
})
</script>
<style lang="scss" scoped>
.probe-zones {
  inset: 0;
  position: absolute;
  pointer-events: none;

  svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }
}

.zone {
  fill: none;
  stroke: var(--zone);
  stroke-width: 1.2;
  stroke-dasharray: 4 3;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  opacity: 0.45;
  transition: opacity var(--motion-base) var(--ease-smooth);

  &.latest {
    fill: var(--zone-wash);
    opacity: 1;
    stroke-width: 2;
    animation: zone-land var(--motion-slow) var(--ease-out-expressive) 0.9s both;
  }
}

@keyframes zone-land {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .zone.latest {
    animation: none;
  }
}
</style>
