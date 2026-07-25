<template>
  <div v-if="challenge" class="hot-cold">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Hot & Cold`"
      title="Find the mystery country"
      :stakes="`Every country you click reports how far you are and which way to head. You have ${challenge.maximumGuesses} probes — the fewer you spend, the more you score.`"
      @done="begin()"
    />

    <header>
      <div class="prompt">
        <h1 class="map-caption">Find the mystery country</h1>
        <span class="map-caption sub">
          {{ probesLeft }} {{ probesLeft === 1 ? 'probe' : 'probes' }} left
        </span>
        <Transition name="caption" mode="out-in">
          <span v-if="feedback" :key="feedback" class="map-caption feedback" :class="warmthClass">
            {{ feedback }}
          </span>
        </Transition>
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      </div>
    </header>

    <footer>
      <TransitionGroup ref="probeList" tag="ol" name="chain" class="probe-list">
        <li
          v-for="probe in probes"
          :key="probe.isoCode"
          class="stop map-caption"
          :class="probe.warmth"
        >
          <CountryFlag class="stop-flag" :country="getCountry(probe.isoCode)" mode="background" />
          <span>{{ countryName(probe.isoCode) }}</span>
          <small v-if="probe.direction">
            {{ Math.round(probe.distanceKm).toLocaleString() }} km {{ probe.direction }}
          </small>
          <small v-else>found it!</small>
        </li>
      </TransitionGroup>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { bearingDegrees, compassArrow, compassLabel, countryLatLng, haversineKm } from '~~/lib/geo'
import type { MapTint } from '~~/store/game.store'
import { isMapClickEvent } from '~~/types/events.types'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'

// Full outline map, fully clickable — never reveal the target through
// highlights, tints or camera focus, so this mode opts out of shapes-only.
const {
  challenge,
  currentRound,
  showInterstitial,
  submitted,
  begin,
  announce,
  entries,
  submitOnce,
  registerCleanup,
  gameStore,
} = useGroupChallenge('hot-cold-challenge', { solo: false })

interface Probe {
  isoCode: ISOCountryCode
  distanceKm: number
  warmth: 'hot' | 'warm' | 'cold'
  /** Compass arrow towards the target — absent on the probe that found it. */
  direction?: string
}

const probes = ref<Probe[]>([])

// On phones the trail is a single scrolling strip; keep the newest probe in
// view. Harmless on desktop, where the wrapped list never overflows.
const probeList = ref<{ $el: HTMLElement } | null>(null)
watch(
  () => probes.value.length,
  async () => {
    await nextTick()
    const list = probeList.value?.$el
    list?.scrollTo({ left: list.scrollWidth, behavior: 'smooth' })
  }
)
const feedback = ref('')
const warmthClass = ref<'hot' | 'warm' | 'cold' | ''>('')

const probesLeft = computed(() => (challenge.value?.maximumGuesses ?? 0) - probes.value.length)

const warmthFor = (distanceKm: number): Probe['warmth'] => {
  if (distanceKm < 800) return 'hot'
  if (distanceKm < 2500) return 'warm'
  return 'cold'
}

const paintProbes = () => {
  gameStore.map.highlighted.clear()
  const tints: { [isoCode in ISOCountryCode]?: MapTint } = {}
  for (const probe of probes.value) {
    gameStore.map.highlighted.add(probe.isoCode)
    tints[probe.isoCode] = probe.warmth
  }
  gameStore.map.tints = tints
}

const temperatureFor = (probe: Probe): string => {
  if (probe.warmth === 'hot') return 'scalding'
  if (probe.warmth === 'warm') return 'warm'
  return probe.distanceKm > 6000 ? 'freezing' : 'cold'
}

const distancePhrase = (distanceKm: number): string =>
  distanceKm < 100
    ? 'less than 100 km'
    : `about ${(Math.round(distanceKm / 100) * 100).toLocaleString()} km`

const clueFor = (probe: Probe): string => {
  const from = countryLatLng(probe.isoCode)
  const target = challenge.value ? countryLatLng(challenge.value.country) : undefined
  if (!from || !target) return ''
  const direction = compassLabel(bearingDegrees(from, target))
  // The shortest way may cross the date line — flag it, or "east of China"
  // reads as impossible on a flat map
  const crossesDateLine = Math.abs(target.lng - from.lng) > 180
  return `${countryName(probe.isoCode)} is ${temperatureFor(probe)} — ${distancePhrase(probe.distanceKm)} to the ${direction}${crossesDateLine ? ', across the date line' : ''}`
}

const submitRound = () => {
  // The trail ends with the found country when the hunt succeeded
  submitOnce(probes.value.map(probe => probe.isoCode))
}

let outOfProbesTimer: ReturnType<typeof setTimeout> | undefined
registerCleanup(() => outOfProbesTimer && clearTimeout(outOfProbesTimer))

const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return
  if (showInterstitial.value || submitted.value) return
  const active = challenge.value
  if (!active) return

  const isoCode = event.detail.isoCode
  if (!isValidISOCode(isoCode)) return

  // Repeat clicks cost nothing — just replay that probe's clue
  const previous = probes.value.find(probe => probe.isoCode === isoCode)
  if (previous) {
    feedback.value = `Already probed: ${clueFor(previous)}`
    warmthClass.value = previous.warmth
    return
  }

  // Found it!
  if (isoCode === active.country) {
    probes.value.push({ isoCode, distanceKm: 0, warmth: 'hot' })
    gameStore.map.status = 'correct'
    gameStore.map.reveal = active.country
    feedback.value = `${countryName(isoCode)} — found it!`
    warmthClass.value = 'hot'
    return submitRound()
  }

  const from = countryLatLng(isoCode)
  const target = countryLatLng(active.country)
  if (!from || !target) return

  const distanceKm = haversineKm(from, target)
  const warmth = warmthFor(distanceKm)
  const probe: Probe = {
    isoCode,
    distanceKm,
    warmth,
    direction: compassArrow(bearingDegrees(from, target)),
  }
  probes.value.push(probe)
  paintProbes()

  // Never the isoCode: a probe's country and warmth together are a bearing fix
  // on the hidden country. The room sees only that someone probed.
  announce({ kind: 'probe' })

  feedback.value = clueFor(probe)
  warmthClass.value = warmth

  if (probes.value.length >= active.maximumGuesses) {
    gameStore.map.status = 'incorrect'
    feedback.value = 'Out of probes!'
    outOfProbesTimer = setTimeout(submitRound, 1200)
  }
}

onBeforeMount(() => {
  document.addEventListener('mapClick', onMapClick)
})
registerCleanup(() => document.removeEventListener('mapClick', onMapClick))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
.hot-cold {
  top: 0;
  left: 0;
  width: 100%;
  height: var(--viewport-height);
  display: flex;
  position: absolute;
  flex-flow: column nowrap;
  justify-content: space-between;
}

header {
  z-index: 2;
  width: 100%;
  text-align: center;
  padding: 2rem 4rem;

  h1 {
    margin: 0;
  }
  .sub {
    padding: 0.4rem 1.4rem;
  }
  .prompt {
    gap: 1rem;
    display: flex;
    align-items: center;
    flex-flow: column nowrap;
  }
}

.feedback {
  padding: 0.4rem 1.4rem;
  font-weight: bold;

  &.hot {
    color: var(--hior-ange);
  }
  &.warm {
    color: hsl(29.7, 79.9%, 45%);
  }
  &.cold {
    color: var(--soft-blue);
  }
}

footer {
  z-index: 2;
  padding: 2rem;
}

.probe-list {
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  justify-content: center;
}

.stop {
  gap: 0.7rem;
  display: flex;
  align-items: center;
  padding: 0.4rem 1.2rem;

  small {
    opacity: 0.6;
  }

  &.hot {
    border-color: hsla(9.8, 81.3%, 60.2%, 0.6);
  }
  &.warm {
    border-color: hsla(29.7, 79.9%, 60%, 0.6);
  }
  &.cold {
    border-color: hsla(197.6, 51.2%, 41.8%, 0.4);
  }
}

.stop-flag {
  width: 2.6rem;
  height: 1.8rem;
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
}

.chain-enter-from {
  opacity: 0;
  transform: translateY(0.8rem) scale(0.9);
}
.chain-enter-active,
.chain-move {
  transition:
    opacity var(--motion-quick) var(--ease-out-expressive),
    transform var(--motion-quick) var(--ease-out-expressive);
}

// Compact phone chrome: tighter prompt padding, footer clear of the home
// indicator.
@media screen and (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }
  footer {
    padding: 1.2rem 1.6rem calc(1.2rem + var(--safe-bottom));
  }

  // A long trail would eat the map from the bottom: one scroll-snapping row,
  // newest probe kept in view by the watcher above.
  .probe-list {
    flex-wrap: nowrap;
    max-width: 100%;
    overflow-x: auto;
    justify-content: flex-start;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
    // .main-board kills pointer events — restore them or the trail can't be
    // finger-scrolled at all.
    pointer-events: auto;

    .stop {
      flex-shrink: 0;
      white-space: nowrap;
      scroll-snap-align: end;
    }
  }
}
</style>
