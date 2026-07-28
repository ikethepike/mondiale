<template>
  <div v-if="challenge" class="mother-tongue challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Mother Tongue`"
      :title="`Who speaks ${challenge.language}?`"
      :stakes="`${challenge.countries.length} countries have ${challenge.language} as an official language — name as many as you can in ${challenge.durationSeconds} seconds. Wrong guesses cost points.`"
      @done="start"
    />

    <ChallengePrompt :hint="hint">
      <h1 class="map-caption">Who speaks {{ challenge.language }}?</h1>
      <span class="map-caption sub">
        {{ found.length }} of {{ challenge.countries.length }} found
      </span>
    </ChallengePrompt>

    <section class="guess-box">
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
    </section>

    <footer>
      <TransitionGroup tag="ol" name="chain" class="found-list">
        <li
          v-for="isoCode in guesses"
          :key="isoCode"
          class="stop map-caption"
          :class="{ stray: !answerSet.has(isoCode) }"
        >
          <CountryFlag class="stop-flag" :country="getCountry(isoCode)" mode="background" />
          <span>{{ countryName(isoCode) }}</span>
        </li>
      </TransitionGroup>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useCollectSetRound } from '~~/lib/use-collect-set-round'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  begin,
  hint,
  announce,
  entries,
  submitOnce,
  gameStore,
} = useGroupChallenge('mother-tongue-challenge', { solo: false })

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const { guesses, answerSet, found, start, onGuess } = useCollectSetRound(
  { submitted, started, announce, submitOnce, begin, gameStore },
  {
    answers: () => challenge.value?.countries ?? [],
    wrongHint: country =>
      `${countryName(country)} doesn't speak ${challenge.value?.language ?? 'it'}`,
    focusInput: () => guessInput.value?.focus(),
  }
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;
.found-list {
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  justify-content: center;
}

.stop {
  gap: 0.7rem;
  display: flex;
  align-items: center;
  padding: 0.4rem 1.2rem;

  &.stray {
    opacity: 0.65;
    border-color: hsla(9.8, 81.3%, 60.2%, 0.6);
  }
}

.stop-flag {
  width: 2.6rem;
  height: 1.8rem;
  border: 0.1rem solid ink(0.25);
}

.chain-enter-from {
  opacity: 0;
  transform: translateY(0.8rem) scale(0.9);
}
.chain-enter-active,
.chain-move {
  transition:
    opacity var(--motion-quick) var(--ease-out-expressive),
    transform var(--motion-quick) var(--ease-out-expressive);
}

@media screen and (max-width: $tablet) {
  // Long answer lists scroll instead of swallowing the map and input.
  .found-list {
    max-height: 22dvh;
    overflow-y: auto;
    // .main-board kills pointer events — restore them or the list can't be
    // touch-scrolled at all.
    pointer-events: auto;
    overscroll-behavior: contain;
  }
}
</style>
