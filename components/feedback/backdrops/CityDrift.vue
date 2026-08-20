<template>
  <svg
    class="city-drift"
    viewBox="0 0 2000 1001"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <circle
      v-for="light in lights"
      :key="light.key"
      class="light ambient-loop"
      :cx="light.x"
      :cy="light.y"
      :r="light.r"
      :style="light.style"
    />
  </svg>
</template>
<script lang="ts" setup>
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { sampleMany } from '~~/lib/arrays'
import { MAP_PROJECTION } from '~~/data/map.gen'
import { projectRobinson } from '~~/lib/geo'
import { seededRandom } from '~~/lib/random'

/**
 * The cities card's ground: the world's lights, seen from orbit.
 *
 * Real cities at their real coordinates, sized by population — so the
 * constellation has the shape of where people actually live (the Ganges
 * plain, the Rhine, the eastern seaboard) rather than an even sprinkle. No
 * label, so nothing here answers a capital.
 */
const props = defineProps<{ seed: number }>()

const LIGHTS = 300

const lights = computed(() => {
  const random = seededRandom(props.seed)
  const cities = Object.values(CITY_LIGHTS).flatMap(list => list ?? [])
  return sampleMany(cities, LIGHTS, random).flatMap((city, index) => {
    const point = projectRobinson({ lat: city.lat, lng: city.lng }, MAP_PROJECTION)
    // Population spans four orders of magnitude; a log keeps a megacity from
    // painting a hundred times a market town.
    const scale = Math.log10(Math.max(city.population, 10000)) - 3.6
    return [
      {
        key: `${index}-${city.name}`,
        x: point.x,
        y: point.y,
        r: 2 + Math.max(scale, 0) * 4.2,
        style: {
          animationDelay: `${(-random() * 7).toFixed(2)}s`,
          animationDuration: `${(4.5 + random() * 5).toFixed(2)}s`,
          opacity: (0.3 + random() * 0.55).toFixed(2),
        } as Record<string, string>,
      },
    ]
  })
})
</script>
<style lang="scss" scoped>
.city-drift {
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 1;
  mask-image: radial-gradient(ellipse 44% 38% at 50% 50%, transparent 28%, black 74%);
}

.light {
  fill: var(--night-amber);
  // A city light has a glow; without it 300 amber discs read as confetti.
  filter: drop-shadow(0 0 3px var(--night-amber));
  // Resting state is lit; the twinkle only modulates it.
  animation: city-twinkle 6s ease-in-out infinite;
}

@keyframes city-twinkle {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}
</style>
