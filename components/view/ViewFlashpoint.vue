<template>
  <section v-if="challenge" class="flashpoint challenge-shell passthrough">
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
        :abroad="submitted ? abroadField : undefined"
      />

      <ChallengePrompt :hint="hint">
        <h1 class="map-caption">
          {{ submitted ? verdictHeadline : 'Where did this happen?' }}
        </h1>
        <span v-if="submitted && abroadField" class="map-caption sub"
          >Amber dots — recorded clashes abroad, in conflicts it joined.</span
        >
        <span v-if="!submitted" class="map-caption sub"
          >One dot, one recorded clash since 1989 — where it happened, not how many died.</span
        >
        <Transition name="caption">
          <span v-if="lateHint" class="map-caption late-hint">{{ lateHint }}</span>
        </Transition>
      </ChallengePrompt>

      <section class="stage">
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      </section>

      <footer :class="{ 'suggest-berth': !challenge.options && !submitted }">
        <template v-if="!submitted">
          <!-- Non-hard mode: pick from flag options, the round clock above
               them. Hard mode: the clock lives inside the guess console. -->
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
                :class="{ 'is-spent': spent.includes(option) }"
                type="button"
                :disabled="submitted || !started || spent.includes(option)"
                @click="onGuess(getCountry(option))"
              >
                <CountryTileFlag class="option-flag" :country="getCountry(option)" />
                <span>{{ countryName(option) }}</span>
              </button>
            </div>
          </template>
          <ChallengeConsole
            v-else
            class="console"
            :value="secondsLeft"
            :total="challenge.durationSeconds"
          >
            <CountryGuessInput
              ref="guessInput"
              :disabled="submitted || !started"
              placeholder="Name the country…"
              @guess="onGuess"
              @miss="announce({ hint: 'No country by that name' })"
            />
          </ChallengeConsole>
        </template>
        <ConflictProfileCard v-else :country="challenge.country" />
      </footer>
    </template>
  </section>
</template>
<script lang="ts" setup>
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import ConflictDotField from '~/components/challenge/ConflictDotField.vue'
import ConflictProfileCard from '~/components/challenge/ConflictProfileCard.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { useAttemptOptions } from '~~/lib/use-attempt-options'
import type { ConflictField } from '~~/types/vendor/ucdp/ucdp.types'

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  remainingFraction,
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
const abroadField = ref<ConflictField>()
const shownWaves = ref(1)
const verdictHeadline = ref('')

/** Padded bbox of a set of dot layers, in map space. */
const fieldBounds = (
  layers: (ConflictField | undefined)[]
): [number, number, number, number] | undefined => {
  const points = layers.flatMap(layer => layer?.eras.flatMap(era => era.points) ?? [])
  if (!points.length) return undefined
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)]
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
  const pad = Math.max(6, 0.15 * Math.max(maxX - minX, maxY - minY))
  return [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2]
}

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

const start = async () => {
  const active = challenge.value
  if (!active) return

  const { CONFLICT_FIELDS, CONFLICT_FIELDS_ABROAD } = await import('~~/data/conflict-events.gen')
  field.value = CONFLICT_FIELDS[active.country]
  abroadField.value = CONFLICT_FIELDS_ABROAD[active.country]

  // Fly the camera to the DOT FIELD's own bounds before any dot lands — the
  // board is blank (solo), so the flight shows nothing, and the cloud draws
  // at a scale where its shape reads. Framing the country instead breaks on
  // giants: Russia's box spans the map while its dots huddle in the Caucasus.
  const bounds = fieldBounds([field.value])
  if (bounds) gameStore.map.feature = { d: '', kind: 'area', bounds }

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
  nextTick(() => guessInput.value?.focus({ auto: true }))
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
  // pulls out to frame the country — widened to the amber abroad layer when
  // one exists, so an intervener's reveal shows its whole footprint.
  shownWaves.value = active.eras.length
  const revealBounds = abroadField.value ? fieldBounds([field.value, abroadField.value]) : undefined
  gameStore.map.feature = revealBounds ? { d: '', kind: 'area', bounds: revealBounds } : undefined
  gameStore.map.solo = false
  gameStore.map.highlighted = new Set([active.country])
  gameStore.map.focus = [active.country]
  // Green wash on success, nothing on failure — flooding the world orange
  // reads as "the whole world is wrong" rather than "you missed".
  gameStore.map.status = correct ? 'correct' : undefined

  submitOnce(correct ? [active.country] : [], score)
}

// The winning guess is never broadcast — outside hard mode the small option
// table makes even a wrong name too strong a clue (policy drops to presence).
const { spent, onGuess } = useAttemptOptions({
  challenge,
  submitted,
  started,
  remainingFraction,
  announce,
  submitRound,
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

header .sub,
header .late-hint {
  max-width: min(80vw, 44rem);
}
header .late-hint {
  padding: 0.4rem 1.4rem;
  font-weight: 600;
}

.stage {
  z-index: 2;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;

  // The section is click-through for the map; only the controls catch input.
  > * {
    pointer-events: auto;
  }
}

.card-options {
  grid-template-columns: repeat(2, minmax(14rem, 20rem));
}

@media (max-width: $tablet) {
  .card-options {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
