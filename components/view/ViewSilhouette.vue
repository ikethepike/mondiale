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
        <h1 class="map-caption">Whose outline is this?</h1>
        <span class="map-caption sub">{{ secondsLeft }}s — earlier answers score higher</span>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
      </div>
    </header>

    <section class="outline-stage">
      <svg v-if="outline" class="outline" :viewBox="outline.viewBox" aria-hidden="true">
        <path ref="outlinePath" :d="outline.d" pathLength="1" />
      </svg>
    </section>

    <section class="guess-box">
      <CountryGuessInput
        ref="guessInput"
        :disabled="submitted || !started || lockedOut"
        :placeholder="lockedOut ? 'Locked out…' : 'Buzz in — type the country'"
        @guess="onGuess"
        @miss="flashHint('No country by that name')"
      />
    </section>

    <footer>
      <div class="timer-track" aria-hidden="true">
        <div
          class="timer-fill"
          :style="{ width: `${(secondsLeft / challenge.durationSeconds) * 100}%` }"
        />
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { prefersReducedMotion } from '~~/lib/motion'
import { countryPathData } from '~~/lib/outline'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

const { gameStore, update, currentRound, clearBoard } = useClientEvents()

const challenge = computed(() => {
  const roundChallenge = currentRound.value?.round.groupChallenge
  return roundChallenge && '_type' in roundChallenge && roundChallenge._type === 'silhouette-challenge'
    ? roundChallenge
    : undefined
})

const submitted = ref(false)
const started = ref(false)
const lockedOut = ref(false)
const showInterstitial = ref(true)
const secondsLeft = ref(challenge.value?.durationSeconds ?? 30)
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()
const outlinePath = ref<SVGPathElement>()

// Blank the world map — the silhouette IS the whole question
clearBoard()
gameStore.map.solo = true

/** The country's shape lifted from the world map, framed in its own viewBox. */
const outline = ref<{ d: string; viewBox: string }>()
onMounted(() => {
  const active = challenge.value
  if (!active) return
  const d = countryPathData(active.country)
  const path = document.querySelector(`.game-map path#${active.country}`) as SVGGraphicsElement | null
  if (!d || !path) return

  const box = path.getBBox()
  const pad = Math.max(box.width, box.height) * 0.12
  outline.value = {
    d,
    viewBox: `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`,
  }
})

const hint = ref('')
let hintTimer: ReturnType<typeof setTimeout> | undefined
const flashHint = (text: string) => {
  hint.value = text
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => (hint.value = ''), 2200)
}

let countdown: ReturnType<typeof setInterval> | undefined
let lockoutTimer: ReturnType<typeof setTimeout> | undefined

const submitRound = (guess: ISOCountryCode | undefined, clientScore: number) => {
  if (submitted.value) return
  submitted.value = true
  if (countdown) clearInterval(countdown)
  update({
    event: 'submit-group-challenge-answers',
    ranking: guess ? [guess] : [],
    clientScore,
  })
}

const begin = () => {
  showInterstitial.value = false
  started.value = true
  nextTick(() => guessInput.value?.focus())

  const active = challenge.value
  if (outlinePath.value && active && !prefersReducedMotion()) {
    gsap.fromTo(
      outlinePath.value,
      { strokeDasharray: 1, strokeDashoffset: 1 },
      { strokeDashoffset: 0, duration: active.durationSeconds, ease: 'none' }
    )
  } else if (outlinePath.value) {
    gsap.set(outlinePath.value, { strokeDasharray: 1, strokeDashoffset: 0 })
  }

  countdown = setInterval(() => {
    secondsLeft.value--
    if (secondsLeft.value <= 0) {
      gameStore.map.status = 'incorrect'
      submitRound(undefined, 0)
    }
  }, 1000)
}

const onGuess = (country: Country) => {
  const active = challenge.value
  if (!active || submitted.value || lockedOut.value || !started.value) return

  if (country.isoCode === active.country) {
    // Earlier buzz, bigger score
    const remainingFraction = Math.max(0, secondsLeft.value / active.durationSeconds)
    const clientScore = Math.round(active.maximumPoints * (0.35 + 0.65 * remainingFraction))
    gameStore.map.status = 'correct'
    gameStore.map.reveal = active.country
    submitRound(country.isoCode, clientScore)
    return
  }

  flashHint(`Not ${countryName(country)} — locked out for 3 seconds`)
  lockedOut.value = true
  if (lockoutTimer) clearTimeout(lockoutTimer)
  lockoutTimer = setTimeout(() => {
    lockedOut.value = false
    nextTick(() => guessInput.value?.focus())
  }, 3000)
}

onBeforeUnmount(() => {
  clearBoard()
  if (countdown) clearInterval(countdown)
  if (hintTimer) clearTimeout(hintTimer)
  if (lockoutTimer) clearTimeout(lockoutTimer)
  if (outlinePath.value) gsap.killTweensOf(outlinePath.value)
})
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
