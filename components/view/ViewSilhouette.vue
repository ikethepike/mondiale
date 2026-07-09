<template>
  <div v-if="challenge" class="silhouette-challenge">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Silhouette`"
      title="Whose outline is this?"
      :stakes="`The outline draws itself over ${challenge.durationSeconds} seconds — buzz in early for more points. A wrong buzz locks you out for a moment.`"
      @done="begin"
    />

    <header>
      <div class="prompt">
        <template v-if="!resolved">
          <h1 class="map-caption">Whose outline is this?</h1>
          <span class="map-caption sub">{{ secondsLeft }}s — earlier answers score higher</span>
          <span v-if="regionRevealed && challenge.region" class="map-caption region-hint">
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

    <section v-show="!resolved" class="outline-stage">
      <svg v-if="outline" class="outline" :viewBox="outline.viewBox" aria-hidden="true">
        <path ref="outlinePath" :d="outline.d" />
      </svg>
    </section>

    <footer v-if="!resolved">
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      <!-- Ticker sits above the input so the input's suggestion list can open
           downward into clear space without the timer cutting across it. -->
      <ChallengeTimer :value="secondsLeft" :total="challenge.durationSeconds" />
      <div class="guess-box">
        <CountryGuessInput
          ref="guessInput"
          :disabled="submitted || !started || lockedOut"
          :placeholder="lockedOut ? 'Locked out…' : 'Buzz in — type the country'"
          @guess="onGuess"
          @miss="announce({ hint: 'No country by that name' })"
        />
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import ChallengeTimer from '~/components/challenge/ChallengeTimer.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { BORDERS } from '~~/data/borders.gen'
import { countryName } from '~~/lib/country'
import { prefersReducedMotion } from '~~/lib/motion'
import { mainlandOutline } from '~~/lib/outline'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

// Blank the world map — the silhouette IS the whole question
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
  stopCountdown,
  registerCleanup,
  gameStore,
} = useGroupChallenge('silhouette-challenge')

const resolved = ref(false)
const lockedOut = ref(false)
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

// The region hint (non-hard mode) surfaces only in the final 30% of the clock —
// a late nudge once the outline is nearly whole, not a giveaway from the start.
const regionRevealed = computed(() => {
  const total = challenge.value?.durationSeconds ?? 30
  return started.value && secondsLeft.value / total <= 0.3
})
const outlinePath = ref<SVGPathElement>()

/** The country's mainland ring, framed in its own viewBox. */
const outline = ref<{ d: string; viewBox: string }>()
onMounted(() => {
  const active = challenge.value
  if (!active) return
  outline.value = mainlandOutline(active.country)
})

let lockoutTimer: ReturnType<typeof setTimeout> | undefined
let revealTimer: ReturnType<typeof setTimeout> | undefined
registerCleanup(() => {
  if (lockoutTimer) clearTimeout(lockoutTimer)
  if (revealTimer) clearTimeout(revealTimer)
  if (outlinePath.value) gsap.killTweensOf(outlinePath.value)
})

const submitRound = (guess: ISOCountryCode | undefined, clientScore: number) => {
  submitOnce(guess ? [guess] : [], clientScore)
}

/**
 * Resolution beat: whether buzzed right or timed out, drop the shapes-only
 * veil and frame the country among its neighbours — the answer lands as a
 * place on the map, not just a name. The scorecard follows after the hold.
 */
const REVEAL_HOLD_MS = 4000
const resolve = (guess: ISOCountryCode | undefined, clientScore: number) => {
  const active = challenge.value
  if (!active || resolved.value) return
  resolved.value = true
  stopCountdown()

  gameStore.map.solo = false
  gameStore.map.labels = true
  gameStore.map.reveal = active.country
  // No full-map status wash here — the reveal is about locating the country,
  // so the tints carry the verdict: the answer in mint or coral, its
  // neighbours in soft sand. Neighbour centers keep the frame tight even
  // next to a giant (Russia would otherwise stretch the shot to the Pacific).
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
  const active = challenge.value

  // Dash-reveal in the path's REAL length units. The pathLength="1" trick is
  // a trap here: values written with px units (as animation libraries do)
  // bypass pathLength normalization in Chrome, leaving a frozen confetti of
  // 1px dashes. getTotalLength + a CSS transition is boringly reliable.
  const path = outlinePath.value
  const outlineLength = path?.getTotalLength() ?? 0
  if (path && outlineLength) {
    path.style.strokeDasharray = `${outlineLength}`
    path.style.strokeDashoffset = prefersReducedMotion() ? '0' : `${outlineLength}`
    // Updated once per countdown tick with a linear 1s transition — the line
    // creeps around the border in one continuous, ever-growing stroke
    path.style.transition = 'stroke-dashoffset 1s linear'
  }

  beginRound({
    onTick: remaining => {
      const total = active?.durationSeconds ?? 30
      if (path && outlineLength && !prefersReducedMotion()) {
        // The full border lands at ~85% of the clock, leaving a beat to study
        // the complete shape before time runs out
        const revealed = Math.min(1, (total - remaining) / (total * 0.85))
        path.style.strokeDashoffset = `${outlineLength * (1 - revealed)}`
      }
    },
    onTimeout: () => resolve(undefined, 0),
  })
  nextTick(() => guessInput.value?.focus())
}

const onGuess = (country: Country) => {
  const active = challenge.value
  if (!active || submitted.value || resolved.value || lockedOut.value || !started.value) return

  if (country.isoCode === active.country) {
    // Earlier buzz, bigger score
    const remainingFraction = Math.max(0, secondsLeft.value / active.durationSeconds)
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
.silhouette-challenge {
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

.outline-stage {
  flex: 1;
  display: flex;
  min-height: 0;
  padding: 1rem 0;
  align-items: center;
  justify-content: center;
}

.outline {
  height: 100%;
  max-height: 44vh;
  max-width: 70vw;

  path {
    fill: none;
    stroke: var(--dark-blue);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
}

.guess-box {
  display: flex;
  justify-content: center;
}

footer {
  z-index: 2;
  padding: 2rem;
  // Reserve room below the guess input so its suggestion list (which opens
  // downward) isn't clipped off the bottom of the screen. Scales with viewport
  // height so it never steals too much room on short screens.
  padding-bottom: clamp(8rem, 24vh, 20rem);
  // Ticker stacked above the input, both centred.
  gap: 1.4rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}
</style>
