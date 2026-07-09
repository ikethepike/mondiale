<template>
  <div v-if="challenge" class="traversal-challenge">
    <Interstitial
      v-if="showInterstitial"
      :tone="challenge.corridor ? 'alert' : 'info'"
      :kicker="
        challenge.corridor
          ? `Round ${currentRound?.number ?? 1} — ${challenge.corridor.name} Corridor`
          : `Round ${currentRound?.number ?? 1} — Border Run`
      "
      :title="`Link ${countryName(challenge.start)} to ${countryName(challenge.target)}`"
      :stakes="
        challenge.corridor
          ? `Only ${challenge.corridor.name} members can bridge the route — every guess counts, and you have ${challenge.maximumClicks}.`
          : `Name the countries that connect them by land — every guess counts, and you have ${challenge.maximumClicks}.`
      "
      @done="onInterstitialDone"
    />

    <header>
      <div class="prompt">
        <h1 class="map-caption">
          Link {{ countryName(challenge.start) }} to {{ countryName(challenge.target) }}
        </h1>
        <span v-if="challenge.corridor" class="map-caption corridor">
          Corridor rule: only {{ challenge.corridor.name }} members can bridge the route
        </span>
        <span class="map-caption sub">
          {{ guessesLeft }} {{ guessesLeft === 1 ? 'guess' : 'guesses' }} left
        </span>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
      </div>
    </header>

    <section class="guess-box">
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      <form class="guess-form map-caption" @submit.prevent="submitTypedGuess">
        <input
          ref="guessInput"
          v-model="query"
          type="text"
          placeholder="Type a country…"
          autocomplete="off"
          :disabled="submitted"
          @keydown.down.prevent="
            highlightedIndex = Math.min(highlightedIndex + 1, suggestions.length - 1)
          "
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
        <li class="stop endpoint map-caption">
          <CountryFlag class="stop-flag" :country="getCountry(challenge.start)" mode="background" />
          <span>{{ countryName(challenge.start) }}</span>
        </li>
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
        <li class="stop endpoint target map-caption">
          <CountryFlag
            class="stop-flag"
            :country="getCountry(challenge.target)"
            mode="background"
          />
          <span>{{ countryName(challenge.target) }}</span>
        </li>
      </ol>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, findCountryByName, getCountry, searchCountriesByName } from '~~/lib/country'
import { distancesFrom, isNeighbour, isRouteComplete } from '~~/lib/traversal'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { MapTint } from '~~/store/game.store'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

// This mode configures its own map presentation from the difficulty below, so
// it opts out of the composable's shapes-only default.
const {
  challenge,
  currentRound,
  showInterstitial,
  submitted,
  begin,
  hint,
  announce,
  entries,
  submitOnce,
  gameStore,
} = useGroupChallenge('traversal-challenge', { solo: false })

const guesses = ref<ISOCountryCode[]>([])
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

// BFS distance fields from both endpoints, for classifying guesses
const distanceMaps = computed(() => {
  const active = challenge.value
  if (!active) return undefined
  return {
    fromStart: distancesFrom(active.start),
    fromTarget: distancesFrom(active.target),
  }
})

const corridorSet = computed(() =>
  challenge.value?.corridor ? new Set(challenge.value.corridor.members) : undefined
)

/** optimal = lies on a shortest route; inefficient = connected detour; stray = neither. */
const tintFor = (isoCode: ISOCountryCode): MapTint => {
  const active = challenge.value
  const maps = distanceMaps.value
  if (!active || !maps) return 'stray'
  // Outside the corridor a guess can never help
  if (corridorSet.value && !corridorSet.value.has(isoCode)) return 'stray'

  const toStart = maps.fromStart.get(isoCode)
  const toTarget = maps.fromTarget.get(isoCode)
  if (
    toStart !== undefined &&
    toTarget !== undefined &&
    toStart + toTarget === active.optimalHops
  ) {
    return 'optimal'
  }

  return linkedSet.value.has(isoCode) ? 'inefficient' : 'stray'
}

// Configure the presentation BEFORE the immediate watcher below paints onto it
gameStore.map.solo = gameStore.game?.difficulty !== 'easy'
gameStore.map.labels = gameStore.game?.difficulty === 'easy'

// Guesses materialize on the map as softly tinted shapes. On easy the full
// outline map (with ISO labels) stays as an aid; otherwise shapes-only.
watch(
  [guesses, challenge],
  () => {
    const active = challenge.value
    gameStore.map.highlighted.clear()

    const tints: { [isoCode in ISOCountryCode]?: MapTint } = {}
    if (active) {
      gameStore.map.highlighted.add(active.start)
      gameStore.map.highlighted.add(active.target)
      tints[active.start] = 'endpoint'
      tints[active.target] = 'endpoint'
      for (const isoCode of guesses.value) {
        gameStore.map.highlighted.add(isoCode)
        tints[isoCode] = tintFor(isoCode)
      }
    }
    gameStore.map.tints = tints
    // The camera reframes to keep every guess in view — a far-flung stray
    // visibly zooms the world out, which is feedback in itself
    gameStore.map.focus = active ? [active.start, active.target, ...guesses.value] : []
  },
  { deep: true, immediate: true }
)

const submitRound = () => {
  submitOnce([...guesses.value])
}

const submitGuess = (country: Country) => {
  const active = challenge.value
  if (!active || submitted.value) return

  if (country.isoCode === active.start)
    return announce({ hint: `You start in ${countryName(country)}` })
  if (country.isoCode === active.target) {
    return announce({ hint: `${countryName(country)} is the destination — bridge the gap to it` })
  }
  if (guesses.value.includes(country.isoCode)) {
    return announce({ hint: `${countryName(country)} is already on the board` })
  }

  guesses.value.push(country.isoCode)
  query.value = ''
  // Each player walks their own route, so naming the step leaks nothing.
  announce({
    kind: linkedSet.value.has(country.isoCode) ? 'correct' : 'wrong',
    isoCode: country.isoCode,
  })

  // Resolve the moment the guessed countries bridge the endpoints
  if (isRouteComplete(active.start, active.target, guesses.value, corridorSet.value)) {
    gameStore.map.status = 'correct'
    return submitRound()
  }

  if (guesses.value.length >= active.maximumClicks) {
    gameStore.map.status = 'incorrect'
    announce({ hint: 'Out of guesses!' })
    setTimeout(submitRound, 1200)
  }
}

const submitTypedGuess = () => {
  const direct = findCountryByName(query.value)
  const picked = suggestions.value[highlightedIndex.value] ?? suggestions.value[0]
  const country = direct ?? picked
  if (!country) return announce({ hint: 'No country by that name' })

  submitGuess(country)
}

const onInterstitialDone = () => {
  begin()
  nextTick(() => guessInput.value?.focus())
}
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
  .hint,
  .corridor {
    padding: 0.4rem 1.4rem;
  }

  .hint,
  .corridor {
    color: var(--hior-ange);
  }

  .corridor {
    font-weight: bold;
    border-color: hsla(9.8, 81.3%, 60.2%, 0.35);
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
    border-width: 0.15rem;
  }

  // The destination reads as "still to reach"
  &.target::before {
    content: '⟶';
    opacity: 0.5;
    font-weight: normal;
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
