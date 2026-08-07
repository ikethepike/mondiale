<template>
  <div v-if="challenge" class="hot-cold challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Hot & Cold`"
      title="Find the mystery country"
      :stakes="`Every country you click reports how far you are and which way to head. You have ${challenge.maximumGuesses} probes — the fewer you spend, the more you score.`"
      @done="begin()"
    />

    <ChallengePrompt :attributions="promptSources">
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
    </ChallengePrompt>

    <footer>
      <TransitionGroup ref="probeList" tag="ol" name="chain" class="country-chip-list rail">
        <CountryChip
          v-for="probe in probes"
          :key="probe.isoCode"
          class="map-caption"
          :class="probe.warmth"
          :country="getCountry(probe.isoCode)"
        >
          <small v-if="probe.direction">
            {{ formatKm(probe.distanceKm) }} {{ probe.direction }}
          </small>
          <small v-else>found it!</small>
        </CountryChip>
      </TransitionGroup>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { bearingDegrees, compassArrow, compassLabel, countryLatLng, haversineKm } from '~~/lib/geo'
import { formatApproxKm, formatKm } from '~~/lib/number'
import type { MapTint } from '~~/store/game.store'
import { isMapClickEvent } from '~~/types/events.types'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'
import { datasetAttribution } from '~~/lib/attribution'

const promptSources = datasetAttribution('map')

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
  distanceKm < 100 ? 'less than 100 km' : `about ${formatApproxKm(distanceKm)}`

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
    // Submit at once — the server's flip (the kind's reveal hold in
    // ROUND_BEATS) gives the verdict its beat before the scorecard.
    submitRound()
  }
}

onBeforeMount(() => {
  document.addEventListener('mapClick', onMapClick)
})
registerCleanup(() => document.removeEventListener('mapClick', onMapClick))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

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

// Chip, trail-list and phone rail recipes come from templates/_country-chip.scss;
// only the warmth borders live here.
.country-chip {
  small {
    opacity: 0.6;
  }

  &.hot {
    border-color: flame(0.6);
  }
  &.warm {
    border-color: hsla(29.7, 79.9%, 60%, 0.6);
  }
  &.cold {
    border-color: hsla(197.6, 51.2%, 41.8%, 0.4);
  }
}
</style>
