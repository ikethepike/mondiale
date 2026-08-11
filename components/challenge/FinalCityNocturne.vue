<template>
  <div class="final-city-nocturne">
    <!-- Lit cities: warm dots pinned in screen space from projected coords.
         At the reveal, the missed ones surface cold and dim — the map itself
         shows what stayed dark. -->
    <NightLights :lights="lights" />
    <footer ref="consoleFooter" class="shell-footer">
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
          aria-label="Your guess"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="go"
          :disabled="paused || finished"
          @input="onEntry"
          @keydown.enter.prevent="onEntry"
        />
        <!-- The prompt as an inert twin, never the placeholder attribute —
             its words ("cities…") put Safari's AutoFill Contact over the
             console (see templates/_ghost-placeholder.scss) -->
        <span v-if="!entry" class="ghost-placeholder" aria-hidden="true"
          >Type {{ countryLabel }}'s big cities…</span
        >
      </NightConsole>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import NightConsole from '~/components/challenge/NightConsole.vue'
import NightLights, { type NightLight } from '~/components/challenge/NightLights.vue'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { countryName, normalizeCountryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { useNocturne } from '~~/lib/use-nocturne'
import { useIsCoarsePointer } from '~~/lib/use-viewport'

import type { CityNocturneChallenge } from '~~/types/challenges/final-challenge.type'

/**
 * City Nocturne: the world goes dark, one country's own border glows, and
 * every correctly typed city ignites warm and yellow at its true spot.
 *
 * The night is real map styling — `useNocturne`'s body class restyles every
 * country path's fill and stroke, so it pans and zooms with zero lag. Only the
 * city dots track the camera (NightLights), and they fade out during
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

// The framed country stays visible above the console (and the keyboard)
const consoleFooter = ref<HTMLElement>()
useFooterBerth(consoleFooter)
const isCoarsePointer = useIsCoarsePointer()

// The night — body skin, chrome tint and the framed country's glow — plus the
// daybreak this component can no longer forget on unmount.
const { nightfall } = useNocturne(() => [props.challenge.country])

const countryLabel = computed(() => countryName(COUNTRIES[props.challenge.country]))
const cities = CITY_LIGHTS[props.challenge.country]?.slice(0, props.challenge.cityCount) ?? []

const durationMs = props.challenge.durationSeconds * 1000
const secondsLeft = computed(() => Math.max(0, Math.ceil((durationMs - elapsedMs.value) / 1000)))

const lights = computed<NightLight[]>(() => {
  // Dot area tracks population (sqrt for area-proportionality), so the
  // capital reads bigger than the fifth city without swallowing the map
  const largest = Math.max(...cities.map(city => city.population))
  return cities
    .filter(city => named.value.has(city.name) || finished.value)
    .map(city => {
      // The map speaks the local tongue: type "Moscow", light "Москва" —
      // canonical beneath, and only when it's a different word
      const label = city.native ?? city.local ?? city.name
      return {
        key: city.name,
        lat: city.lat,
        lng: city.lng,
        state: named.value.has(city.name) ? 'lit' : 'missed',
        label,
        sublabel: label.toLowerCase() === city.name.toLowerCase() ? undefined : city.name,
        size: 0.7 + Math.sqrt(city.population / largest) * 0.9,
      }
    })
})

let ticker: ReturnType<typeof setInterval> | undefined
let startedAt = 0

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
  // Round-start autofocus is desktop-only, same policy as the input homes
  if (!isCoarsePointer.value) field.value?.focus()
  ticker = setInterval(() => {
    elapsedMs.value = performance.now() - startedAt
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

// Daybreak is `useNocturne`'s, bound to this component's own unmount.
onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})
</script>
<!-- The night skin is templates/_nocturne-night.scss and the dots are
     NightLights — both shared with the Star Chart. -->
<style lang="scss" scoped>
// Scenic overlay per the challenge-shell contract: the lights stay
// pointer-inert behind everything; the console stands in a .shell-footer at
// the column's foot and inherits the shared berth + bottom clearance.
.final-city-nocturne {
  inset: 0;
  display: flex;
  position: absolute;
  pointer-events: none;
  flex-flow: column nowrap;
  justify-content: flex-end;
}
</style>
