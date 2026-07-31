<template>
  <div v-if="challenge" class="anthem-challenge challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Opening Ceremony`"
      title="Whose anthem is this?"
      :stakes="`A national anthem plays for ${challenge.durationSeconds} seconds — buzz in early for more points. Hints arrive as it runs, and a wrong buzz locks you out for a moment.`"
      @done="onInterstitialDone"
    />

    <ChallengePrompt :hint="hint">
      <template v-if="!resolved">
        <h1 class="map-caption">Whose anthem is this?</h1>
        <span class="map-caption sub">Earlier answers score higher</span>
      </template>
      <template v-else>
        <h1 class="map-caption">It was {{ countryName(challenge.country) }}</h1>
        <span class="map-caption sub">{{ anthem?.title ?? 'The anthem' }}</span>
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

      <ul v-if="!resolved" class="hints">
        <li v-if="unlocked.region && challenge.region" class="hint-chip">
          Region: {{ challenge.region }}
        </li>
        <li v-if="unlocked.swatches && challenge.swatches?.length" class="hint-chip swatch-chip">
          Flag:
          <span
            v-for="colour in challenge.swatches"
            :key="colour"
            class="swatch"
            :style="{ '--swatch': colour }"
          />
        </li>
        <li v-if="unlocked.initial && challenge.initial" class="hint-chip">
          Starts with “{{ challenge.initial }}”
        </li>
      </ul>
    </section>

    <footer v-if="!resolved" class="suggest-berth">
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      <div class="guess-box">
        <ChallengeConsole class="console" :value="secondsLeft" :total="challenge.durationSeconds">
          <CountryGuessInput
            ref="guessInput"
            :disabled="submitted || !started || lockedOut"
            :placeholder="lockedOut ? 'Locked out…' : 'Buzz in — type the country'"
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
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { ANTHEMS } from '~~/data/anthems.gen'
import { BORDERS } from '~~/data/borders.gen'
import { countryName } from '~~/lib/country'
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
} = useBuzzRound('anthem-buzz-challenge', {
  isCorrect: (active, isoCode) => active.country === isoCode,
  maximumPoints: active => active.maximumPoints,
  lockoutHint: name => `Not ${name} — locked out for 3 seconds`,
  onResolve: () => {
    const active = challenge.value
    if (!active) return
    // Land the answer as a place, not just a name — the country framed among
    // its neighbours, same as the silhouette reveal.
    const neighbours = BORDERS[active.country] ?? []
    gameStore.map.labels = true
    gameStore.map.reveal = active.country
    gameStore.map.focus = [active.country]
    gameStore.map.focusContext = neighbours
    gameStore.map.tints[active.country] = 'optimal'
    for (const neighbour of neighbours) gameStore.map.tints[neighbour] = 'inefficient'
  },
})

const dock = ref<InstanceType<typeof AudioDock>>()
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const anthem = computed(() => (challenge.value ? ANTHEMS[challenge.value.country] : undefined))

/** The interstitial tap IS the gesture that unblocks autoplay — start the clip
 *  and the clock together, from inside that same user event. */
const onInterstitialDone = () => {
  begin(() => {
    dock.value?.play()
    nextTick(() => guessInput.value?.focus({ auto: true }))
  })
}

// A clip that is still buffering when the tap lands: arm the round the moment
// it becomes playable rather than dropping the tap entirely.
watch(audioReady, ready => {
  if (ready && !showInterstitial.value && !started.value) onInterstitialDone()
})

const onGuess = (country: Country) => {
  const verdict = guess(country.isoCode, countryName(country.isoCode))
  if (verdict === 'correct') dock.value?.stop()
  if (verdict === 'wrong') {
    setTimeout(() => guessInput.value?.focus(), 3000)
  }
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

.hint-chip {
  gap: 0.6rem;
  display: flex;
  padding: 0.5rem 1.2rem;
  font-size: 1.3rem;
  font-weight: 600;
  align-items: center;
  border-radius: 2rem;
  color: var(--soft-blue);
  background: #{milk(0.6)};
  animation: chip-in var(--motion-quick) var(--ease-out-expressive) both;
}

.swatch {
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  background: var(--swatch);
  border: 1px solid #{ink(0.2)};
}
</style>
