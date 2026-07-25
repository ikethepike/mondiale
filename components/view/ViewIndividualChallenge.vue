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
        <div
          v-if="!status"
          key="question"
          class="question"
          :class="{ 'text-guess': textGuessVariant }"
        >
          <!-- Classic find-on-the-map -->
          <template v-if="variant === 'find'">
            <h1 class="map-caption">
              {{ processReplacements(details?.phrasing || '', challenge.country) }}
            </h1>
            <div v-if="challenge.id === 'flag' && country" class="flag-frame">
              <CountryFlag
                class="flag ambient-loop"
                :country="country"
                mode="background"
                fit="contain"
              />
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

          <!-- Palette twins: these flags share the same colours — spot the one -->
          <template v-else-if="variant === 'flag-twins'">
            <h1 class="map-caption">Which of these is {{ countryName(challenge.country) }}?</h1>
            <span class="map-caption sub">They all share the same colours — look closely.</span>
            <div class="options twin-options">
              <button
                v-for="option in challenge.options"
                :key="option"
                class="option twin-option"
                type="button"
                @click="submitAnswer(option)"
              >
                <CountryFlag class="twin-flag" :country="getCountry(option)" mode="inline" />
              </button>
            </div>
          </template>

          <!-- Border detective: name the country these neighbours surround -->
          <template v-else-if="variant === 'border-detective' && challenge.neighbours">
            <h1 class="map-caption">Who sits in the middle?</h1>
            <span class="map-caption sub">
              {{ borderSecondsLeft }}s — name the country these neighbours all border
            </span>
            <ChallengeTimer :value="borderSecondsLeft" :total="BORDER_DETECTIVE_SECONDS" />
            <div class="border-ring" :style="{ '--ring-count': challenge.neighbours.length }">
              <div class="ring-center" aria-hidden="true">
                <span v-if="isoHint" class="iso-chip">{{ isoHint }}</span>
                <svg v-if="borderHint" class="hint-outline" :viewBox="borderHint.viewBox">
                  <path :d="borderHint.d" />
                </svg>
                <template v-else>?</template>
              </div>
              <div
                v-for="(neighbour, index) in challenge.neighbours"
                :key="neighbour"
                class="ring-flag"
                :class="{ named: !isHard }"
                :style="ringSlot(index, challenge.neighbours.length)"
              >
                <CountryFlag :country="getCountry(neighbour)" mode="inline" />
                <span v-if="!isHard" class="ring-name">{{ countryName(neighbour) }}</span>
              </div>
            </div>
            <div class="hint-row">
              <Transition name="caption">
                <button
                  v-if="!borderHint && outlineHintUnlocked"
                  class="hint-button"
                  type="button"
                  @click="showBorderHint"
                >
                  <StatTopicIcon class="hint-icon" topic="reveal" />
                  Outline (−{{ GATE_HINT_BITE_STEPS }} steps)
                </button>
              </Transition>
              <Transition name="caption">
                <button
                  v-if="!isoHint && isoHintUnlocked"
                  class="hint-button"
                  type="button"
                  @click="showIsoHint"
                >
                  <StatTopicIcon class="hint-icon" topic="question" />
                  Country code (−{{ GATE_HINT_BITE_STEPS }} steps)
                </button>
              </Transition>
            </div>
            <div class="guess-box">
              <CountryGuessInput
                :disabled="!!status"
                placeholder="Type the country in the middle"
                @guess="onBorderGuess"
              />
            </div>
          </template>

          <!-- Zoom-out: the map eases out from a coastline — name it early -->
          <template v-else-if="variant === 'zoom-out'">
            <h1 class="map-caption">Name it before the map zooms out</h1>
            <span class="map-caption sub">The longer you wait, the more you'll see.</span>
            <div class="guess-box">
              <CountryGuessInput
                :disabled="!!status"
                placeholder="Type the country you recognise"
                @guess="onZoomOutGuess"
              />
            </div>
          </template>

          <!-- Money match (hard): which country spends this currency? -->
          <template v-else-if="variant === 'money-match'">
            <h1 class="map-caption">Which country uses this currency?</h1>
            <div v-if="challenge.image" class="money-hero money-hero-photo">
              <img class="money-note" :src="challenge.image" alt="A banknote" />
              <span class="money-code">{{ getCountry(challenge.country).currency }}</span>
            </div>
            <div v-else class="money-hero" aria-hidden="true">
              <span class="money-symbol">{{
                currencySymbol(getCountry(challenge.country).currency)
              }}</span>
              <span class="money-code">{{ getCountry(challenge.country).currency }}</span>
            </div>
            <div class="options card-options">
              <button
                v-for="option in challenge.options"
                :key="option"
                class="option card-option"
                type="button"
                @click="submitAnswer(option)"
              >
                <CountryTileFlag class="option-flag" :country="getCountry(option)" />
                <span>{{ countryName(option) }}</span>
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
            <div class="options leader-options">
              <button
                v-for="option in challenge.options"
                :key="option"
                class="option leader-option map-caption"
                type="button"
                @click="submitAnswer(option)"
              >
                <span
                  v-if="leaderPortrait(option)"
                  class="leader-thumb"
                  :style="{ backgroundImage: `url(${leaderPortrait(option)})` }"
                  aria-hidden="true"
                />
                <span v-else class="leader-thumb placeholder" aria-hidden="true" />
                <span class="leader-name">{{
                  titlecaseLeader(getCountry(option).government?.leader ?? '')
                }}</span>
              </button>
            </div>
          </template>

          <!-- Whose leader is this? Portrait up, four countries down -->
          <PhotoOptionChallenge
            v-else-if="variant === 'leader-portrait' && challenge.portrait && challenge.options"
            :image="challenge.portrait.image"
            caption="Which country does this leader govern?"
            :options="challenge.options"
            alt="A national leader"
            @pick="submitAnswer"
          />

          <!-- Which country's capital is this? (photo) -->
          <PhotoOptionChallenge
            v-else-if="variant === 'capital-match' && challenge.image && challenge.options"
            :image="challenge.image"
            caption="Which country's capital is this?"
            :options="challenge.options"
            alt="A capital city"
            @pick="submitAnswer"
          />

          <!-- Which country is this landmark in? (photo) -->
          <PhotoOptionChallenge
            v-else-if="variant === 'landmark-quiz' && challenge.image && challenge.options"
            :image="challenge.image"
            caption="Which country is this landmark in?"
            :options="challenge.options"
            alt="A famous landmark"
            @pick="submitAnswer"
          />

          <!-- Outline reveal race (hard): name it before the border completes -->
          <template v-else-if="variant === 'outline-reveal'">
            <h1 class="map-caption">Whose border is drawing itself?</h1>
            <span class="map-caption sub">{{ outlineSubCopy }}</span>
            <svg
              v-if="outlineReveal"
              class="reveal-outline"
              :viewBox="outlineReveal.viewBox"
              aria-hidden="true"
            >
              <path
                ref="outlineRevealPath"
                :d="outlineReveal.d"
                :stroke-width="outlineReveal.strokeWidth"
              />
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
            <span class="map-caption sub"
              >Duel {{ duelIndex + 1 }} of {{ totalDuels }} — win them all</span
            >
            <div class="options card-options">
              <button
                v-for="option in [currentDuel.a, currentDuel.b]"
                :key="option"
                class="option card-option"
                type="button"
                @click="answerDuel(option)"
              >
                <CountryTileFlag class="option-flag" :country="getCountry(option)" />
                <span>{{ countryName(option) }}</span>
              </button>
            </div>
          </template>

          <!-- Trend duel: whose stat is rising/falling — win every duel -->
          <template v-else-if="variant === 'trend-duel' && currentTrendDuel">
            <h1 class="map-caption">
              Whose {{ trendDuelLabel }} is {{ currentTrendDuel.seek }}?
            </h1>
            <span class="map-caption sub"
              >Duel {{ trendDuelIndex + 1 }} of {{ totalTrendDuels }} — win them all</span
            >
            <div class="options card-options">
              <button
                v-for="option in [currentTrendDuel.a, currentTrendDuel.b]"
                :key="`${currentTrendDuel.metric}-${option}`"
                class="option card-option trend-option"
                :class="trendDuelCardClass(option)"
                type="button"
                :disabled="!!trendDuelReveal"
                @click="answerTrendDuel(option)"
              >
                <CountryTileFlag class="option-flag" :country="getCountry(option)" />
                <span>{{ countryName(option) }}</span>
                <TrendSparkline
                  v-if="trendDuelReveal && trendSeriesFor(option, currentTrendDuel.metric)"
                  :series="trendSeriesFor(option, currentTrendDuel.metric)!"
                  :metric="currentTrendDuel.metric"
                  animate-in
                />
              </button>
            </div>
          </template>

          <!-- Trajectory match: whose chart is this? -->
          <template v-else-if="variant === 'trajectory-match' && challenge.trajectory">
            <h1 class="map-caption">Whose chart is this?</h1>
            <span class="map-caption sub">
              {{ trajectorySecondsLeft }}s — one of these countries' {{ trajectoryLabel }}
            </span>
            <ChallengeTimer :value="trajectorySecondsLeft" :total="TRAJECTORY_MATCH_SECONDS" />
            <div
              class="border-ring trajectory-ring"
              :style="{ '--ring-count': challenge.trajectory.options.length }"
            >
              <div class="ring-center chart-center" aria-hidden="true">
                <TrendSparkline
                  v-if="trajectorySeries"
                  :series="trajectorySeries"
                  :metric="challenge.trajectory.metric"
                  :hide-values="!trajectoryValuesRevealed"
                />
              </div>
              <button
                v-for="(option, index) in challenge.trajectory.options"
                :key="option"
                class="ring-flag ring-pick"
                :class="{ struck: struckOptions.has(option) }"
                type="button"
                :disabled="struckOptions.has(option)"
                :style="ringSlot(index, challenge.trajectory.options.length)"
                @click="onTrajectoryPick(option)"
              >
                <CountryFlag :country="getCountry(option)" mode="inline" />
                <span v-if="!isHard" class="ring-name">{{ countryName(option) }}</span>
              </button>
            </div>
            <div class="hint-row">
              <Transition name="caption">
                <button
                  v-if="!struckOptions.size && strikeHintUnlocked"
                  class="hint-button"
                  type="button"
                  @click="showStrikeHint"
                >
                  <StatTopicIcon class="hint-icon" topic="reveal" />
                  Strike out half (−{{ GATE_HINT_BITE_STEPS }} steps)
                </button>
              </Transition>
            </div>
          </template>
        </div>
        <ChallengeResult
          v-else-if="status"
          key="result"
          class="result"
          :status="status"
          :incorrect-message="incorrectMessage"
        >
          <DuelReveal
            v-if="variant === 'higher-lower' && duelOutcomes.length && duelAccessorId"
            :outcomes="duelOutcomes"
            :accessor-id="duelAccessorId"
            :topic="duelTopic"
            :colors="PAIR_COLORS"
          />
          <TrendSparkline
            v-else-if="variant === 'trajectory-match' && challenge?.trajectory && trajectorySeries"
            class="result-sparkline"
            :series="trajectorySeries"
            :metric="challenge.trajectory.metric"
          />
          <LeaderReveal
            v-else-if="(variant === 'leader-pick' || variant === 'leader-portrait') && challenge"
            :country="challenge.country"
          />
          <LandmarkReveal
            v-else-if="variant === 'landmark-quiz' && landmark"
            :landmark="landmark"
          />
        </ChallengeResult>
      </Transition>
    </header>
  </div>
</template>
<script lang="ts" setup>
import Interstitial from '~/components/feedback/Interstitial.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import DuelReveal from '~/components/feedback/DuelReveal.vue'
import LeaderReveal from '~/components/feedback/LeaderReveal.vue'
import LandmarkReveal from '~/components/feedback/LandmarkReveal.vue'
import ChallengeTimer from '~/components/challenge/ChallengeTimer.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import PhotoOptionChallenge from '~/components/challenge/PhotoOptionChallenge.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import { LANDMARKS } from '~~/data/landmarks.gen'
import TrendSparkline from '~/components/challenge/TrendSparkline.vue'
import { TRENDS } from '~~/data/trends.gen'
import { shuffleArray } from '~~/lib/arrays'
import { accessorTopicLabel, getChallengeDetails } from '~~/lib/challenges'
import { countryName, getCountry } from '~~/lib/country'
import { readTrend, TREND_METRICS, type TrendMetricId } from '~~/lib/trends'
import { currencyName, currencySymbol } from '~~/lib/currency'
import { politicalLeader, titlecaseLeader } from '~~/lib/leaders'
import { useClientEvents } from '~~/lib/events/client-side'
import { useOutlineReveal } from '~~/lib/useOutlineReveal'
import { GATE_HINT_BITE_STEPS } from '~~/lib/scoring'
import { mainlandOutline } from '~~/lib/outline'
import { wait } from '~~/lib/time'
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
/** Variants that guess via CountryGuessInput need `.question` left un-clipped
    so the downward-opening suggestion list stays visible. */
const textGuessVariant = computed(() =>
  ['zoom-out', 'border-detective', 'outline-reveal'].includes(variant.value)
)
const status = toRef(gameStore.map, 'status')
/** Hard mode hides the helper labels (e.g. neighbour names in Border Detective). */
const isHard = computed(() => gameStore.game?.difficulty === 'hard')

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

/** landmark-quiz: the curated entry behind the photo — dossier + map marker. */
const landmark = computed(() =>
  challenge.value?.landmarkSlug ? LANDMARKS[challenge.value.landmarkSlug] : undefined
)

const interstitialTitle = computed(() => {
  const active = challenge.value
  if (!active) return 'Challenge!'
  switch (variant.value) {
    case 'flag-pick':
      return `Which flag belongs to ${countryName(active.country)}?`
    case 'flag-twins':
      return `Spot ${countryName(active.country)} among its palette twins`
    case 'border-detective':
      return 'Name the country these neighbours surround'
    case 'money-match':
      return 'Which country spends this currency?'
    case 'zoom-out':
      return 'Name the country before the map zooms out'
    case 'capital-match':
      return "Which country's capital is this?"
    case 'landmark-quiz':
      return 'Which country is this landmark in?'
    case 'odd-one-out':
      return active.oddOneOut?.propertyLabel ?? 'Find the odd one out'
    case 'leader-pick':
      return `Who leads ${countryName(active.country)}?`
    case 'higher-lower':
      return `Win ${totalDuels.value === 2 ? 'both duels' : `all ${totalDuels.value} duels`}: which country ranks higher?`
    case 'trend-duel':
      return `Win all ${totalTrendDuels.value} duels: whose stat is rising, whose is falling?`
    case 'trajectory-match':
      return 'One chart, one country — whose trajectory is this?'
    case 'outline-reveal':
      return 'Name the country before its border finishes drawing itself'
    case 'leader-portrait':
      return 'Whose leader is this?'
    default:
      return processReplacements(details.value?.phrasing || '', active.country)
  }
})

// --- Outline reveal race (hard) ------------------------------------------------
const OUTLINE_REVEAL_SECONDS = 25
// Preview flash → sweep-away → clock-synced border draw, all size-relative.
const {
  outline: outlineReveal,
  outlinePath: outlineRevealPath,
  phase: outlinePhase,
  prepareOutline,
  beginOutlineReveal: beginOutlineDraw,
  tickOutlineReveal,
  resetOutlineReveal,
} = useOutlineReveal()
const outlineSecondsLeft = ref(OUTLINE_REVEAL_SECONDS)
let outlineTimer: ReturnType<typeof setInterval> | undefined
// Bumped on gate reset/unmount so a held clock-start can't arm a dead round.
let outlineRound = 0
/** Cap on holding the clock for the geometry chunk — bounded dead air. */
const OUTLINE_CLOCK_HOLD_MS = 3000

/** Any ISO that isn't the answer — a failed gate submits a can't-match token. */
const wrongTokenFor = (correct: ISOCountryCode): ISOCountryCode => (correct === 'CH' ? 'AT' : 'CH')

const beginOutlineReveal = () => {
  const active = challenge.value
  if (!active || variant.value !== 'outline-reveal' || outlineTimer) return
  const round = ++outlineRound
  prepareOutline(active.country)

  // Hold the clock until the preview is armed — the geometry chunk mustn't
  // burn answer time — but never past the cap: the gate must not hang
  // without its timeout just because the geometry was slow or missing.
  // completeAt 1: in this race the closing line IS the deadline.
  Promise.race([beginOutlineDraw(OUTLINE_REVEAL_SECONDS, 1), wait(OUTLINE_CLOCK_HOLD_MS)]).then(
    () => {
      if (round !== outlineRound || outlineTimer || status.value) return
      outlineTimer = setInterval(() => {
        outlineSecondsLeft.value--
        tickOutlineReveal(outlineSecondsLeft.value)

        if (outlineSecondsLeft.value <= 0) {
          if (outlineTimer) clearInterval(outlineTimer)
          if (!status.value) {
            gameStore.map.solo = false
            submitAnswer(wrongTokenFor(active.country))
          }
        }
      }, 1000)
    }
  )
}

const outlineSubCopy = computed(() => {
  switch (outlinePhase.value) {
    case 'preview':
    case 'sweep':
      return 'Memorize it — it unravels in a moment'
    case 'static':
      return `${outlineSecondsLeft.value}s — the whole border, one shot`
    case 'drawing':
      return `${outlineSecondsLeft.value}s — name it before the line closes`
    default:
      return `${outlineSecondsLeft.value}s — name the country`
  }
})

const onOutlineGuess = (country: Country) => {
  if (status.value) return
  if (outlineTimer) clearInterval(outlineTimer)
  // One shot: right or wrong, this is the answer — the server validates.
  // Bring the world back so the result zoom has a map to land on.
  gameStore.map.solo = false
  submitAnswer(country.isoCode)
}

// --- Border detective --------------------------------------------------------
// Timed like the other mystery gates: the clock scales the leap (buzz curve,
// applied server-side from the reported fraction) and runs out into a miss.
const BORDER_DETECTIVE_SECONDS = 40
/** Hints unlock in waves: the outline a third in, the ISO code two thirds in. */
const OUTLINE_HINT_UNLOCK_ELAPSED = 1 / 3
const ISO_HINT_UNLOCK_ELAPSED = 2 / 3
const borderSecondsLeft = ref(BORDER_DETECTIVE_SECONDS)
let borderTimer: ReturnType<typeof setInterval> | undefined
/** The bought outline hint, drawn in the ring's centre. Every hint bites steps. */
const borderHint = ref<Awaited<ReturnType<typeof mainlandOutline>>>()
let borderHintLoading = false
/** The bought last-resort hint: the country's ISO code, chipped onto the ring. */
const isoHint = ref<ISOCountryCode>()
const elapsedFraction = computed(() => 1 - borderSecondsLeft.value / BORDER_DETECTIVE_SECONDS)
const outlineHintUnlocked = computed(() => elapsedFraction.value >= OUTLINE_HINT_UNLOCK_ELAPSED)
const isoHintUnlocked = computed(() => elapsedFraction.value >= ISO_HINT_UNLOCK_ELAPSED)
const hintsUsed = computed(() => (borderHint.value ? 1 : 0) + (isoHint.value ? 1 : 0))

const beginBorderDetective = () => {
  const active = challenge.value
  if (!active || variant.value !== 'border-detective' || borderTimer) return
  borderTimer = setInterval(() => {
    borderSecondsLeft.value--
    if (borderSecondsLeft.value <= 0) {
      if (borderTimer) clearInterval(borderTimer)
      if (!status.value) {
        gameStore.map.solo = false
        submitAnswer(wrongTokenFor(active.country))
      }
    }
  }, 1000)
}

const showBorderHint = async () => {
  const active = challenge.value
  if (!active || borderHint.value || borderHintLoading || status.value) return
  borderHintLoading = true
  try {
    // The outline loads the HD geometry chunk — only count (and charge) the
    // hint once a frame actually lands, and never after the gate resolved.
    const frame = await mainlandOutline(active.country)
    if (frame && challenge.value === active && !status.value) borderHint.value = frame
  } finally {
    borderHintLoading = false
  }
}

const showIsoHint = () => {
  const active = challenge.value
  if (!active || isoHint.value || status.value) return
  isoHint.value = active.country
}

const onBorderGuess = (country: Country) => {
  if (status.value) return
  if (borderTimer) clearInterval(borderTimer)
  // Bring the world back so the result zoom has a map to land on.
  gameStore.map.solo = false
  submitAnswer(country.isoCode, {
    remainingFraction: Math.max(0, borderSecondsLeft.value) / BORDER_DETECTIVE_SECONDS,
    hintsUsed: hintsUsed.value,
  })
}

// --- Zoom-out ----------------------------------------------------------------
const ZOOM_OUT_SECONDS = 20
let zoomOutTimer: ReturnType<typeof setTimeout> | undefined
const beginZoomOut = () => {
  const active = challenge.value
  if (!active) return
  gameStore.map.zoomOut = { isoCode: active.country, durationSeconds: ZOOM_OUT_SECONDS }
  // Safety: if they never guess, resolve as a miss a beat after full zoom-out
  // so the pawn doesn't stall.
  if (zoomOutTimer) clearTimeout(zoomOutTimer)
  zoomOutTimer = setTimeout(
    () => {
      if (!status.value) submitAnswer(wrongTokenFor(active.country))
    },
    (ZOOM_OUT_SECONDS + 6) * 1000
  )
}
const onZoomOutGuess = (country: Country) => {
  if (status.value) return
  if (zoomOutTimer) clearTimeout(zoomOutTimer)
  gameStore.map.zoomOut = undefined // stop the reveal; the result zoom takes over
  submitAnswer(country.isoCode)
}

/** Position a neighbour flag evenly around the ring (start at top, clockwise). */
const ringSlot = (index: number, total: number) => {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2
  return {
    left: `${50 + Math.cos(angle) * 42}%`,
    top: `${50 + Math.sin(angle) * 42}%`,
  }
}

// --- Higher-lower duels ------------------------------------------------------
const duelIndex = ref(0)
const totalDuels = computed(() => challenge.value?.higherLower?.pairs.length ?? 0)
const currentDuel = computed(() => challenge.value?.higherLower?.pairs[duelIndex.value])
// Small portrait for a leader-pick option, when Wikidata has one.
const leaderPortrait = (isoCode: ISOCountryCode) => politicalLeader(isoCode)?.image

const duelAccessorId = computed(() => challenge.value?.higherLower?.accessorId)
const duelTopic = computed(() => {
  const accessorId = duelAccessorId.value
  if (!accessorId) return ''
  return accessorTopicLabel(accessorId)
})

const failedDuelAnswer = ref<ISOCountryCode>()

/** Each duel the player actually faced, kept for the educational reveal. */
export interface DuelOutcome {
  picked: ISOCountryCode
  higher: ISOCountryCode
  lower: ISOCountryCode
  correct: boolean
}
const duelOutcomes = ref<DuelOutcome[]>([])

// Distinct wash per pair, so the reveal's map highlight matches its cards.
const PAIR_COLORS = [
  'hsla(197.6, 51.2%, 41.8%, 0.55)', // soft-blue
  'hsla(29.7, 79.9%, 62%, 0.55)', // warm-sand
  'hsla(170.5, 24.7%, 55%, 0.6)', // soft-mint
]

// Paint the faced pairs onto the map in matching colours (win or loss).
const revealDuelsOnMap = () => {
  gameStore.map.countryGroupings = duelOutcomes.value.map((outcome, index) => ({
    color: PAIR_COLORS[index % PAIR_COLORS.length],
    countries: [outcome.higher, outcome.lower],
  }))
  gameStore.map.focus = duelOutcomes.value.flatMap(outcome => [outcome.higher, outcome.lower])
}

const answerDuel = (picked: ISOCountryCode) => {
  const active = challenge.value
  const duel = currentDuel.value
  if (!active?.higherLower || !duel || status.value) return

  const other = picked === duel.a ? duel.b : duel.a
  const pickedValue = getValueByAccessorID(picked, active.higherLower.accessorId)?.amount ?? 0
  const otherValue = getValueByAccessorID(other, active.higherLower.accessorId)?.amount ?? 0
  const won = pickedValue > otherValue

  duelOutcomes.value.push({
    picked,
    higher: won ? picked : other,
    lower: won ? other : picked,
    correct: won,
  })

  if (won) {
    if (duelIndex.value >= totalDuels.value - 1) {
      // Swept the whole streak — submit the winning token
      revealDuelsOnMap()
      return submitAnswer(active.country, { reveal: false })
    }
    duelIndex.value++
    return
  }

  // Any lost duel fails the challenge: submit a token that can't match
  failedDuelAnswer.value = other
  const wrongToken = active.country === picked ? other : picked
  revealDuelsOnMap()
  submitAnswer(wrongToken, { reveal: false })
}

// --- Trend duels ---------------------------------------------------------------
// Higher-lower's trust model with a pow-reveal beat: pick a flag, both cards
// flip to sparklines, hold, then the next pair slides in (or the gate resolves).
const TREND_DUEL_REVEAL_MS = 3200
const trendDuelIndex = ref(0)
const totalTrendDuels = computed(() => challenge.value?.trendDuels?.length ?? 0)
const currentTrendDuel = computed(() => challenge.value?.trendDuels?.[trendDuelIndex.value])
const trendDuelReveal = ref<{ picked: ISOCountryCode; correct: boolean }>()
let trendDuelTimer: ReturnType<typeof setTimeout> | undefined
const failedTrendDuel = ref<{ answer: ISOCountryCode; seek: 'rising' | 'falling' }>()

const trendSeriesFor = (isoCode: ISOCountryCode, metric: TrendMetricId) =>
  TRENDS[isoCode]?.[metric]
const trendDuelLabel = computed(() =>
  currentTrendDuel.value ? TREND_METRICS[currentTrendDuel.value.metric].label : ''
)

const trendDuelCardClass = (option: ISOCountryCode) => {
  const reveal = trendDuelReveal.value
  if (!reveal || option !== reveal.picked) return undefined
  return reveal.correct ? 'was-right' : 'was-wrong'
}

const answerTrendDuel = (picked: ISOCountryCode) => {
  const active = challenge.value
  const duel = currentTrendDuel.value
  if (!active?.trendDuels || !duel || status.value || trendDuelReveal.value) return

  const direction = readTrend(trendSeriesFor(picked, duel.metric), duel.metric)?.direction
  const correct = direction === duel.seek
  trendDuelReveal.value = { picked, correct }

  trendDuelTimer = setTimeout(() => {
    trendDuelReveal.value = undefined
    if (!correct) {
      const other = picked === duel.a ? duel.b : duel.a
      failedTrendDuel.value = { answer: other, seek: duel.seek }
      // Any lost duel fails the challenge: submit a token that can't match
      const wrongToken = active.country === picked ? other : picked
      return submitAnswer(wrongToken, { reveal: false })
    }
    if (trendDuelIndex.value >= totalTrendDuels.value - 1) {
      // Swept the whole streak — submit the winning token
      return submitAnswer(active.country, { reveal: false })
    }
    trendDuelIndex.value++
  }, TREND_DUEL_REVEAL_MS)
}

// --- Trajectory match ----------------------------------------------------------
// Timed like border-detective: the clock scales the leap, one buyable hint
// (strike out half the decoys) bites steps, and non-hard games get the y-axis
// values free in the final third.
const TRAJECTORY_MATCH_SECONDS = 40
const STRIKE_HINT_UNLOCK_ELAPSED = 1 / 3
const VALUES_REVEAL_ELAPSED = 2 / 3
const trajectorySecondsLeft = ref(TRAJECTORY_MATCH_SECONDS)
let trajectoryTimer: ReturnType<typeof setInterval> | undefined
const struckOptions = ref(new Set<ISOCountryCode>())

const trajectoryElapsed = computed(() => 1 - trajectorySecondsLeft.value / TRAJECTORY_MATCH_SECONDS)
const strikeHintUnlocked = computed(() => trajectoryElapsed.value >= STRIKE_HINT_UNLOCK_ELAPSED)
const trajectoryValuesRevealed = computed(() => {
  const trajectory = challenge.value?.trajectory
  if (!trajectory) return false
  // Result beat always shows values; during play hard mode stays shape-only.
  if (status.value) return true
  return trajectory.valuesHint && trajectoryElapsed.value >= VALUES_REVEAL_ELAPSED
})
const trajectoryLabel = computed(() => {
  const trajectory = challenge.value?.trajectory
  return trajectory ? TREND_METRICS[trajectory.metric].label : ''
})
const trajectorySeries = computed(() => {
  const active = challenge.value
  return active?.trajectory ? TRENDS[active.country]?.[active.trajectory.metric] : undefined
})

const beginTrajectoryMatch = () => {
  const active = challenge.value
  if (!active || variant.value !== 'trajectory-match' || trajectoryTimer) return
  trajectoryTimer = setInterval(() => {
    trajectorySecondsLeft.value--
    if (trajectorySecondsLeft.value <= 0) {
      if (trajectoryTimer) clearInterval(trajectoryTimer)
      if (!status.value) submitAnswer(wrongTokenFor(active.country))
    }
  }, 1000)
}

const showStrikeHint = () => {
  const active = challenge.value
  const trajectory = active?.trajectory
  if (!active || !trajectory || struckOptions.value.size || status.value) return
  const decoys = shuffleArray(trajectory.options.filter(option => option !== active.country))
  struckOptions.value = new Set(decoys.slice(0, Math.ceil(decoys.length / 2)))
}

const onTrajectoryPick = (isoCode: ISOCountryCode) => {
  if (status.value || struckOptions.value.has(isoCode)) return
  if (trajectoryTimer) clearInterval(trajectoryTimer)
  submitAnswer(isoCode, {
    remainingFraction: Math.max(0, trajectorySecondsLeft.value) / TRAJECTORY_MATCH_SECONDS,
    hintsUsed: struckOptions.value.size ? 1 : 0,
  })
}

// --- Result messaging ---------------------------------------------------------
const incorrectMessage = computed(() => {
  const active = challenge.value
  const picked = submittedCountry.value
  switch (variant.value) {
    case 'flag-pick':
      return picked ? `That flag belongs to ${countryName(picked)}` : 'Not that flag.'
    case 'flag-twins':
      return picked ? `That's ${countryName(picked)} — a close twin` : 'Not that one.'
    case 'border-detective':
      return active ? `It was ${countryName(active.country)}` : 'Not quite.'
    case 'money-match':
      return active
        ? `That's the ${currencyName(getCountry(active.country).currency)} (${getCountry(active.country).currency})`
        : 'Not quite.'
    case 'zoom-out':
      return active ? `It was ${countryName(active.country)}` : 'Not quite.'
    case 'capital-match':
      return active
        ? `That's ${getCountry(active.country).geography.capital.name}, ${countryName(active.country)}`
        : 'Not quite.'
    case 'landmark-quiz':
      // The dossier below carries the landmark's name and story.
      return active ? `It's in ${countryName(active.country)}` : 'Not quite.'
    case 'odd-one-out':
      return active ? `The odd one out was ${countryName(active.country)}` : 'Not quite.'
    case 'leader-pick':
      return picked ? `That's ${countryName(picked)}'s leader` : 'Not that one.'
    case 'higher-lower':
      return failedDuelAnswer.value
        ? `${countryName(failedDuelAnswer.value)} ranks higher`
        : 'Not quite.'
    case 'trend-duel':
      return failedTrendDuel.value
        ? `${countryName(failedTrendDuel.value.answer)} is the one ${failedTrendDuel.value.seek}`
        : 'Not quite.'
    case 'trajectory-match':
      return active ? `That trajectory belongs to ${countryName(active.country)}` : 'Time ran out.'
    case 'outline-reveal':
      return active ? `That border belongs to ${countryName(active.country)}` : 'Time ran out.'
    case 'leader-portrait':
      return active?.portrait
        ? `That's ${active.portrait.name} — ${countryName(active.country)}'s leader`
        : 'Not quite.'
    default:
      return picked ? `Sorry, you pressed: ${countryName(picked)}` : 'Not quite.'
  }
})

const submitAnswer = (
  isoCode: ISOCountryCode,
  options: { reveal?: boolean; remainingFraction?: number; hintsUsed?: number } = {}
) => {
  if (status.value) return
  if (currentMove.value?.challenge?._type === 'final-challenge') return

  submittedISOCode.value = isoCode
  gameStore.map.highlighted.clear()
  update({
    event: 'submit-individual-challenge-answer',
    isoCode,
    remainingFraction: options.remainingFraction,
    hintsUsed: options.hintsUsed,
  })

  const active = currentMove.value?.challenge
  if (active) {
    const correct = isoCode === active.country
    if (options.reveal !== false) {
      gameStore.map.reveal = active.country
      // Landmark-quiz: mark the landmark's true spot on the reveal zoom
      if (landmark.value?.coordinates) gameStore.map.pinAnswer = landmark.value.coordinates
    }
    gameStore.map.status = correct ? 'correct' : 'incorrect'
  }
}

const showInterstitial = ref(true)

// The reveal race starts the moment the interstitial clears
watch(showInterstitial, value => {
  if (value) return
  if (variant.value === 'outline-reveal') beginOutlineReveal()
  if (variant.value === 'zoom-out') beginZoomOut()
  if (variant.value === 'border-detective') beginBorderDetective()
  if (variant.value === 'trajectory-match') beginTrajectoryMatch()
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
  outlineRound++
  resetOutlineReveal()
  outlineSecondsLeft.value = OUTLINE_REVEAL_SECONDS
  if (borderTimer) {
    clearInterval(borderTimer)
    borderTimer = undefined
  }
  borderHint.value = undefined
  isoHint.value = undefined
  borderSecondsLeft.value = BORDER_DETECTIVE_SECONDS
  if (zoomOutTimer) {
    clearTimeout(zoomOutTimer)
    zoomOutTimer = undefined
  }
  if (trendDuelTimer) {
    clearTimeout(trendDuelTimer)
    trendDuelTimer = undefined
  }
  trendDuelIndex.value = 0
  trendDuelReveal.value = undefined
  failedTrendDuel.value = undefined
  if (trajectoryTimer) {
    clearInterval(trajectoryTimer)
    trajectoryTimer = undefined
  }
  trajectorySecondsLeft.value = TRAJECTORY_MATCH_SECONDS
  struckOptions.value = new Set()
  if (next.variant === 'outline-reveal' || next.variant === 'border-detective') {
    gameStore.map.solo = true
  }
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
  // The world map is a giveaway for shape/neighbour mystery gates
  if (variant.value === 'outline-reveal' || variant.value === 'border-detective') {
    gameStore.map.solo = true
  }
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
  outlineRound++
  if (outlineTimer) clearInterval(outlineTimer)
  if (borderTimer) clearInterval(borderTimer)
  if (zoomOutTimer) clearTimeout(zoomOutTimer)
  if (trendDuelTimer) clearTimeout(trendDuelTimer)
  if (trajectoryTimer) clearInterval(trajectoryTimer)
  resetOutlineReveal()
  document.removeEventListener('mapClick', onMapClick)
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
.individual-challenge {
  top: 0;
  left: 0;
  width: 100%;
  height: var(--viewport-height);
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
  .question,
  .result {
    gap: 1rem;
    display: flex;
    align-items: center;
    flex-flow: column nowrap;
    // Fallback: scroll to the options if a tall hero + cards overflow.
    max-height: var(--viewport-height);
    overflow-y: auto;

    // Text-guess variants have bounded content and must not clip the
    // guess input's downward-opening suggestion list.
    &.text-guess {
      max-height: none;
      overflow-y: visible;
    }
  }

  // The round is resolved — nothing behind the reveal needs taps, and the
  // scroll container must take touches itself under .main-board's
  // pointer-events: none. The play-state .question stays pass-through so
  // map-tap variants keep working.
  .result {
    pointer-events: auto;
    overscroll-behavior: contain;
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

  @media (hover: hover) {
    &:hover {
      transform: translateY(-0.3rem);
      border-color: var(--dark-blue);
    }
  }
  &:active {
    border-color: var(--dark-blue);
  }
}

// The flag box derives its width from its 3:2 aspect-ratio + fixed height, so
// it's narrower than the card — center it rather than letting it sit left.
.flag-option {
  display: flex;
  align-items: center;
  justify-content: center;
}

.flag-option .option-flag {
  height: 11rem;
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
}

// Palette twins: large inline flags so the subtle differences (stripe order, a
// crescent, an emblem) are what the eye resolves.
.twin-options {
  grid-template-columns: repeat(2, minmax(18rem, 26rem));
}

.twin-option {
  padding: 0.8rem;

  .twin-flag {
    width: 100%;
    aspect-ratio: 3 / 2;
    border-radius: 0.4rem;
    box-shadow: 0 0 0 1px hsla(215.7, 76.4%, 21.6%, 0.2);
  }
}

@media (max-width: $tablet) {
  .twin-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

// Border detective: neighbour flags in a ring around an empty "?" centre.
.border-ring {
  position: relative;
  width: min(38rem, 78vw);
  aspect-ratio: 1;
  margin: 1.6rem auto 0;
  pointer-events: none;
}

.ring-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 34%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 4rem;
  font-weight: 700;
  color: hsla(215.7, 76.4%, 21.6%, 0.35);
  border: 0.2rem dashed hsla(215.7, 76.4%, 21.6%, 0.3);
  background: hsla(36, 100%, 98%, 0.6);
}

.ring-flag {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 22%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;

  // Let each flag keep its intrinsic aspect ratio — Nepal's pennant is not
  // 3:2, so forcing a rectangle distorted it and spilled the box-shadow.
  :deep(svg) {
    width: 100%;
    height: auto;
    border-radius: 0.3rem;
    filter: drop-shadow(0 1px 3px hsla(215.7, 76.4%, 21.6%, 0.25));
  }
}

// The bought hint: the mystery country's outline takes over the "?" circle.
.ring-center .hint-outline {
  width: 76%;
  height: 76%;

  path {
    fill: none;
    stroke: var(--dark-blue);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
}

// The bought last resort: the ISO code chipped over the circle's top edge.
.ring-center .iso-chip {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -55%);
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  padding: 0.2rem 0.9rem 0.2rem 1.08rem; // optical: balance the tracking's tail
  border-radius: 1rem;
  color: var(--dark-blue);
  background: hsla(36, 100%, 98%, 0.92);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.3);
}

// Trend duel: the pow reveal flips both cards to sparklines; the picked card
// carries the verdict wash.
.trend-option {
  .trend-sparkline {
    width: 100%;
    margin-top: 0.4rem;
  }
  &.was-right {
    border-color: hsla(170.5, 34.7%, 45%, 0.7);
    background: hsla(170.5, 34.7%, 55.1%, 0.14);
  }
  &.was-wrong {
    border-color: var(--hior-ange);
    background: hsla(9.8, 81.3%, 60.2%, 0.18);
  }
}

// Trajectory match: the mystery chart sits where border-detective keeps its
// "?", with the candidate flags clickable around it.
.trajectory-ring {
  pointer-events: auto;

  .chart-center {
    width: 52%;
    font-size: inherit;
    border-radius: 1.2rem;
    aspect-ratio: auto;
    padding: 1rem 1.2rem 0.6rem;
    pointer-events: none;
  }
}

.ring-pick {
  border: 0;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  background: none;
  transition: opacity var(--motion-quick) var(--ease-out-expressive);

  @media (hover: hover) {
    &:hover:not(:disabled) :deep(svg) {
      filter: drop-shadow(0 2px 5px hsla(215.7, 76.4%, 21.6%, 0.4));
    }
  }

  &.struck {
    opacity: 0.25;
    cursor: default;
    text-decoration: line-through;
  }
}

.result-sparkline {
  width: min(30rem, 80vw);
  margin: 0.8rem auto 0;
}

.hint-row {
  gap: 1rem;
  display: flex;
  flex-flow: row wrap;
  justify-content: center;
}

.hint-button {
  cursor: pointer;
  gap: 0.7rem;
  display: inline-flex;
  align-items: center;
  font-size: 1.4rem;
  font-family: inherit;
  padding: 0.6rem 1.4rem;

  .hint-icon {
    flex-shrink: 0;
  }
  border-radius: 1.2rem;
  pointer-events: auto;
  color: var(--dark-blue);
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.88);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  transition: border-color var(--motion-quick) var(--ease-out-expressive);

  @media (hover: hover) {
    &:hover {
      border-color: var(--dark-blue);
    }
  }
  &:active {
    border-color: var(--dark-blue);
  }
}

.ring-name {
  font-size: 1.1rem;
  line-height: 1.15;
  text-align: center;
  color: var(--dark-blue);
  max-width: 12ch;
}

@media (max-width: $tablet) {
  .border-ring {
    width: min(30rem, 88vw);
  }
  .ring-center {
    font-size: 3rem;
  }
}

// Money match: the currency glyph IS the question — big and editorial.
.money-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  margin: 1.6rem 0 0.4rem;

  .money-symbol {
    font-size: 8rem;
    line-height: 1;
    font-weight: 700;
    color: var(--dark-blue);
    font-family: 'Lusitana', serif;
  }
  .money-code {
    font-size: 1.6rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--soft-blue);
  }
}

// Banknote hero: bound by both width and height so portrait notes still leave
// room for the option cards below (no scroll).
.money-hero-photo {
  gap: 0.8rem;

  .money-note {
    width: auto;
    height: auto;
    max-width: min(40rem, 90vw);
    max-height: 42vh;
    object-fit: contain;
    border-radius: 0.6rem;
    box-shadow: 0 0.6rem 1.8rem hsla(215.7, 76.4%, 21.6%, 0.28);
  }
}

@media (max-width: $tablet) {
  .money-hero-photo .money-note {
    max-height: 34vh;
  }
}

@media (max-width: $tablet) {
  .money-hero .money-symbol {
    font-size: 6rem;
  }
}

.card-option {
  gap: 1rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;

  .option-flag {
    width: 100%;
    // 3:1 via the wide tile's own aspect-ratio — a fixed height crops the hoist.
    height: auto;
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

  // Stroke width arrives as a user-unit attribute scaled to the country's
  // frame — non-scaling-stroke would shatter the dash-reveal (see outline.ts).
  path {
    fill: none;
    stroke: var(--dark-blue);
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

.leader-options {
  grid-template-columns: minmax(28rem, 44rem);
}

.leader-option {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  text-align: left;
  padding: 0.8rem 1.2rem;

  .leader-thumb {
    flex: 0 0 auto;
    width: 4.4rem;
    height: 4.4rem;
    border-radius: 50%;
    background-size: cover;
    background-position: center top;
    background-color: hsla(215.7, 76.4%, 21.6%, 0.08);
    border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);

    &.placeholder {
      // A subtle silhouette stand-in when no portrait exists.
      background-image: radial-gradient(
        circle at 50% 38%,
        hsla(215.7, 76.4%, 21.6%, 0.25) 0 1.1rem,
        transparent 1.2rem
      );
    }
  }

  .leader-name {
    flex: 1;
    min-width: 0;
  }
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

// Compact phone chrome for the 13 gate variants: full-width option grids,
// a fluid flag hero, and tighter prompt padding.
@media (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;

    .flag {
      width: min(26rem, 78vw);
      height: auto;
      aspect-ratio: 26 / 15;
    }
  }

  .options {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .flag-option .option-flag {
    height: 9rem;
  }

  .text-options,
  .leader-options {
    width: min(44rem, 100%);
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
