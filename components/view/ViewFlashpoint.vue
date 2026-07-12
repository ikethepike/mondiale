<template>
  <section v-if="challenge" class="flashpoint">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Flashpoint`"
      title="A history of conflict, drawn in dots"
      :stakes="stakes"
      @done="start"
    />
    <template v-else>
      <ConflictDotField
        v-if="field"
        :field="field"
        :shown-waves="shownWaves"
        :show-chip="!submitted"
      />

      <header>
        <div class="prompt">
          <h1 class="map-caption">
            {{ submitted ? verdictHeadline : 'Where did this happen?' }}
          </h1>
          <span v-if="!submitted" class="map-caption sub"
            >One dot, one recorded clash — where it happened, not how many died.</span
          >
          <Transition name="caption">
            <span v-if="lateHint" class="map-caption late-hint">{{ lateHint }}</span>
          </Transition>
          <ChallengeTimer
            v-if="!submitted"
            class="timer"
            :value="secondsLeft"
            :total="challenge.durationSeconds"
          />
          <Transition name="caption">
            <span v-if="hint" class="map-caption hint">{{ hint }}</span>
          </Transition>
        </div>
      </header>

      <section class="stage">
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      </section>

      <footer :class="{ 'has-input': !challenge.options && !submitted }">
        <template v-if="!submitted">
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
        </template>
        <ConflictProfileCard v-else :country="challenge.country" />
      </footer>
    </template>
  </section>
</template>
<script lang="ts" setup>
import ChallengeTimer from '~/components/challenge/ChallengeTimer.vue'
import ConflictDotField from '~/components/challenge/ConflictDotField.vue'
import ConflictProfileCard from '~/components/challenge/ConflictProfileCard.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { capitalGuessScore } from '~~/lib/challenges'
import { countryName, getCountry } from '~~/lib/country'
import { buzzScore } from '~~/lib/scoring'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { Country, ISOCountryCode } from '~~/types/geography.types'
import type { ConflictField } from '~~/types/vendor/ucdp/ucdp.types'

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  begin,
  stopCountdown,
  hint,
  announce,
  entries,
  submitOnce,
  gameStore,
} = useGroupChallenge('flashpoint-challenge')

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()
const field = ref<ConflictField>()
const shownWaves = ref(1)
const verdictHeadline = ref('')

const stakes = computed(() => {
  const base =
    'Each dot is a recorded clash (UCDP counts an armed conflict once it causes 25 battle-related deaths in a year). They appear era by era — name the country.'
  return challenge.value?.maximumGuesses
    ? `${base} You get ${challenge.value.maximumGuesses} guesses — the second is worth less.`
    : `${base} The earlier you buzz, the more it's worth.`
})

/** The dealer's non-hard helper, held back until every wave has landed —
 *  the dots get their chance to be read before the words step in. */
const lateHint = computed(() => {
  const active = challenge.value
  if (!active?.hint || submitted.value || !started.value) return ''
  const wavesDone = active.eras.length * active.secondsPerEra
  return active.durationSeconds - secondsLeft.value >= wavesDone + 2 ? active.hint : ''
})

/** Options already picked and wrong — greyed out, and counted against the cap. */
const spent = ref<ISOCountryCode[]>([])
const attemptsUsed = computed(() => spent.value.length)
const attemptsLeft = computed(() =>
  challenge.value?.maximumGuesses
    ? challenge.value.maximumGuesses - attemptsUsed.value
    : Number.POSITIVE_INFINITY
)

const start = async () => {
  const active = challenge.value
  if (!active) return

  const { CONFLICT_FIELDS } = await import('~~/data/conflict-events.gen')
  field.value = CONFLICT_FIELDS[active.country]

  // Fly the camera to the DOT FIELD's own bounds before any dot lands — the
  // board is blank (solo), so the flight shows nothing, and the cloud draws
  // at a scale where its shape reads. Framing the country instead breaks on
  // giants: Russia's box spans the map while its dots huddle in the Caucasus.
  const points = field.value?.eras.flatMap(era => era.points) ?? []
  if (points.length) {
    const xs = points.map(([x]) => x)
    const ys = points.map(([, y]) => y)
    const [minX, maxX] = [Math.min(...xs), Math.max(...xs)]
    const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
    const pad = Math.max(6, 0.15 * Math.max(maxX - minX, maxY - minY))
    gameStore.map.feature = {
      d: '',
      kind: 'area',
      bounds: [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2],
    }
  }

  begin({
    onTimeout: () => submitRound(0),
    onTick: left => {
      const elapsed = active.durationSeconds - left
      shownWaves.value = Math.min(
        active.eras.length,
        1 + Math.floor(elapsed / active.secondsPerEra)
      )
    },
  })
  nextTick(() => guessInput.value?.focus())
}

const submitRound = (score: number) => {
  const active = challenge.value
  if (!active || submitted.value) return
  stopCountdown()

  const correct = score > 0
  verdictHeadline.value = !correct
    ? `It was ${countryName(active.country)}`
    : `Well read — ${countryName(active.country)}`

  // The reveal beat: every wave lands, the world comes back, and the camera
  // pulls out from the dot field to frame the whole country, dots glued on.
  shownWaves.value = active.eras.length
  gameStore.map.feature = undefined
  gameStore.map.solo = false
  gameStore.map.highlighted = new Set([active.country])
  gameStore.map.focus = [active.country]
  // Green wash on success, nothing on failure — flooding the world orange
  // reads as "the whole world is wrong" rather than "you missed".
  gameStore.map.status = correct ? 'correct' : undefined

  submitOnce(correct ? [active.country] : [], score)
}

/** Option variants pay by attempt; hard mode free-types against the clock. */
const scoreFor = (active: NonNullable<typeof challenge.value>) =>
  active.maximumGuesses
    ? capitalGuessScore(attemptsUsed.value + 1, active.maximumGuesses, active.maximumPoints)
    : buzzScore(active.maximumPoints, secondsLeft.value / active.durationSeconds)

const onGuess = (country: Country) => {
  const active = challenge.value
  if (!active || submitted.value || !started.value) return

  // The winning guess is never broadcast — it would hand opponents the answer.
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
.flashpoint {
  top: 0;
  left: 0;
  width: 100%;
  height: var(--viewport-height);
  display: flex;
  position: absolute;
  pointer-events: none;
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
  .hint,
  .late-hint {
    padding: 0.4rem 1.4rem;
    max-width: min(80vw, 44rem);
  }
  .hint {
    color: var(--hior-ange);
  }
  .late-hint {
    font-weight: 600;
  }
  .timer {
    max-width: min(80vw, 40rem);
  }
  .prompt {
    gap: 1rem;
    display: flex;
    position: relative;
    align-items: center;
    flex-flow: column nowrap;
  }
}

// The miss hint floats below the prompt instead of joining its flex flow.
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

.stage {
  z-index: 2;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

footer {
  z-index: 2;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;

  // The section is click-through for the map; only the controls catch input.
  > * {
    pointer-events: auto;
  }

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
    height: auto;
    border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  }
}

@media (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }
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
</style>
