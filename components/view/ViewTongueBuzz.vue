<template>
  <div v-if="challenge" class="tongue-challenge challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Mother Tongue`"
      title="What language is this?"
      :stakes="`Someone speaks for ${challenge.durationSeconds} seconds. Name ANY country where that language is official — there is more than one right answer. Buzz early for more points.`"
      @done="onInterstitialDone"
    />

    <ChallengePrompt :hint="hint">
      <template v-if="!resolved">
        <h1 class="map-caption">Where is this spoken?</h1>
        <span class="map-caption sub">Any country with it as an official language counts</span>
      </template>
      <template v-else>
        <h1 class="map-caption">That was {{ challenge.language }}</h1>
        <span class="map-caption sub">
          Official in {{ challenge.countries.length }}
          {{ challenge.countries.length === 1 ? 'country' : 'countries' }}
        </span>
      </template>
    </ChallengePrompt>

    <section class="stage">
      <AudioDock
        ref="dock"
        :clip="challenge.clip"
        :fraction="remainingFraction"
        :label="resolved ? 'That was it' : 'Listening…'"
        ended-label="Clip finished — the clock is still running"
        @ready="audioReady = true"
      />

      <ul v-if="!resolved && unlocked.region && challenge.region" class="hints">
        <li class="hint-chip">One of them is in {{ challenge.region }}</li>
      </ul>

      <ol v-if="resolved" class="country-chip-list answers" aria-label="Every correct answer">
        <CountryChip
          v-for="isoCode in challenge.countries"
          :key="isoCode"
          class="map-caption"
          :country="getCountry(isoCode)"
        />
      </ol>
    </section>

    <footer v-if="!resolved" class="suggest-berth">
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      <div class="guess-box">
        <ChallengeConsole class="console" :value="secondsLeft" :total="challenge.durationSeconds">
          <CountryGuessInput
            ref="guessInput"
            :disabled="submitted || !started || lockedOut"
            :placeholder="lockedOut ? 'Locked out…' : 'Buzz in — name a country'"
            @guess="onGuess"
            @miss="announce({ hint: 'No country by that name' })"
          />
        </ChallengeConsole>
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import AudioDock from '~/components/challenge/AudioDock.vue'
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { speaksTongue } from '~~/lib/challenges'
import { countryName, getCountry } from '~~/lib/country'
import { useBuzzRound } from '~~/lib/use-buzz-round'
import type { Country } from '~~/types/geography.types'

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  remainingFraction,
  hint,
  announce,
  entries,
  gameStore,
  resolved,
  lockedOut,
  audioReady,
  unlocked,
  begin,
  guess,
} = useBuzzRound('tongue-buzz-challenge', {
  // The same predicate the server verifies with — a second membership test
  // here would drift the moment the answer set grows a qualifier.
  isCorrect: (active, isoCode) => speaksTongue(active, isoCode),
  maximumPoints: active => active.maximumPoints,
  lockoutHint: name => `${name} doesn't have it as an official language`,
  onResolve: () => {
    const active = challenge.value
    if (!active) return
    // Light up every correct country at once — the whole point of the round is
    // that the answer was a set.
    gameStore.map.labels = true
    gameStore.map.focus = active.countries
    for (const isoCode of active.countries) gameStore.map.tints[isoCode] = 'optimal'
  },
})

const dock = ref<InstanceType<typeof AudioDock>>()
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const onInterstitialDone = () => {
  begin(() => {
    dock.value?.play()
    nextTick(() => guessInput.value?.focus({ auto: true }))
  })
}

watch(audioReady, ready => {
  if (ready && !showInterstitial.value && !started.value) onInterstitialDone()
})

const onGuess = (country: Country) => {
  const verdict = guess(country.isoCode, countryName(country.isoCode))
  if (verdict === 'correct') dock.value?.stop()
  if (verdict === 'wrong') setTimeout(() => guessInput.value?.focus(), 3000)
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.stage {
  flex: 1;
  gap: 1.4rem;
  display: flex;
  min-height: 0;
  padding: 1rem 0;
  align-items: center;
  flex-flow: column nowrap;
  justify-content: center;
}

.hints {
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  display: flex;
  list-style: none;
  flex-flow: row wrap;
  pointer-events: auto;
  justify-content: center;
}

// The answer roll sits clear of the dock's caption rather than under it.
.answers {
  margin-top: 1.6rem;
}

.hint-chip {
  padding: 0.5rem 1.2rem;
  font-size: 1.3rem;
  font-weight: 600;
  border-radius: 2rem;
  color: var(--soft-blue);
  background: #{milk(0.6)};
  animation: chip-in var(--motion-quick) var(--ease-out-expressive) both;
}
</style>
