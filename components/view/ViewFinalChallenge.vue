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
          <span class="counter map-caption"
            >{{ currentChallengeCount }}/{{ totalChallengeCount }}</span
          >
          <h2 class="map-caption">{{ details?.question }}</h2>
        </div>
      </Transition>
    </header>
    <ChallengeResult v-if="status" :key="currentChallengeCount" :status="status" class="result">
      <template v-if="lesson">{{ lesson }}</template>
    </ChallengeResult>
  </div>
</template>
<script lang="ts" setup>
import Interstitial from '~/components/feedback/Interstitial.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import {
  COLOR_CODED_REGIONS,
  FINAL_STAT_LABELS,
  getFinalChallengeDetails,
} from '~~/lib/challenges/final-challenge'
import { countryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { formatAmount } from '~~/lib/number'
import { getValueByAccessorID } from '~~/lib/values'
import { REGION_LABELS } from '~~/lib/variant'
import { isMapClickEvent } from '~~/types/events.types'
import { type ISOCountryCode, isValidISOCode, type Region } from '~~/types/geography.types'

const { currentFinalChallenge, clearBoard, update, gameStore, currentMove, game } =
  useClientEvents()

const status = toRef(gameStore.map, 'status')

/**
 * The teachable moment. Wrong answers get the fact they missed AND the fact
 * they picked (so the mistake itself teaches); correct answers get the fact
 * restated with its number to reinforce it.
 */
const lastGuess = ref<ISOCountryCode | undefined>(undefined)
const lesson = computed(() => {
  const challenge = currentFinalChallenge.value
  if (!challenge || !status.value) return undefined

  switch (challenge._type) {
    case 'min-challenge':
    case 'max-challenge': {
      const label = FINAL_STAT_LABELS[challenge.accessorId]
      const answer = getValueByAccessorID(challenge.country, challenge.accessorId)
      if (!answer) return undefined
      const answerLine = `${countryName(COUNTRIES[challenge.country])}: ${formatAmount(answer)} ${label.toLowerCase()}`
      if (status.value === 'correct' || !lastGuess.value || lastGuess.value === challenge.country)
        return answerLine
      const guessed = getValueByAccessorID(lastGuess.value, challenge.accessorId)
      if (!guessed) return answerLine
      return `${answerLine} — your pick, ${countryName(COUNTRIES[lastGuess.value])}: ${formatAmount(guessed)}`
    }
    case 'region-challenge': {
      const country = COUNTRIES[challenge.country]
      return `${country.name.english} is part of ${REGION_LABELS[country.region]}.`
    }
    case 'leadership-challenge': {
      const country = COUNTRIES[challenge.country]
      const { leader } = country.government
      return leader ? `${leader} leads ${countryName(country)}.` : undefined
    }
    case 'language-challenge': {
      const speakers = Object.values(COUNTRIES).filter(country =>
        country.languages.includes(challenge.language)
      ).length
      return `${challenge.language} is spoken in ${speakers} ${speakers === 1 ? 'country' : 'countries'} — they stay lit on the map.`
    }
    case 'membership-challenge': {
      return status.value === 'correct'
        ? `${countryName(COUNTRIES[challenge.exception])} is the odd one out.`
        : `The odd one out was ${countryName(COUNTRIES[challenge.exception])}.`
    }
    default:
      return undefined
  }
})

const details = computed(() => {
  if (!currentFinalChallenge.value) return undefined
  return getFinalChallengeDetails({
    challenge: currentFinalChallenge.value,
    variant: game.value?.variant,
  })
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
  gameStore.map.reveal = undefined
  gameStore.map.revealStat = undefined
  gameStore.map.status = undefined
  gameStore.map.highlighted.clear()
  lastGuess.value = undefined

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
  if (isValidISOCode(isoCode)) lastGuess.value = isoCode

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

      // Surface the stat on the reveal card — the number is the lesson
      if (currentFinalChallenge.value._type !== 'leadership-challenge') {
        const { accessorId, country } = currentFinalChallenge.value
        const amount = getValueByAccessorID(country, accessorId)
        if (amount) {
          gameStore.map.revealStat = {
            label: FINAL_STAT_LABELS[accessorId],
            value: formatAmount(amount),
          }
        }
      }

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
@use '~/assets/scss/rules/breakpoints' as *;
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

// Compact phone chrome: tighter prompt padding, footer clear of the home
// indicator.
@media screen and (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }
}
</style>
