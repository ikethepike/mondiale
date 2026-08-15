<template>
  <div v-if="challenge" class="mother-tongue challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Mother Tongue`"
      :title="motherTongueQuestion(challenge)"
      :stakes="motherTongueStakes(challenge)"
      @done="start"
    />

    <ChallengePrompt :hint="hint" :hint-tone="hintTone" :attributions="promptSources">
      <h1 class="map-caption">{{ motherTongueQuestion(challenge) }}</h1>
      <span class="map-caption sub">
        {{ found.length }} of {{ challenge.countries.length }} found
      </span>
    </ChallengePrompt>

    <footer ref="consoleFooter" class="suggest-berth">
      <TransitionGroup ref="trail" tag="ol" name="chain" class="country-chip-list rail">
        <CountryChip
          v-for="isoCode in guesses"
          :key="isoCode"
          class="map-caption"
          :class="{ stray: !answerSet.has(isoCode) }"
          :country="getCountry(isoCode)"
        />
      </TransitionGroup>
      <div class="guess-box">
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
        <ChallengeConsole class="console" :value="secondsLeft" :total="challenge.durationSeconds">
          <CountryGuessInput
            ref="guessInput"
            :disabled="submitted || !started"
            :excluded="guesses"
            placeholder="Type a country that speaks it…"
            @guess="onGuess"
            @miss="announce({ hint: 'No country by that name' })"
          />
        </ChallengeConsole>
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import {
  motherTongueQuestion,
  motherTongueScope,
  motherTongueStakes,
  speaksButOffBoard,
} from '~~/lib/language-rounds'
import { useChipTrail } from '~~/lib/use-chip-trail'
import { useCollectSetRound } from '~~/lib/use-collect-set-round'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { datasetAttribution } from '~~/lib/attribution'

const promptSources = datasetAttribution('countries')

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  begin,
  hint,
  hintTone,
  announce,
  entries,
  submitOnce,
  gameStore,
} = useGroupChallenge('mother-tongue-challenge', { solo: false })

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

// The camera frames the found countries above the console (and the keyboard)
const consoleFooter = ref<HTMLElement>()
useFooterBerth(consoleFooter)

const { guesses, answerSet, found, start, onGuess } = useCollectSetRound(
  { submitted, started, announce, submitOnce, begin, gameStore },
  {
    answers: () => challenge.value?.countries ?? [],
    wrongHint: country =>
      `${countryName(country)} doesn't speak ${challenge.value?.language ?? 'it'}`,
    // A speaker standing off the board is RIGHT about the world and wrong only
    // about this round, so it bounces free instead of costing a point — and it
    // says so, because being told "Burundi doesn't speak French" is a lie.
    // Terra Incognita refuses this hook for the opposite reason: a free bounce
    // there would leak a country that hasn't vanished yet.
    reject: country => {
      const round = challenge.value
      if (!round || !speaksButOffBoard(round, country.isoCode)) return undefined
      return `${countryName(country)} does speak ${round.language} — but this round is ${motherTongueScope(round)}`
    },
    focusInput: () => guessInput.value?.focus({ auto: true }),
  }
)

// The caught names ride the phone's one-row rail — it follows the newest.
const { trail } = useChipTrail(() => guesses.value.length)
</script>
<!-- Chips, list layout and the chain landing all come from shared templates. -->
<style lang="scss" scoped>
// Caught chips over the console — the input holds the bottom edge.
footer {
  gap: 1.2rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}
</style>
