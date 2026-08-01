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
        idle-label="Tap play to start the round"
        :playing-label="resolved ? 'That was it' : 'Listening…'"
        ended-label="Tap to hear it again — the clock is still running"
        @started="onAudioStarted"
      />

      <!-- `hint` rather than `chain`: no -move rule, so an arriving chip can't
           shove its neighbours. Same landing as the anthem round. -->
      <!-- Same ladder as the anthem round: each chip lands as the clock crosses
           its threshold, narrowing the field without naming a country. -->
      <TransitionGroup v-if="!resolved" tag="ul" name="hint" class="hints">
        <li v-if="unlocked.region && challenge.region" key="region" class="hint-chip">
          One of them is in {{ challenge.region }}
        </li>
        <li v-if="unlocked.swatches && challenge.speakerCount" key="count" class="hint-chip">
          Official in {{ challenge.speakerCount }}
          {{ challenge.speakerCount === 1 ? 'country' : 'countries' }}
        </li>
        <!-- Seeing the language written is the strongest hint short of naming
             a country: the script alone rules most of the world out. -->
        <li v-if="unlocked.swatches && challenge.sample" key="sample" class="hint-chip sample-chip">
          <span class="sample-script">Written in {{ challenge.sample.script }}</span>
          <span class="sample-lines" :lang="challenge.sample.code">
            <span v-for="(line, index) in challenge.sample.lines" :key="index">{{ line }}</span>
          </span>
        </li>
        <li v-if="unlocked.initial && challenge.initial" key="initial" class="hint-chip">
          One starts with “{{ challenge.initial }}”
        </li>
      </TransitionGroup>

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
  unlocked,
  revealStage,
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

/** Show the stage and stop. The round never plays on its own: the player
 *  presses play, and only that starts the clip and the clock together. An
 *  autoplay attempt here would start the countdown on desktop while iOS sat
 *  silent — the same round running two different ways. */
const onInterstitialDone = () => revealStage()

/** The clock hangs off audio genuinely playing, never off a load event, so a
 *  slow download or a withheld autoplay can't eat anyone's buzz time. */
const onAudioStarted = () => {
  begin(() => nextTick(() => guessInput.value?.focus({ auto: true })))
}

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

// Reserves a chip's height from the start, so the first arrival lands in space
// already held rather than pushing the stage around it.
.hints {
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  display: flex;
  min-height: 3rem;
  list-style: none;
  align-items: center;
  flex-flow: row wrap;
  pointer-events: auto;
  justify-content: center;
}

// The answer roll sits clear of the dock's caption rather than under it.
.answers {
  margin-top: 1.6rem;
}

// The written sample is a block rather than a line: two lines of script need
// room to be read, not squeezed onto a pill.
.sample-chip {
  gap: 0.4rem;
  flex-flow: column nowrap;
  align-items: flex-start;
  padding: 0.7rem 1.2rem;
}

.sample-script {
  font-size: 1.1rem;
  opacity: 0.75;
}

.sample-lines {
  gap: 0.15rem;
  display: flex;
  font-size: 1.5rem;
  line-height: 1.4;
  flex-flow: column nowrap;
  color: var(--dark-blue);
}

.hint-chip {
  padding: 0.5rem 1.2rem;
  font-size: 1.3rem;
  font-weight: 600;
  border-radius: 2rem;
  color: var(--soft-blue);
  background: #{milk(0.6)};
  // Entrance belongs to the TransitionGroup, not to the chip — a CSS animation
  // here would replay on every re-render and fight the landing.
}
</style>
