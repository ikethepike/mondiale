<template>
  <div v-if="challenge" class="composition challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Composition`"
      title="Where were they born?"
      :stakes="stakes"
      @done="start"
    />

    <ChallengePrompt :hint="hint">
      <h1 class="map-caption">
        {{ countryName(challenge.country) }}'s residents born abroad — where were most of them born?
      </h1>
    </ChallengePrompt>

    <section class="stage">
      <!-- The bar IS the question: every origin's share of the foreign-born
           population, largest first, anonymous until the reveal names it. -->
      <div class="bar" role="img" :aria-label="barLabel">
        <span
          v-for="(slice, index) in slices"
          :key="slice.isoCode"
          class="slice"
          :class="{ named }"
          :style="{ '--share': slice.share, '--depth': index, '--i': index }"
        >
          <span v-if="named && slice.share >= LABEL_MIN_SHARE" class="slice-label">
            <CountryFlag
              class="slice-flag"
              :country="getCountry(slice.isoCode)"
              mode="background"
            />
            <span class="slice-name">{{ countryName(slice.isoCode) }}</span>
          </span>
          <span class="slice-share">{{ formatShare(slice.share) }}</span>
        </span>
        <span class="slice tail" :style="{ '--share': tailShare }">
          <span class="slice-share">{{ formatShare(tailShare) }}</span>
        </span>
      </div>
      <p class="legend eyebrow">
        {{ formatCompact(total) }} residents born abroad · the rest are smaller origins
      </p>

      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </section>

    <footer :class="{ 'suggest-berth': !challenge.options }">
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
          @guess="onGuess"
          @miss="announce({ hint: 'No country by that name' })"
        />
      </ChallengeConsole>
    </footer>

    <SourceInfo class="sources" label="Source" :attributions="sources" />
  </div>
</template>
<script lang="ts" setup>
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import CountryTileFlag from '~/components/country/CountryTileFlag.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { countryName, getCountry } from '~~/lib/country'
import { formatCompact } from '~~/lib/number'
import { corridorsToDestination } from '~~/lib/migration'
import { useAttemptOptions } from '~~/lib/use-attempt-options'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'

/**
 * Composition: a country's foreign-born population split by where those people
 * were born. The largest slice is the answer.
 *
 * The figures count residents born abroad, never ancestry — a country's
 * largest recognised minority is often home-born and absent from this data.
 * Copy stays on "born abroad"/"born in"; see lib/migration.ts.
 */
const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  remainingFraction,
  begin,
  hint,
  announce,
  entries,
  submitOnce,
  gameStore,
} = useGroupChallenge('composition-challenge')

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const sources = datasetAttribution('migration')

const slices = computed(() => challenge.value?.slices ?? [])

/** The bar is anonymous while it is the question; answering names it. */
const named = computed(() => submitted.value)

/** Below this a slice is too narrow to hold a flag and a name without
 *  spilling over its neighbours — its percentage stands alone. */
const LABEL_MIN_SHARE = 0.08

/** Listed shares are of the whole foreign-born population, so what's left is
 *  the long tail of origins too small to draw. */
const tailShare = computed(() =>
  Math.max(0, 1 - slices.value.reduce((sum, slice) => sum + slice.share, 0))
)

const total = computed(() => {
  if (!challenge.value) return 0
  return corridorsToDestination(challenge.value.country).reduce(
    (sum, origin) => sum + origin.value.amount,
    0
  )
})

const formatShare = (share: number) => `${Math.round(share * 100)}%`

const barLabel = computed(() =>
  submitted.value
    ? slices.value
        .map(slice => `${countryName(slice.isoCode)} ${formatShare(slice.share)}`)
        .join(', ')
    : `${slices.value.length} origins, largest ${formatShare(slices.value[0]?.share ?? 0)}`
)

const stakes = computed(() =>
  challenge.value?.options
    ? 'The bar splits a country’s foreign-born residents by where they were born. Name the largest origin — each guess you spend is worth less.'
    : 'The bar splits a country’s foreign-born residents by where they were born. Name the largest origin before the clock runs out.'
)

/** The largest origin — what the round actually asks for. */
const answer = computed(() => slices.value[0]?.isoCode)

const submitRound = (score: number) => {
  if (submitted.value) return
  // No map verdict wash: the question lives entirely on the bar, and a
  // full-board tint would read as a claim about the map itself
  // Bank the origin that scored, not the board the bar belongs to
  submitOnce(score > 0 && answer.value ? [answer.value] : [], score)
}

const start = () => {
  begin({ onTimeout: () => submitRound(0) })
  nextTick(() => guessInput.value?.focus({ auto: true }))
}

// The attempt machine grades against `answer`, since this round's subject —
// the board on the bar — is never one of its own options
const attemptChallenge = computed(() =>
  challenge.value && answer.value ? { ...challenge.value, answer: answer.value } : undefined
)

const { spent, onGuess } = useAttemptOptions({
  challenge: attemptChallenge,
  submitted,
  started,
  remainingFraction,
  announce,
  submitRound,
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/ink' as *;

.stage {
  z-index: 2;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1.2rem;
}

// One flat bar, single-hue: the slices differ by depth, not by colour, so the
// eye reads magnitude instead of hunting for a legend.
.bar {
  display: flex;
  overflow: hidden;
  width: clamp(28rem, 72vw, 56rem);
  height: 6.5rem;
  border: 1px solid ink(0.14);
  border-radius: 0.8rem;
  box-shadow: 0 1px 0 ink(0.05);
}

.slice {
  display: flex;
  flex: var(--share) 1 0;
  flex-direction: column;
  gap: 0.2rem;
  justify-content: center;
  align-items: center;
  min-width: 0;
  padding: 0.3rem;
  background: ink(calc(0.5 - var(--depth, 0) * 0.07), 41%);
  color: milk();
  text-align: center;
  transform-origin: left center;
  animation: bar-grow var(--motion-slow) var(--ease-out) backwards;
  animation-delay: calc(var(--i, 0) * 60ms);

  + .slice {
    border-left: 1px solid milk(0.25);
  }

  &.tail {
    flex-grow: var(--share);
    background: ink(0.12);
    color: ink(0.65);
  }
}

// A 3% slice is a few pixels wide — its flag and name would spill across its
// neighbours, so only slices with room to hold a label wear one. The
// percentages carry the rest, and the reveal names every origin in order.
.slice-label {
  display: flex;
  gap: 0.3rem;
  align-items: center;
  overflow: hidden;
  min-width: 0;
  max-width: 100%;
}

.slice-flag {
  flex: none;
  width: 1.5rem;
  height: 1rem;
  border-radius: 0.15rem;
}

.slice-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 0.85rem;
}

.slice-share {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.legend {
  opacity: 0.7;
}

footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;
}

// The option table is the bar's own origins — up to six, so three across
// keeps each card readable without a second scroll
.card-options {
  grid-template-columns: repeat(3, minmax(10rem, 15rem));
}

.sources {
  bottom: 0.8rem;
  left: 0.8rem;
  position: absolute;
}

@media (max-width: $tablet) {
  // The stage owns the shell's padding here, so the bar can't bleed past the
  // viewport edge the way a fixed clamp would. It sits high rather than
  // centred: the tall column below belongs to the option table.
  .stage {
    justify-content: flex-start;
    width: 100%;
    padding: 2rem 1.2rem 0;
  }

  .bar {
    width: 100%;
    height: 5rem;
  }

  // Narrow slices can't hold a name — the reveal's percentages still read
  .slice-name {
    display: none;
  }

  // Six flags two-across would push the last row under the fold, so the cards
  // give up their photo proportions and sit tighter
  .card-options {
    width: 100%;
    gap: 0.7rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .card-option {
    gap: 0.4rem;
    padding: 0.5rem;
    font-size: 0.8rem;
  }
}
</style>
