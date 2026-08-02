<template>
  <div v-if="challenge" class="silhouette-challenge challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Silhouette`"
      title="Whose outline is this?"
      :stakes="`The outline flashes whole, then draws itself back in over ${challenge.durationSeconds} seconds — buzz in early for more points. A wrong buzz locks you out for a moment.`"
      @done="begin"
    />

    <ChallengePrompt :hint="hint">
      <template v-if="!resolved">
        <h1 class="map-caption">Whose outline is this?</h1>
        <span class="map-caption sub">Earlier answers score higher</span>
        <span v-if="regionRevealed && challenge.region" class="map-caption region-hint">
          Region: {{ challenge.region }}
        </span>
      </template>
      <template v-else>
        <h1 class="map-caption">It was {{ countryName(challenge.country) }}</h1>
        <span class="map-caption sub">Here it is among its neighbours</span>
      </template>
    </ChallengePrompt>

    <section v-show="!resolved" class="outline-stage">
      <svg v-if="outline" class="outline" :viewBox="outline.viewBox" aria-hidden="true">
        <path ref="outlinePath" :d="outline.d" :stroke-width="outline.strokeWidth" />
      </svg>
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
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { BORDERS } from '~~/data/borders.gen'
import { countryName } from '~~/lib/country'
import { useBuzzRound } from '~~/lib/use-buzz-round'
import { useOutlineReveal } from '~~/lib/useOutlineReveal'
import type { Country } from '~~/types/geography.types'

// Preview flash → sweep-away → clock-synced border draw, all size-relative.
const {
  outline,
  outlinePath,
  prepareOutline,
  beginOutlineReveal,
  tickOutlineReveal,
  resetOutlineReveal,
} = useOutlineReveal()

/** Shorter than the audio rounds' hold: no verse to translate, so four
 *  seconds of the country framed among its neighbours is the whole reveal. */
const OUTLINE_REVEAL_HOLD_MS = 4000

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
  registerCleanup,
  gameStore,
  resolved,
  lockedOut,
  begin: beginBuzz,
  guess,
} = useBuzzRound('silhouette-challenge', {
  isCorrect: (active, isoCode) => active.country === isoCode,
  maximumPoints: active => active.maximumPoints,
  // No isoCode: a wrong buzz would name a candidate for the shared answer.
  lockoutHint: name => `Not ${name} — locked out for 3 seconds`,
  onLockoutEnd: () => nextTick(() => guessInput.value?.focus()),
  onTick: tickOutlineReveal,
  // Blank the world map — the silhouette IS the whole question.
  solo: true,
  revealHoldMs: OUTLINE_REVEAL_HOLD_MS,
  /**
   * Resolution beat: whether buzzed right or timed out, drop the shapes-only
   * veil and frame the country among its neighbours — the answer lands as a
   * place on the map, not just a name. The scorecard follows after the hold.
   */
  onResolve: winningGuess => {
    const active = challenge.value
    if (!active) return
    gameStore.map.solo = false
    gameStore.map.labels = true
    gameStore.map.reveal = active.country
    // No full-map status wash here — the reveal is about locating the country,
    // so the tints carry the verdict: the answer in mint or coral, its
    // neighbours in soft sand. Neighbour centers keep the frame tight even
    // next to a giant (Russia would otherwise stretch the shot to the Pacific).
    const neighbours = BORDERS[active.country] ?? []
    gameStore.map.focus = [active.country]
    gameStore.map.focusContext = neighbours
    gameStore.map.tints[active.country] = winningGuess ? 'optimal' : 'stray'
    for (const neighbour of neighbours) {
      gameStore.map.tints[neighbour] = 'inefficient'
    }
  },
})

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

// The region hint (non-hard mode) surfaces only in the final 30% of the clock —
// a late nudge once the outline is nearly whole, not a giveaway from the start.
const regionRevealed = computed(() => started.value && remainingFraction.value <= 0.3)

onMounted(() => {
  const active = challenge.value
  if (active) prepareOutline(active.country)
})
registerCleanup(resetOutlineReveal)

const begin = () => {
  beginOutlineReveal(challenge.value?.durationSeconds ?? 30)
  beginBuzz(() => nextTick(() => guessInput.value?.focus({ auto: true })))
}

const onGuess = (country: Country) => {
  guess(country.isoCode, countryName(country))
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

header .region-hint {
  padding: 0.4rem 1.4rem;
  color: var(--soft-blue);
  font-weight: 600;
}

.outline-stage {
  flex: 1;
  display: flex;
  min-height: 0;
  padding: 1rem 0;
  align-items: center;
  justify-content: center;
}

// The outline IS this mode's map. With the keyboard up, stacking prompt +
// stage + console leaves no stage on short viewports (~80px in a 650px
// in-app browser) — so the stage stops competing in the column and becomes
// an absolute backdrop spanning the visible band, the h1 pill floating over
// its top and the console over its foot, both wearing their scrims (the
// sanctioned bespoke positioned stage).
:root.keyboard-up .silhouette-challenge {
  .outline-stage {
    inset: 1rem 0 calc(var(--keyboard-inset, 0px) + 11rem);
    padding: 0;
    z-index: 0;
    position: absolute;
  }

  .outline {
    max-height: none; // the band is the cap
  }

  // The prompt pills paint above the positioned stage; the subs give their
  // space back to the drawing while typing — the h1 carries the question.
  header {
    z-index: 1;
    position: relative;

    .sub {
      display: none;
    }
  }
}

.outline {
  height: 100%;
  max-height: 44vh;
  max-width: 70vw;

  // Stroke width arrives as a user-unit attribute scaled to the country's
  // frame — non-scaling-stroke would shatter the dash-reveal (see outline.ts).
  path {
    fill: none;
    stroke: var(--dark-blue);
    stroke-linejoin: round;
    stroke-linecap: round;
  }
}

.guess-box {
  display: flex;
  justify-content: center;
  width: 100%;
}

footer {
  // Ticker stacked above the input, both centred.
  gap: 1.4rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}
</style>
