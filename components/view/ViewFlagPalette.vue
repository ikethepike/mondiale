<template>
  <div v-if="challenge" class="flag-palette">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Flag Palette`"
      title="Whose flag is this?"
      stakes="Only the colours — no flag. Name the country before the clock runs out. First correct guess wins the points."
      @done="start"
    />

    <header>
      <div class="prompt">
        <h1 class="map-caption">Whose flag has these colours?</h1>
        <span class="map-caption sub">{{ secondsLeft }}s left</span>
        <span v-if="regionRevealed && challenge.region" class="map-caption region-hint">
          Region: {{ challenge.region }}
        </span>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
      </div>
    </header>

    <section class="stage">
      <div class="swatches" aria-hidden="true">
        <span
          v-for="(color, index) in challenge.swatches"
          :key="index"
          class="swatch"
          :style="{ background: color }"
        />
      </div>

      <!-- Opponents' live guesses land here as pawns on their pick -->
      <TransitionGroup tag="ul" name="guess" class="live-guesses">
        <li v-for="[playerId, iso] in opponentGuesses" :key="playerId" class="live-guess">
          <PlayerPawn v-if="playerFor(playerId)" class="guess-pawn" :player="playerFor(playerId)!" />
          <span class="guess-name">{{ countryName(iso) }}</span>
        </li>
      </TransitionGroup>
    </section>

    <footer>
      <div class="timer-track" aria-hidden="true">
        <div
          class="timer-fill"
          :style="{ width: `${(secondsLeft / challenge.durationSeconds) * 100}%` }"
        />
      </div>
      <CountryGuessInput
        ref="guessInput"
        :disabled="submitted || !started"
        placeholder="Name the country…"
        @guess="onGuess"
        @miss="flashHint('No country by that name')"
      />
    </footer>
  </div>
</template>
<script lang="ts" setup>
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import { countryName } from '~~/lib/country'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { Country } from '~~/types/geography.types'

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  begin,
  submitOnce,
  registerCleanup,
  gameStore,
  update,
} = useGroupChallenge('flag-palette-challenge')

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

// The region hint (non-hard mode) surfaces only in the final third of the
// clock — a late nudge as time runs out, not a giveaway from the start.
const regionRevealed = computed(() => {
  const total = challenge.value?.durationSeconds ?? 0
  return started.value && total > 0 && secondsLeft.value / total <= 1 / 3
})

// Opponents' live picks (from the ephemeral player-guessing broadcast).
const opponentGuesses = computed(() => Object.entries(gameStore.map.liveGuesses))
const playerFor = (playerId: string) => gameStore.game?.players[playerId]

const submitRound = (correct: boolean) => {
  if (submitted.value) return
  gameStore.map.status = correct ? 'correct' : undefined
  submitOnce(correct && challenge.value ? [challenge.value.country] : [], correct ? challenge.value?.maximumPoints ?? 0 : 0)
}

const start = () => {
  begin({ onTimeout: () => submitRound(false) })
  nextTick(() => guessInput.value?.focus())
}

const hint = ref('')
let hintTimer: ReturnType<typeof setTimeout> | undefined
const flashHint = (text: string) => {
  hint.value = text
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => (hint.value = ''), 2000)
}
registerCleanup(() => hintTimer && clearTimeout(hintTimer))

const onGuess = (country: Country) => {
  const active = challenge.value
  if (!active || submitted.value || !started.value) return

  // Broadcast this pick so opponents see it land live.
  update({ event: 'player-guessing', isoCode: country.isoCode })

  if (country.isoCode === active.country) {
    submitRound(true)
  } else {
    flashHint(`${countryName(country)} — not it`)
  }
}

// A wrong typed guess doesn't end the round — players keep trying until they
// get it or the clock runs out; only the first correct guess scores.
</script>
<style lang="scss" scoped>
.flag-palette {
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  display: flex;
  position: absolute;
  flex-flow: column nowrap;
  justify-content: space-between;
}

header {
  z-index: 2;
  width: 100%;
  text-align: center;
  padding: 2rem 4rem;

  h1 {
    margin: 0;
    font-size: 3.2rem;
  }
  .sub,
  .hint {
    padding: 0.4rem 1.4rem;
  }
  .hint {
    color: var(--hior-ange);
  }
  .region-hint {
    padding: 0.4rem 1.4rem;
    color: var(--soft-blue);
    font-weight: 600;
  }
  .prompt {
    gap: 1rem;
    display: flex;
    align-items: center;
    flex-flow: column nowrap;
  }
}

.stage {
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
}

.swatches {
  display: flex;
  gap: 1.2rem;
  padding: 1.4rem;
  border-radius: 1.4rem;
  background: hsla(36, 100%, 98%, 0.85);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);
}

.swatch {
  width: min(8rem, 16vw);
  height: min(8rem, 16vw);
  border-radius: 1rem;
  box-shadow: inset 0 0 0 1px hsla(215.7, 76.4%, 21.6%, 0.15);
}

.live-guesses {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  justify-content: center;
  min-height: 3rem;
}

.live-guess {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.9rem;
  border-radius: 999px;
  font-size: 1.3rem;
  background: hsla(0, 0%, 100%, 0.55);
  border: 1px solid hsla(215.7, 76.4%, 21.6%, 0.15);

  .guess-pawn {
    width: 1.4rem;
    height: 1.8rem;
  }
}

footer {
  z-index: 2;
  padding: 2rem;
  // Lift clear of the viewport edge so the guess input's suggestion list
  // (which opens downward) isn't clipped off the bottom of the screen.
  // Scales with viewport height so it never steals too much room on short
  // screens, but always reserves enough on tall ones.
  padding-bottom: clamp(8rem, 24vh, 20rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;
}

.timer-track {
  width: 100%;
  max-width: 46rem;
  height: 0.5rem;
  border-radius: 0.25rem;
  background: hsla(215.7, 76.4%, 21.6%, 0.12);
  overflow: hidden;
}
.timer-fill {
  height: 100%;
  background: var(--soft-blue);
  transition: width 1s linear;
}

.guess-enter-from {
  opacity: 0;
  transform: translateY(0.6rem) scale(0.9);
}
.guess-enter-active,
.guess-move {
  transition:
    opacity var(--motion-quick) var(--ease-out-expressive),
    transform var(--motion-quick) var(--ease-out-expressive);
}
</style>
