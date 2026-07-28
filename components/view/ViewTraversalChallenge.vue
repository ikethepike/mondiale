<template>
  <div v-if="challenge" class="traversal-challenge challenge-shell">
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

    <ChallengePrompt :hint="hint">
      <h1 class="map-caption">
        Link {{ countryName(challenge.start) }} to {{ countryName(challenge.target) }}
      </h1>
      <span v-if="challenge.corridor" class="map-caption corridor">
        Corridor rule: only {{ challenge.corridor.name }} members can bridge the route
      </span>
      <span class="map-caption sub">
        {{ guessesLeft }} {{ guessesLeft === 1 ? 'guess' : 'guesses' }} left
      </span>
    </ChallengePrompt>

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
      <ol class="route country-chip-list">
        <CountryChip class="endpoint map-caption" :country="getCountry(challenge.start)" />
        <TransitionGroup name="chain">
          <CountryChip
            v-for="isoCode in guesses"
            :key="isoCode"
            class="map-caption"
            :class="{ stray: !linkedSet.has(isoCode) }"
            :country="getCountry(isoCode)"
          />
        </TransitionGroup>
        <CountryChip class="endpoint target map-caption" :country="getCountry(challenge.target)" />
      </ol>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import CountryChip from '~/components/country/CountryChip.vue'
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
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;
header .corridor {
  font-weight: bold;
  padding: 0.4rem 1.4rem;
  color: var(--hior-ange);
  border-color: flame(0.35);
}

// Chip and route-list recipes come from templates/_country-chip.scss;
// only the journey's own accents live here.
.endpoint {
  font-weight: bold;
  border-color: var(--dark-blue);
  border-width: 0.15rem;
}

// The destination reads as "still to reach"
.target::before {
  content: '⟶';
  opacity: 0.5;
  font-weight: normal;
}
</style>
