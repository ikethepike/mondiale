<template>
  <div v-if="challenge" class="traversal-challenge">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Border Run`"
      :title="`Link ${countryName(challenge.start)} to ${countryName(challenge.target)}`"
      :stakes="`Name the countries that connect them by land — every guess counts, and you have ${challenge.maximumClicks}.`"
      @done="onInterstitialDone"
    />

    <header>
      <div class="prompt">
        <h1 class="map-caption">
          Link {{ countryName(challenge.start) }} to {{ countryName(challenge.target) }}
        </h1>
        <span class="map-caption sub">
          {{ guessesLeft }} {{ guessesLeft === 1 ? 'guess' : 'guesses' }} left
        </span>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
      </div>
    </header>

    <section class="guess-box">
      <form class="guess-form map-caption" @submit.prevent="submitTypedGuess">
        <input
          ref="guessInput"
          v-model="query"
          type="text"
          placeholder="Type a country…"
          autocomplete="off"
          :disabled="submitted"
          @keydown.down.prevent="highlightedIndex = Math.min(highlightedIndex + 1, suggestions.length - 1)"
          @keydown.up.prevent="highlightedIndex = Math.max(highlightedIndex - 1, 0)"
        />
        <ul v-if="suggestions.length" class="suggestions">
          <li
            v-for="(suggestion, index) in suggestions"
            :key="suggestion.isoCode"
            :class="{ highlighted: index === highlightedIndex }"
            @mousedown.prevent="submitGuess(suggestion)"
          >
            <CountryFlag class="suggestion-flag" :country="suggestion" mode="background" />
            <span>{{ countryName(suggestion) }}</span>
          </li>
        </ul>
      </form>
    </section>

    <footer>
      <ol class="route">
        <li class="stop endpoint map-caption">{{ countryName(challenge.start) }}</li>
        <TransitionGroup name="chain">
          <li
            v-for="isoCode in guesses"
            :key="isoCode"
            class="stop map-caption"
            :class="{ stray: !linkedSet.has(isoCode) }"
          >
            <CountryFlag class="stop-flag" :country="getCountry(isoCode)" mode="background" />
            <span>{{ countryName(isoCode) }}</span>
          </li>
        </TransitionGroup>
        <li class="stop endpoint map-caption">{{ countryName(challenge.target) }}</li>
      </ol>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import {
  countryName,
  findCountryByName,
  getCountry,
  searchCountriesByName,
} from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { isNeighbour, isRouteComplete } from '~~/lib/traversal'
import { isTraversalChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

const { gameStore, update, currentRound, game, clearBoard } = useClientEvents()

const challenge = computed(() => {
  const roundChallenge = currentRound.value?.round.groupChallenge
  return isTraversalChallenge(roundChallenge) ? roundChallenge : undefined
})

const guesses = ref<ISOCountryCode[]>([])
const submitted = ref(false)
const showInterstitial = ref(true)
const query = ref('')
const highlightedIndex = ref(0)
const guessInput = ref<HTMLInputElement>()

const guessesLeft = computed(() => (challenge.value?.maximumClicks ?? 0) - guesses.value.length)

const suggestions = computed(() => {
  if (!challenge.value || submitted.value) return []
  const taken = new Set([challenge.value.start, challenge.value.target, ...guesses.value])
  return searchCountriesByName(query.value, 8)
    .filter(country => !taken.has(country.isoCode))
    .slice(0, 6)
})

watch(suggestions, () => (highlightedIndex.value = 0))

/**
 * Guesses connected (through other guesses) to either endpoint — everything
 * else renders as a stray so mistakes are visible immediately.
 */
const linkedSet = computed(() => {
  const active = challenge.value
  if (!active) return new Set<ISOCountryCode>()

  const allowed = new Set([active.start, active.target, ...guesses.value])
  const linked = new Set<ISOCountryCode>()
  const queue = [active.start, active.target]
  const visited = new Set(queue)
  while (queue.length) {
    const current = queue.shift() as ISOCountryCode
    for (const isoCode of allowed) {
      if (visited.has(isoCode) || !isNeighbour(current, isoCode)) continue
      visited.add(isoCode)
      linked.add(isoCode)
      queue.push(isoCode)
    }
  }
  return linked
})

// On easy difficulty the outline map stays visible as an aid; otherwise the
// map IS the answer key, so it hides for the whole round.
const mapAllowed = computed(() => game.value?.difficulty === 'easy')

watch(
  [guesses, challenge],
  () => {
    gameStore.map.highlighted.clear()
    if (!mapAllowed.value || !challenge.value) return
    gameStore.map.highlighted.add(challenge.value.start)
    gameStore.map.highlighted.add(challenge.value.target)
    for (const isoCode of guesses.value) gameStore.map.highlighted.add(isoCode)
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

const submitRound = () => {
  if (submitted.value) return
  submitted.value = true
  update({ event: 'submit-group-challenge-answers', ranking: [...guesses.value] })
}

const submitGuess = (country: Country) => {
  const active = challenge.value
  if (!active || submitted.value) return

  if (country.isoCode === active.start) return flashHint(`You start in ${countryName(country)}`)
  if (country.isoCode === active.target) {
    return flashHint(`${countryName(country)} is the destination — bridge the gap to it`)
  }
  if (guesses.value.includes(country.isoCode)) {
    return flashHint(`${countryName(country)} is already on the board`)
  }

  guesses.value.push(country.isoCode)
  query.value = ''

  // Resolve the moment the guessed countries bridge the endpoints
  if (isRouteComplete(active.start, active.target, guesses.value)) {
    gameStore.map.status = 'correct'
    return submitRound()
  }

  if (guesses.value.length >= active.maximumClicks) {
    gameStore.map.status = 'incorrect'
    flashHint('Out of guesses!')
    setTimeout(submitRound, 1200)
  }
}

const submitTypedGuess = () => {
  const direct = findCountryByName(query.value)
  const picked = suggestions.value[highlightedIndex.value] ?? suggestions.value[0]
  const country = direct ?? picked
  if (!country) return flashHint('No country by that name')

  submitGuess(country)
}

const onInterstitialDone = () => {
  showInterstitial.value = false
  nextTick(() => guessInput.value?.focus())
}

onBeforeMount(() => {
  clearBoard()
  if (!mapAllowed.value) gameStore.map.hidden = true
})
onBeforeUnmount(() => {
  clearBoard()
  gameStore.map.hidden = false
  if (hintTimer) clearTimeout(hintTimer)
})
</script>
<style lang="scss" scoped>
.traversal-challenge {
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

.guess-form {
  width: 34rem;
  max-width: 84vw;
  position: relative;
  pointer-events: auto;
  padding: 0.6rem;

  input {
    width: 100%;
    border: none;
    outline: none;
    background: none;
    font-size: 2.2rem;
    text-align: center;
    font-family: inherit;
    color: var(--dark-blue);

    &::placeholder {
      opacity: 0.45;
      color: var(--dark-blue);
    }
  }
}

.suggestions {
  left: 0;
  right: 0;
  top: 100%;
  margin: 0.6rem 0 0;
  padding: 0.4rem;
  list-style: none;
  position: absolute;
  border-radius: 1.2rem;
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.94);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);

  li {
    gap: 1rem;
    display: flex;
    cursor: pointer;
    align-items: center;
    border-radius: 0.8rem;
    padding: 0.5rem 0.9rem;
    color: var(--dark-blue);

    &.highlighted,
    &:hover {
      background: hsla(197.6, 51.2%, 41.8%, 0.12);
    }
  }
}

.suggestion-flag {
  width: 2.8rem;
  height: 1.9rem;
  flex-shrink: 0;
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
}

footer {
  z-index: 2;
  padding: 2rem;
}

.route {
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  align-items: center;
  justify-content: center;
}

.stop {
  gap: 0.7rem;
  display: flex;
  align-items: center;
  padding: 0.4rem 1.2rem;

  &.endpoint {
    font-weight: bold;
    border-color: var(--dark-blue);
  }

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
