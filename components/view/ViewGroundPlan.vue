<template>
  <div v-if="challenge" class="ground-plan challenge-shell passthrough">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      kind="ground-plan"
      title="Name the city"
      :stakes="stakes"
      @done="start"
    />

    <ChallengePrompt :hint="hint" :hint-tone="hintTone">
      <template v-if="!resolved">
        <h1 class="map-caption">Which city is this?</h1>
        <span class="map-caption sub">{{ ladderCaption }}</span>
      </template>
    </ChallengePrompt>

    <!-- The plan is the whole surface, not a picture on it: it runs edge to
         edge behind the chrome, which floats over it wearing its own scrim. -->
    <CityPlanTile
      v-if="paths"
      class="plan-backdrop"
      :paths="paths"
      :layers="shownLayers"
      :show-green="resolved"
      :fit="fitPlan"
    />

    <section class="stage">
      <ChallengeResult
        v-if="resolved"
        class="verdict"
        :status="wasCorrect ? 'correct' : 'incorrect'"
        :correct-message="`${challenge.city} — ${countryName(challenge.country)}`"
        :incorrect-message="`It was ${challenge.city}, ${countryName(challenge.country)}`"
      >
        <p v-if="challenge.lesson">{{ challenge.lesson }}</p>
        <p v-if="crossingLine" class="crossings">{{ crossingLine }}</p>
      </ChallengeResult>
      <GuessTicker v-else :entries="entries" :players="gameStore.game?.players ?? {}" />
    </section>

    <!-- No `suggest-berth`: this console refuses a suggestion list (a dropdown
         of cities would be the answer sheet), so reserving room below it just
         floats the console 200px off the floor. -->
    <footer v-if="!resolved">
      <template v-if="challenge.options">
        <ChallengeTimerRadial
          class="footer-clock"
          :value="secondsLeft"
          :total="challenge.durationSeconds"
        />
        <div class="options card-options">
          <button
            v-for="option in challenge.options"
            :key="option"
            class="option card-option"
            :class="{ 'is-spent': isSpent(option) }"
            type="button"
            :disabled="submitted || !started || isSpent(option)"
            @click="onOption(option)"
          >
            <span>{{ option }}</span>
          </button>
        </div>
      </template>
      <ChallengeConsole
        v-else
        class="console"
        :value="secondsLeft"
        :total="challenge.durationSeconds"
      >
        <!-- No suggestion list: a dropdown of cities would be the answer sheet,
             the same refusal the Star Chart makes. -->
        <form class="guess-form" @submit.prevent="commit">
          <input
            ref="guessInput"
            v-model="entry"
            type="text"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            :disabled="submitted || !started"
          />
          <span v-if="!entry" class="ghost-placeholder">Name the city…</span>
        </form>
      </ChallengeConsole>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import CityPlanTile from '~/components/challenge/CityPlanTile.vue'
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import type { CityPlanPaths } from '~~/types/challenges/group-modes.type'
import { countryName, getCountry } from '~~/lib/country'
import { cityCountryByName } from '~~/lib/cities'
import { loadCityPlan } from '~~/lib/city-plan-tiles'
import { groundPlanRemainingFraction, revealedLayers } from '~~/lib/ground-plan'
import { buzzScore } from '~~/lib/scoring'
import { classicPlaySeconds } from '~~/lib/round-beats'
import { formatNumber } from '~~/lib/number'
import { useIsPortrait } from '~~/lib/use-viewport'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { useAttemptOptions } from '~~/lib/use-attempt-options'

const {
  challenge,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  remainingFraction,
  begin,
  hint,
  hintTone,
  announce,
  entries,
  submitOnce,
  stopCountdown,
  gameStore,
} = useGroupChallenge('ground-plan-challenge')

// A cut is wider than it is tall, so a portrait screen cannot fill without
// cropping into the safe zone. Fit there, fill everywhere else.
const fitPlan = useIsPortrait()

const guessInput = ref<HTMLInputElement>()
const entry = ref('')
const resolved = ref(false)
const wasCorrect = ref(false)
const paths = ref<CityPlanPaths>()

/** The whole window on one derivation — the server clocks the same number. */
const totalSeconds = computed(() => classicPlaySeconds(challenge.value) ?? 0)

/**
 * Layers land on the clock rather than on a timer of their own: the composable
 * already runs the countdown this kind needs (a derived `playSeconds` puts it
 * on the local decrement), so a second interval could only drift from it.
 */
const revealedCount = computed(() => {
  const active = challenge.value
  if (!active || !started.value) return 0
  const elapsed = totalSeconds.value - secondsLeft.value
  return Math.min(active.layers.length, Math.floor(elapsed / active.secondsPerLayer) + 1)
})

const shownLayers = computed(() => {
  const active = challenge.value
  if (!active) return []
  return resolved.value ? active.layers : revealedLayers(active, revealedCount.value)
})

const ladderCaption = computed(() => {
  const active = challenge.value
  if (!active || !started.value) return 'Watch it build'
  return `Layer ${revealedCount.value} of ${active.layers.length}`
})

const crossingLine = computed(() => {
  const count = challenge.value?.crossings ?? 0
  if (!count) return ''
  const plural = count === 1 ? 'crossing' : 'crossings'
  return `${formatNumber(count)} water ${plural} in frame — a river is a barrier, and bridges are expensive.`
})

const stakes = computed(() =>
  challenge.value?.maximumGuesses
    ? `A city draws itself layer by layer. Name it before the bridges land — you get ${challenge.value.maximumGuesses} guesses, and the second is worth less.`
    : 'A city draws itself layer by layer, water first. Name it before the bridges land — the fewer layers you need, the more it pays.'
)

watch(
  challenge,
  async active => {
    if (!active) return
    paths.value = await loadCityPlan(active.cut.slug)
  },
  { immediate: true }
)

/** The reveal is display-only; the server's flip ends the beat. */
const resolve = (correct: boolean, score: number) => {
  if (resolved.value) return
  resolved.value = true
  wasCorrect.value = correct
  stopCountdown()
  gameStore.map.status = correct ? 'correct' : undefined
  submitOnce(correct && challenge.value ? [challenge.value.country] : [], score)
}

const submitRound = (score: number) => resolve(score > 0, score)

const start = () => {
  begin({ onTimeout: () => submitRound(0) })
  nextTick(() => guessInput.value?.focus())
}

// Options pay by attempt through the shared table; the typed variant pays by
// LADDER instead, so it must not route through the same helper — its clock
// branch would price the answer on seconds, which is not this round's tension.
const { spent, onGuess } = useAttemptOptions({
  challenge: computed(() =>
    challenge.value
      ? {
          country: challenge.value.country,
          maximumGuesses: challenge.value.maximumGuesses,
          maximumPoints: challenge.value.maximumPoints,
        }
      : undefined
  ),
  submitted,
  started,
  remainingFraction,
  announce,
  submitRound,
})

/**
 * `spent` tracks the COUNTRY a pick resolved to, because that is what the
 * shared attempt table scores. The buttons are city names, so the spent test
 * has to go through the same resolution rather than comparing the labels.
 */
const isSpent = (option: string): boolean => {
  const isoCode = cityCountryByName(option)
  return !!isoCode && spent.value.includes(isoCode)
}

const onOption = (option: string) => {
  const isoCode = cityCountryByName(option)
  if (!isoCode || !challenge.value) return
  onGuess(getCountry(isoCode))
}

const commit = () => {
  const active = challenge.value
  const typed = entry.value.trim()
  if (!active || !typed || !started.value || resolved.value || submitted.value) return

  const isoCode = cityCountryByName(typed)
  // An unmatched name spends nothing — there is no city to score, and a
  // near-miss spelling is one edit from right.
  if (!isoCode) return announce({ hint: `No city called “${typed}”` })

  entry.value = ''
  if (isoCode !== active.country) {
    return announce({ hint: `${typed} isn't this city`, tone: 'alert' })
  }
  resolve(
    true,
    buzzScore(active.maximumPoints, groundPlanRemainingFraction(active, revealedCount.value))
  )
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

// The plan is the ground the round is played on, so it sits under everything
// and takes the whole viewport. The shell is `passthrough`; the chrome opts
// itself back in.
.plan-backdrop {
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
}

.stage {
  flex: 1;
  z-index: 1;
  min-height: 0;
  display: flex;
  position: relative;
  align-items: center;
  justify-content: center;
}

.verdict {
  z-index: 3;
  pointer-events: auto;
  max-width: min(92vw, 34rem);
}

.crossings {
  opacity: 0.8;
}

footer {
  z-index: 2;
  display: flex;
  gap: 1.4rem;
  padding-bottom: 0.6rem;
  align-items: center;
  flex-direction: column;
}

.footer-clock {
  flex: none;
  pointer-events: auto;
}

// Over a busy plan the cards need their cream back — the shared option card is
// translucent by default, which reads as noise on top of street work.
.card-options {
  pointer-events: auto;
  grid-template-columns: repeat(2, minmax(14rem, 20rem));

  :deep(.card-option) {
    backdrop-filter: blur(0.6rem);
  }
}

@media (max-width: $tablet) {
  .card-options {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
