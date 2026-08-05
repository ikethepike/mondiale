<template>
  <div v-if="challenge" class="trend-race challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Trend Race`"
      :title="`Whose ${metricLabel} has ${challenge.direction} the most?`"
      :stakes="`Every line here has ${challenge.direction} since ${challenge.windowStartYear} — pick the country that moved the most. One shot, ${challenge.durationSeconds} seconds.`"
      @done="begin({ onTimeout: () => resolve() })"
    />

    <ChallengeTimerRadial
      v-if="!revealed && !showInterstitial"
      class="round-clock"
      :value="secondsLeft"
      :total="challenge.durationSeconds"
    />

    <ChallengePrompt :attributions="[trendAttribution(challenge.metric)]">
      <h1 class="map-caption">
        Which country's {{ metricLabel }} has {{ challenge.direction }} the most since
        {{ challenge.windowStartYear }}?
      </h1>
      <span v-if="revealed && pickedWinner" class="map-caption sub verdict correct">
        Called it — {{ winnerName }} moved the most
      </span>
      <span v-else-if="revealed && picked !== undefined" class="map-caption sub verdict incorrect">
        {{ winnerName }} moved the most
      </span>
      <span v-else-if="revealed" class="map-caption sub verdict incorrect">
        Time's up — {{ winnerName }} moved the most
      </span>
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </ChallengePrompt>

    <section ref="stageEl" class="race-stage">
      <!-- The reveal's second act: the whole world's CURRENT values as a
           gapminder strip, so the racers land in absolute context. -->
      <Transition name="caption">
        <div v-if="revealed" class="spread">
          <span class="map-caption sub">Every country's {{ metricLabel }} today</span>
          <StatStripPlot
            :metric="challenge.metric"
            :target="winner"
            :decoy="picked !== undefined && picked !== winner ? picked : undefined"
            :noted="challenge.options.filter(option => option !== winner && option !== picked)"
          />
        </div>
      </Transition>
      <TransitionGroup ref="listEl" tag="ul" name="race" class="race-list">
        <li v-for="isoCode in raceOrder" :key="isoCode" :data-iso="isoCode">
          <StatCard
            tag="button"
            type="button"
            class="race-card"
            :class="cardClass(isoCode)"
            :topic="metricTopic"
            :accessor="metricGlyph"
            :disabled="revealed"
            @click="pick(isoCode)"
          >
            <ContourRipple
              v-if="revealed && isoCode === winner"
              class="card-ripple"
              tone="success"
              :delay="0.3"
            />
            <span class="race-country">
              <CountryFlag class="flag" :country="getCountry(isoCode)" />
              <strong>{{ countryName(isoCode) }}</strong>
            </span>
            <TrendSparkline
              v-if="revealed && seriesFor(isoCode)"
              :series="seriesFor(isoCode)!"
              :metric="challenge.metric"
              animate-in
            />
            <Transition name="caption">
              <span v-if="revealed" class="rank-tag" :class="{ winner: isoCode === winner }">
                {{ rankLabel(isoCode) }}
              </span>
            </Transition>
          </StatCard>
        </li>
      </TransitionGroup>
      <Transition name="caption">
        <ButtonFilled v-if="revealed" class="continue-button" @click="finish">
          <span v-if="browseSecondsLeft > BROWSE_HINT_S">Continue</span>
          <!-- Button copy, not view chrome — the round clock above is the shared
               radial; a dial inside a button label wouldn't read. -->
          <span v-else>Continuing in {{ browseSecondsLeft }}s</span>
        </ButtonFilled>
      </Transition>
    </section>
  </div>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import StatCard from '~/components/challenge/StatCard.vue'
import TrendSparkline from '~/components/challenge/TrendSparkline.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import ContourRipple from '~/components/feedback/ContourRipple.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import StatStripPlot from '~/components/feedback/StatStripPlot.vue'
import { trendAttribution } from '~~/lib/attribution'
import { countryName, getCountry } from '~~/lib/country'
import { prefersReducedMotion, REVEAL_BEAT_MS } from '~~/lib/motion'
import { TREND_METRICS } from '~~/lib/trends'
import { TRENDS } from '~~/lib/trends-data'
import { centreScrollTop, useIsPhone } from '~~/lib/use-viewport'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { ISOCountryCode } from '~~/types/geography.types'

const {
  challenge,
  currentRound,
  showInterstitial,
  secondsLeft,
  begin,
  announce,
  entries,
  submitOnce,
  stopCountdown,
  registerCleanup,
  gameStore,
} = useGroupChallenge('trend-race-challenge')

const picked = ref<ISOCountryCode>()
const revealed = ref(false)
const sorted = ref(false)
let browseTimer: ReturnType<typeof setInterval> | undefined
let sortTimer: ReturnType<typeof setTimeout> | undefined
registerCleanup(() => browseTimer && clearInterval(browseTimer))
// Continue can land before the beat fires — an orphaned timer would write to
// a torn-down component.
registerCleanup(() => sortTimer && clearTimeout(sortTimer))

const isPhone = useIsPhone()
const stageEl = ref<HTMLElement | null>(null)
// TransitionGroup's ref resolves to the component; its $el is the <ul>.
const listEl = ref<{ $el?: HTMLElement } | null>(null)

const metricLabel = computed(() =>
  challenge.value ? TREND_METRICS[challenge.value.metric].label : ''
)
const metricTopic = computed(() =>
  challenge.value ? TREND_METRICS[challenge.value.metric].topic : undefined
)
const metricGlyph = computed(() =>
  challenge.value ? TREND_METRICS[challenge.value.metric].glyph : undefined
)

const winner = computed(() => challenge.value?.standings[0])
const winnerName = computed(() => (winner.value ? countryName(winner.value) : ''))
const pickedWinner = computed(() => picked.value !== undefined && picked.value === winner.value)

// Deal order is a shuffle, so the rank tags read out of order and the winner
// can sit below the fold. The reveal re-lays the cards into standings order —
// the server's ranking, never re-derived here.
const raceOrder = computed<ISOCountryCode[]>(() => {
  const active = challenge.value
  if (!active) return []
  return sorted.value ? active.standings : active.options
})

const seriesFor = (isoCode: ISOCountryCode) =>
  challenge.value ? TRENDS[isoCode]?.[challenge.value.metric] : undefined

const rankLabel = (isoCode: ISOCountryCode) => {
  const position = challenge.value?.standings.indexOf(isoCode) ?? -1
  if (position === 0) return `Moved the most`
  return position === -1 ? '' : `#${position + 1}`
}

const cardClass = (isoCode: ISOCountryCode) => {
  if (!revealed.value) return undefined
  if (isoCode === winner.value) return 'is-winner'
  if (isoCode === picked.value) return 'was-picked'
  return 'is-settled'
}

/**
 * Land the reveal on the player's own card: the sort already puts the winner
 * on top and the header names them, so "where did mine finish?" is what's
 * left. On a timeout there is no pick — fall back to the winner.
 *
 * Scrolls the stage only, never scrollIntoView, whose ancestor walk shifts
 * the whole shell. Layout offsets, not rects: the FLIP moves lie mid-glide.
 */
const scrollToOutcome = () => {
  // Desktop's .race-stage has no overflow — the grid is centred and whole.
  if (!isPhone.value) return
  const target = picked.value ?? winner.value
  if (!target) return
  nextTick(() => {
    const stage = stageEl.value
    const item = listEl.value?.$el?.querySelector<HTMLElement>(`[data-iso="${CSS.escape(target)}"]`)
    if (!stage || !item) return
    // .race-stage is the only positioned ancestor, so it is the li's
    // offsetParent and offsetTop already reads in the stage's scroll space.
    stage.scrollTo({
      top: centreScrollTop(
        stage.clientHeight,
        stage.scrollHeight,
        item.offsetTop,
        item.offsetHeight
      ),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  })
}

// The reveal is browsable: the player leaves via Continue, the cap only
// exists so an AFK player can't hold up the room's next-round barrier.
const BROWSE_CAP_S = 60
const BROWSE_HINT_S = 10
const browseSecondsLeft = ref(BROWSE_CAP_S)

/** Leave the reveal — the pick (or the empty timeout answer) is submitted. */
const finish = () => {
  if (browseTimer) clearInterval(browseTimer)
  browseTimer = undefined
  if (sortTimer) clearTimeout(sortTimer)
  sortTimer = undefined
  submitOnce(picked.value ? [picked.value] : [])
}

/** One resolution path for both the tap and the timeout. */
const resolve = (isoCode?: ISOCountryCode) => {
  const active = challenge.value
  if (!active || revealed.value) return
  stopCountdown()
  revealed.value = true
  picked.value = isoCode
  // Every card is on screen — naming the pick would hand out the answer.
  if (isoCode) announce({ kind: 'presence' })
  // A beat, then the cards rank themselves and the stage finds the pick.
  sortTimer = setTimeout(() => {
    sortTimer = undefined
    sorted.value = true
    scrollToOutcome()
  }, REVEAL_BEAT_MS)
  browseTimer = setInterval(() => {
    browseSecondsLeft.value--
    if (browseSecondsLeft.value <= 0) finish()
  }, 1000)
}

const pick = (isoCode: ISOCountryCode) => {
  if (showInterstitial.value) return
  resolve(isoCode)
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

header .verdict.correct {
  color: var(--dark-blue);
}
header .verdict.incorrect {
  color: var(--hior-ange);
}

.race-stage {
  flex: 1;
  gap: 2rem;
  display: flex;
  min-height: 0;
  padding: 0 2rem;
  position: relative;
  align-items: center;
  flex-flow: column nowrap;
  justify-content: center;
}

.spread {
  gap: 1rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
  pointer-events: auto;
  width: min(84rem, 94vw);

  .stat-strip-plot {
    --swarm-height: clamp(9rem, 18vh, 15rem);
  }
}

.race-list {
  gap: 1.4rem;
  margin: 0;
  padding: 0;
  display: grid;
  list-style: none;
  pointer-events: auto;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 20rem));
  justify-content: center;
  width: 100%;

  li {
    display: flex;
  }
}

.continue-button {
  flex: none;
  align-self: center;
  pointer-events: auto;
}

.race-card {
  cursor: pointer;
  position: relative;
  transition:
    transform var(--motion-quick) var(--ease-out-expressive),
    border-color var(--motion-quick) var(--ease-out-expressive),
    background-color var(--motion-base) var(--ease-out-expressive);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      transform: translateY(-0.3rem);
      border-color: var(--dark-blue);
    }
  }
  &:active:not(:disabled) {
    border-color: var(--dark-blue);
  }
  &:disabled {
    cursor: default;
  }

  .card-ripple {
    inset: -15%;
    position: absolute;
    pointer-events: none;
  }

  .race-country {
    gap: 0.8rem;
    display: flex;
    font-size: 1.6rem;
    align-items: center;

    .flag {
      width: 3.2rem;
      height: 2.1rem;
      flex: none;
    }
  }

  .rank-tag {
    font-size: 1.2rem;
    font-weight: bold;
    opacity: 0.7;

    &.winner {
      opacity: 1;
      color: hsl(170.5, 34.7%, 38%);
    }
  }

  // Reveal: the steepest mover glows mint, the rest settle back.
  &.is-winner {
    border-color: hsla(170.5, 34.7%, 45%, 0.7);
    background: hsla(170.5, 34.7%, 55.1%, 0.14);
  }
  &.was-picked:not(.is-winner) {
    outline: 0.25rem solid var(--hior-ange);
    outline-offset: 0.2rem;
  }
}

// The reveal's second beat: the shuffled cards re-lay themselves into
// standings order. --motion-slow, like the timeline's line-move — a rank
// shuffle is an entrance, not a tick.
.race-move {
  transition: transform var(--motion-slow) var(--ease-out-expressive);
}

// Nothing enters or leaves — the same cards only ever permute. The guard
// keeps a mid-glide unmount from collapsing the grid under cards in flight.
.race-leave-active {
  position: absolute;
}

@media (prefers-reduced-motion: reduce) {
  .race-move {
    transition: none;
  }
}

@media screen and (max-width: $tablet) {
  .race-stage {
    overflow-y: auto;
    // Centering + overflow pushes content above the scroll origin, where it
    // can never be scrolled back into view — anchor to the top instead.
    justify-content: flex-start;
    // .main-board kills pointer events; the scroll container must take
    // touches itself or drags on gaps between cards won't scroll.
    pointer-events: auto;
    overscroll-behavior: contain;
    padding: 0.4rem 1.6rem calc(1.2rem + var(--safe-bottom));
  }

  // 94vw is wider than the stage's padded inner width — with the stage now a
  // scroll container that would surface as horizontal jitter.
  .spread {
    width: 100%;
  }

  .race-list {
    gap: 0.8rem;
    grid-template-columns: minmax(0, 1fr);
  }

  // Phone cards read as rows: flag and name lead. The stat emblem stays a
  // top-left corner badge (never in flow — it forced a second row); the
  // content indents past it instead.
  .race-card {
    gap: 0.8rem 1rem;
    padding: 1.2rem 1.4rem 1.2rem 4.2rem;
    flex-flow: row wrap;
    text-align: left;

    .race-country {
      flex: 1;
      min-width: 0;
    }

    :deep(.topic-icon) {
      top: 1.3rem;
      left: 1.2rem;
    }

    :deep(.trend-sparkline) {
      width: 100%;
    }

    .rank-tag {
      width: 100%;
    }
  }
}
</style>
