<template>
  <template v-if="challenge.rosetta">
    <h1 class="map-caption">Finish the pair</h1>
    <ChallengeTimerRadial class="gate-clock" :value="secondsLeft" :total="ROSETTA_SECONDS" />

    <!-- One grid for both rows, not a grid per row: the ties must land in the
         same column or the analogy stops reading as a shape. -->
    <div class="analogy">
      <span class="term given">{{ challenge.rosetta.exemplar.term }}</span>
      <span class="tie given" aria-hidden="true">is to</span>
      <span class="term given">{{ countryName(challenge.rosetta.exemplar.isoCode) }}</span>
      <span class="term">{{ challenge.rosetta.term }}</span>
      <span class="tie" aria-hidden="true">is to</span>
      <span class="term blank">?</span>
    </div>

    <Transition name="caption">
      <span v-if="shownRelation" class="relation map-caption">
        …as a country is to {{ shownRelation }}
      </span>
    </Transition>

    <div class="hint-row">
      <Transition name="caption">
        <button
          v-if="!shownRelation && hintUnlocked"
          class="hint-button"
          type="button"
          @click="buyRelationHint"
        >
          <StatTopicIcon class="hint-icon" topic="question" />
          Name the link (−{{ GATE_HINT_BITE_STEPS }} from the pot)
        </button>
      </Transition>
    </div>

    <Teleport v-if="footerReady" to="#gate-footer">
      <div class="guess-box">
        <CountryGuessInput placeholder="Type the country — one shot" @guess="onGuess" />
      </div>
    </Teleport>
  </template>
</template>
<script lang="ts" setup>
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import { countryName } from '~~/lib/country'
import { GATE_HINT_BITE_STEPS, HINT_UNLOCK_FIRST_ELAPSED } from '~~/lib/scoring'
import { useGateChallenge, useGateClock } from '~~/lib/use-gate-challenge'
import { ROSETTA_SECONDS } from './timing'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { Country } from '~~/types/geography.types'

const props = defineProps<{ challenge: IndividualChallenge }>()

const { status, isEasy, submitAnswer, giveUp } = useGateChallenge()

const boughtRelation = ref(false)
const footerReady = ref(false)

const { secondsLeft, remainingFraction, elapsedFraction, stop } = useGateClock(ROSETTA_SECONDS, {
  onExpire: () => giveUp(hintsUsed.value),
})
const hintUnlocked = computed(() => elapsedFraction.value >= HINT_UNLOCK_FIRST_ELAPSED)

/** Easy mode is told what the link is for free; everyone else can buy it.
 *  Working out the relation from the exemplar IS the mode, so on hard it
 *  costs steps or nothing. */
const shownRelation = computed(() =>
  isEasy.value || boughtRelation.value ? props.challenge.rosetta?.relationLabel : undefined
)
/** Only a bought hint bites — the easy-mode freebie is the difficulty, not a
 *  purchase, and must not dock the leap. */
const hintsUsed = computed(() => (boughtRelation.value ? 1 : 0))

onMounted(() => {
  footerReady.value = true
})
const buyRelationHint = () => {
  if (boughtRelation.value || status.value) return
  boughtRelation.value = true
}

const onGuess = (country: Country) => {
  if (status.value) return
  stop()
  submitAnswer(country.isoCode, {
    remainingFraction: remainingFraction.value,
    hintsUsed: hintsUsed.value,
  })
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// The analogy is the whole stage: the demonstrated pair above, the asked pair
// below, sharing one grid so both ties land in the same column — the aligned
// shape is what makes it read as an analogy rather than two questions.
.analogy {
  display: grid;
  align-items: center;
  justify-items: center;
  margin-top: 1.4rem;
  gap: 0.6rem 1.2rem;
  grid-template-columns: 1fr auto 1fr;
}

.term {
  padding: 0.7rem 1.4rem;
  font-size: 2.2rem;
  line-height: 1.15;
  text-align: center;
  color: var(--dark-blue);
  border-radius: 1rem;
  backdrop-filter: blur(0.5rem);
  background: milk(0.88);
  border: 0.1rem solid ink(0.25);
}

// The demonstrated pair is context, not the question — quieter than the ask.
.term.given {
  font-size: 1.8rem;
  opacity: 0.75;
}

// The tie rides over the map, so it takes a scrim like everything else here.
.tie {
  font-size: 1.3rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--soft-blue);
  padding: 0.2rem 0.6rem;
  border-radius: 0.6rem;
  backdrop-filter: blur(0.5rem);
  background: milk(0.8);
}

.blank {
  min-width: 6rem;
  font-weight: 700;
  color: ink(0.4);
  border-style: dashed;
}

.relation {
  margin-top: 0.8rem;
  padding: 0.4rem 1.4rem;
}

@media (max-width: $tablet) {
  .term {
    font-size: 1.8rem;
    padding: 0.5rem 1rem;
  }
  .term.given {
    font-size: 1.5rem;
  }
}
</style>
