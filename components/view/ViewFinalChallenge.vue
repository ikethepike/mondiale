<template>
  <div class="view-final-challenge">
    <GauntletIntro
      v-if="showInterstitial"
      :questions="totalChallengeCount"
      :lives="livesRemaining"
      @done="showInterstitial = false"
    />
    <header :class="{ dimmed: status }">
      <Transition name="caption" mode="out-in">
        <div :key="currentChallengeCount" class="prompt">
          <span class="counter map-caption"
            >{{ currentChallengeCount }}/{{ totalChallengeCount }}</span
          >
          <OrganizationLogo
            v-if="currentFinalChallenge?._type === 'membership-challenge'"
            :organization="currentFinalChallenge.organization"
          />
          <h2 class="map-caption">{{ details?.question }}</h2>
        </div>
      </Transition>
    </header>
    <span
      v-if="initialLives && !showInterstitial"
      class="hearts map-caption"
      aria-label="lives"
      :class="{ dimmed: status }"
    >
      <span
        v-for="index in initialLives"
        :key="index"
        class="heart"
        :class="{ spent: index > livesRemaining }"
        >♥</span
      >
    </span>
    <FinalScales
      v-if="currentFinalChallenge?._type === 'scales-challenge' && !showInterstitial"
      :challenge="currentFinalChallenge"
      :picks="scalesPicks"
      :result="scalesResult"
      @clear="clearScalesPicks"
      @weigh="submitScales"
    />
    <!-- The night survives the reveal — lit countries glow in the dark while
         the lesson shows, then the whole scene eases back to daylight -->
    <Transition name="sunset-fade">
      <FinalSunsetBlitz
        v-if="currentFinalChallenge?._type === 'sunset-blitz-challenge'"
        :key="currentChallengeCount"
        :challenge="currentFinalChallenge"
        :paused="showInterstitial"
        @finished="onSunsetFinished"
      />
    </Transition>
    <!-- The night holds through the reveal — lit cities keep glowing, missed
         ones surface as cold dots — then fades with the mode transition -->
    <Transition name="sunset-fade">
      <FinalCityNocturne
        v-if="currentFinalChallenge?._type === 'city-nocturne-challenge'"
        :key="`nocturne-${currentChallengeCount}`"
        :challenge="currentFinalChallenge"
        :paused="showInterstitial"
        @finished="onNocturneFinished"
      />
    </Transition>
    <!-- Born In: picks wear their independence year as they land; the reveal
         extends the chips to every qualifying country -->
    <MapYearLabels
      v-if="currentFinalChallenge?._type === 'born-challenge' && bornYearEntries.length"
      :entries="bornYearEntries"
    />
    <ChallengeResult
      v-if="status"
      :key="currentChallengeCount"
      :status="status"
      :correct-message="
        currentFinalChallenge?._type === 'city-nocturne-challenge' ? 'Success!' : undefined
      "
      class="result"
    >
      <SunsetReveal
        v-if="currentFinalChallenge?._type === 'sunset-blitz-challenge' && sunsetResult"
        :challenge="currentFinalChallenge"
        :named="sunsetResult.named"
        :in-play="sunsetResult.inPlay"
        :quota="sunsetResult.quota"
      />
      <NocturneReveal
        v-if="currentFinalChallenge?._type === 'city-nocturne-challenge' && nocturneResult"
        :challenge="currentFinalChallenge"
        :named-cities="nocturneResult"
      />
      <MadeReveal
        v-if="currentFinalChallenge?._type === 'made-challenge' && madeRevealReady"
        :challenge="currentFinalChallenge"
        :picked="lastGuess"
      />
      <template v-if="lesson">{{ lesson }}</template>
      <span v-if="livesLine" class="lives-line">{{ livesLine }}</span>
    </ChallengeResult>
  </div>
</template>
<script lang="ts" setup>
import FinalCityNocturne from '~/components/challenge/FinalCityNocturne.vue'
import FinalScales, { type ScalesResult } from '~/components/challenge/FinalScales.vue'
import FinalSunsetBlitz from '~/components/challenge/FinalSunsetBlitz.vue'
import MadeReveal from '~/components/challenge/MadeReveal.vue'
import MapYearLabels from '~/components/challenge/MapYearLabels.vue'
import NocturneReveal from '~/components/challenge/NocturneReveal.vue'
import SunsetReveal from '~/components/challenge/SunsetReveal.vue'
import OrganizationLogo from '~/components/challenge/OrganizationLogo.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import GauntletIntro from '~/components/feedback/GauntletIntro.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import {
  COLOR_CODED_REGIONS,
  FINAL_STAT_LABELS,
  GAUNTLET_LIVES,
  getFinalChallengeDetails,
  sunsetQuota,
} from '~~/lib/challenges/final-challenge'
import { countryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { titlecaseLeader } from '~~/lib/leaders'
import { formatAmount } from '~~/lib/number'
import { getValueByAccessorID } from '~~/lib/values'
import { REGION_LABELS } from '~~/lib/variant'
import { isMapClickEvent } from '~~/types/events.types'
import { type ISOCountryCode, isValidISOCode, type Region } from '~~/types/geography.types'

const { currentFinalChallenge, clearBoard, update, gameStore, currentMove, game } =
  useClientEvents()

const status = toRef(gameStore.map, 'status')

const gauntlet = computed(() => {
  if (currentMove.value?.challenge?._type !== 'final-challenge') return undefined
  return currentMove.value.challenge
})

// Payload-driven progress: totals survive redeals, hearts mirror the server
const totalChallengeCount = computed(() => gauntlet.value?.totalCount ?? 0)
const livesRemaining = computed(() => gauntlet.value?.lives ?? 0)
const initialLives = computed(() =>
  gauntlet.value ? GAUNTLET_LIVES[gauntlet.value.difficulty] : 0
)
const currentChallengeCount = computed(() => {
  if (!gauntlet.value) return 0
  return Math.min(
    totalChallengeCount.value,
    totalChallengeCount.value - gauntlet.value.challenges.length + 1
  )
})

/**
 * The teachable moment. Wrong answers get the fact they missed AND the fact
 * they picked (so the mistake itself teaches); correct answers get the fact
 * restated with its number to reinforce it.
 */
const lastGuess = ref<ISOCountryCode | undefined>(undefined)
const scalesPicks = ref<ISOCountryCode[]>([])
const scalesResult = ref<ScalesResult | undefined>(undefined)
const sunsetResult = ref<
  { named: ISOCountryCode[]; inPlay: ISOCountryCode[]; quota: number } | undefined
>(undefined)
const nocturneResult = ref<string[] | undefined>(undefined)
// The made-in reveal waits a beat so the lit map registers before the card
const madeRevealReady = ref(false)
let madeRevealTimeout: ReturnType<typeof setTimeout> | undefined

// Born In: picks made so far (multi-pick quota; a wrong click ends the round)
const bornPicks = ref<ISOCountryCode[]>([])

// Year chips: during the hunt only the player's picks wear them; at the
// reveal every qualifying country does — biggest populations first so the
// collision skip drops the least-known chips
const bornYearEntries = computed(() => {
  const challenge = currentFinalChallenge.value
  if (challenge?._type !== 'born-challenge') return []
  const revealAll = !!status.value
  return Object.values(COUNTRIES)
    .filter(
      country =>
        (country.government.independence?.amount ?? 0) > challenge.year &&
        (revealAll || bornPicks.value.includes(country.isoCode))
    )
    .sort((a, b) => (b.people.population?.amount ?? 0) - (a.people.population?.amount ?? 0))
    .map(country => ({
      isoCode: country.isoCode,
      label: String(country.government.independence!.amount),
    }))
})

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
      return leader ? `${titlecaseLeader(leader)} leads ${countryName(country)}.` : undefined
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
    case 'born-challenge': {
      const qualifying = Object.values(COUNTRIES).filter(
        country => (country.government.independence?.amount ?? 0) > challenge.year
      ).length
      const pickedYear =
        lastGuess.value && COUNTRIES[lastGuess.value].government.independence?.amount
      const pickedLine =
        status.value === 'incorrect' && lastGuess.value && pickedYear
          ? ` Your pick, ${countryName(COUNTRIES[lastGuess.value])}: ${pickedYear}.`
          : ''
      return `${qualifying} countries became independent after ${challenge.year} — they stay lit on the map.${pickedLine}`
    }
    case 'made-challenge':
      // A beat of lit countries on the map, then MadeReveal's ranked card
      return undefined
    case 'scales-challenge': {
      // The beam shows the numbers — the lesson recaps the coalition
      if (!scalesPicks.value.length) return undefined
      return `Your side: ${scalesPicks.value.map(isoCode => countryName(COUNTRIES[isoCode])).join(' + ')}.`
    }
    case 'sunset-blitz-challenge':
      // SunsetReveal carries the whole scorecard
      return undefined
    case 'city-nocturne-challenge':
      // NocturneReveal carries the whole scorecard
      return undefined
    default:
      return undefined
  }
})

// Optimistic: the payload still holds pre-answer lives during the reveal
const livesLine = computed(() => {
  if (status.value !== 'incorrect') return undefined
  return livesRemaining.value > 0
    ? `A life is spent — ${livesRemaining.value - 1} left.`
    : 'Out of lives — back to the board race.'
})

const details = computed(() => {
  if (!currentFinalChallenge.value) return undefined
  return getFinalChallengeDetails({
    challenge: currentFinalChallenge.value,
    variant: game.value?.variant,
  })
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
  if (challenge?._type === 'scales-challenge') {
    gameStore.map.tints[challenge.target] = 'endpoint'
    gameStore.map.focus = [challenge.target]
  }
}

watch(currentFinalChallenge, () => {
  gameStore.map.reveal = undefined
  gameStore.map.revealStat = undefined
  gameStore.map.status = undefined
  gameStore.map.highlighted.clear()
  gameStore.map.tints = {}
  gameStore.map.focus = []
  lastGuess.value = undefined
  scalesPicks.value = []
  scalesResult.value = undefined
  sunsetResult.value = undefined
  nocturneResult.value = undefined
  bornPicks.value = []
  madeRevealReady.value = false
  if (madeRevealTimeout) clearTimeout(madeRevealTimeout)

  triggerMembershipChallenge()
})

const showInterstitial = ref(true)

const clearScalesPicks = () => {
  for (const isoCode of scalesPicks.value) gameStore.map.highlighted.delete(isoCode)
  scalesPicks.value = []
}

const submitScales = () => {
  const challenge = currentFinalChallenge.value
  if (challenge?._type !== 'scales-challenge' || !scalesPicks.value.length) return

  const target = getValueByAccessorID(challenge.target, challenge.accessorId)
  let combined = 0
  for (const isoCode of scalesPicks.value) {
    combined += getValueByAccessorID(isoCode, challenge.accessorId)?.amount ?? 0
  }
  const balanced =
    !!target &&
    combined >= target.amount * (1 - challenge.tolerance) &&
    combined <= target.amount * (1 + challenge.tolerance)

  if (target) {
    const ratio = combined / target.amount
    scalesResult.value = {
      ratio,
      offBy: Math.round(Math.abs(ratio - 1) * 100),
      balanced,
      targetDisplay: formatAmount(target),
      combinedDisplay: formatAmount({ ...target, amount: combined }),
    }
  }

  // No map.reveal here — the beam card carries the verdict; the country
  // dossier would just shout the target's population over it
  gameStore.map.status = balanced ? 'correct' : 'incorrect'

  update({
    event: 'submit-final-challenge-answer',
    submittedAnswer: {
      _type: 'scales-challenge',
      isoCodes: [...scalesPicks.value],
    },
  })
}

const onNocturneFinished = (namedCities: string[]) => {
  const challenge = currentFinalChallenge.value
  if (challenge?._type !== 'city-nocturne-challenge') return

  nocturneResult.value = namedCities
  gameStore.map.status = namedCities.length >= challenge.quota ? 'correct' : 'incorrect'

  update({
    event: 'submit-final-challenge-answer',
    submittedAnswer: {
      _type: 'city-nocturne-challenge',
      namedCities,
    },
  })
}

const onSunsetFinished = (named: ISOCountryCode[], inPlay: ISOCountryCode[]) => {
  const challenge = currentFinalChallenge.value
  if (challenge?._type !== 'sunset-blitz-challenge') return

  sunsetResult.value = { named, inPlay, quota: sunsetQuota(challenge) }
  gameStore.map.status = named.length >= sunsetResult.value.quota ? 'correct' : 'incorrect'

  update({
    event: 'submit-final-challenge-answer',
    submittedAnswer: {
      _type: 'sunset-blitz-challenge',
      namedCountries: named,
    },
  })
}

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
    case 'born-challenge':
      {
        if (!isValidISOCode(isoCode)) {
          return console.error(`Unsupported country: ${isoCode}`)
        }
        const { year, quota } = currentFinalChallenge.value
        if (bornPicks.value.includes(isoCode)) return

        const qualifies = (COUNTRIES[isoCode].government.independence?.amount ?? 0) > year

        // A qualifying pick lights up with its year and the hunt continues;
        // a wrong one ends the round on the spot
        if (qualifies) {
          bornPicks.value.push(isoCode)
          gameStore.map.highlighted.add(isoCode)
          if (bornPicks.value.length < quota) return
        }

        for (const country of Object.values(COUNTRIES)) {
          if ((country.government.independence?.amount ?? 0) > year) {
            gameStore.map.highlighted.add(country.isoCode)
          }
        }
        gameStore.map.status = qualifies ? 'correct' : 'incorrect'
        update({
          event: 'submit-final-challenge-answer',
          submittedAnswer: {
            _type: 'born-challenge',
            isoCodes: [...bornPicks.value],
          },
        })
      }
      break
    case 'made-challenge':
      {
        if (!isValidISOCode(isoCode)) {
          return console.error(`Unsupported country: ${isoCode}`)
        }
        const { commodity } = currentFinalChallenge.value

        for (const country of Object.values(COUNTRIES)) {
          if ((country.economics.exports ?? []).includes(commodity)) {
            gameStore.map.highlighted.add(country.isoCode)
          }
        }

        gameStore.map.status = gameStore.map.highlighted.has(isoCode) ? 'correct' : 'incorrect'
        madeRevealTimeout = setTimeout(() => (madeRevealReady.value = true), 1200)

        update({
          event: 'submit-final-challenge-answer',
          submittedAnswer: {
            _type: 'made-challenge',
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
    case 'scales-challenge':
      {
        const challenge = currentFinalChallenge.value
        if (!isValidISOCode(isoCode) || isoCode === challenge.target) return

        // Toggle the pick; the panel's Weigh in submits
        const picked = scalesPicks.value.indexOf(isoCode)
        if (picked >= 0) {
          scalesPicks.value.splice(picked, 1)
          gameStore.map.highlighted.delete(isoCode)
        } else if (scalesPicks.value.length < challenge.maxPicks) {
          scalesPicks.value.push(isoCode)
          gameStore.map.highlighted.add(isoCode)
        }
      }
      break
    case 'sunset-blitz-challenge':
    case 'city-nocturne-challenge':
      // Typed modes — the map is scenery while the night holds
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
  if (madeRevealTimeout) clearTimeout(madeRevealTimeout)
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

// Lives live in the corner — glanceable, out of the question's way
.hearts {
  top: 1.2rem;
  right: 1.2rem;
  position: absolute;
  padding: 0.4rem 1rem;
  transition: opacity var(--motion-base) var(--ease-smooth);

  &.dimmed {
    opacity: 0.4;
  }

  .heart {
    color: hsla(9.8, 81.3%, 60.2%, 1);
    margin-right: 0.2rem;

    &:last-child {
      margin-right: 0;
    }

    &.spent {
      opacity: 0.25;
    }
  }
}

.result {
  margin-top: 4rem;
}

.lives-line {
  display: block;
  opacity: 0.75;
  margin-top: 0.6rem;
}

.sunset-fade-leave-active {
  transition: opacity 0.9s var(--ease-smooth);
}

.sunset-fade-leave-to {
  opacity: 0;
}

// Compact phone chrome: tighter prompt padding, footer clear of the home
// indicator.
@media screen and (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }
}
</style>
