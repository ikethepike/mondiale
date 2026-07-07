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
          {{ found.length }} of {{ challenge.neighbours.length }} found —
          {{ secondsLeft }}s left
        </span>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
      </div>
    </header>

    <section class="guess-box">
      <CountryGuessInput
        ref="guessInput"
        :disabled="submitted || !started"
        :excluded="[challenge.country, ...guesses]"
        placeholder="Type a neighbour…"
        @guess="onGuess"
        @miss="flashHint('No country by that name')"
      />
    </section>

    <footer>
      <div class="timer-track" aria-hidden="true">
        <div class="timer-fill" :style="{ width: `${(secondsLeft / challenge.durationSeconds) * 100}%` }" />
      </div>
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
import CountryFlag from '~/components/country/CountryFlag.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import type { MapTint } from '~~/store/game.store'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

const { gameStore, update, currentRound, clearBoard } = useClientEvents()

const challenge = computed(() => {
  const roundChallenge = currentRound.value?.round.groupChallenge
  return roundChallenge && '_type' in roundChallenge && roundChallenge._type === 'neighbour-blitz-challenge'
    ? roundChallenge
    : undefined
})

const guesses = ref<ISOCountryCode[]>([])
const submitted = ref(false)
const started = ref(false)
const showInterstitial = ref(true)
const secondsLeft = ref(challenge.value?.durationSeconds ?? 45)
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const neighbourSet = computed(() => new Set(challenge.value?.neighbours ?? []))
const found = computed(() => guesses.value.filter(isoCode => neighbourSet.value.has(isoCode)))

// Shapes-only map: the centre country plus guesses materializing around it
clearBoard()
gameStore.map.solo = true

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

const hint = ref('')
let hintTimer: ReturnType<typeof setTimeout> | undefined
const flashHint = (text: string) => {
  hint.value = text
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => (hint.value = ''), 2200)
}

let countdown: ReturnType<typeof setInterval> | undefined

const submitRound = () => {
  if (submitted.value) return
  submitted.value = true
  if (countdown) clearInterval(countdown)
  gameStore.map.status =
    found.value.length >= (challenge.value?.neighbours.length ?? Infinity) ? 'correct' : undefined
  update({ event: 'submit-group-challenge-answers', ranking: [...guesses.value] })
}

const begin = () => {
  showInterstitial.value = false
  started.value = true
  nextTick(() => guessInput.value?.focus())

  countdown = setInterval(() => {
    secondsLeft.value--
    if (secondsLeft.value <= 0) submitRound()
  }, 1000)
}

const onGuess = (country: Country) => {
  const active = challenge.value
  if (!active || submitted.value || !started.value) return

  if (country.isoCode === active.country) {
    return flashHint(`${countryName(country)} is the country itself`)
  }
  if (guesses.value.includes(country.isoCode)) {
    return flashHint(`${countryName(country)} is already on the board`)
  }

  guesses.value.push(country.isoCode)
  if (!neighbourSet.value.has(country.isoCode)) {
    flashHint(`${countryName(country)} doesn't border ${countryName(active.country)}`)
  }

  // Every neighbour found — no reason to run out the clock
  if (found.value.length === active.neighbours.length) {
    gameStore.map.status = 'correct'
    submitRound()
  }
}

onBeforeUnmount(() => {
  clearBoard()
  if (countdown) clearInterval(countdown)
  if (hintTimer) clearTimeout(hintTimer)
})
</script>
<style lang="scss" scoped>
.neighbour-blitz {
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
  display: flex;
  justify-content: center;
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
