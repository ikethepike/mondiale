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
      <CountryGuessInput
        ref="guessInput"
        :disabled="submitted"
        :excluded="excluded"
        @guess="submitGuess"
        @miss="announce({ hint: 'No country by that name' })"
      />
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
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
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
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const guessesLeft = computed(() => (challenge.value?.maximumClicks ?? 0) - guesses.value.length)

// Endpoints leave the suggestions but stay typeable in full — submitGuess
// answers an exact endpoint guess with its hint rather than spending a turn.
const excluded = computed(() =>
  challenge.value
    ? [challenge.value.start, challenge.value.target, ...guesses.value]
    : ([] as ISOCountryCode[])
)

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
  // A wrong step is named — it cost its guesser and helps nobody. A right one
  // is a stepping stone on a route the others are still hunting, so the room
  // sees only that somebody found one.
  const linked = linkedSet.value.has(country.isoCode)
  announce({
    kind: linked ? 'correct' : 'wrong',
    ...(linked ? {} : { isoCode: country.isoCode }),
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

const onInterstitialDone = () => {
  begin()
  nextTick(() => guessInput.value?.focus())
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
.traversal-challenge {
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
  .route {
    max-height: 22dvh;
    overflow-y: auto;
  }

}
</style>
