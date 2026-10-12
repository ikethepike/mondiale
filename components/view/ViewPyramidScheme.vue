<template>
  <div v-if="challenge" class="pyramid-scheme challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      kind="pyramid-scheme"
      title="Whose pyramid is this?"
      :stakes="stakes"
      @done="start"
    />

    <ChallengePrompt
      :compact="tight"
      :hint="hint"
      :hint-tone="hintTone"
      :attributions="datasetAttribution('wpp')"
    >
      <h1 v-if="!revealed" class="map-caption">Whose population pyramid is this?</h1>
      <ChallengeResult
        v-else
        :status="solved ? 'correct' : 'incorrect'"
        :correct-message="verdictHeadline"
        :incorrect-message="verdictHeadline"
      >
        <template v-if="wrongPick">
          The dashed outline is {{ countryName(wrongPick) }}, the pick that missed.
        </template>
      </ChallengeResult>
    </ChallengePrompt>

    <section
      ref="stageEl"
      class="stage"
      :class="{
        revealed,
        scrollport: revealed,
        'fade-top': scrollableUp,
        'fade-bottom': scrollableDown,
      }"
      @scroll.passive="syncScrollEdges"
    >
      <div class="board">
        <div class="chart">
          <PopulationPyramid
            :iso-code="challenge.country"
            :frame="frame"
            :scars="revealed ? scars : []"
            :ghost="revealed ? wrongPick : undefined"
            annotated
          />
          <p class="axis">
            <span class="men">← men</span>
            <span class="women">women →</span>
          </p>
        </div>

        <aside class="readout">
          <ChallengeTimerRadial
            v-if="!revealed"
            class="readout-clock"
            :value="secondsLeft"
            :total="challenge.durationSeconds"
          />
          <dl>
            <div class="year">
              <dt>Year</dt>
              <dd>{{ shownYear }}</dd>
            </div>
            <div>
              <dt>Median age</dt>
              <dd>{{ readout.median }}</dd>
            </div>
            <div>
              <dt>Under 15</dt>
              <dd>{{ readout.young }}%</dd>
            </div>
            <div>
              <dt>65 and over</dt>
              <dd>{{ readout.old }}%</dd>
            </div>
          </dl>
        </aside>
      </div>

      <PyramidTimeline v-model="frame" class="timeline" />
      <PyramidReveal
        v-if="revealed"
        class="reveal"
        :challenge="challenge"
        :submitted="banked"
        :with-shapes="false"
      />
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </section>

    <footer ref="footerEl" class="shell-footer">
      <div v-if="!revealed" class="options card-options">
        <button
          v-for="option in challenge.options"
          :key="option"
          class="option card-option"
          :class="{ 'is-spent': spent.includes(option) }"
          type="button"
          :disabled="submitted || !started || spent.includes(option)"
          @click="onGuess(getCountry(option))"
        >
          <CountryTileFlag class="option-flag" :country="getCountry(option)" />
          <span>{{ countryName(option) }}</span>
        </button>
      </div>
      <BrowseContinue
        v-else-if="browseHold !== undefined"
        :seconds-left="browseSecondsLeft"
        @continue="finish"
      />
    </footer>
  </div>
</template>

<script lang="ts" setup>
import BrowseContinue from '~/components/challenge/BrowseContinue.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import PopulationPyramid from '~/components/challenge/PopulationPyramid.vue'
import PyramidReveal from '~/components/challenge/PyramidReveal.vue'
import PyramidTimeline from '~/components/challenge/PyramidTimeline.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import {
  medianAge,
  pyramidFrameAt,
  pyramidScars,
  pyramidYearAt,
  shareOver65,
  shareUnder15,
} from '~~/lib/pyramids'
import { useAckOnce } from '~~/lib/use-ack-once'
import { useAttemptOptions } from '~~/lib/use-attempt-options'
import { useDeadlineClock } from '~~/lib/use-deadline-clock'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { useScrollEdges } from '~~/lib/use-scroll-edges'
import { useIsPhone, useIsShortViewport } from '~~/lib/use-viewport'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { ISOCountryCode } from '~~/types/geography.types'

const {
  challenge,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  remainingFraction,
  begin,
  stopCountdown,
  hint,
  hintTone,
  announce,
  entries,
  submitOnce,
  gameStore,
  currentRound,
  boothAnswer,
  subject,
  seatEcho,
} = useGroupChallenge('pyramid-scheme-challenge')
const { seatCursor } = useClientEvents()

const footerEl = ref<HTMLElement>()
useFooterBerth(footerEl)

const stageEl = ref<HTMLElement>()
const { scrollableUp, scrollableDown, syncScrollEdges } = useScrollEdges(() => stageEl.value)

const isPhone = useIsPhone()
const isShort = useIsShortViewport()
const tight = computed(() => isPhone.value || isShort.value)

const stakes = computed(() => {
  const active = challenge.value
  if (!active) return ''
  const base = `One country's age structure across sixty years. Pick its owner from ${active.options.length} — ${active.maximumGuesses} guesses, the second worth less.`
  return gameStore.game?.difficulty === 'hard'
    ? `${base} Today the options look alike, but they aged decades apart: drag the timeline back.`
    : base
})

// --- the chart ---------------------------------------------------------------

const frame = ref(0)
const shownYear = computed(() => pyramidYearAt(frame.value))
const current = computed(() =>
  challenge.value ? pyramidFrameAt(challenge.value.country, frame.value) : undefined
)
const readout = computed(() => {
  const at = current.value
  if (!at) return { median: 0, young: 0, old: 0 }
  return {
    median: Math.round(medianAge(at)),
    young: Math.round(shareUnder15(at)),
    old: Math.round(shareOver65(at)),
  }
})
const scars = computed(() => (challenge.value ? pyramidScars(challenge.value.country) : []))

// --- answering ---------------------------------------------------------------

/** This mount's own picks, once banked. */
const picks = ref<ISOCountryCode[]>()
/** The picks the reveal reads: this mount's, the booth's followed seat, or the
 *  seat's banked answer after a remount mid-reveal. */
const banked = computed<ISOCountryCode[]>(
  () =>
    picks.value ??
    boothAnswer.value?.submitted ??
    currentRound.value?.round.groupAnswers[gameStore.seatId]?.submitted ??
    []
)
const revealed = computed(() => submitted.value || !!boothAnswer.value)
const solved = computed(() => !!challenge.value && banked.value.includes(challenge.value.country))
const wrongPick = computed(() =>
  banked.value.filter(isoCode => isoCode !== challenge.value?.country).at(-1)
)

const verdictHeadline = computed(() => {
  const active = challenge.value
  if (!active) return ''
  const name = countryName(active.country)
  if (!solved.value) return `It was ${name}`
  return banked.value[0] === active.country ? `${name}, first try` : `${name}, at the second try`
})

const submitRound = (_score: number, attempt: ISOCountryCode[]) => {
  if (submitted.value) return
  stopCountdown()
  picks.value = attempt
  submitOnce(attempt)
}

const start = () => begin({ onTimeout: () => submitRound(0, spent.value) })

// The winning pick is never broadcast, and the four options make even a wrong
// name too strong a clue — the policy drops it to presence.
const { spent, onGuess } = useAttemptOptions({
  challenge,
  submitted,
  started,
  remainingFraction,
  announce,
  submitRound,
})

// --- the browsable reveal ----------------------------------------------------

const browseHold = computed(() =>
  !gameStore.watching &&
  seatCursor.value?.subject === subject &&
  seatCursor.value.step === 'round-verdict'
    ? seatCursor.value.holdUntil
    : undefined
)
const { secondsOnClock: browseSecondsLeft } = useDeadlineClock(browseHold)
const { send: finish } = useAckOnce(() => ({ event: 'round-reveal-done', ...seatEcho(subject) }))
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/scroll-fade' as *;

/** PopulationPyramid's annotated viewBox, width over height. */
$chart-aspect: calc(107 / 88);

.stage {
  // The chart is sized from the height it may take; its width follows the
  // pyramid's own aspect, so the men/women key always spans the bars.
  --chart-height: 52dvh;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: safe center;
  gap: 1.2rem;
  width: min(120rem, calc(100% - 3.2rem));
  margin: 0 auto;

  &.revealed {
    justify-content: flex-start;
    overflow-y: auto;
    @include scroll-mask($top: 2rem, $bottom: 2.4rem);

    --chart-height: 36dvh;

    > * {
      flex: none;
    }
  }
}

.board {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2.4rem;
  width: 100%;
  min-height: 0;
  flex: 0 1 auto;
}

.chart {
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: min(100%, calc(var(--chart-height) * #{$chart-aspect}), 96rem);

  :deep(.population-pyramid svg) {
    max-height: var(--chart-height);
  }
}

.axis {
  margin: 0;
  display: flex;
  justify-content: space-between;
  font-size: 1.1rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding-left: 7%;

  .men {
    color: var(--pyramid-male);
  }
  .women {
    color: var(--pyramid-female);
  }
}

.readout {
  display: grid;
  gap: 1.4rem;
  flex: none;
  width: 12rem;
  font-variant-numeric: tabular-nums;

  dl {
    margin: 0;
    display: grid;
    gap: 1.4rem;
  }

  dt {
    font-size: 1.05rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #{ink(0.55)};
  }

  dd {
    margin: 0;
    font-size: 2.2rem;
    font-weight: 700;
    line-height: 1.15;
  }

  .year dd {
    font-size: 3.4rem;
  }

  .readout-clock {
    --clock-size: 6.4rem;
    --clock-seconds-size: 2rem;
  }
}

.timeline {
  width: min(64rem, 100%);
}

.shell-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;
  pointer-events: auto;
}

.card-options {
  grid-template-columns: repeat(4, minmax(12rem, 18rem));
}

.reveal {
  width: min(72rem, 100%);
  padding-top: 1.2rem;
  border-top: 0.1rem solid $hairline;
}

@media screen and (max-width: $tablet), screen and (max-height: $short) {
  .board {
    gap: 1.2rem;
  }

  .stage:not(.revealed) {
    --chart-height: 44dvh;
  }

  .readout {
    width: 8.4rem;
    gap: 0.9rem;

    dl {
      gap: 0.9rem;
    }
    .readout-clock {
      --clock-size: 4.8rem;
      --clock-seconds-size: 1.6rem;
    }

    dt {
      font-size: 0.9rem;
    }
    dd {
      font-size: 1.7rem;
    }
    .year dd {
      font-size: 2.2rem;
    }
  }

  .card-options {
    width: calc(100% - 3.2rem);
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

// A phone has no width to spare beside the chart: the readout drops under it
// as one row and the chart takes the full width.
@media screen and (max-width: $tablet) {
  .board {
    flex-direction: column;
    align-items: stretch;
    gap: 0.8rem;
  }

  // What the prompt, the readout row, the timeline and two rows of options
  // leave over — a short phone otherwise stacks them over the chart.
  .stage:not(.revealed) {
    --chart-height: clamp(12rem, calc(100dvh - 46rem), 44dvh);
  }

  .chart {
    align-self: center;
  }

  .readout {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 1.2rem;

    dl {
      flex: 1;
      grid-template-columns: repeat(4, auto);
      justify-content: space-between;
    }
  }
}

// A phone on its side: no height for stacked rows, plenty of width.
@media screen and (max-height: $short) and (min-width: $tablet) {
  .stage:not(.revealed) {
    --chart-height: 38dvh;
  }

  .readout {
    grid-template-columns: auto 1fr;
    align-items: center;
    width: auto;

    dl {
      grid-template-columns: repeat(2, auto);
      column-gap: 1.6rem;
    }
  }

  .card-options {
    gap: 0.8rem;
    grid-template-columns: repeat(4, minmax(0, 14rem));
  }

  .card-option {
    gap: 0.3rem;
    padding: 0.5rem;
    font-size: 1.3rem;

    :deep(.option-flag) {
      height: 2.6rem;
    }
  }
}
</style>
