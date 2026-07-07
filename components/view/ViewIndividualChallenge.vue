<template>
  <div v-if="challenge" class="individual-challenge">
    <Interstitial
      v-if="showInterstitial"
      :title="interstitialTitle"
      :stakes="'Answer correctly to leap ahead — get it wrong and you\'re knocked back.'"
      @done="showInterstitial = false"
    />
    <header v-else>
      <Transition name="caption" mode="out-in">
        <div v-if="!status" key="question" class="question">
          <!-- Classic find-on-the-map -->
          <template v-if="variant === 'find'">
            <h1 class="map-caption">
              {{ processReplacements(details?.phrasing || '', challenge.country) }}
            </h1>
            <div v-if="challenge.id === 'flag' && country" class="flag-frame">
              <CountryFlag class="flag ambient-loop" :country="country" mode="background" fit="contain" />
            </div>
            <span class="hint map-caption" :class="{ visible: showDoubleTapHint }">
              Press again to confirm
            </span>
          </template>

          <!-- Which flag belongs to X? -->
          <template v-else-if="variant === 'flag-pick'">
            <h1 class="map-caption">Which flag belongs to {{ countryName(challenge.country) }}?</h1>
            <div class="options flag-options">
              <button
                v-for="option in challenge.options"
                :key="option"
                class="option flag-option"
                type="button"
                @click="submitAnswer(option)"
              >
                <CountryFlag class="option-flag" :country="getCountry(option)" mode="background" />
              </button>
            </div>
          </template>

          <!-- Odd one out -->
          <template v-else-if="variant === 'odd-one-out' && challenge.oddOneOut">
            <h1 class="map-caption">{{ challenge.oddOneOut.propertyLabel }}</h1>
            <span class="map-caption sub">Pick the one that doesn't belong</span>
            <div class="options card-options">
              <button
                v-for="option in challenge.oddOneOut.countries"
                :key="option"
                class="option card-option"
                type="button"
                @click="submitAnswer(option)"
              >
                <CountryFlag class="option-flag" :country="getCountry(option)" mode="background" />
                <span>{{ countryName(option) }}</span>
              </button>
            </div>
          </template>

          <!-- Who leads X? -->
          <template v-else-if="variant === 'leader-pick'">
            <h1 class="map-caption">Who leads {{ countryName(challenge.country) }}?</h1>
            <div class="options text-options">
              <button
                v-for="option in challenge.options"
                :key="option"
                class="option text-option map-caption"
                type="button"
                @click="submitAnswer(option)"
              >
                {{ getCountry(option).government?.leader }}
              </button>
            </div>
          </template>

          <!-- Outline reveal race (hard): name it before the border completes -->
          <template v-else-if="variant === 'outline-reveal'">
            <h1 class="map-caption">Whose border is drawing itself?</h1>
            <span class="map-caption sub">
              {{ outlineSecondsLeft }}s — name it before the line closes
            </span>
            <svg
              v-if="outlineReveal"
              class="reveal-outline"
              :viewBox="outlineReveal.viewBox"
              aria-hidden="true"
            >
              <path ref="outlineRevealPath" :d="outlineReveal.d" />
            </svg>
            <div class="guess-box">
              <CountryGuessInput
                :disabled="!!status"
                placeholder="Type the country — one shot"
                @guess="onOutlineGuess"
              />
            </div>
          </template>

          <!-- Higher or lower: win every duel in the streak -->
          <template v-else-if="variant === 'higher-lower' && currentDuel">
            <h1 class="map-caption">Which ranks higher — {{ duelTopic }}?</h1>
            <span class="map-caption sub">Duel {{ duelIndex + 1 }} of {{ totalDuels }} — win them all</span>
            <div class="options card-options">
              <button
                v-for="option in [currentDuel.a, currentDuel.b]"
                :key="option"
                class="option card-option"
                type="button"
                @click="answerDuel(option)"
              >
                <CountryFlag class="option-flag" :country="getCountry(option)" mode="background" />
                <span>{{ countryName(option) }}</span>
              </button>
            </div>
          </template>
        </div>
        <ChallengeResult
          v-else-if="status"
          key="result"
          :status="status"
          :incorrect-message="incorrectMessage"
        />
      </Transition>
    </header>
  </div>
</template>
<script lang="ts" setup>
import Interstitial from '~/components/feedback/Interstitial.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import { getChallengeDetails } from '~~/lib/challenges'
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { prefersReducedMotion } from '~~/lib/motion'
import { mainlandOutline } from '~~/lib/outline'
import { getValueByAccessorID, processReplacements } from '~~/lib/values'
import { isMapClickEvent } from '~~/types/events.types'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

const { currentMove, update, gameStore, clearBoard } = useClientEvents()

const challenge = ref(
  currentMove.value?.challenge?._type === 'individual-challenge'
    ? currentMove.value?.challenge
    : undefined
)

const variant = computed(() => challenge.value?.variant ?? 'find')
const status = toRef(gameStore.map, 'status')

const submittedISOCode = ref<ISOCountryCode>()
const submittedCountry = computed(() => {
  if (!submittedISOCode.value) return undefined
  return getCountry(submittedISOCode.value)
})

const details = computed(() => {
  if (!challenge.value) return undefined
  return getChallengeDetails(challenge.value.id)
})

const country = computed(() => {
  if (!challenge.value) return undefined
  return getCountry(challenge.value.country)
})

const interstitialTitle = computed(() => {
  const active = challenge.value
  if (!active) return 'Challenge!'
  switch (variant.value) {
    case 'flag-pick':
      return `Which flag belongs to ${countryName(active.country)}?`
    case 'odd-one-out':
      return active.oddOneOut?.propertyLabel ?? 'Find the odd one out'
    case 'leader-pick':
      return `Who leads ${countryName(active.country)}?`
    case 'higher-lower':
      return `Win ${totalDuels.value === 2 ? 'both duels' : `all ${totalDuels.value} duels`}: which country ranks higher?`
    case 'outline-reveal':
      return 'Name the country before its border finishes drawing itself'
    default:
      return processReplacements(details.value?.phrasing || '', active.country)
  }
})

// --- Outline reveal race (hard) ------------------------------------------------
const OUTLINE_REVEAL_SECONDS = 25
const outlineReveal = ref<{ d: string; viewBox: string }>()
const outlineRevealPath = ref<SVGPathElement>()
const outlineSecondsLeft = ref(OUTLINE_REVEAL_SECONDS)
let outlineTimer: ReturnType<typeof setInterval> | undefined

/** Any ISO that isn't the answer — a failed gate submits a can't-match token. */
const wrongTokenFor = (correct: ISOCountryCode): ISOCountryCode => (correct === 'CH' ? 'AT' : 'CH')

const beginOutlineReveal = () => {
  const active = challenge.value
  if (!active || variant.value !== 'outline-reveal' || outlineTimer) return
  outlineReveal.value = mainlandOutline(active.country)

  nextTick(() => {
    const path = outlineRevealPath.value
    const length = path?.getTotalLength() ?? 0
    if (!path || !length) return

    // Continuous dash-reveal in the path's real length units (px-valued dash
    // properties bypass pathLength normalization — see ViewSilhouette)
    path.style.strokeDasharray = `${length}`
    path.style.strokeDashoffset = prefersReducedMotion() ? '0' : `${length}`
    path.style.transition = 'stroke-dashoffset 1s linear'

    outlineTimer = setInterval(() => {
      outlineSecondsLeft.value--

      if (!prefersReducedMotion()) {
        const revealed = Math.min(
          1,
          (OUTLINE_REVEAL_SECONDS - outlineSecondsLeft.value) / (OUTLINE_REVEAL_SECONDS * 0.85)
        )
        path.style.strokeDashoffset = `${length * (1 - revealed)}`
      }

      if (outlineSecondsLeft.value <= 0) {
        if (outlineTimer) clearInterval(outlineTimer)
        if (!status.value) {
          gameStore.map.solo = false
          submitAnswer(wrongTokenFor(active.country))
        }
      }
    }, 1000)
  })
}

const onOutlineGuess = (country: Country) => {
  if (status.value) return
  if (outlineTimer) clearInterval(outlineTimer)
  // One shot: right or wrong, this is the answer — the server validates.
  // Bring the world back so the result zoom has a map to land on.
  gameStore.map.solo = false
  submitAnswer(country.isoCode)
}

// --- Higher-lower duels ------------------------------------------------------
const duelIndex = ref(0)
const totalDuels = computed(() => challenge.value?.higherLower?.pairs.length ?? 0)
const currentDuel = computed(() => challenge.value?.higherLower?.pairs[duelIndex.value])
const duelTopic = computed(() => {
  const accessorId = challenge.value?.higherLower?.accessorId
  if (!accessorId) return ''
  const phrasing = getChallengeDetails(accessorId)?.phrasing ?? accessorId
  return phrasing.replace(/^rank (the following|these)( countries)? by /i, '')
})

const failedDuelAnswer = ref<ISOCountryCode>()

const answerDuel = (picked: ISOCountryCode) => {
  const active = challenge.value
  const duel = currentDuel.value
  if (!active?.higherLower || !duel || status.value) return

  const other = picked === duel.a ? duel.b : duel.a
  const pickedValue = getValueByAccessorID(picked, active.higherLower.accessorId)?.amount ?? 0
  const otherValue = getValueByAccessorID(other, active.higherLower.accessorId)?.amount ?? 0

  if (pickedValue > otherValue) {
    if (duelIndex.value >= totalDuels.value - 1) {
      // Swept the whole streak — submit the winning token
      return submitAnswer(active.country, { reveal: false })
    }
    duelIndex.value++
    return
  }

  // Any lost duel fails the challenge: submit a token that can't match
  failedDuelAnswer.value = other
  const wrongToken = active.country === picked ? other : picked
  submitAnswer(wrongToken, { reveal: false })
}

// --- Result messaging ---------------------------------------------------------
const incorrectMessage = computed(() => {
  const active = challenge.value
  const picked = submittedCountry.value
  switch (variant.value) {
    case 'flag-pick':
      return picked ? `That flag belongs to ${countryName(picked)}` : 'Not that flag.'
    case 'odd-one-out':
      return active ? `The odd one out was ${countryName(active.country)}` : 'Not quite.'
    case 'leader-pick':
      return picked
        ? `That's ${countryName(picked)}'s leader`
        : 'Not that one.'
    case 'higher-lower':
      return failedDuelAnswer.value
        ? `${countryName(failedDuelAnswer.value)} ranks higher`
        : 'Not quite.'
    case 'outline-reveal':
      return active ? `That border belongs to ${countryName(active.country)}` : 'Time ran out.'
    default:
      return picked ? `Sorry, you pressed: ${countryName(picked)}` : 'Not quite.'
  }
})

const submitAnswer = (isoCode: ISOCountryCode, options: { reveal?: boolean } = {}) => {
  if (status.value) return
  if (currentMove.value?.challenge?._type === 'final-challenge') return

  submittedISOCode.value = isoCode
  gameStore.map.highlighted.clear()
  update({ event: 'submit-individual-challenge-answer', isoCode })

  const active = currentMove.value?.challenge
  if (active) {
    const correct = isoCode === active.country
    if (options.reveal !== false) gameStore.map.reveal = active.country
    gameStore.map.status = correct ? 'correct' : 'incorrect'
  }
}

const showInterstitial = ref(true)

// The reveal race starts the moment the interstitial clears
watch(showInterstitial, value => {
  if (!value) beginOutlineReveal()
})

// Back-to-back gates can reach a still-mounted view (the walk between them
// is quick). Latch the new challenge and reset every bit of per-gate state
// exactly as a fresh mount would — stale outlines, duel counters and map
// zoom from the previous gate must not leak into the next question.
watch(currentMove, move => {
  const next = move?.challenge?._type === 'individual-challenge' ? move.challenge : undefined
  if (!next || next === challenge.value) return
  // Never tear down a result beat in progress — the view unmounts after it
  if (status.value) return

  challenge.value = next
  clearBoard()
  submittedISOCode.value = undefined
  failedDuelAnswer.value = undefined
  duelIndex.value = 0
  showDoubleTapHint.value = false
  if (outlineTimer) {
    clearInterval(outlineTimer)
    outlineTimer = undefined
  }
  outlineReveal.value = undefined
  outlineSecondsLeft.value = OUTLINE_REVEAL_SECONDS
  if (next.variant === 'outline-reveal') gameStore.map.solo = true
  showInterstitial.value = true
})

const showDoubleTapHint = ref(false)
const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return
  if (showInterstitial.value) return
  // Answer revealed — the zoomed result view is locked, no more highlighting
  if (status.value) return
  // The map is only the answer surface for the classic find variant
  if (variant.value !== 'find') return

  const isoCode = event.detail.isoCode as ISOCountryCode
  if (gameStore.map.highlighted.has(isoCode)) {
    // Double click, submit
    submitAnswer(isoCode)
  } else {
    showDoubleTapHint.value = true
    gameStore.map.highlighted.clear()
    gameStore.map.highlighted.add(isoCode)
  }
}

onBeforeMount(() => {
  // Clear out our global state
  clearBoard()
  // The world map is a giveaway while a mystery border draws itself
  if (variant.value === 'outline-reveal') gameStore.map.solo = true
  document.addEventListener('mapClick', onMapClick)

  // Recovery: in this phase with no challenge to show (a reload landed in
  // the pause between answering and moving on, or the server lost its
  // pacing timer) the view would render a bare map forever. Asking to
  // re-enter the movement flow is idempotent, so nudge the server.
  if (!challenge.value) {
    update({ event: 'enter-movement-phase' })
  }
})
onBeforeUnmount(() => {
  clearBoard()
  if (outlineTimer) clearInterval(outlineTimer)
  document.removeEventListener('mapClick', onMapClick)
})
</script>
<style lang="scss" scoped>
.individual-challenge {
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  position: absolute;
}

header {
  z-index: 2;
  width: 100%;
  text-align: center;
  padding: 2rem 4rem;
  position: absolute;
  justify-content: center;
  h1 {
    margin: 0;
    font-size: 3.2rem;
  }
  .sub {
    padding: 0.4rem 1.4rem;
  }
  .hint {
    opacity: 0;
    display: inline-block;
    padding: 0.4rem 1.4rem;
    transform: translateY(-0.4rem);
    transition:
      opacity var(--motion-base) var(--ease-out-expressive),
      transform var(--motion-base) var(--ease-out-expressive);

    &.visible {
      opacity: 1;
      transform: none;
    }
  }
  .question {
    gap: 1rem;
    display: flex;
    align-items: center;
    flex-flow: column nowrap;
  }

  // The flag is the question — present it as the hero, framed like the
  // caption scrim, arriving with a settle and idling on a gentle float
  .flag-frame {
    padding: 1.2rem;
    margin-top: 0.6rem;
    border-radius: 1.2rem;
    backdrop-filter: blur(0.5rem);
    background: hsla(36, 100%, 98%, 0.85);
    border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);
    animation: flag-arrive var(--motion-slow) var(--ease-out-expressive) 1;
  }
  .flag {
    width: 26rem;
    height: 15rem;
    display: block;
    max-width: 70vw;
    filter: drop-shadow(0 0.4rem 0.8rem hsla(215.7, 76.4%, 21.6%, 0.18));
    animation: flag-float calc(var(--motion-ambient) * 0.7) ease-in-out infinite;
  }
}

// --- Variant option panels ---------------------------------------------------
.options {
  gap: 1.4rem;
  display: grid;
  margin-top: 1.4rem;
  pointer-events: auto;
  grid-template-columns: repeat(2, minmax(16rem, 24rem));
}

.option {
  cursor: pointer;
  padding: 1.2rem;
  font-size: 1.8rem;
  font-family: inherit;
  border-radius: 1.2rem;
  color: var(--dark-blue);
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.88);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  transition:
    transform var(--motion-quick) var(--ease-out-expressive),
    border-color var(--motion-quick) var(--ease-out-expressive);

  &:hover {
    transform: translateY(-0.3rem);
    border-color: var(--dark-blue);
  }
}

.flag-option .option-flag {
  height: 11rem;
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
}

.card-option {
  gap: 1rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;

  .option-flag {
    width: 100%;
    height: 8rem;
    border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  }
}

.text-options {
  grid-template-columns: minmax(28rem, 44rem);
}

// The self-drawing border race
.reveal-outline {
  height: 38vh;
  max-width: 62vw;
  margin-top: 0.6rem;

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
  margin-top: 1rem;
  pointer-events: auto;
}

.text-option {
  text-align: center;
}

@keyframes flag-arrive {
  0% {
    opacity: 0;
    transform: translateY(1.6rem) scale(0.88);
  }
}

@keyframes flag-float {
  50% {
    transform: translateY(-0.5rem) rotate(0.6deg);
  }
}
</style>
