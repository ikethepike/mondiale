<template>
  <div v-if="challenge" class="hot-cold">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Hot & Cold`"
      title="Find the mystery country"
      :stakes="`Click the map — every probe tells you how far and which way. You have ${challenge.maximumGuesses} probes.`"
      @done="showInterstitial = false"
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
      </div>
    </header>

    <footer>
      <TransitionGroup tag="ol" name="chain" class="probe-list">
        <li
          v-for="probe in probes"
          :key="probe.isoCode"
          class="stop map-caption"
          :class="probe.warmth"
        >
          <CountryFlag class="stop-flag" :country="getCountry(probe.isoCode)" mode="background" />
          <span>{{ countryName(probe.isoCode) }}</span>
          <small>{{ Math.round(probe.distanceKm).toLocaleString() }} km</small>
        </li>
      </TransitionGroup>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { bearingDegrees, compassLabel, countryLatLng, haversineKm } from '~~/lib/geo'
import type { MapTint } from '~~/store/game.store'
import { isMapClickEvent } from '~~/types/events.types'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'

const { gameStore, update, currentRound, clearBoard } = useClientEvents()

const challenge = computed(() => {
  const roundChallenge = currentRound.value?.round.groupChallenge
  return roundChallenge && '_type' in roundChallenge && roundChallenge._type === 'hot-cold-challenge'
    ? roundChallenge
    : undefined
})

interface Probe {
  isoCode: ISOCountryCode
  distanceKm: number
  warmth: 'hot' | 'warm' | 'cold'
}

const probes = ref<Probe[]>([])
const submitted = ref(false)
const showInterstitial = ref(true)
const feedback = ref('')
const warmthClass = ref<'hot' | 'warm' | 'cold' | ''>('')

const probesLeft = computed(
  () => (challenge.value?.maximumGuesses ?? 0) - probes.value.length
)

// Full outline map, fully clickable — never reveal the target through
// highlights, tints or camera focus
clearBoard()

const warmthFor = (distanceKm: number): Probe['warmth'] => {
  if (distanceKm < 800) return 'hot'
  if (distanceKm < 2500) return 'warm'
  return 'cold'
}

const WARMTH_TINTS: { [warmth in Probe['warmth']]: MapTint } = {
  hot: 'optimal',
  warm: 'inefficient',
  cold: 'stray',
}

const paintProbes = () => {
  gameStore.map.highlighted.clear()
  const tints: { [isoCode in ISOCountryCode]?: MapTint } = {}
  for (const probe of probes.value) {
    gameStore.map.highlighted.add(probe.isoCode)
    tints[probe.isoCode] = WARMTH_TINTS[probe.warmth]
  }
  gameStore.map.tints = tints
}

const submitRound = () => {
  if (submitted.value) return
  submitted.value = true
  // The trail ends with the found country when the hunt succeeded
  update({
    event: 'submit-group-challenge-answers',
    ranking: probes.value.map(probe => probe.isoCode),
  })
}

const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return
  if (showInterstitial.value || submitted.value) return
  const active = challenge.value
  if (!active) return

  const isoCode = event.detail.isoCode
  if (!isValidISOCode(isoCode)) return
  if (probes.value.some(probe => probe.isoCode === isoCode)) return

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
  probes.value.push({ isoCode, distanceKm, warmth })
  paintProbes()

  const direction = compassLabel(bearingDegrees(from, target))
  const temperature = warmth === 'hot' ? 'Scalding' : warmth === 'warm' ? 'Warm' : 'Cold'
  // The shortest way may cross the date line — flag it, or "east of China"
  // reads as impossible on a flat map
  const crossesDateLine = Math.abs(target.lng - from.lng) > 180
  feedback.value = `${temperature} — about ${Math.round(distanceKm / 100) * 100} km to the ${direction}${crossesDateLine ? ', across the date line' : ''}`
  warmthClass.value = warmth

  if (probes.value.length >= active.maximumGuesses) {
    gameStore.map.status = 'incorrect'
    feedback.value = 'Out of probes!'
    setTimeout(submitRound, 1200)
  }
}

onBeforeMount(() => {
  document.addEventListener('mapClick', onMapClick)
})
onBeforeUnmount(() => {
  clearBoard()
  document.removeEventListener('mapClick', onMapClick)
})
</script>
<style lang="scss" scoped>
.hot-cold {
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
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
    font-size: 3.2rem;
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
</style>
