<template>
  <div class="trend-duel-reveal" :style="{ '--duel-columns': columns }">
    <ol class="duels">
      <li
        v-for="(row, index) in rows"
        :key="index"
        class="duel"
        :class="{ missed: !row.correct }"
        :style="{ '--i': index }"
      >
        <span class="duel-head">
          {{ row.label }} — {{ row.answerName }} is the one {{ row.seek }}
        </span>
        <span class="sides">
          <span
            v-for="side in row.sides"
            :key="side.isoCode"
            class="side"
            :class="{ answer: side.isAnswer, missed: side.missed }"
          >
            <span class="side-id">
              <CountryFlag
                class="side-flag"
                :country="getCountry(side.isoCode)"
                mode="background"
              />
              <span class="side-name">{{ countryName(side.isoCode) }}</span>
              <span v-if="side.pickedMark" class="side-picked">your pick</span>
            </span>
            <TrendSparkline
              v-if="side.series"
              :series="side.series"
              :metric="row.metric"
              detail="chart"
            />
          </span>
        </span>
      </li>
    </ol>
  </div>
</template>
<script lang="ts" setup>
import TrendSparkline from '~/components/challenge/TrendSparkline.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import { countryName, getCountry } from '~~/lib/country'
import { TREND_METRICS } from '~~/lib/trends'
import { TRENDS } from '~~/lib/trends-data'
import type { TrendDuelOutcome } from '~~/types/challenges/individual-challenge.type'

/**
 * The trend-duel gate's ledger: every duel faced, both series side by side —
 * DuelReveal's shape for trends. Renders inside ChallengeResult's lesson
 * body, and stays span-built to match its siblings.
 */
const props = defineProps<{
  outcomes: TrendDuelOutcome[]
}>()

/** How wide the ledger may ask to be: a lost first duel is a one-card ledger and
 *  must not stretch a card across the screen. Three abreast is the ceiling —
 *  past that a duel's two charts go to slivers. */
const columns = computed(() => Math.min(props.outcomes.length, 3))

const rows = computed(() =>
  props.outcomes.map(outcome => ({
    metric: outcome.metric,
    label: TREND_METRICS[outcome.metric].label,
    seek: outcome.seek,
    correct: outcome.correct,
    answerName: countryName(outcome.answer),
    sides: [outcome.answer, outcome.other].map(isoCode => ({
      isoCode,
      series: TRENDS[isoCode]?.[outcome.metric],
      isAnswer: isoCode === outcome.answer,
      pickedMark: isoCode === outcome.picked,
      missed: !outcome.correct && isoCode === outcome.picked,
    })),
  }))
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// Five duels × two annotated charts is a wall, not a paragraph: one duel per row
// ran ~120rem tall and the shell does not scroll, so the verdict head above and
// the last duels below both fell off the screen. The ledger takes its own width
// from the `wide` host (ChallengeResult drops its prose cap for it) and spends
// it across rather than down.
//
// The width is DEFINITE and counted off the duels: the host card is
// `width: max-content` and a sparkline has no intrinsic width of its own (its
// svg is `width: 100%`), so an auto-sized ledger collapses onto the head line's
// measure — the narrow column this reveal used to render as. The count comes
// from the script rather than a breakpoint because it is the ledger's content,
// not the viewport, that says how many cards there are to stand side by side.
.trend-duel-reveal {
  gap: 0.8rem;
  display: flex;
  max-width: 100%;
  text-align: left;
  flex-flow: column nowrap;
  width: calc(var(--duel-columns, 3) * 38rem);
}

// Duels abreast where there is room, one per row on a phone — and whatever
// still runs past the fold scrolls inside the card rather than off the screen.
.duels {
  gap: 0.7rem;
  margin: 0;
  // The scroller's own padding, so a card's border and the sparkline's
  // edge-kissing end dot aren't shaved by the overflow.
  padding: 0.2rem;
  display: grid;
  list-style: none;
  // The column count follows the width the ledger actually got, not the
  // viewport: three duels abreast on a laptop, two on a tablet, one on a phone.
  // It resolves at all only because the reveal above declares a definite width.
  // 34rem is the floor a duel needs — two annotated charts share the card, and
  // under ~17rem apiece the year row runs its outer labels into the middle one.
  grid-template-columns: repeat(auto-fit, minmax(34rem, 1fr));
  // Whatever still runs past the fold scrolls inside the card. The card stands
  // under the verdict head in a shell that does not scroll, so this ceiling is
  // what keeps the head — and the last duel — on the screen.
  max-height: min(70vh, 68rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.duel {
  gap: 0.6rem;
  display: flex;
  min-width: 0;
  padding: 0.7rem 1rem;
  border-radius: 1.2rem;
  flex-flow: column nowrap;
  background: glass(0.55);
  border: 1px solid ink(0.1);
  // The cards land in sequence, the shape TrajectoryReveal's rows keep.
  animation: row-land var(--motion-base) var(--ease-out-expressive) both;
  animation-delay: calc(var(--i, 0) * 60ms);

  // The duels that cost the streak, legible at a glance across the grid —
  // scanning ten curves for an orange country name is not reading.
  &.missed {
    border-color: var(--hior-ange);
    background: flame(0.12);
  }
}

.duel-head {
  font-size: 1.3rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--dark-blue);
}

.sides {
  gap: 1rem;
  display: grid;
  align-items: start;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.side {
  gap: 0.4rem;
  display: flex;
  min-width: 0;
  flex-flow: column nowrap;

  &:not(.answer) {
    opacity: 0.7;
  }

  &.missed {
    opacity: 1;

    .side-name,
    .side-picked {
      color: var(--hior-ange);
    }
  }
}

// The pick marker wraps under the name rather than squeezing it — a half-card
// column leaves "Bosnia and Herzegovina" no room to share its row.
.side-id {
  gap: 0.1rem 0.6rem;
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  align-items: center;
}

.side-flag {
  flex: 0 0 auto;
  width: 2.2rem;
  height: 1.5rem;
  border-radius: 0.3rem;
  box-shadow: 0 0 0 1px ink(0.12);
}

.side-name {
  min-width: 0;
  font-size: 1.3rem;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.side-picked {
  font-size: 1.05rem;
  flex-shrink: 0;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--soft-blue);
}

.trend-duel-reveal .source-line {
  justify-content: center;
}

// Below the phone squeeze two annotated charts abreast are slivers — the duel
// stacks, and the ledger is a single scrolling column of them.
@media (max-width: $phone) {
  .sides {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .duel {
    animation: none;
  }
}
</style>
