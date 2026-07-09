<template>
  <div v-if="challenge" class="stat-detective">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Stat Detective`"
      title="Guess the country from its numbers"
      :stakes="`A clue lands every ${challenge.secondsPerClue} seconds — buzz in early for more points. A wrong buzz locks you out for a moment.`"
      @done="begin"
    />

    <header>
      <div class="prompt">
        <template v-if="!resolved">
          <h1 class="map-caption">Which country is this?</h1>
          <span class="map-caption sub">
            Clue {{ revealedCount }} of {{ totalClues }} — earlier answers score higher
          </span>
          <span v-if="challenge.region" class="map-caption region-hint">
            Region: {{ challenge.region }}
          </span>
        </template>
        <template v-else>
          <h1 class="map-caption">It was {{ countryName(challenge.country) }}</h1>
          <span class="map-caption sub">Here it is among its neighbours</span>
        </template>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
      </div>
    </header>

    <section v-if="!resolved" class="clue-stage">
      <TransitionGroup name="clue" tag="ul" class="clue-list">
        <li v-for="clue in revealedClues" :key="clue.accessorId" class="clue-card">
          <span class="clue-label">{{ clue.label }}</span>
          <strong class="clue-value">{{ clue.value }}</strong>
          <!-- The big value above already shows the number; the plot adds the
               scale context, so suppress the marker's own value label. -->
          <ScalePlot
            v-if="clue.scale"
            :amount="clue.scale.amount"
            :min="clue.scale.min"
            :max="clue.scale.max"
            :invert="clue.scale.invert"
            :least-label="clue.scale.leastLabel"
            :most-label="clue.scale.mostLabel"
          />
        </li>
        <!-- Non-hard mode's final clue: a photo from the country (capital or
             landmark), revealed once every stat has been shown. -->
        <li v-if="photoRevealed && challenge.photo" key="photo-clue" class="clue-card photo-clue">
          <span class="clue-label">A glimpse of the place</span>
          <div class="photo-clue-stage">
            <ZoomableImage :src="challenge.photo" alt="A place in the mystery country" />
          </div>
        </li>
      </TransitionGroup>
    </section>

    <section v-if="!resolved" class="guess-box">
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      <CountryGuessInput
        ref="guessInput"
        :disabled="submitted || !started || lockedOut"
        :placeholder="lockedOut ? 'Locked out…' : 'Buzz in — type the country'"
        @guess="onGuess"
        @miss="announce({ hint: 'No country by that name' })"
      />
    </section>

    <footer v-if="!resolved">
      <div class="timer-track" aria-hidden="true">
        <div
          class="timer-fill"
          :style="{ width: `${(revealedClues.length / challenge.clues.length) * 100}%` }"
        />
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import ScalePlot from '~/components/feedback/ScalePlot.vue'
import ZoomableImage from '~/components/challenge/ZoomableImage.vue'
import { BORDERS } from '~~/data/borders.gen'
import { accessorTopicLabel, getChallengeDetails } from '~~/lib/challenges'
import { countryName } from '~~/lib/country'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { formatNumber } from '~~/lib/number'
import { getValueByAccessorID } from '~~/lib/values'
import type { Country, ISOCountryCode } from '~~/types/geography.types'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'

// Blank the world map — the numbers are the whole question
const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  begin: beginRound,
  hint,
  announce,
  entries,
  submitOnce,
  registerCleanup,
  gameStore,
} = useGroupChallenge('stat-detective-challenge')

const resolved = ref(false)
const lockedOut = ref(false)
const revealedCount = ref(0)
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const clueLabel = (accessorId: GroupChallengeAccessorId) => accessorTopicLabel(accessorId)

const revealedClues = computed(() => {
  const active = challenge.value
  if (!active) return []
  return active.clues.slice(0, revealedCount.value).map(accessorId => {
    const value = getValueByAccessorID(active.country, accessorId)
    const details = getChallengeDetails(accessorId)
    // Bounded indices (democracy, corruption, gini) carry a fixed scale + pole
    // labels — plot the value so "0.3 index" reads as "low on a 0–1 scale".
    const scale =
      value && details?.scale && details.markers
        ? {
            amount: value.amount,
            min: details.scale.min,
            max: details.scale.max,
            invert: details.scale.invert,
            leastLabel: details.markers.least,
            mostLabel: details.markers.most,
          }
        : undefined
    return {
      accessorId,
      label: clueLabel(accessorId),
      value: value ? `${formatNumber(value.amount)}${value.unit ? ` ${value.unit}` : ''}` : '—',
      scale,
    }
  })
})

// Non-hard mode adds a photo as one extra clue after every stat has shown.
const hasPhotoClue = computed(() => !!challenge.value?.photo)
const statClueCount = computed(() => challenge.value?.clues.length ?? 0)
const totalClues = computed(() => statClueCount.value + (hasPhotoClue.value ? 1 : 0))
const photoRevealed = computed(
  () => hasPhotoClue.value && revealedCount.value > statClueCount.value
)

// Paced by `secondsPerClue`, not a round countdown — the clue interval is local
let clueTimer: ReturnType<typeof setInterval> | undefined
let lockoutTimer: ReturnType<typeof setTimeout> | undefined
let revealTimer: ReturnType<typeof setTimeout> | undefined
registerCleanup(() => {
  if (clueTimer) clearInterval(clueTimer)
  if (lockoutTimer) clearTimeout(lockoutTimer)
  if (revealTimer) clearTimeout(revealTimer)
})

const submitRound = (guess: ISOCountryCode | undefined, clientScore: number) => {
  submitOnce(guess ? [guess] : [], clientScore)
}

/** Same resolution beat as the silhouette: land the answer as a PLACE. */
const REVEAL_HOLD_MS = 4000
const resolve = (guess: ISOCountryCode | undefined, clientScore: number) => {
  const active = challenge.value
  if (!active || resolved.value) return
  resolved.value = true
  if (clueTimer) clearInterval(clueTimer)

  gameStore.map.solo = false
  gameStore.map.labels = true
  gameStore.map.reveal = active.country
  const neighbours = BORDERS[active.country] ?? []
  gameStore.map.focus = [active.country]
  gameStore.map.focusContext = neighbours
  gameStore.map.tints[active.country] = guess ? 'optimal' : 'stray'
  for (const neighbour of neighbours) {
    gameStore.map.tints[neighbour] = 'inefficient'
  }

  revealTimer = setTimeout(() => submitRound(guess, clientScore), REVEAL_HOLD_MS)
}

const begin = () => {
  beginRound()
  revealedCount.value = 1
  nextTick(() => guessInput.value?.focus())

  const active = challenge.value
  if (!active) return

  clueTimer = setInterval(() => {
    if (revealedCount.value < totalClues.value) {
      revealedCount.value++
      return
    }

    // Everything shown — one final grace interval, then it resolves unsolved
    if (clueTimer) clearInterval(clueTimer)
    clueTimer = undefined
    revealTimer = setTimeout(() => resolve(undefined, 0), active.secondsPerClue * 1000)
  }, active.secondsPerClue * 1000)
}

const onGuess = (country: Country) => {
  const active = challenge.value
  if (!active || submitted.value || resolved.value || lockedOut.value || !started.value) return

  if (country.isoCode === active.country) {
    // Fewer clues seen, bigger score
    const remainingFraction = Math.max(
      0,
      (active.clues.length - revealedCount.value) / active.clues.length
    )
    const clientScore = Math.round(active.maximumPoints * (0.35 + 0.65 * remainingFraction))
    resolve(country.isoCode, clientScore)
    return
  }

  // No isoCode: a wrong buzz would name a candidate for the shared answer.
  announce({ kind: 'locked', hint: `Not ${countryName(country)} — locked out for 3 seconds` })
  lockedOut.value = true
  if (lockoutTimer) clearTimeout(lockoutTimer)
  lockoutTimer = setTimeout(() => {
    lockedOut.value = false
    nextTick(() => guessInput.value?.focus())
  }, 3000)
}
</script>
<style lang="scss" scoped>
.stat-detective {
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
  .region-hint {
    padding: 0.4rem 1.4rem;
    color: var(--soft-blue);
    font-weight: 600;
  }
  .prompt {
    gap: 1rem;
    display: flex;
    align-items: center;
    flex-flow: column nowrap;
  }
}

.clue-stage {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow-y: auto;
  align-items: center;
  justify-content: center;
}

.clue-list {
  gap: 1.2rem;
  margin: 0;
  padding: 0;
  display: grid;
  list-style: none;
  max-width: 88rem;
  grid-template-columns: repeat(auto-fit, minmax(22rem, 26rem));
  justify-content: center;
}

.clue-card {
  gap: 0.5rem;
  display: flex;
  padding: 1.6rem;
  text-align: center;
  align-items: center;
  border-radius: 1.2rem;
  flex-flow: column nowrap;
  color: var(--dark-blue);
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.88);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);

  .clue-label {
    opacity: 0.65;
    font-size: 1.3rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .clue-value {
    font-size: 2.4rem;
  }
}

// The photo clue spans the grid and gives the image real room.
.photo-clue {
  grid-column: 1 / -1;

  .photo-clue-stage {
    width: min(40rem, 84vw);
    height: min(24rem, 32vh);
    margin-top: 0.4rem;
  }
}

// New clues arrive with a settle
.clue-enter-active {
  transition:
    opacity var(--motion-base) var(--ease-out-expressive),
    transform var(--motion-base) var(--ease-out-expressive);
}
.clue-enter-from {
  opacity: 0;
  transform: translateY(1.4rem) scale(0.94);
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
  margin: 0 auto;
  max-width: 46rem;
  overflow: hidden;
  border-radius: 0.25rem;
  background: hsla(215.7, 76.4%, 21.6%, 0.12);
}

.timer-fill {
  height: 100%;
  background: var(--soft-blue);
  transition: width 1s linear;
}
</style>
