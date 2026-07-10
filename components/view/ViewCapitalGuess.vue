<template>
  <div v-if="challenge" class="capital-guess">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Capital Guess`"
      title="What capital is this?"
      :stakes="stakes"
      @done="start"
    />

    <header>
      <div class="prompt">
        <h1 class="map-caption">Which country's capital is this?</h1>
        <span class="map-caption sub">{{ secondsLeft }}s left</span>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
      </div>
    </header>

    <section class="stage">
      <!-- Adaptive photo stage — any aspect ratio, never cropped; zoom + pan. -->
      <div class="photo-stage">
        <ZoomableImage :src="challenge.image" alt="A capital city" />
      </div>

      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </section>

    <!-- The free-type input opens a suggestion list downward, so that variant
         reserves extra room below; the flag-options grid needs none. -->
    <footer :class="{ 'has-input': !challenge.options }">
      <ChallengeTimer :value="secondsLeft" :total="challenge.durationSeconds" />

      <!-- Non-hard mode: pick from flag options. Hard mode: free-type. -->
      <div v-if="challenge.options" class="options card-options">
        <button
          v-for="option in challenge.options"
          :key="option"
          class="option card-option"
          :class="{ 'is-spent': spent.includes(option) }"
          type="button"
          :disabled="submitted || !started || spent.includes(option)"
          @click="onGuess(getCountry(option))"
        >
          <CountryTileFlag class="option-flag" :country="getCountry(option)" />
          <span>{{ countryName(option) }}</span>
        </button>
      </div>
      <CountryGuessInput
        v-else
        ref="guessInput"
        :disabled="submitted || !started"
        placeholder="Name the country…"
        @guess="onGuess"
        @miss="announce({ hint: 'No country by that name' })"
      />
    </footer>
  </div>
</template>
<script lang="ts" setup>
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import ChallengeTimer from '~/components/challenge/ChallengeTimer.vue'
import ZoomableImage from '~/components/challenge/ZoomableImage.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { capitalGuessScore } from '~~/lib/challenges'
import { countryName, getCountry } from '~~/lib/country'
import { buzzScore } from '~~/lib/scoring'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

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
} = useGroupChallenge('capital-guess-challenge')

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const stakes = computed(() =>
  challenge.value?.maximumGuesses
    ? `Name the country from its capital's skyline. You get ${challenge.value.maximumGuesses} guesses — each one you spend is worth less.`
    : "Name the country from its capital's skyline before the clock runs out. The sooner you name it, the more it's worth."
)

/** Options already picked and wrong — greyed out, and counted against the cap. */
const spent = ref<ISOCountryCode[]>([])
const attemptsUsed = computed(() => spent.value.length)
const attemptsLeft = computed(() =>
  challenge.value?.maximumGuesses
    ? challenge.value.maximumGuesses - attemptsUsed.value
    : Number.POSITIVE_INFINITY
)

const submitRound = (score: number) => {
  if (submitted.value) return
  gameStore.map.status = score > 0 ? 'correct' : undefined
  submitOnce(score > 0 && challenge.value ? [challenge.value.country] : [], score)
}

const start = () => {
  begin({ onTimeout: () => submitRound(0) })
  nextTick(() => guessInput.value?.focus())
}

/**
 * The option variants pay by which attempt landed it; hard mode free-types
 * against the clock, so an early answer is worth more than a late one.
 */
const scoreFor = (active: NonNullable<typeof challenge.value>) =>
  active.maximumGuesses
    ? capitalGuessScore(attemptsUsed.value + 1, active.maximumGuesses, active.maximumPoints)
    : buzzScore(active.maximumPoints, secondsLeft.value / active.durationSeconds)

const onGuess = (country: Country) => {
  const active = challenge.value
  if (!active || submitted.value || !started.value) return

  // The winning guess is never broadcast — it would hand opponents the answer.
  // Outside hard mode the options make even a wrong name too strong a clue, so
  // the policy drops that variant to presence.
  if (country.isoCode === active.country) return submitRound(scoreFor(active))

  if (active.maximumGuesses) {
    if (spent.value.includes(country.isoCode)) return
    spent.value = [...spent.value, country.isoCode]
    if (attemptsLeft.value <= 0) {
      announce({ kind: 'wrong', isoCode: country.isoCode, hint: 'Out of guesses' })
      return submitRound(0)
    }
  }

  const left = attemptsLeft.value
  announce({
    kind: 'wrong',
    isoCode: country.isoCode,
    hint: Number.isFinite(left)
      ? `${countryName(country)} — ${left} ${left === 1 ? 'guess' : 'guesses'} left`
      : `${countryName(country)} — not it`,
  })
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
.capital-guess {
  top: 0;
  left: 0;
  width: 100%;
  height: var(--viewport-height);
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
  }
  .sub,
  .hint {
    padding: 0.4rem 1.4rem;
  }
  .hint {
    color: var(--hior-ange);
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
  gap: 1.6rem;
}

// The photo is the hero of this round, so it can breathe more than the gate's
// stage. Scales fluidly with the viewport between a floor and a larger ceiling.
.photo-stage {
  width: clamp(30rem, 70vw, 54rem);
  height: clamp(22rem, 40vh, 38rem);
}

@media (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }
  // The photo absorbs whatever the prompt and the option grid leave over —
  // fewer options mean a taller hero, more options shrink it — instead of
  // the fixed height leaving a band of dead space above the footer.
  .stage {
    flex: 1 1 auto;
    min-height: 0;
    justify-content: center;
  }
  .photo-stage {
    width: min(94vw, 54rem);
    flex: 1 1 auto;
    height: auto;
    min-height: 14rem;
    max-height: min(44dvh, 38rem);
  }
}

footer {
  z-index: 2;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;

  // Free-type variant: lift clear of the viewport edge so the guess input's
  // suggestion list (which opens downward) isn't clipped off the bottom. Scales
  // with viewport height so it never steals too much room on short screens.
  &.has-input {
    padding-bottom: clamp(8rem, 24vh, 20rem);
  }
}

.card-options {
  gap: 1.4rem;
  display: grid;
  pointer-events: auto;
  grid-template-columns: repeat(2, minmax(14rem, 20rem));
}
.card-option {
  cursor: pointer;
  padding: 1rem;
  gap: 0.8rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
  border-radius: 1.2rem;
  color: var(--dark-blue);
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.88);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  transition:
    transform var(--motion-quick) var(--ease-out-expressive),
    border-color var(--motion-quick) var(--ease-out-expressive);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      transform: translateY(-0.3rem);
      border-color: var(--dark-blue);
    }
  }
  &:active:not(:disabled) {
    border-color: var(--dark-blue);
  }
  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
  &.is-spent {
    opacity: 0.35;
    border-color: var(--hior-ange);
  }

  .option-flag {
    width: 100%;
    height: 6rem;
    border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  }
}
@media (max-width: $tablet) {
  .card-options {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  footer {
    width: 100%;
    padding: 1.2rem 1.6rem calc(1.2rem + var(--safe-bottom));

    &.has-input {
      padding-bottom: clamp(8rem, 24dvh, 20rem);
    }
  }
}

// The miss hint floats below the prompt instead of joining its flex flow —
// popping in and out must not reflow the header (or the view under it).
header .prompt {
  position: relative;
}
header .prompt .hint {
  top: 100%;
  left: 0;
  right: 0;
  z-index: 3;
  width: max-content;
  max-width: 100%;
  position: absolute;
  margin: 0.4rem auto 0;
}
</style>
