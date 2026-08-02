<template>
  <div v-if="challenge" class="stat-detective challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Stat Detective`"
      title="Guess the country from its numbers"
      :stakes="`A clue lands every ${challenge.secondsPerClue} seconds — buzz in early for more points. A wrong buzz locks you out for a moment.`"
      @done="begin"
    />

    <ChallengePrompt :hint="hint">
      <template v-if="!resolved">
        <h1 class="map-caption">Which country is this?</h1>
        <span class="map-caption sub">Clue {{ revealedCount }} of {{ totalClues }}</span>
        <span v-if="challenge.region" class="map-caption region-hint">
          Region: {{ challenge.region }}
        </span>
      </template>
      <template v-else>
        <h1 class="map-caption">It was {{ countryName(challenge.country) }}</h1>
        <span class="map-caption sub">Here it is among its neighbours</span>
      </template>
    </ChallengePrompt>

    <section v-if="!resolved" class="clue-stage">
      <TransitionGroup name="clue" tag="ul" class="clue-list">
        <StatCard
          v-for="clue in displayClues"
          :key="clue.accessorId"
          tag="li"
          class="clue-card"
          :label="clue.label"
          :topic="clue.topic"
          :accessor="clue.accessorId"
          :source-value="clue.amount"
          :style="{ '--depth': clue.depth }"
        >
          <strong class="clue-value">{{ clue.value }}</strong>
          <!-- The big value above already shows the number; the plot adds the
               scale context, so suppress the marker's own value label. -->
          <ScalePlot v-if="clue.scale" v-bind="clue.scale" />
        </StatCard>
        <!-- The final clue: a photo from the country (capital or landmark),
             revealed once every stat has been shown. On phones it takes the
             top of the pile via CSS order — it IS the newest clue. -->
        <StatCard
          v-if="photoRevealed && challenge.photo"
          key="photo-clue"
          tag="li"
          class="clue-card photo-clue"
          label="A glimpse of the place"
          topic="photo"
          :attributions="photoSources"
          :style="{ '--depth': 0 }"
        >
          <div class="photo-clue-stage">
            <ZoomableImage :src="challenge.photo" alt="A place in the mystery country" />
          </div>
        </StatCard>
      </TransitionGroup>
    </section>

    <!-- Clues read above, the answer holds the bottom edge. No suggest-berth:
         the dropdown opens UPWARD over the clue stage (Empire's pattern), so
         the console needs only the keyboard lift. -->
    <footer v-if="!resolved">
      <div class="guess-box">
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
        <!-- The console drains with the round clock; the "Clue N of M" caption
             carries the clue pacing. -->
        <ChallengeConsole class="console" :value="secondsLeft" :total="totalSeconds">
          <CountryGuessInput
            ref="guessInput"
            :disabled="submitted || !started || lockedOut"
            :placeholder="lockedOut ? 'Locked out…' : 'Buzz in — type the country'"
            @guess="onGuess"
            @miss="announce({ hint: 'No country by that name' })"
          />
        </ChallengeConsole>
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import StatCard from '~/components/challenge/StatCard.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import ScalePlot from '~/components/feedback/ScalePlot.vue'
import ZoomableImage from '~/components/challenge/ZoomableImage.vue'
import { BORDERS } from '~~/data/borders.gen'
import { datasetAttribution, dedupeAttributions } from '~~/lib/attribution'
import { accessorTopicLabel, getChallengeDetails, getScaleProps } from '~~/lib/challenges'
import { countryName } from '~~/lib/country'
import { buzzScore } from '~~/lib/scoring'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { useIsPhone } from '~~/lib/use-viewport'
import { formatAmount } from '~~/lib/number'
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
const secondsLeft = ref(0)
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
    const scale = getScaleProps(accessorId, value?.amount)
    return {
      accessorId,
      label: clueLabel(accessorId),
      topic: details?.topic,
      value: value ? formatAmount(value) : '—',
      // The figure itself rides along so the card's ⓘ credits the exact
      // vintage and whichever source won this country's fallback chain.
      amount: value,
      scale,
    }
  })
})

/** The photo clue is a capital skyline or a landmark — only a path travels,
 *  so the ⓘ names both registries honestly. */
const photoSources = dedupeAttributions([
  ...datasetAttribution('capitals'),
  ...datasetAttribution('landmarks'),
])

// The photo lands as one extra clue after every stat has shown.
const hasPhotoClue = computed(() => !!challenge.value?.photo)
const statClueCount = computed(() => challenge.value?.clues.length ?? 0)
const totalClues = computed(() => statClueCount.value + (hasPhotoClue.value ? 1 : 0))
const photoRevealed = computed(
  () => hasPhotoClue.value && revealedCount.value > statClueCount.value
)

// The whole round on one clock: the last clue lands one interval before zero,
// so the tail interval is the grace period the old timer chain gave.
const totalSeconds = computed(() => totalClues.value * (challenge.value?.secondsPerClue ?? 0))

// Phones read newest-first — a new clue lands on top of the pile and old
// ones are a calm scroll below, never a forced one (the old auto-scroll
// yanked the reader's place every clue interval). Desktop keeps the
// dealt-order grid. `depth` counts back from the newest for the dim ramp.
const isPhone = useIsPhone()
const displayClues = computed(() => {
  const clues = revealedClues.value.map((clue, index) => ({
    ...clue,
    depth: revealedClues.value.length - 1 - index,
  }))
  return isPhone.value ? clues.reverse() : clues
})

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
  secondsLeft.value = totalSeconds.value
  nextTick(() => guessInput.value?.focus({ auto: true }))

  const active = challenge.value
  if (!active) return

  // One 1s ticker drives the countdown AND the clue pacing, so the drained
  // bar, the seconds caption and the clue count can never drift apart.
  clueTimer = setInterval(() => {
    secondsLeft.value = Math.max(0, secondsLeft.value - 1)
    const elapsed = totalSeconds.value - secondsLeft.value
    revealedCount.value = Math.min(
      totalClues.value,
      1 + Math.floor(elapsed / active.secondsPerClue)
    )

    if (secondsLeft.value > 0) return
    if (clueTimer) clearInterval(clueTimer)
    clueTimer = undefined
    resolve(undefined, 0)
  }, 1000)
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
    const clientScore = buzzScore(active.maximumPoints, remainingFraction)
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
@use '~/assets/scss/rules/breakpoints' as *;

header .region-hint {
  padding: 0.4rem 1.4rem;
  color: var(--soft-blue);
  font-weight: 600;
}

// The console hugs the bottom, so its suggestions open upward over the clue
// stage — same flip as the night console and the empire timebar.
.guess-box :deep(.suggestions) {
  top: auto;
  bottom: 100%;
  margin: 0 0 0.6rem;
}

.clue-stage {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow-y: auto;
  // Soft edges: clues slide under a fade instead of guillotining at the
  // scroller's bounds.
  mask-image: linear-gradient(
    to bottom,
    transparent,
    black 1.6rem,
    black calc(100% - 1.6rem),
    transparent
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent,
    black 1.6rem,
    black calc(100% - 1.6rem),
    transparent
  );
}

// The ticker's empty line and the roomy footer paddings read as a dead band
// between the clues and the input — collapse them until content earns them.
.guess-box :deep(.guess-ticker) {
  min-height: 0;
}

footer {
  padding-top: 0.4rem;
}

.clue-list {
  gap: 1.2rem;
  padding: 0;
  display: grid;
  list-style: none;
  // Definite width + auto margins: a flex-item grid otherwise sizes to
  // max-content and overflows the viewport centred (clipping both edges);
  // auto margins centre it *safely* once the stage starts scrolling.
  width: 100%;
  margin: auto;
  max-width: 88rem;
  grid-template-columns: repeat(auto-fit, minmax(22rem, 26rem));
  justify-content: center;
}

// Card chrome lives in StatCard — only clue-specific sizing here.
.clue-card {
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
// Scoped under .clue-list so the entrance outranks the phone stack's
// depth-based opacity/transform (equal specificity would lose to it in
// source order and swallow the animation).
.clue-list .clue-enter-active {
  transition:
    opacity var(--motion-base) var(--ease-out-expressive),
    transform var(--motion-base) var(--ease-out-expressive);
}
.clue-list .clue-enter-from {
  opacity: 0;
  transform: translateY(1.4rem) scale(0.94);
}

@media screen and (max-width: $tablet) {
  // Compact single-column clue cards, newest on top (displayClues reverses
  // the order): reading older clues is a plain scroll downward — no sticky
  // pile, no snap, no forced scrolling.
  .clue-stage {
    padding-top: 1.2rem;
    // The view shell is pointer-events: none (map taps pass through); the
    // stack must opt back in or finger-scrolling falls through to the map.
    pointer-events: auto;
  }
  .clue-list {
    gap: 0.8rem;
    padding: 0 1.6rem;
    // Build from the top; desktop keeps the vertically-centred grid.
    margin: 0 auto;
  }
  // Older clues fade and shrink gently down the pile — depth counts back
  // from the newest card.
  .clue-card {
    padding: 1rem 1.2rem;
    background: var(--background-color);
    transform-origin: top center;
    opacity: calc(1 - min(var(--depth, 0) * 0.1, 0.45));
    // The standalone `scale` property, NOT transform: the TransitionGroup's
    // FLIP move writes an inline transform that would stomp a transform-based
    // scale — cards would pop to full size, then visibly shrink back.
    scale: calc(1 - min(var(--depth, 0) * 0.015, 0.08));
    transition:
      opacity var(--motion-slow) var(--ease-smooth),
      scale var(--motion-slow) var(--ease-smooth);

    .clue-value {
      font-size: 2rem;
    }
  }
  // The newest clue leads the pile, wherever it sits in DOM order.
  .photo-clue {
    order: -1;
  }
  // The finale goes full-bleed on phones — the 84vw plate deliberately
  // breaks past the card's border for the reveal-scale moment; only the
  // height compacts for the shorter viewport.
  .photo-clue .photo-clue-stage {
    height: min(34dvh, 30rem);
  }
}
</style>
