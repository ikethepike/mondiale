<template>
  <div class="view-final-challenge">
    <Interstitial
      v-if="showInterstitial"
      kicker="Final Challenge!"
      :title="`${totalChallengeCount} questions stand between you and victory`"
      stakes="Answer them all to win the game — a single miss sends you back."
      :hold-for="3.6"
      @done="showInterstitial = false"
    />
    <header :class="{ dimmed: status }">
      <Transition name="caption" mode="out-in">
        <div :key="currentChallengeCount" class="prompt">
          <span class="counter map-caption">{{ currentChallengeCount }}/{{ totalChallengeCount }}</span>
          <h2 class="map-caption">{{ details?.question }}</h2>
        </div>
      </Transition>
    </header>
    <ChallengeResult v-if="status" :key="currentChallengeCount" :status="status" class="result" />
  </div>
</template>
<script lang="ts" setup>
import Interstitial from '~/components/feedback/Interstitial.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { COLOR_CODED_REGIONS, getFinalChallengeDetails } from '~~/lib/challenges/final-challenge'
import { useClientEvents } from '~~/lib/events/client-side'
import { isMapClickEvent } from '~~/types/events.types'
import { type ISOCountryCode, isValidISOCode, type Region } from '~~/types/geography.types'

const { currentFinalChallenge, clearBoard, update, gameStore, currentMove } = useClientEvents()

const status = toRef(gameStore.map, 'status')

const details = computed(() => {
  if (!currentFinalChallenge.value) return undefined
  return getFinalChallengeDetails({ challenge: currentFinalChallenge.value })
})
const totalChallengeCount = ref(
  (() => {
    if (!currentMove.value || currentMove.value.challenge?._type !== 'final-challenge') return 0
    return currentMove.value.challenge.challenges.length
  })()
)
const currentChallengeCount = computed(() => {
  if (!currentMove.value || currentMove.value.challenge?._type !== 'final-challenge') return 0
  return totalChallengeCount.value + 1 - currentMove.value.challenge.challenges.length
})

const triggerMembershipChallenge = () => {
  const challenge = currentFinalChallenge.value
  if (challenge?._type === 'membership-challenge') {
    const countries = Object.values(COUNTRIES)
    gameStore.map.highlighted.add(challenge.exception)
    for (const country of countries) {
      if (country.membership.some(organization => organization.id === challenge.organization)) {
        gameStore.map.highlighted.add(country.isoCode)
      }
    }
  }
}

watch(currentFinalChallenge, () => {
  console.log('update')
  gameStore.map.reveal = undefined
  gameStore.map.status = undefined
  gameStore.map.highlighted.clear()

  triggerMembershipChallenge()
})

const showInterstitial = ref(true)

const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return
  if (showInterstitial.value) return
  // Answer revealed — ignore clicks so the result can't be re-submitted or
  // the zoomed-in highlight repainted while the server settles the outcome
  if (status.value) return
  if (!currentFinalChallenge.value) return
  const { isoCode } = event.detail

  switch (currentFinalChallenge.value._type) {
    case 'region-challenge':
      {
        let selectedRegion: Region | undefined = undefined
        for (const [region, data] of Object.entries(COLOR_CODED_REGIONS)) {
          if (!data.countries.includes(isoCode)) continue
          selectedRegion = region as Region
        }

        if (!selectedRegion) {
          throw new ReferenceError(`Unable to identify region: ${isoCode}`)
        }

        // Show if answer was correct
        const isCorrect = selectedRegion === COUNTRIES[currentFinalChallenge.value.country].region

        gameStore.map.reveal = currentFinalChallenge.value.country
        gameStore.map.status = isCorrect ? 'correct' : 'incorrect'

        // ! Submit answer
        update({
          event: 'submit-final-challenge-answer',
          submittedAnswer: {
            _type: 'region-challenge',
            region: selectedRegion,
          },
        })
      }
      break
    case 'max-challenge':
    case 'min-challenge':
    case 'leadership-challenge':
      gameStore.map.reveal = currentFinalChallenge.value.country
      gameStore.map.status =
        isoCode === currentFinalChallenge.value.country ? 'correct' : 'incorrect'

      update({
        event: 'submit-final-challenge-answer',
        submittedAnswer: {
          _type: currentFinalChallenge.value._type,
          isoCode: isoCode as ISOCountryCode, // We check this in the backend
        },
      })
      break
    case 'language-challenge':
      {
        if (!isValidISOCode(isoCode)) {
          return console.error(`Unsupported country: ${isoCode}`)
        }

        for (const country of Object.values(COUNTRIES)) {
          if (!country.languages.includes(currentFinalChallenge.value.language)) continue
          gameStore.map.highlighted.add(country.isoCode)
        }

        const isCorrect = gameStore.map.highlighted.has(isoCode)
        gameStore.map.status = isCorrect ? 'correct' : 'incorrect'

        update({
          event: 'submit-final-challenge-answer',
          submittedAnswer: {
            _type: 'language-challenge',
            isoCode: isoCode as ISOCountryCode,
          },
        })
      }
      break
    case 'membership-challenge':
      {
        const { exception } = currentFinalChallenge.value
        gameStore.map.highlighted.clear()

        const isCorrect = isoCode === exception
        gameStore.map.reveal = exception
        gameStore.map.status = isCorrect ? 'correct' : 'incorrect'

        update({
          event: 'submit-final-challenge-answer',
          submittedAnswer: {
            _type: 'membership-challenge',
            isoCode: isoCode as ISOCountryCode,
          },
        })
      }
      break
    default:
      console.error(`Unsupported final event type`, currentFinalChallenge.value)
      break
  }
}

onBeforeMount(() => {
  // Clear out our global state
  clearBoard()
  triggerMembershipChallenge()
  document.addEventListener('mapClick', onMapClick)
})
onBeforeUnmount(() => {
  clearBoard()
  document.removeEventListener('mapClick', onMapClick)
})
</script>
<style lang="scss" scoped>
.view-final-challenge {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  position: absolute;
}

header {
  text-align: center;
  padding: 2rem 4rem;
  transition: opacity var(--motion-base) var(--ease-smooth);

  &.dimmed {
    opacity: 0.4;
  }

  h2 {
    margin: 0;
    font-size: 3rem;
  }

  .counter {
    padding: 0.4rem 1.4rem;
  }

  .prompt {
    gap: 1rem;
    display: flex;
    align-items: center;
    flex-flow: column nowrap;
  }
}

.result {
  margin-top: 4rem;
}
</style>
