<template>
  <div v-if="challenge" class="name-that-water challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Name That Water`"
      :title="promptTitle"
      :stakes="`It's glowing on the map. ${challenge.maximumGuesses} guesses, ${challenge.durationSeconds} seconds — earlier and fewer guesses score higher. Hints surface as the clock runs, each costing points.`"
      @done="begin"
    />

    <ChallengePrompt :hint="hint">
      <template v-if="!resolved">
        <h1 class="map-caption">{{ promptTitle }}</h1>
        <span class="map-caption sub">
          {{ attemptsLeft }} {{ attemptsLeft === 1 ? 'guess' : 'guesses' }} left
        </span>
        <Transition name="caption">
          <span v-if="shoreHint" class="map-caption sub clue">{{ shoreHint }}</span>
        </Transition>
        <Transition name="caption">
          <span v-if="letterHint" class="map-caption sub clue">{{ letterHint }}</span>
        </Transition>
      </template>
      <template v-else>
        <h1 class="map-caption">
          {{ resolvedCorrectly ? 'Well spotted' : 'It was' }} — the {{ challenge.featureName }}
        </h1>
        <span class="map-caption sub">{{ shoreLine }}</span>
      </template>
    </ChallengePrompt>

    <section v-if="!resolved" class="guess-box">
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      <div class="hint-row">
        <Transition name="caption">
          <button
            v-if="!shoreHint && shoreHintUnlocked"
            class="hint-button"
            type="button"
            @click="showShoreHint"
          >
            <StatTopicIcon class="hint-icon" topic="reveal" />
            Shores (−{{ hintBitePoints }} pts)
          </button>
        </Transition>
        <Transition name="caption">
          <button
            v-if="!letterHint && letterHintUnlocked"
            class="hint-button"
            type="button"
            @click="showLetterHint"
          >
            <StatTopicIcon class="hint-icon" topic="question" />
            Initials (−{{ hintBitePoints }} pts)
          </button>
        </Transition>
      </div>
      <ChallengeConsole class="console" :value="secondsLeft" :total="challenge.durationSeconds">
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
      </ChallengeConsole>
    </section>
  </div>
</template>
<script lang="ts" setup>
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName } from '~~/lib/country'
import { normalizeAnswer } from '~~/lib/strings'
import { attemptFraction, HINT_BITE_FRACTION, hintDockedScore } from '~~/lib/scoring'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { MapTint } from '~~/store/game.store'
import type { ISOCountryCode } from '~~/types/geography.types'

// The glowing feature IS the question — countries stay for context, so this
// mode opts out of the composable's shapes-only default.
const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  elapsedFraction,
  hint,
  announce,
  entries,
  submitOnce,
  registerCleanup,
  gameStore,
} = useGroupChallenge('name-water-challenge', { solo: false })

// This mode runs its own clock, because the reveal holds after the countdown
// stops. `begin` below shadows the composable's, which is never destructured —
// calling it as well would arm a second countdown off the same durationSeconds.
const secondsLeft = ref(0)
const resolved = ref(false)
const resolvedCorrectly = ref(false)
const attempts = ref(0)
const attemptsLeft = computed(() => (challenge.value?.maximumGuesses ?? 0) - attempts.value)

/** Candidate names for suggestions, loaded with the geometry chunk. */
interface WaterOption {
  id: string
  name: string
}
const options = ref<WaterOption[]>([])

const normalizeName = (name: string) => normalizeAnswer(name, { articles: ['the', 'el', 'la', 'il'] })

onMounted(async () => {
  const active = challenge.value
  if (!active) return
  const { WATER_FEATURES } = await import('~~/data/water.gen')
  const feature = WATER_FEATURES[active.featureId]
  if (feature) {
    gameStore.map.feature = { d: feature.d, kind: 'area', bounds: feature.bounds }
  }
  // Suggestions offer every ocean, sea and lake — the full haystack is the game
  options.value = Object.values(WATER_FEATURES)
    .filter(
      candidate =>
        candidate.kind === 'ocean' || candidate.kind === 'sea' || candidate.kind === 'lake'
    )
    .map(candidate => ({ id: candidate.id, name: candidate.name }))
})

const promptTitle = computed(() => {
  switch (challenge.value?.kind) {
    case 'ocean':
      return 'Which ocean is this?'
    case 'lake':
      return 'Which lake is this?'
    default:
      return 'Which body of water is this?'
  }
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

// Buyable hints unlock in waves: shores a third in, initials two thirds in.
// Each bought hint bites HINT_BITE_FRACTION of the pot off the final score.
const SHORE_HINT_UNLOCK_ELAPSED = 1 / 3
const LETTER_HINT_UNLOCK_ELAPSED = 2 / 3
const shoreHint = ref<string>()
const letterHint = ref<string>()

const shoreHintUnlocked = computed(
  () => !resolved.value && elapsedFraction.value >= SHORE_HINT_UNLOCK_ELAPSED
)
const letterHintUnlocked = computed(
  () => !resolved.value && elapsedFraction.value >= LETTER_HINT_UNLOCK_ELAPSED
)
const hintsUsed = computed(() => (shoreHint.value ? 1 : 0) + (letterHint.value ? 1 : 0))
const hintBitePoints = computed(() =>
  Math.round((challenge.value?.maximumPoints ?? 0) * HINT_BITE_FRACTION)
)

const showShoreHint = () => {
  const active = challenge.value
  if (!active || resolved.value || shoreHint.value) return
  const shores = active.countries.slice(0, 2).map(isoCode => countryName(isoCode))
  shoreHint.value = `Touches ${shores.join(' and ')}`
}

const showLetterHint = () => {
  const active = challenge.value
  if (!active || resolved.value || letterHint.value) return
  const initials = active.featureName
    .split(/\s+/)
    .map(word => `${word[0]}…`)
    .join(' ')
  letterHint.value = `Its initials: ${initials}`
}

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
    ? hintDockedScore(
        Math.round(active.maximumPoints * attemptFraction(attempts.value, active.maximumGuesses)),
        active.maximumPoints,
        hintsUsed.value
      )
    : 0

  revealTimer = setTimeout(() => submitOnce([], clientScore), REVEAL_HOLD_MS)
}

const begin = () => {
  showInterstitial.value = false
  started.value = true
  secondsLeft.value = challenge.value?.durationSeconds ?? 0
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

  if (attempts.value >= active.maximumGuesses) return resolve(false)
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
@use '~/assets/scss/rules/ink' as *;

// Bought clues persist under the guess counter, unlike the transient miss toast.
header .clue {
  color: var(--hior-ange);
}

.guess-box {
  // Centred in the space under the prompt (the old footer used to hold the
  // bottom): the suggestion list opens downward and needs the room below.
  margin: auto 0;
}

// Hint chips come from templates/_hint-chip.scss.

// Mirrors CountryGuessInput's look for a consistent typing surface (the
// console strips the pill and owns the width).
.guess-form {
  position: relative;

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
    background: milk(0.94);
    border: 0.1rem solid ink(0.25);

    li {
      cursor: pointer;
      font-size: 1.6rem;
      border-radius: 0.5rem;
      padding: 0.5rem 0.9rem;

      &.highlighted,
      &:hover {
        background: ink(0.08);
      }
    }
  }
}
</style>
