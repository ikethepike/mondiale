<template>
  <div v-if="challenge" class="water-blitz">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — ${copy.kicker}`"
      :title="copy.title"
      :stakes="`${challenge.countries.length} countries — name as many as you can in ${challenge.durationSeconds} seconds. Wrong names cost points.`"
      @done="begin"
    />

    <header>
      <div class="prompt">
        <h1 class="map-caption">{{ copy.title }}</h1>
        <span class="map-caption sub">
          {{ found.length }} of {{ challenge.countries.length }} found
        </span>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
      </div>
    </header>

    <section class="guess-box">
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      <!-- The round clock lives inside the console pill — this mode's lower
           half belongs to the guess box and the found list. -->
      <ChallengeConsole class="console" :value="secondsLeft" :total="challenge.durationSeconds">
        <CountryGuessInput
          ref="guessInput"
          :disabled="submitted || !started"
          :excluded="guesses"
          :placeholder="copy.placeholder"
          @guess="onGuess"
          @miss="announce({ hint: 'No country by that name' })"
        />
      </ChallengeConsole>
    </section>

    <footer>
      <TransitionGroup tag="ol" name="chain" class="found-list">
        <li
          v-for="isoCode in guesses"
          :key="isoCode"
          class="stop map-caption"
          :class="{ stray: !answerSet.has(isoCode) }"
        >
          <CountryFlag class="stop-flag" :country="getCountry(isoCode)" mode="background" />
          <span>{{ countryName(isoCode) }}</span>
        </li>
      </TransitionGroup>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useCollectSetRound } from '~~/lib/use-collect-set-round'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'

// Full world map with the feature drawn on top; guesses tint as they land — so
// this mode opts out of the composable's shapes-only default.
const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  begin: beginRound,
  hint,
  announce,
  entries,
  submitOnce,
  gameStore,
} = useGroupChallenge('water-blitz-challenge', { solo: false })

/** One view, three moods — the feature kind decides the copy. */
const copy = computed(() => {
  const active = challenge.value
  const name = active?.featureName ?? ''
  switch (active?.kind) {
    case 'river':
      return {
        kicker: 'River Run',
        title: `The ${name} flows through which countries?`,
        placeholder: 'Type a country along the river…',
      }
    case 'sea':
    case 'lake':
      return {
        kicker: 'Shared Shores',
        title: `Name every country on the ${name}`,
        placeholder: 'Type a country on this shore…',
      }
    default:
      return {
        kicker: 'Highlands & Basins',
        title: `The ${name} spans which countries?`,
        placeholder: 'Type a country it touches…',
      }
  }
})

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

onMounted(async () => {
  const active = challenge.value
  if (!active) return
  // Geometry lives in its own lazy chunk — only the feature id travelled
  const { WATER_FEATURES } = await import('~~/data/water.gen')
  const feature = WATER_FEATURES[active.featureId]
  if (!feature) return
  gameStore.map.feature = {
    d: feature.d,
    kind: feature.kind === 'river' ? 'line' : 'area',
    bounds: feature.bounds,
  }
})

const { guesses, answerSet, found, start: begin, onGuess } = useCollectSetRound(
  { submitted, started, announce, submitOnce, begin: beginRound, gameStore },
  {
    answers: () => challenge.value?.countries ?? [],
    wrongHint: country => `${countryName(country)} isn't one of them`,
    focusInput: () => guessInput.value?.focus(),
  }
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;
.water-blitz {
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

.guess-box {
  gap: 1.2rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

.console {
  width: min(42rem, calc(100vw - 3.2rem));
}

footer {
  z-index: 2;
  padding: 2rem;
}

.found-list {
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  justify-content: center;
}

.stop {
  gap: 0.7rem;
  display: flex;
  align-items: center;
  padding: 0.4rem 1.2rem;

  &.stray {
    opacity: 0.65;
    border-color: hsla(9.8, 81.3%, 60.2%, 0.6);
  }
}

.stop-flag {
  width: 2.6rem;
  height: 1.8rem;
  border: 0.1rem solid ink(0.25);
}

.chain-enter-from {
  opacity: 0;
  transform: translateY(0.8rem) scale(0.9);
}
.chain-enter-active,
.chain-move {
  transition:
    opacity var(--motion-quick) var(--ease-out-expressive),
    transform var(--motion-quick) var(--ease-out-expressive);
}

// Compact phone chrome: tighter prompt padding, footer clear of the home
// indicator.
@media screen and (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }
  footer {
    padding: 1.2rem 1.6rem calc(1.2rem + var(--safe-bottom));
  }
  // Long answer lists scroll instead of swallowing the map and input.
  .found-list {
    max-height: 22dvh;
    overflow-y: auto;
    // .main-board kills pointer events — restore them or the list can't be
    // touch-scrolled at all.
    pointer-events: auto;
    overscroll-behavior: contain;
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
