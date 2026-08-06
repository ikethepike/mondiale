<template>
  <template v-if="challenge.errata">
    <h1 class="map-caption">One of these names is wrong</h1>
    <span class="map-caption sub">
      {{
        challenge.errata.kind === 'swap'
          ? 'Two of them are wearing each other’s — tap either one'
          : 'Tap the country that isn’t what the map says'
      }}
    </span>
    <ChallengeTimerRadial class="gate-clock" :value="secondsLeft" :total="ERRATA_SECONDS" />
    <span class="hint map-caption" :class="{ visible: showDoubleTapHint }">
      Press again to confirm
    </span>
    <div class="hint-row">
      <Transition name="caption">
        <button
          v-if="!cleared.size && hintUnlocked"
          class="hint-button"
          type="button"
          @click="clearHalf"
        >
          <StatTopicIcon class="hint-icon" topic="reveal" />
          Clear half (−{{ GATE_HINT_BITE_STEPS }} steps)
        </button>
      </Transition>
    </div>
  </template>
</template>
<script lang="ts" setup>
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import { shuffleArray } from '~~/lib/arrays'
import { countryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { GATE_HINT_BITE_STEPS, HINT_UNLOCK_FIRST_ELAPSED } from '~~/lib/scoring'
import { useGateChallenge, wrongTokenFor } from '~~/lib/use-gate-challenge'
import { ERRATA_SECONDS } from './timing'
import { isMapClickEvent } from '~~/types/events.types'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

const props = defineProps<{ challenge: IndividualChallenge }>()

const { gameStore } = useClientEvents()
const { status, showInterstitial, submitAnswer } = useGateChallenge()

const secondsLeft = ref(ERRATA_SECONDS)
const showDoubleTapHint = ref(false)
/** Innocents the bought hint has struck off — dimmed and no longer tappable. */
const cleared = ref(new Set<ISOCountryCode>())
let timer: ReturnType<typeof setInterval> | undefined

const elapsed = computed(() => 1 - secondsLeft.value / ERRATA_SECONDS)
const hintUnlocked = computed(() => elapsed.value >= HINT_UNLOCK_FIRST_ELAPSED)

/**
 * The stage IS the labels: frame the cluster, write the (partly wrong) names
 * onto it, and dim the rest of the world so the lineup reads as one page of an
 * atlas. `clearBoard` on the next gate takes all of it back down.
 */
onMounted(() => {
  const errata = props.challenge.errata
  if (!errata) return
  gameStore.map.focus = [...errata.lineup]
  gameStore.map.countryLabels = { ...errata.labels }
  document.addEventListener('mapClick', onMapClick)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('mapClick', onMapClick)
})

watch(
  showInterstitial,
  value => {
    if (value || timer) return
    timer = setInterval(() => {
      secondsLeft.value--
      if (secondsLeft.value > 0) return
      clearInterval(timer)
      if (!status.value) resolve(wrongTokenFor(props.challenge.country))
    }, 1000)
  },
  { immediate: true }
)

/**
 * Every way out of the gate goes through here, so the map always corrects
 * itself: the misprint is replaced with the true names and the hint's dimming
 * lifts. The stage taught the lie, so the stage has to take it back — leaving
 * the swapped labels up through the reveal would teach it twice.
 */
const resolve = (isoCode: ISOCountryCode, options: { timed?: boolean } = {}) => {
  if (timer) clearInterval(timer)
  const errata = props.challenge.errata
  if (errata) {
    gameStore.map.countryLabels = Object.fromEntries(
      errata.lineup.map(member => [member, countryName(member)])
    )
  }
  gameStore.map.dimmed = []
  submitAnswer(
    isoCode,
    options.timed
      ? {
          remainingFraction: Math.max(0, secondsLeft.value) / ERRATA_SECONDS,
          hintsUsed: cleared.value.size ? 1 : 0,
        }
      : {}
  )
}

/** Strike out half the innocents. Never a culprit — the hint narrows the
 *  search, it doesn't hand over the answer. */
const clearHalf = () => {
  const errata = props.challenge.errata
  if (!errata || cleared.value.size || status.value) return
  const innocents = shuffleArray(
    errata.lineup.filter(isoCode => !errata.culprits.includes(isoCode))
  )
  const struck = new Set(innocents.slice(0, Math.ceil(innocents.length / 2)))
  cleared.value = struck
  gameStore.map.dimmed = [...struck]
}

// Tap to select, tap again to confirm — the find gate's contract. A single tap
// is too easy to misfire on a phone, and a misfire here forfeits the walk.
const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return
  if (showInterstitial.value || status.value) return
  const errata = props.challenge.errata
  if (!errata) return

  const isoCode = event.detail.isoCode as ISOCountryCode
  // Only the lineup is in play; a tap on the dimmed world is a slip, not an
  // answer, and must not forfeit the gate.
  if (!errata.lineup.includes(isoCode) || cleared.value.has(isoCode)) return

  if (gameStore.map.highlighted.has(isoCode)) {
    resolve(isoCode, { timed: true })
  } else {
    showDoubleTapHint.value = true
    gameStore.map.highlighted.clear()
    gameStore.map.highlighted.add(isoCode)
  }
}
</script>
<style lang="scss" scoped>
.hint {
  opacity: 0;
  display: inline-block;
  padding: 0.4rem 1.4rem;
  transform: translateY(-0.4rem);
  transition:
    opacity var(--motion-base) var(--ease-out-expressive),
    transform var(--motion-base) var(--ease-out-expressive);

  &.visible {
    opacity: 1;
    transform: none;
  }
}
</style>
