<template>
  <div class="final-city-nocturne">
    <!-- Lit cities: warm dots pinned in screen space from projected coords.
         At the reveal, the missed ones surface cold and dim — the map itself
         shows what stayed dark. -->
    <div class="lights">
      <div
        v-for="city in shownCities"
        :key="city.name"
        class="light"
        :class="{ missed: !city.lit }"
        :style="{ left: `${city.left}%`, top: `${city.top}%` }"
      >
        <span class="glow" :style="{ width: `${city.size}rem`, height: `${city.size}rem` }" />
        <span class="label">
          {{ city.label }}
          <span v-if="city.sublabel" class="sublabel">{{ city.sublabel }}</span>
        </span>
      </div>
    </div>
    <NightConsole
      v-show="!finished"
      :lit="named.size"
      :quota="challenge.quota"
      :seconds-left="secondsLeft"
      :duration-seconds="challenge.durationSeconds"
    >
      <input
        ref="field"
        v-model="entry"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        enterkeyhint="go"
        :placeholder="`Type ${countryLabel}'s big cities…`"
        :disabled="paused || finished"
        @input="onEntry"
        @keydown.enter.prevent="onEntry"
      />
    </NightConsole>
  </div>
</template>
<script lang="ts" setup>
import NightConsole from '~/components/challenge/NightConsole.vue'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { MAP_PROJECTION } from '~~/data/map.gen'
import { countryName, normalizeCountryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { projectRobinson } from '~~/lib/geo'

import type { CityNocturneChallenge } from '~~/types/challenges/final-challenge.type'

/**
 * City Nocturne: the world goes dark, one country's own border glows, and
 * every correctly typed city ignites warm and yellow at its true spot.
 *
 * The night is real map styling — a body class restyles every country path's
 * fill and stroke (see the unscoped block below), so it pans and zooms with
 * zero lag. Only the city dots track the camera, and they fade out during
 * gestures. No suggestions — the suggestion list would BE the answer sheet.
 * Client-trust graded like sunset; only the canonical lit names travel.
 */
const props = defineProps<{ challenge: CityNocturneChallenge; paused: boolean }>()

const emit = defineEmits<{ finished: [namedCities: string[]] }>()

const { gameStore } = useClientEvents()

const TICK_MS = 80

const field = ref<HTMLInputElement>()
const entry = ref('')
const named = ref(new Set<string>())
const elapsedMs = ref(0)
const finished = ref(false)
const viewBox = ref<{ x: number; y: number; w: number; h: number }>()

const countryLabel = computed(() => countryName(COUNTRIES[props.challenge.country]))
const cities = CITY_LIGHTS[props.challenge.country]?.slice(0, props.challenge.cityCount) ?? []

const durationMs = props.challenge.durationSeconds * 1000
const secondsLeft = computed(() => Math.max(0, Math.ceil((durationMs - elapsedMs.value) / 1000)))

const shownCities = computed(() => {
  const vb = viewBox.value
  if (!vb?.w) return []
  // Dot area tracks population (sqrt for area-proportionality), so the
  // capital reads bigger than the fifth city without swallowing the map
  const largest = Math.max(...cities.map(city => city.population))
  return cities
    .filter(city => named.value.has(city.name) || finished.value)
    .map(city => {
      const point = projectRobinson({ lat: city.lat, lng: city.lng }, MAP_PROJECTION)
      // The map speaks the local tongue: type "Moscow", light "Москва" —
      // canonical beneath, and only when it's a different word
      const label = city.native ?? city.local ?? city.name
      return {
        name: city.name,
        label,
        sublabel: label.toLowerCase() === city.name.toLowerCase() ? undefined : city.name,
        lit: named.value.has(city.name),
        left: ((point.x - vb.x) / vb.w) * 100,
        top: ((point.y - vb.y) / vb.h) * 100,
        size: 0.7 + Math.sqrt(city.population / largest) * 0.9,
      }
    })
})

let ticker: ReturnType<typeof setInterval> | undefined
let startedAt = 0
let mapSvg: SVGSVGElement | null = null
let targetPath: Element | null = null

const readViewBox = () => {
  mapSvg ??= document.querySelector('.game-map svg')
  const raw = mapSvg?.getAttribute('viewBox')?.split(/\s+/).map(Number)
  if (raw?.length === 4 && raw.every(Number.isFinite)) {
    viewBox.value = { x: raw[0]!, y: raw[1]!, w: raw[2]!, h: raw[3]! }
  }
}

const nightfall = () => {
  document.body.classList.add('nocturne-night')
  targetPath = document.querySelector(`.game-map path[data-id][id="${props.challenge.country}"]`)
  targetPath?.classList.add('nocturne-target')
}

const daybreak = () => {
  document.body.classList.remove('nocturne-night')
  targetPath?.classList.remove('nocturne-target')
}

const finish = () => {
  if (finished.value) return
  finished.value = true
  if (ticker) clearInterval(ticker)
  emit('finished', [...named.value])
}

const start = () => {
  if (ticker || finished.value) return
  gameStore.map.focus = [props.challenge.country]
  nightfall()
  startedAt = performance.now()
  field.value?.focus()
  ticker = setInterval(() => {
    elapsedMs.value = performance.now() - startedAt
    readViewBox()
    if (elapsedMs.value >= durationMs) finish()
  }, TICK_MS)
}

const onEntry = () => {
  const typed = normalizeCountryName(entry.value)
  if (!typed) return
  const hit = cities.find(
    city =>
      !named.value.has(city.name) &&
      [city.name, ...city.alt].some(variant => normalizeCountryName(variant) === typed)
  )
  if (!hit) return

  named.value.add(hit.name)
  entry.value = ''
  if (named.value.size === cities.length) finish()
}

watch(
  () => props.paused,
  paused => {
    if (!paused) start()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
  daybreak()
})
</script>
<style lang="scss">
// Unscoped on purpose: the night restyles the REAL map paths, so it moves
// with the camera natively instead of chasing the viewBox from an overlay
// The ocean darkens via body only — .main-board/.harness are SIBLINGS
// painted ABOVE the map, so giving them a background blacks out the world
body.nocturne-night {
  background: hsl(216, 50%, 7%);

  // The night holds still: no panning or zooming mid-round — the dots and
  // the framed country stay exactly where the camera settled them
  .game-map {
    pointer-events: none;
  }

  // !important on purpose: the map engine writes fill/stroke-width inline,
  // and the night skin must win over it. Strokes go screen-space
  // (non-scaling) because the engine's zoom-scaled widths render sub-pixel
  // under the skin's static values.
  .game-map path[data-id] {
    fill: hsl(216, 42%, 15%) !important;
    stroke: hsla(216, 24%, 52%, 0.65) !important;
    stroke-width: 1.1px !important;
    vector-effect: non-scaling-stroke;
    transition:
      fill 0.8s var(--ease-smooth),
      stroke 0.8s var(--ease-smooth);
  }

  .game-map path[data-id].nocturne-target {
    fill: hsl(216, 36%, 20%) !important;
    stroke: hsla(45, 90%, 72%, 0.8) !important;
    stroke-width: 1.6px !important;
    filter: drop-shadow(0 0 0.25rem hsla(45, 96%, 65%, 0.2));
  }

  // The dots chase the camera on a timer — hide them mid-gesture instead of
  // letting them trail behind the pan
  &:has(.is-interacting) .final-city-nocturne .lights {
    opacity: 0;
  }
}
</style>
<style lang="scss" scoped>
.final-city-nocturne {
  inset: 0;
  position: absolute;
  pointer-events: none;
}

.lights {
  inset: 0;
  position: absolute;
  transition: opacity 0.15s var(--ease-smooth);
}

.light {
  position: absolute;
  transform: translate(-50%, -50%);

  .glow {
    width: 1rem;
    height: 1rem;
    display: block;
    border-radius: 50%;
    background: hsla(45, 96%, 72%, 1);
    box-shadow:
      0 0 0.6rem 0.2rem hsla(45, 96%, 65%, 0.9),
      0 0 2.4rem 0.8rem hsla(38, 90%, 55%, 0.45);
    animation: ignite 0.5s var(--ease-smooth);
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

// A missed city at the reveal: cold, dim, unmistakably not yours
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

@media (prefers-reduced-motion: reduce) {
  .light .glow {
    animation: none;
  }
}

</style>
