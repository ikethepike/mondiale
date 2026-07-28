<template>
  <div v-if="challenge" class="neighbour-blitz challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Neighbour Blitz`"
      :title="`Name ${countryName(challenge.country)}'s neighbours`"
      :stakes="`${challenge.neighbours.length} countries share a border with it — name as many as you can in ${challenge.durationSeconds} seconds. Wrong names cost points.`"
      @done="begin"
    />

    <ChallengePrompt :hint="hint">
      <h1 class="map-caption">Name {{ countryName(challenge.country) }}'s neighbours</h1>
      <span class="map-caption sub">
        {{ found.length }} of {{ challenge.neighbours.length }} found
      </span>
    </ChallengePrompt>

    <section class="guess-box">
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      <ChallengeConsole class="console" :value="secondsLeft" :total="challenge.durationSeconds">
        <CountryGuessInput
          ref="guessInput"
          :disabled="submitted || !started"
          :excluded="[challenge.country, ...guesses]"
          placeholder="Type a neighbour…"
          @guess="onGuess"
          @miss="announce({ hint: 'No country by that name' })"
        />
      </ChallengeConsole>
    </section>

    <footer>
      <TransitionGroup tag="ol" name="chain" class="country-chip-list">
        <CountryChip
          v-for="isoCode in guesses"
          :key="isoCode"
          class="map-caption"
          :class="{ stray: !neighbourSet.has(isoCode) }"
          :country="getCountry(isoCode)"
        />
      </TransitionGroup>
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
import { useCollectSetRound } from '~~/lib/use-collect-set-round'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'

// Shapes-only map: the centre country plus guesses materializing around it
const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  begin: beginRound,
  hint,
  announce,
  entries,
  submitOnce,
  gameStore,
} = useGroupChallenge('neighbour-blitz-challenge')

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const {
  guesses,
  answerSet: neighbourSet,
  found,
  start: begin,
  onGuess,
} = useCollectSetRound(
  { submitted, started, announce, submitOnce, begin: beginRound, gameStore },
  {
    answers: () => challenge.value?.neighbours ?? [],
    wrongHint: country =>
      `${countryName(country)} doesn't border ${challenge.value ? countryName(challenge.value.country) : 'it'}`,
    reject: country =>
      country.isoCode === challenge.value?.country
        ? `${countryName(country)} is the country itself`
        : undefined,
    // The centre country anchors the frame; guesses materialize around it.
    decorate: (tints, guessed) => {
      const active = challenge.value
      gameStore.map.highlighted.clear()
      if (active) {
        gameStore.map.highlighted.add(active.country)
        tints[active.country] = 'endpoint'
        for (const isoCode of guessed) gameStore.map.highlighted.add(isoCode)
      }
      gameStore.map.focus = active ? [active.country, ...guessed] : []
    },
    focusInput: () => guessInput.value?.focus(),
  }
)
</script>
<!-- Chips, list layout and the chain landing all come from shared templates. -->
