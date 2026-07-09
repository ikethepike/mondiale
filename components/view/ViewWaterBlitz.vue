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
          {{ found.length }} of {{ challenge.countries.length }} found — {{ secondsLeft }}s left
        </span>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
      </div>
    </header>

    <section class="guess-box">
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      <CountryGuessInput
        ref="guessInput"
        :disabled="submitted || !started"
        :excluded="guesses"
        :placeholder="copy.placeholder"
        @guess="onGuess"
        @miss="announce({ hint: 'No country by that name' })"
      />
    </section>

    <footer>
      <div class="timer-track" aria-hidden="true">
        <div
          class="timer-fill"
          :style="{ width: `${(secondsLeft / challenge.durationSeconds) * 100}%` }"
        />
      </div>
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
import CountryFlag from '~/components/country/CountryFlag.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { MapTint } from '~~/store/game.store'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

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

const guesses = ref<ISOCountryCode[]>([])
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const answerSet = computed(() => new Set(challenge.value?.countries ?? []))
const found = computed(() => guesses.value.filter(isoCode => answerSet.value.has(isoCode)))

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

watch(
  [guesses, challenge],
  () => {
    const tints: { [isoCode in ISOCountryCode]?: MapTint } = {}
    for (const isoCode of guesses.value) {
      tints[isoCode] = answerSet.value.has(isoCode) ? 'optimal' : 'stray'
    }
    gameStore.map.tints = tints
  },
  { deep: true, immediate: true }
)

const submitRound = () => {
  if (submitted.value) return
  gameStore.map.status =
    found.value.length >= (challenge.value?.countries.length ?? Infinity) ? 'correct' : undefined
  submitOnce([...guesses.value])
}

const begin = () => {
  beginRound({ onTimeout: submitRound })
  nextTick(() => guessInput.value?.focus())
}

const onGuess = (country: Country) => {
  const active = challenge.value
  if (!active || submitted.value || !started.value) return

  if (guesses.value.includes(country.isoCode)) {
    return announce({ hint: `${countryName(country)} is already on the board` })
  }

  guesses.value.push(country.isoCode)
  const correct = answerSet.value.has(country.isoCode)
  announce({
    kind: correct ? 'correct' : 'wrong',
    isoCode: country.isoCode,
    hint: correct ? undefined : `${countryName(country)} isn't one of them`,
  })

  // Everything found — no reason to run out the clock
  if (found.value.length === active.countries.length) {
    gameStore.map.status = 'correct'
    submitRound()
  }
}
</script>
<style lang="scss" scoped>
.water-blitz {
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

footer {
  z-index: 2;
  padding: 2rem;
}

.timer-track {
  height: 0.5rem;
  margin: 0 auto 1.6rem;
  max-width: 46rem;
  border-radius: 0.25rem;
  background: hsla(215.7, 76.4%, 21.6%, 0.12);
  overflow: hidden;
}

.timer-fill {
  height: 100%;
  background: var(--soft-blue);
  transition: width 1s linear;
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
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
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
</style>
