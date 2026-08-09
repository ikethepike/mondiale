<template>
  <template v-if="challenge.scriptorium">
    <h1 class="map-caption">Name a country that writes like this</h1>
    <ChallengeTimerRadial class="gate-clock" :value="secondsLeft" :total="SCRIPTORIUM_SECONDS" />

    <!-- The manuscript page: a couple of lines of the language in its own
         script, and nothing else — the writing IS the question. The `lang`
         attribute is what picks the right font (ViewTongueBuzz's mechanism);
         the script's NAME stays for the reveal, since for a single-country
         script it would answer the gate. -->
    <div v-if="sample" class="manuscript" :lang="sample.code">
      <span v-for="line in sample.lines" :key="line" class="manuscript-line">{{ line }}</span>
    </div>

    <Transition name="caption">
      <span v-if="shownRegion" class="region-note map-caption">
        Spoken mostly in {{ shownRegion }}
      </span>
    </Transition>

    <div class="hint-row">
      <Transition name="caption">
        <button
          v-if="!shownRegion && regionHint && hintUnlocked"
          class="hint-button"
          type="button"
          @click="buyRegionHint"
        >
          <StatTopicIcon class="hint-icon" topic="question" />
          Name the region (−{{ GATE_HINT_BITE_STEPS }} from the pot)
        </button>
      </Transition>
    </div>

    <Teleport v-if="footerReady" to="#gate-footer">
      <div class="guess-box">
        <CountryGuessInput placeholder="Type any country that speaks it" @guess="onGuess" />
      </div>
    </Teleport>
  </template>
</template>
<script lang="ts" setup>
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { GATE_HINT_BITE_STEPS, HINT_UNLOCK_FIRST_ELAPSED } from '~~/lib/scoring'
import { scriptoriumAnswers, scriptoriumEntry, scriptoriumRegionHint } from '~~/lib/scriptorium'
import {
  anthemTongueSample,
  seededTongueSample,
  tongueSampleSource,
} from '~~/lib/tongue-samples'
import { useAnthemLyrics } from '~~/lib/use-anthem-lyrics'
import { useGateChallenge, useGateClock } from '~~/lib/use-gate-challenge'
import { SCRIPTORIUM_SECONDS } from './timing'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { Country } from '~~/types/geography.types'

const props = defineProps<{ challenge: IndividualChallenge }>()

const { gameStore } = useClientEvents()
const { status, isEasy, submitAnswer, giveUp } = useGateChallenge()

const footerReady = ref(false)
const boughtRegion = ref(false)

const { secondsLeft, remainingFraction, elapsedFraction, stop } = useGateClock(
  SCRIPTORIUM_SECONDS,
  { onExpire: () => giveUp(hintsUsed.value) }
)
const hintUnlocked = computed(() => elapsedFraction.value >= HINT_UNLOCK_FIRST_ELAPSED)

const language = computed(() => props.challenge.scriptorium?.language)

/** The written sample: a seed for the seeded languages, a couple of anthem
 *  lines through the same home for everyone else — lib/tongue-samples, shared
 *  with the Tongues round. A failed fetch leaves the gate unplayable-blind,
 *  so the safety expiry (`useGateClock`) still resolves it as a miss. */
const borrowedLyrics = useAnthemLyrics(() => {
  const active = language.value
  if (!active || seededTongueSample(active)) return undefined
  return tongueSampleSource(active, scriptoriumEntry(active)?.code)
})
const sample = computed(() => {
  const active = language.value
  if (!active) return undefined
  return (
    seededTongueSample(active) ??
    (borrowedLyrics.value ? anthemTongueSample(borrowedLyrics.value) : undefined)
  )
})

/** Easy mode gets the region for free (rosetta's freebie posture — the
 *  difficulty, not a purchase); everyone else can buy it once unlocked. */
const regionHint = computed(() => (language.value ? scriptoriumRegionHint(language.value) : undefined))
const shownRegion = computed(() =>
  isEasy.value || boughtRegion.value ? regionHint.value : undefined
)
const hintsUsed = computed(() => (boughtRegion.value ? 1 : 0))

onMounted(() => {
  footerReady.value = true
})
const buyRegionHint = () => {
  if (boughtRegion.value || status.value) return
  boughtRegion.value = true
}

const onGuess = (country: Country) => {
  if (status.value) return
  stop()
  submitAnswer(country.isoCode, {
    remainingFraction: remainingFraction.value,
    hintsUsed: hintsUsed.value,
  })
  // Fills = knowledge: light every accepted speaker for the reveal frame,
  // the same set the verdict just graded against (submitAnswer cleared the
  // board first, so this paint is the reveal's alone).
  if (language.value) {
    for (const isoCode of scriptoriumAnswers(language.value)) {
      gameStore.map.highlighted.add(isoCode)
    }
  }
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// The page is the stage: unfamiliar glyphs rendered large on a cream leaf.
// The block-not-line posture from the tongue round's sample applies — two
// lines of script need room to breathe or the glyph shapes smear together.
.manuscript {
  gap: 1rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
  margin-top: 1.6rem;
  padding: 2.2rem 3rem;
  max-width: min(56rem, 92vw);
  border-radius: 1.2rem;
  backdrop-filter: blur(0.5rem);
  background: milk(0.92);
  border: 0.1rem solid ink(0.25);
}

.manuscript-line {
  font-size: 3rem;
  line-height: 1.5;
  text-align: center;
  color: var(--dark-blue);
  overflow-wrap: anywhere;
}

.region-note {
  margin-top: 0.8rem;
  padding: 0.4rem 1.4rem;
}

@media (max-width: $tablet) {
  .manuscript {
    padding: 1.6rem 2rem;
  }
  .manuscript-line {
    font-size: 2.3rem;
  }
}
</style>
