<template>
  <template v-if="challenge.rulers">
    <h1 class="map-caption">One of these is not its country's ruling party</h1>
    <span class="map-caption sub">Tap the party that isn't in government</span>
    <ChallengeTimerRadial class="gate-clock" :value="secondsLeft" :total="RULERS_SECONDS" />
    <span class="hint map-caption" :class="{ visible: showDoubleTapHint }">
      Press again to confirm
    </span>
  </template>
</template>
<script lang="ts" setup>
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { useGateChallenge, useGateClock } from '~~/lib/use-gate-challenge'
import { RULERS_SECONDS } from './timing'
import { isMapClickEvent } from '~~/types/events.types'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Rulers: a framed neighbourhood wearing its governments' logos, one of which
 * is an opposition party from its OWN country.
 *
 * The map IS the interface — there is no option list, because the logos are the
 * options. Same shape as the errata gate: frame the cluster, write the register,
 * take taps through `mapClick`. Nothing here draws geometry; a second renderer
 * inside a gate would duplicate the camera, the anchor cache and the hit-testing
 * the always-mounted map already owns.
 */

const props = defineProps<{ challenge: IndividualChallenge }>()

const { gameStore } = useClientEvents()
const { status, showInterstitial, submitAnswer, giveUp } = useGateChallenge()

const showDoubleTapHint = ref(false)

const { secondsLeft, remainingFraction, stop } = useGateClock(RULERS_SECONDS, {
  // The stage dressed a country in someone else's logo; it has to be put right
  // whether or not anybody answered.
  onExpire: () => {
    restoreStage()
    giveUp()
  },
})

onMounted(() => {
  const rulers = props.challenge.rulers
  if (!rulers) return
  gameStore.map.focus = [...rulers.lineup]
  gameStore.map.countryLogos = { ...rulers.logos }
  // Everything not in play fades back. That is what separates the stage from
  // the map — a card behind each logo read as a box sitting ON the world
  // rather than a party sitting IN a country.
  gameStore.map.spotlight = [...rulers.lineup]
  document.addEventListener('mapClick', onMapClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('mapClick', onMapClick)
})

/**
 * Put the map right: the impostor's country goes back to wearing its real
 * government. The stage taught the lie, so the stage takes it back — leaving it
 * up through the reveal would teach it twice.
 */
const restoreStage = () => {
  stop()
  const rulers = props.challenge.rulers
  if (rulers) {
    gameStore.map.countryLogos = { ...rulers.logos, ...(rulers.trueLogo ?? {}) }
  }
  // The world comes back for the reveal — the answer reads against the whole
  // map, not a spotlit corner of it.
  gameStore.map.spotlight = []
  return undefined
}

const resolve = (isoCode: ISOCountryCode) => {
  restoreStage()
  submitAnswer(isoCode, { remainingFraction: remainingFraction.value })
}

// Tap to select, tap again to confirm — the find gate's contract. A misfire
// here forfeits the walk, which is too harsh for a single stray tap.
const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return
  if (showInterstitial.value || status.value) return
  const rulers = props.challenge.rulers
  if (!rulers) return

  const isoCode = event.detail.isoCode as ISOCountryCode
  // Only the framed countries are in play; a tap on the sea or a neighbour
  // outside the stage is a slip, not an answer.
  if (!rulers.lineup.includes(isoCode)) return

  if (gameStore.map.highlighted.has(isoCode)) {
    resolve(isoCode)
  } else {
    showDoubleTapHint.value = true
    gameStore.map.highlighted.clear()
    gameStore.map.highlighted.add(isoCode)
  }
}
</script>

<style lang="scss" scoped>
.hint {
  display: inline-block;
  padding: 0.4rem 1.4rem;
  opacity: 0;
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
