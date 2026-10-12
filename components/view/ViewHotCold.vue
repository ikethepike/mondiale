<template>
  <div v-if="challenge" class="hot-cold challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      kind="hot-cold"
      title="Find the mystery country"
      :stakes="`Every country you click drops a compass pointing toward the mystery country, and tells you how far off you are. You have ${challenge.maximumGuesses} probes — the fewer you spend, the more you score.`"
      @done="begin()"
    />

    <ProbeZones v-if="!showInterstitial" :probes="probes" />
    <ProbeCompasses v-if="!showInterstitial" :probes="probes" :compact="isPhone" />

    <ChallengePrompt :attributions="promptSources">
      <h1 class="map-caption">Find the mystery country</h1>
      <span class="map-caption sub">
        {{ probesLeft }} {{ probesLeft === 1 ? 'probe' : 'probes' }} left
      </span>
      <Transition name="caption" mode="out-in">
        <span
          v-if="feedback"
          :key="feedback.text"
          class="map-caption feedback"
          :class="feedback.warmth"
        >
          <strong v-if="feedback.trend" class="trend" :class="feedback.trend.trend">
            {{ trendLead(feedback.trend) }}
          </strong>
          {{ feedback.text }}
        </span>
      </Transition>
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </ChallengePrompt>

    <footer>
      <TransitionGroup ref="trail" tag="ol" name="chain" class="country-chip-list rail">
        <CountryChip
          v-for="probe in probes"
          :key="probe.isoCode"
          class="map-caption probe-chip"
          :style="{ '--warmth': warmthColor(warmthFraction(probe.distanceKm)) }"
          :country="getCountry(probe.isoCode)"
        >
          <small v-if="probe.degrees !== undefined">
            {{ formatKm(probe.distanceKm) }} {{ compassArrow(probe.degrees) }}
          </small>
          <small v-else>found it!</small>
        </CountryChip>
      </TransitionGroup>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ProbeCompasses from '~/components/challenge/ProbeCompasses.vue'
import ProbeZones from '~/components/challenge/ProbeZones.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useChipTrail } from '~~/lib/use-chip-trail'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { compassArrow, compassLabel } from '~~/lib/geo'
import {
  probeDistanceKm,
  probeFrame,
  probeHeading,
  probeOrigin,
  probeTrend,
  temperatureFor,
  warmthFor,
  warmthFraction,
  type HotColdProbe,
  type Warmth,
} from '~~/lib/hot-cold'
import { formatApproxKm, formatKm } from '~~/lib/number'
import { useIsPhone } from '~~/lib/use-viewport'
import { warmthColor } from '~~/lib/warmth'
import { isMapClickEvent } from '~~/types/events.types'
import { isValidISOCode } from '~~/types/geography.types'
import { datasetAttribution } from '~~/lib/attribution'

const promptSources = datasetAttribution('map')

// Full outline map, fully clickable — never reveal the target through
// highlights, tints or camera focus, so this mode opts out of shapes-only.
const {
  challenge,
  showInterstitial,
  submitted,
  begin,
  announce,
  entries,
  submitOnce,
  registerCleanup,
  gameStore,
  previewVerdict,
} = useGroupChallenge('hot-cold-challenge', { solo: false })

const probes = ref<HotColdProbe[]>([])

// The probe trail rides the shared rail — it keeps the newest probe in view.
const { trail } = useChipTrail(() => probes.value.length)

type Trend = NonNullable<ReturnType<typeof probeTrend>>

const feedback = ref<{ text: string; warmth: Warmth; trend?: Trend }>()

const probesLeft = computed(() => (challenge.value?.maximumGuesses ?? 0) - probes.value.length)

const isPhone = useIsPhone()

/** Each probed country wears its own point on the warmth ramp; a small
 *  screen also frames the trail and its zones. */
const paintProbes = () => {
  gameStore.map.countryGroupings = probes.value.map(probe => ({
    color: warmthColor(warmthFraction(probe.distanceKm), 0.45),
    countries: [probe.isoCode],
  }))
  if (isPhone.value) gameStore.map.frame = probeFrame(probes.value)
}
registerCleanup(() => (gameStore.map.frame = undefined))

const distancePhrase = (distanceKm: number): string =>
  distanceKm < 100 ? 'less than 100 km' : `about ${formatApproxKm(distanceKm)}`

const clueFor = (probe: HotColdProbe): string => {
  if (probe.degrees === undefined) return ''
  // "East of China" reads as impossible on a flat map unless the date line is named
  const dateLine = probe.crossesDateLine ? ', across the date line' : ''
  return `${countryName(probe.isoCode)} is ${temperatureFor(probe.distanceKm)} — ${distancePhrase(probe.distanceKm)} to the ${compassLabel(probe.degrees)}${dateLine}`
}

const trendLead = ({ trend, deltaKm }: Trend): string => {
  if (trend === 'closest') return 'Warmer — your closest yet!'
  const lead = trend === 'warmer' ? 'Warmer' : 'Colder'
  if (deltaKm < 100) return `${lead}, only just.`
  return `${lead}, ${formatApproxKm(deltaKm)} ${trend === 'warmer' ? 'closer' : 'further'}.`
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

  // Repeat clicks cost nothing — the country keeps the point it was first
  // probed from, or one probe could re-measure Russia from anywhere in it
  const previous = probes.value.find(probe => probe.isoCode === isoCode)
  if (previous) {
    previous.replays++
    feedback.value = { text: `Already probed: ${clueFor(previous)}`, warmth: previous.warmth }
    return
  }

  const origin = probeOrigin(isoCode, event.detail.latLng)

  if (isoCode === active.country) {
    probes.value.push({ isoCode, origin, distanceKm: 0, warmth: 'hot', replays: 0 })
    previewVerdict('correct')
    gameStore.map.frame = undefined
    gameStore.map.reveal = active.country
    feedback.value = { text: `${countryName(isoCode)} — found it!`, warmth: 'hot' }
    return submitRound()
  }

  if (!origin) return
  const distanceKm = probeDistanceKm(origin, active.country)
  const heading = probeHeading(origin, active.country)
  if (distanceKm === undefined || !heading) return

  const last = probes.value.at(-1)
  const trend = probeTrend(
    distanceKm,
    last && {
      lastKm: last.distanceKm,
      bestKm: Math.min(...probes.value.map(probe => probe.distanceKm)),
    }
  )
  const probe: HotColdProbe = {
    isoCode,
    origin,
    distanceKm,
    warmth: warmthFor(distanceKm),
    degrees: heading.degrees,
    crossesDateLine: heading.crossesDateLine,
    trend: trend?.trend,
    replays: 0,
  }
  probes.value.push(probe)
  paintProbes()

  // The isoCode and point ride to the server only so it can measure the
  // distance; the room is told a 100km-rounded radius and never the country —
  // a probe's country and warmth together would be a bearing fix on the hidden target.
  announce({ kind: 'probe', isoCode, latLng: origin })

  feedback.value = { text: clueFor(probe), warmth: probe.warmth, trend }

  if (probes.value.length >= active.maximumGuesses) {
    previewVerdict('incorrect')
    feedback.value = { text: 'Out of probes!', warmth: 'cold' }
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

  .trend {
    color: var(--hior-ange);

    &.colder {
      color: var(--soft-blue);
    }
  }
}

// Chip, trail-list and phone rail recipes come from templates/_country-chip.scss;
// only the warmth edge lives here.
.probe-chip {
  border-color: var(--warmth);

  small {
    opacity: 0.6;
  }
}
</style>
