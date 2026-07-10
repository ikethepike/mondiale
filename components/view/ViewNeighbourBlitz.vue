<template>
  <div v-if="challenge" class="neighbour-blitz">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Neighbour Blitz`"
      :title="`Name ${countryName(challenge.country)}'s neighbours`"
      :stakes="`${challenge.neighbours.length} countries share a border with it — name as many as you can in ${challenge.durationSeconds} seconds. Wrong names cost points.`"
      @done="begin"
    />

    <header>
      <div class="prompt">
        <h1 class="map-caption">Name {{ countryName(challenge.country) }}'s neighbours</h1>
        <span class="map-caption sub">
          {{ found.length }} of {{ challenge.neighbours.length }} found — {{ secondsLeft }}s left
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
        :excluded="[challenge.country, ...guesses]"
        placeholder="Type a neighbour…"
        @guess="onGuess"
        @miss="announce({ hint: 'No country by that name' })"
      />
    </section>

    <footer>
      <ChallengeTimer class="timer" :value="secondsLeft" :total="challenge.durationSeconds" />
      <TransitionGroup tag="ol" name="chain" class="found-list">
        <li
          v-for="isoCode in guesses"
          :key="isoCode"
          class="stop map-caption"
          :class="{ stray: !neighbourSet.has(isoCode) }"
        >
          <CountryFlag class="stop-flag" :country="getCountry(isoCode)" mode="background" />
          <span>{{ countryName(isoCode) }}</span>
        </li>
      </TransitionGroup>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengeTimer from '~/components/challenge/ChallengeTimer.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { MapTint } from '~~/store/game.store'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

// Shapes-only map: the centre country plus guesses materializing around it
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
} = useGroupChallenge('neighbour-blitz-challenge')

const guesses = ref<ISOCountryCode[]>([])
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const neighbourSet = computed(() => new Set(challenge.value?.neighbours ?? []))
const found = computed(() => guesses.value.filter(isoCode => neighbourSet.value.has(isoCode)))

watch(
  [guesses, challenge],
  () => {
    const active = challenge.value
    gameStore.map.highlighted.clear()
    const tints: { [isoCode in ISOCountryCode]?: MapTint } = {}
    if (active) {
      gameStore.map.highlighted.add(active.country)
      tints[active.country] = 'endpoint'
      for (const isoCode of guesses.value) {
        gameStore.map.highlighted.add(isoCode)
        tints[isoCode] = neighbourSet.value.has(isoCode) ? 'optimal' : 'stray'
      }
    }
    gameStore.map.tints = tints
    gameStore.map.focus = active ? [active.country, ...guesses.value] : []
  },
  { deep: true, immediate: true }
)

const submitRound = () => {
  if (submitted.value) return
  gameStore.map.status =
    found.value.length >= (challenge.value?.neighbours.length ?? Infinity) ? 'correct' : undefined
  submitOnce([...guesses.value])
}

const begin = () => {
  beginRound({ onTimeout: submitRound })
  nextTick(() => guessInput.value?.focus())
}

const onGuess = (country: Country) => {
  const active = challenge.value
  if (!active || submitted.value || !started.value) return

  if (country.isoCode === active.country) {
    return announce({ hint: `${countryName(country)} is the country itself` })
  }
  if (guesses.value.includes(country.isoCode)) {
    return announce({ hint: `${countryName(country)} is already on the board` })
  }

  guesses.value.push(country.isoCode)
  const correct = neighbourSet.value.has(country.isoCode)
  // Everyone races the same list, so a right name would be a free answer. Only
  // the misses are named; a hit says just that somebody found one.
  announce({
    kind: correct ? 'correct' : 'wrong',
    ...(correct
      ? {}
      : {
          isoCode: country.isoCode,
          hint: `${countryName(country)} doesn't border ${countryName(active.country)}`,
        }),
  })

  // Every neighbour found — no reason to run out the clock
  if (found.value.length === active.neighbours.length) {
    gameStore.map.status = 'correct'
    submitRound()
  }
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
.neighbour-blitz {
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

footer {
  z-index: 2;
  padding: 2rem;
}

.timer {
  margin: 0 auto 1.6rem;
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
  }

}
</style>
