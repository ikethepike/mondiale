<template>
  <div v-if="challenge" class="individual-challenge">
    <Interstitial
      v-if="showInterstitial"
      :title="processReplacements(details?.phrasing || '', challenge.country)"
      stakes="Answer correctly to leap ahead — get it wrong and you're knocked back."
      @done="showInterstitial = false"
    />
    <header v-else>
      <Transition name="caption" mode="out-in">
        <div v-if="!status" key="question" class="question">
          <h1 class="map-caption">
            {{ processReplacements(details?.phrasing || '', challenge.country) }}
          </h1>
          <span v-if="showDoubleTapHint" class="hint map-caption">Press again to confirm</span>
          <div v-if="challenge.id === 'flag' && country" class="flag-frame">
            <CountryFlag
              class="flag ambient-loop"
              :country="country"
              mode="background"
              fit="contain"
            />
          </div>
        </div>
        <ChallengeResult
          v-else-if="submittedCountry && status"
          key="result"
          :status="status"
          :incorrect-message="`Sorry, you pressed: ${countryName(submittedCountry)}`"
        />
      </Transition>
    </header>
  </div>
</template>
<script lang="ts" setup>
import Interstitial from '~/components/feedback/Interstitial.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import { getChallengeDetails } from '~~/lib/challenges'
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { processReplacements } from '~~/lib/values'
import { isMapClickEvent } from '~~/types/events.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const { currentMove, update, gameStore, clearBoard } = useClientEvents()

const challenge = ref(
  currentMove.value?.challenge?._type === 'individual-challenge'
    ? currentMove.value?.challenge
    : undefined
)

const status = toRef(gameStore.map, 'status')
// const reveal = computed<ISOCountryCode[]>(() => {
//   if (status.value === 'unanswered') return []
//   if (!challenge.value) return []
//   return [challenge.value.country]
// })
const submittedISOCode = ref<ISOCountryCode>()
const submittedCountry = computed(() => {
  if (!submittedISOCode.value) return undefined
  return getCountry(submittedISOCode.value)
})
const submitAnswer = (isoCode: ISOCountryCode) => {
  if (status.value) return
  if (currentMove.value?.challenge?._type === 'final-challenge') return

  submittedISOCode.value = isoCode
  gameStore.map.highlighted.clear()
  update({ event: 'submit-individual-challenge-answer', isoCode })

  const challenge = currentMove.value?.challenge
  if (challenge) {
    const correct = isoCode === challenge.country
    gameStore.map.reveal = challenge.country
    gameStore.map.status = correct ? 'correct' : 'incorrect'
  }
}

const details = computed(() => {
  if (!challenge.value) return undefined
  return getChallengeDetails(challenge.value.id)
})

const country = computed(() => {
  if (!challenge.value) return undefined
  return getCountry(challenge.value.country)
})

const showInterstitial = ref(true)

const showDoubleTapHint = ref(false)
const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return
  if (showInterstitial.value) return

  const isoCode = event.detail.isoCode as ISOCountryCode
  if (gameStore.map.highlighted.has(isoCode)) {
    // Double click, submit
    // Show hint
    submitAnswer(isoCode)
  } else {
    showDoubleTapHint.value = true
    gameStore.map.highlighted.clear()
    gameStore.map.highlighted.add(isoCode)
  }
}

onBeforeMount(() => {
  // Clear out our global state
  clearBoard()
  document.addEventListener('mapClick', onMapClick)
})
onBeforeUnmount(() => {
  clearBoard()
  document.removeEventListener('mapClick', onMapClick)
})
</script>
<style lang="scss" scoped>
.individual-challenge {
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  position: absolute;
}

header {
  z-index: 2;
  width: 100%;
  text-align: center;
  padding: 2rem 4rem;
  position: absolute;
  justify-content: center;
  h1 {
    margin: 0;
    font-size: 3.2rem;
  }
  .hint {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.4rem 1.4rem;
  }
  .question {
    gap: 1rem;
    display: flex;
    align-items: center;
    flex-flow: column nowrap;
  }
  // The flag is the question — present it as the hero, framed like the
  // caption scrim, arriving with a settle and idling on a gentle float
  .flag-frame {
    padding: 1.2rem;
    margin-top: 0.6rem;
    border-radius: 1.2rem;
    backdrop-filter: blur(0.5rem);
    background: hsla(36, 100%, 98%, 0.85);
    border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);
    animation: flag-arrive var(--motion-slow) var(--ease-out-expressive) 1;
  }
  .flag {
    width: 26rem;
    height: 15rem;
    display: block;
    max-width: 70vw;
    filter: drop-shadow(0 0.4rem 0.8rem hsla(215.7, 76.4%, 21.6%, 0.18));
    animation: flag-float calc(var(--motion-ambient) * 0.7) ease-in-out infinite;
  }
}

@keyframes flag-arrive {
  0% {
    opacity: 0;
    transform: translateY(1.6rem) scale(0.88);
  }
}

@keyframes flag-float {
  50% {
    transform: translateY(-0.5rem) rotate(0.6deg);
  }
}
</style>
