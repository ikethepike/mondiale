<template>
  <div class="view-final-challenge challenge-shell">
    <GauntletIntro
      v-if="showInterstitial"
      :questions="totalChallengeCount"
      :lives="livesRemaining"
      @done="showInterstitial = false"
    />
    <ChallengePrompt :class="{ dimmed: status }" :attributions="promptSources">
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
          <!-- The live beat's endonym rides the top of a staggered card deck —
               the fanned cards behind it are the endonyms still to come -->
          <Transition name="caption" mode="out-in">
            <span v-if="currentEndonym" :key="currentEndonym" class="endonym-deck">
              <span
                v-for="layer in endonymCardsBehind"
                :key="layer"
                class="deck-card map-caption"
                :style="{ '--layer': layer }"
                aria-hidden="true"
              />
              <span class="endonym-word map-caption">“{{ currentEndonym }}”</span>
            </span>
          </Transition>
        </div>
      </Transition>
    </ChallengePrompt>
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
    <!-- The easel stays up through the reveal — the true border draws itself
         in over the attempt before the next question sweeps both away -->
    <FinalBoundary
      v-if="currentFinalChallenge?._type === 'boundary-challenge' && !showInterstitial"
      :key="`boundary-${currentChallengeCount}`"
      :challenge="currentFinalChallenge"
      :revealed="!!status"
      @finished="onBoundaryFinished"
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
    <!-- Endonym: hits wear the country's own name for the rest of the round;
         the reveal extends the chips to the whole dealt deck -->
    <MapYearLabels
      v-if="currentFinalChallenge?._type === 'endonym-challenge' && endonymLabelEntries.length"
      :entries="endonymLabelEntries"
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
      <EndonymReveal
        v-if="currentFinalChallenge?._type === 'endonym-challenge'"
        :challenge="currentFinalChallenge"
        :picks="endonymPicks"
      />
      <template v-if="lesson">{{ lesson }}</template>
      <span v-if="livesLine" class="lives-line">{{ livesLine }}</span>
    </ChallengeResult>
  </div>
</template>
<script lang="ts" setup>
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import FinalBoundary from '~/components/challenge/FinalBoundary.vue'
import FinalCityNocturne from '~/components/challenge/FinalCityNocturne.vue'
import FinalScales, { type ScalesResult } from '~/components/challenge/FinalScales.vue'
import FinalSunsetBlitz from '~/components/challenge/FinalSunsetBlitz.vue'
import EndonymReveal from '~/components/challenge/EndonymReveal.vue'
import MadeReveal from '~/components/challenge/MadeReveal.vue'
import MapYearLabels from '~/components/challenge/MapYearLabels.vue'
import NocturneReveal from '~/components/challenge/NocturneReveal.vue'
import SunsetReveal from '~/components/challenge/SunsetReveal.vue'
import OrganizationLogo from '~/components/challenge/OrganizationLogo.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import GauntletIntro from '~/components/feedback/GauntletIntro.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { attributionFor, datasetAttribution, type Attribution } from '~~/lib/attribution'
import {
  bornAfter,
  boundaryStory,
  COLOR_CODED_REGIONS,
  exportsCommodity,
  FINAL_STAT_LABELS,
  GAUNTLET_LIVES,
  getFinalChallengeDetails,
  isCorrectFinalAnswer,
  speaksLanguage,
  sunsetQuota,
  weighScalesPicks,
} from '~~/lib/challenges/final-challenge'
import { countryEndonym, countryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { playableCountries } from '~~/lib/game-rules'
import { titlecaseLeader } from '~~/lib/leaders'
import { formatAmount } from '~~/lib/number'
import { getValueByAccessorID } from '~~/lib/values'
import { REGION_LABELS } from '~~/lib/variant'
import type { FinalChallengeAnswer } from '~~/types/challenges/final-challenge.type'
import { isMapClickEvent } from '~~/types/events.types'
import { type ISOCountryCode, isValidISOCode, type Region } from '~~/types/geography.types'

const { currentFinalChallenge, clearBoard, update, gameStore, currentMove, game } =
  useClientEvents()

const status = toRef(gameStore.map, 'status')

const gauntlet = computed(() => {
  if (currentMove.value?.challenge?._type !== 'final-challenge') return undefined
  return currentMove.value.challenge
})

/** The result beat's verdict — the same shared function the server runs. */
const checkAnswer = (submittedAnswer: FinalChallengeAnswer): boolean => {
  const challenge = currentFinalChallenge.value
  if (!challenge) return false
  return isCorrectFinalAnswer({
    challenge,
    submittedAnswer,
    pool: game.value ? playableCountries(game.value) : [],
  })
}

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

// Endonym: one pick per answered beat — the current beat is the array length
const endonymPicks = ref<ISOCountryCode[]>([])

const currentEndonym = computed(() => {
  const challenge = currentFinalChallenge.value
  if (challenge?._type !== 'endonym-challenge' || status.value) return undefined
  const isoCode = challenge.countries[endonymPicks.value.length]
  return isoCode ? countryEndonym(isoCode) : undefined
})

// The fanned cards behind the live one — the endonyms still to come
const endonymCardsBehind = computed(() => {
  const challenge = currentFinalChallenge.value
  if (challenge?._type !== 'endonym-challenge') return 0
  return Math.max(0, challenge.countries.length - endonymPicks.value.length - 1)
})

// Endonym chips: during the hunt only hit beats wear the country's own name;
// at the reveal the whole dealt deck does
const endonymLabelEntries = computed(() => {
  const challenge = currentFinalChallenge.value
  if (challenge?._type !== 'endonym-challenge') return []
  const revealAll = !!status.value
  return challenge.countries
    .filter((isoCode, beat) => revealAll || endonymPicks.value[beat] === isoCode)
    .map(isoCode => ({ isoCode, label: countryEndonym(isoCode)! }))
})

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
        bornAfter(country.isoCode, challenge.year) &&
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
      // A value tie can crown a country other than the dealt extreme — teach
      // the one the player actually answered with.
      const answered =
        status.value === 'correct' && lastGuess.value ? lastGuess.value : challenge.country
      const answer = getValueByAccessorID(answered, challenge.accessorId)
      if (!answer) return undefined
      const answerLine = `${countryName(COUNTRIES[answered])}: ${formatAmount(answer)} ${label.toLowerCase()}`
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
        speaksLanguage(country.isoCode, challenge.language)
      ).length
      return `${challenge.language} is spoken in ${speakers} ${speakers === 1 ? 'country' : 'countries'} — they stay lit on the map.`
    }
    case 'membership-challenge': {
      return status.value === 'correct'
        ? `${countryName(COUNTRIES[challenge.exception])} is the odd one out.`
        : `The odd one out was ${countryName(COUNTRIES[challenge.exception])}.`
    }
    case 'born-challenge': {
      const qualifying = Object.values(COUNTRIES).filter(country =>
        bornAfter(country.isoCode, challenge.year)
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
    case 'boundary-challenge': {
      // The border's story where the atlas has one; the easel overlay is the
      // visual lesson either way
      const [first, second] = challenge.countries
      return (
        boundaryStory(challenge.countries) ??
        `The real ${countryName(COUNTRIES[first])}–${countryName(COUNTRIES[second])} line draws itself in over yours.`
      )
    }
    case 'endonym-challenge':
      // EndonymReveal carries the whole scorecard
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

/** Where the current gate's question comes from, by challenge kind. The
 *  reveal cards (sunset, nocturne, made) carry their own credit rows. */
const promptSources = computed<Attribution[] | undefined>(() => {
  const active = currentFinalChallenge.value
  if (!active) return undefined
  switch (active._type) {
    case 'scales-challenge':
    case 'max-challenge':
    case 'min-challenge':
      return [attributionFor(active.accessorId)]
    case 'membership-challenge':
    case 'language-challenge':
    case 'made-challenge':
    case 'region-challenge':
      return datasetAttribution('countries')
    case 'leadership-challenge':
      return datasetAttribution('leaders')
    case 'born-challenge':
    case 'endonym-challenge':
      return datasetAttribution('countries')
    case 'sunset-blitz-challenge':
    case 'city-nocturne-challenge':
      return datasetAttribution('cities')
    case 'boundary-challenge':
      return datasetAttribution('map')
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
  // The world behind the easel goes silhouette — its drawn borders would
  // hand the boundary round its answer
  gameStore.map.solo = challenge?._type === 'boundary-challenge'
}

watch(currentFinalChallenge, (challenge, previous) => {
  // Every server snapshot rebuilds the game object, so the SAME unchanged
  // challenge routinely arrives with a fresh identity (another player's event,
  // a spectator joining). Resetting on identity alone blanked map.focus
  // mid-round — the camera watcher then world-fit the globe in the middle of
  // a running sunset blitz. Only an actual challenge change may reset.
  if (JSON.stringify(challenge) === JSON.stringify(previous)) return

  gameStore.map.reveal = undefined
  gameStore.map.revealStat = undefined
  gameStore.map.status = undefined
  gameStore.map.highlighted.clear()
  gameStore.map.tints = {}
  gameStore.map.focus = []
  gameStore.map.focusContext = []
  lastGuess.value = undefined
  scalesPicks.value = []
  scalesResult.value = undefined
  sunsetResult.value = undefined
  nocturneResult.value = undefined
  bornPicks.value = []
  endonymPicks.value = []
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

  const weighed = weighScalesPicks(challenge, scalesPicks.value)
  if (weighed) {
    const ratio = weighed.combined / weighed.target.amount
    scalesResult.value = {
      ratio,
      offBy: Math.round(Math.abs(ratio - 1) * 100),
      balanced: weighed.balanced,
      targetDisplay: formatAmount(weighed.target),
      combinedDisplay: formatAmount({ ...weighed.target, amount: weighed.combined }),
    }
  }

  const submittedAnswer: FinalChallengeAnswer = {
    _type: 'scales-challenge',
    isoCodes: [...scalesPicks.value],
  }
  // No map.reveal here — the beam card carries the verdict; the country
  // dossier would just shout the target's population over it
  gameStore.map.status = checkAnswer(submittedAnswer) ? 'correct' : 'incorrect'

  update({ event: 'submit-final-challenge-answer', submittedAnswer })
}

const onNocturneFinished = (namedCities: string[]) => {
  const challenge = currentFinalChallenge.value
  if (challenge?._type !== 'city-nocturne-challenge') return

  nocturneResult.value = namedCities
  const submittedAnswer = { _type: 'city-nocturne-challenge', namedCities } as const
  gameStore.map.status = checkAnswer(submittedAnswer) ? 'correct' : 'incorrect'

  update({ event: 'submit-final-challenge-answer', submittedAnswer })
}

const onBoundaryFinished = (drawn: [number, number][]) => {
  const challenge = currentFinalChallenge.value
  if (challenge?._type !== 'boundary-challenge') return

  const submittedAnswer = { _type: 'boundary-challenge', drawn } as const
  gameStore.map.status = checkAnswer(submittedAnswer) ? 'correct' : 'incorrect'

  update({ event: 'submit-final-challenge-answer', submittedAnswer })
}

const onSunsetFinished = (named: ISOCountryCode[], inPlay: ISOCountryCode[]) => {
  const challenge = currentFinalChallenge.value
  if (challenge?._type !== 'sunset-blitz-challenge') return

  sunsetResult.value = { named, inPlay, quota: sunsetQuota(challenge) }
  const submittedAnswer = { _type: 'sunset-blitz-challenge', namedCountries: named } as const
  gameStore.map.status = checkAnswer(submittedAnswer) ? 'correct' : 'incorrect'

  update({ event: 'submit-final-challenge-answer', submittedAnswer })
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

        const submittedAnswer = { _type: 'region-challenge', region: selectedRegion } as const

        gameStore.map.reveal = currentFinalChallenge.value.country
        gameStore.map.status = checkAnswer(submittedAnswer) ? 'correct' : 'incorrect'

        update({ event: 'submit-final-challenge-answer', submittedAnswer })
      }
      break
    case 'max-challenge':
    case 'min-challenge':
    case 'leadership-challenge': {
      const submittedAnswer: FinalChallengeAnswer = {
        _type: currentFinalChallenge.value._type,
        isoCode: isoCode as ISOCountryCode, // We check this in the backend
      }
      const correct = checkAnswer(submittedAnswer)
      // Stat ties share the podium — reveal the country the player actually
      // got right, not the dealt extreme it happens to equal.
      const revealIso =
        correct && isValidISOCode(isoCode) ? isoCode : currentFinalChallenge.value.country
      gameStore.map.reveal = revealIso
      gameStore.map.status = correct ? 'correct' : 'incorrect'

      // Surface the stat on the reveal card — the number is the lesson
      if (currentFinalChallenge.value._type !== 'leadership-challenge') {
        const { accessorId } = currentFinalChallenge.value
        const amount = getValueByAccessorID(revealIso, accessorId)
        if (amount) {
          gameStore.map.revealStat = {
            label: FINAL_STAT_LABELS[accessorId],
            value: formatAmount(amount),
          }
        }
      }

      update({ event: 'submit-final-challenge-answer', submittedAnswer })
      break
    }
    case 'language-challenge':
      {
        if (!isValidISOCode(isoCode)) {
          return console.error(`Unsupported country: ${isoCode}`)
        }

        for (const country of Object.values(COUNTRIES)) {
          if (!speaksLanguage(country.isoCode, currentFinalChallenge.value.language)) continue
          gameStore.map.highlighted.add(country.isoCode)
        }

        const submittedAnswer = { _type: 'language-challenge', isoCode } as const
        gameStore.map.status = checkAnswer(submittedAnswer) ? 'correct' : 'incorrect'

        update({ event: 'submit-final-challenge-answer', submittedAnswer })
      }
      break
    case 'born-challenge':
      {
        if (!isValidISOCode(isoCode)) {
          return console.error(`Unsupported country: ${isoCode}`)
        }
        const { year, quota } = currentFinalChallenge.value
        if (bornPicks.value.includes(isoCode)) return

        // A qualifying pick lights up with its year and the hunt continues;
        // a wrong one ends the round on the spot
        if (bornAfter(isoCode, year)) {
          bornPicks.value.push(isoCode)
          gameStore.map.highlighted.add(isoCode)
          if (bornPicks.value.length < quota) return
        }

        for (const country of Object.values(COUNTRIES)) {
          if (bornAfter(country.isoCode, year)) {
            gameStore.map.highlighted.add(country.isoCode)
          }
        }
        const submittedAnswer: FinalChallengeAnswer = {
          _type: 'born-challenge',
          isoCodes: [...bornPicks.value],
        }
        gameStore.map.status = checkAnswer(submittedAnswer) ? 'correct' : 'incorrect'
        update({ event: 'submit-final-challenge-answer', submittedAnswer })
      }
      break
    case 'endonym-challenge':
      {
        if (!isValidISOCode(isoCode)) {
          return console.error(`Unsupported country: ${isoCode}`)
        }
        const { countries, quota } = currentFinalChallenge.value
        const beat = endonymPicks.value.length
        if (beat >= countries.length) return
        // A tap on an already-hit country is a misclick, not an answer
        if (countries.some((iso, index) => endonymPicks.value[index] === iso && iso === isoCode)) {
          return
        }

        endonymPicks.value.push(isoCode)
        // A later hit may overwrite an earlier stray on the same country
        gameStore.map.tints[isoCode] = isoCode === countries[beat] ? 'optimal' : 'stray'

        const hits = countries.filter((iso, index) => endonymPicks.value[index] === iso).length
        const remaining = countries.length - endonymPicks.value.length
        // The verdict is still open — the next endonym takes the stage
        if (hits < quota && hits + remaining >= quota) return

        // Decided: surface the dealt countries the player never found
        for (const iso of countries) {
          gameStore.map.tints[iso] ??= 'inefficient'
        }
        const submittedAnswer: FinalChallengeAnswer = {
          _type: 'endonym-challenge',
          isoCodes: [...endonymPicks.value],
        }
        gameStore.map.status = checkAnswer(submittedAnswer) ? 'correct' : 'incorrect'
        update({ event: 'submit-final-challenge-answer', submittedAnswer })
      }
      break
    case 'made-challenge':
      {
        if (!isValidISOCode(isoCode)) {
          return console.error(`Unsupported country: ${isoCode}`)
        }
        const { commodity } = currentFinalChallenge.value

        for (const country of Object.values(COUNTRIES)) {
          if (exportsCommodity(country.isoCode, commodity)) {
            gameStore.map.highlighted.add(country.isoCode)
          }
        }

        const submittedAnswer = { _type: 'made-challenge', isoCode } as const
        gameStore.map.status = checkAnswer(submittedAnswer) ? 'correct' : 'incorrect'
        madeRevealTimeout = setTimeout(() => (madeRevealReady.value = true), 1200)

        update({ event: 'submit-final-challenge-answer', submittedAnswer })
      }
      break
    case 'membership-challenge':
      {
        const { exception } = currentFinalChallenge.value
        gameStore.map.highlighted.clear()

        const submittedAnswer = {
          _type: 'membership-challenge',
          isoCode: isoCode as ISOCountryCode,
        } as const
        gameStore.map.reveal = exception
        gameStore.map.status = checkAnswer(submittedAnswer) ? 'correct' : 'incorrect'

        update({ event: 'submit-final-challenge-answer', submittedAnswer })
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
    case 'boundary-challenge':
      // Off-map modes — the map is scenery while the easel or night holds
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
@use '~/assets/scss/rules/ink' as *;
// The gauntlet stacks its beats from the top (the result follows the
// question), not against both edges.
.view-final-challenge {
  justify-content: flex-start;
}

header {
  transition: opacity var(--motion-base) var(--ease-smooth);

  &.dimmed {
    opacity: 0.4;
  }
}

// The keyed swap wrapper inside the shared prompt column keeps the recipe —
// the whole beat (counter, logo, question) lifts away and settles as one.
header .prompt {
  gap: 1rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;

  h2 {
    margin: 0;
  }

  .counter {
    padding: 0.4rem 1.4rem;
  }

  // The endonym takes the stage on a card deck — the fanned cards behind it
  // count the names still to come, thinning as beats resolve
  .endonym-deck {
    position: relative;
    isolation: isolate;
    display: inline-block;

    // A tidy vertical pile: each card peeks straight out below the one above,
    // narrowing slightly so the stack tapers instead of reading as a shadow
    .deck-card {
      inset: 0;
      position: absolute;
      transform: translateY(calc(var(--layer) * 0.5rem)) scaleX(calc(1 - var(--layer) * 0.06));
    }

    .endonym-word {
      position: relative;
      z-index: 1;
      display: inline-block;
      padding: 0.5rem 1.8rem;
      font-size: 2.1rem;
    }
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
    color: flame();
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
</style>
