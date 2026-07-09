<template>
  <div v-if="challenge" class="name-that-water">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Name That Water`"
      :title="challenge.kind === 'lake' ? 'Which lake is this?' : 'Which body of water is this?'"
      :stakes="`It's glowing on the map. Three guesses, ${DURATION_SECONDS} seconds — earlier and fewer guesses score higher.`"
      @done="begin"
    />

    <header>
      <div class="prompt">
        <template v-if="!resolved">
          <h1 class="map-caption">
            {{ challenge.kind === 'lake' ? 'Which lake is this?' : 'Which body of water is this?' }}
          </h1>
          <span class="map-caption sub">
            {{ attemptsLeft }} {{ attemptsLeft === 1 ? 'guess' : 'guesses' }} left —
            {{ secondsLeft }}s
          </span>
        </template>
        <template v-else>
          <h1 class="map-caption">
            {{ resolvedCorrectly ? 'Well spotted' : 'It was' }} — the {{ challenge.featureName }}
          </h1>
          <span class="map-caption sub">{{ shoreLine }}</span>
        </template>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
      </div>
    </header>

    <section v-if="!resolved" class="guess-box">
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      <form class="guess-form map-caption" @submit.prevent="submitTyped">
        <input
          ref="input"
          v-model="query"
          type="text"
          placeholder="Type its name…"
          autocomplete="off"
          :disabled="!started"
          @keydown.down.prevent="
            highlightedIndex = Math.min(highlightedIndex + 1, suggestions.length - 1)
          "
          @keydown.up.prevent="highlightedIndex = Math.max(highlightedIndex - 1, 0)"
        />
        <ul v-if="suggestions.length" class="suggestions">
          <li
            v-for="(suggestion, index) in suggestions"
            :key="suggestion.id"
            :class="{ highlighted: index === highlightedIndex }"
            @mousedown.prevent="pick(suggestion)"
          >
            <span>{{ suggestion.name }}</span>
          </li>
        </ul>
      </form>
    </section>

    <footer v-if="!resolved">
      <ChallengeTimer :value="secondsLeft" :total="DURATION_SECONDS" />
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengeTimer from '~/components/challenge/ChallengeTimer.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName } from '~~/lib/country'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { MapTint } from '~~/store/game.store'
import type { ISOCountryCode } from '~~/types/geography.types'

const DURATION_SECONDS = 45
const MAX_ATTEMPTS = 3

// The glowing feature IS the question — countries stay for context, so this
// mode opts out of the composable's shapes-only default.
const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  hint,
  announce,
  entries,
  submitOnce,
  registerCleanup,
  gameStore,
} = useGroupChallenge('name-water-challenge', { solo: false })

// `NameWaterChallenge` carries no `durationSeconds`, so the composable's
// countdown never arms — this mode paces itself off the constant above.
const secondsLeft = ref(DURATION_SECONDS)
const resolved = ref(false)
const resolvedCorrectly = ref(false)
const attempts = ref(0)
const attemptsLeft = computed(() => MAX_ATTEMPTS - attempts.value)

/** Candidate names for suggestions, loaded with the geometry chunk. */
interface WaterOption {
  id: string
  name: string
}
const options = ref<WaterOption[]>([])

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^(the|el|la|il)\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

onMounted(async () => {
  const active = challenge.value
  if (!active) return
  const { WATER_FEATURES } = await import('~~/data/water.gen')
  const feature = WATER_FEATURES[active.featureId]
  if (feature) {
    gameStore.map.feature = { d: feature.d, kind: 'area', bounds: feature.bounds }
  }
  // Suggestions offer every sea and lake — the full haystack is the game
  options.value = Object.values(WATER_FEATURES)
    .filter(candidate => candidate.kind === 'sea' || candidate.kind === 'lake')
    .map(candidate => ({ id: candidate.id, name: candidate.name }))
})

const query = ref('')
const highlightedIndex = ref(0)
const input = ref<HTMLInputElement>()

const suggestions = computed(() => {
  const needle = normalizeName(query.value)
  if (!needle) return []
  return options.value.filter(option => normalizeName(option.name).includes(needle)).slice(0, 6)
})

watch(suggestions, () => (highlightedIndex.value = 0))

const shoreLine = computed(() => {
  const shores = challenge.value?.countries ?? []
  const names = shores.slice(0, 6).map(isoCode => countryName(isoCode))
  const overflow = shores.length - names.length
  return `Touching ${names.join(', ')}${overflow > 0 ? ` and ${overflow} more` : ''}`
})

let countdown: ReturnType<typeof setInterval> | undefined
let revealTimer: ReturnType<typeof setTimeout> | undefined
registerCleanup(() => {
  if (countdown) clearInterval(countdown)
  if (revealTimer) clearTimeout(revealTimer)
})

/** Earlier and fewer guesses score higher; the reveal beat lands either way. */
const REVEAL_HOLD_MS = 4200
const resolve = (correct: boolean) => {
  const active = challenge.value
  if (!active || resolved.value) return
  resolved.value = true
  resolvedCorrectly.value = correct
  if (countdown) clearInterval(countdown)

  const tints: { [isoCode in ISOCountryCode]?: MapTint } = {}
  for (const isoCode of active.countries) tints[isoCode] = correct ? 'optimal' : 'inefficient'
  gameStore.map.tints = tints
  gameStore.map.labels = true

  const clientScore = correct
    ? Math.round(active.maximumPoints * (1 - (attempts.value - 1) * 0.3))
    : 0

  revealTimer = setTimeout(() => submitOnce([], clientScore), REVEAL_HOLD_MS)
}

const begin = () => {
  showInterstitial.value = false
  started.value = true
  nextTick(() => input.value?.focus())

  countdown = setInterval(() => {
    secondsLeft.value--
    if (secondsLeft.value <= 0) resolve(false)
  }, 1000)
}

const pick = (option: WaterOption) => {
  const active = challenge.value
  if (!active || resolved.value || !started.value) return
  query.value = ''
  attempts.value++

  if (
    option.id === active.featureId ||
    normalizeName(option.name) === normalizeName(active.featureName)
  ) {
    return resolve(true)
  }

  if (attempts.value >= MAX_ATTEMPTS) return resolve(false)
  // No label: the guessed feature narrows the single shared target.
  announce({ kind: 'wrong', hint: `Not the ${option.name} — ${attemptsLeft.value} left` })
}

const submitTyped = () => {
  const exact = options.value.find(
    option => normalizeName(option.name) === normalizeName(query.value)
  )
  const choice = exact ?? suggestions.value[highlightedIndex.value] ?? suggestions.value[0]
  if (!choice) return announce({ hint: 'No water by that name' })
  pick(choice)
}
</script>
<style lang="scss" scoped>
.name-that-water {
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

// Mirrors CountryGuessInput's look for a consistent typing surface
.guess-form {
  width: 34rem;
  max-width: 86vw;
  position: relative;
  pointer-events: auto;

  input {
    width: 100%;
    border: none;
    font-size: 1.8rem;
    font-family: inherit;
    background: transparent;
    color: var(--dark-blue);
    padding: 0.6rem 0.4rem;
    text-align: center;

    &:focus {
      outline: none;
    }
  }

  .suggestions {
    left: 0;
    right: 0;
    margin: 0.6rem 0 0;
    padding: 0.4rem;
    list-style: none;
    position: absolute;
    border-radius: 0.9rem;
    backdrop-filter: blur(0.5rem);
    background: hsla(36, 100%, 98%, 0.94);
    border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);

    li {
      cursor: pointer;
      font-size: 1.6rem;
      border-radius: 0.5rem;
      padding: 0.5rem 0.9rem;

      &.highlighted,
      &:hover {
        background: hsla(215.7, 76.4%, 21.6%, 0.08);
      }
    }
  }
}

footer {
  z-index: 2;
  padding: 2rem;
}
</style>
