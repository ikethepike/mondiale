<template>
  <!-- Spans throughout: renders inside ChallengeResult's lesson <p>. -->
  <span class="ranked-bars minmax-reveal">
    <span class="header">
      <StatTopicIcon class="topic" :accessor="challenge.accessorId" />
      <strong class="stat">{{ label }}</strong>
      <span class="subtitle">{{ subtitle }}</span>
    </span>
    <span class="rows">
      <span
        v-for="(row, index) in rows"
        :key="row.isoCode"
        class="row"
        :class="{ picked: row.isoCode === picked, answer: row.isAnswer }"
        :style="{ '--i': index }"
      >
        <span class="place">{{ row.place }}</span>
        <CountryFlag class="row-flag" :country="COUNTRIES[row.isoCode]" mode="background" />
        <span class="country">{{ row.name }}</span>
        <span class="bar">
          <span class="fill" :style="{ width: `${row.width}%` }" />
        </span>
        <span class="value">{{ row.display }}</span>
      </span>
    </span>
    <span v-if="pickedLine" class="picked-line" :style="{ '--i': rows.length }">
      {{ pickedLine }}
    </span>
    <span v-if="spreadLine" class="spread-line" :style="{ '--i': rows.length + 1 }">
      {{ spreadLine }}
    </span>
    <span class="credit-row">
      <SourceInfo :attributions="[source]" />
      <span class="credit">{{ source.credit }}</span>
    </span>
  </span>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { attributionFor } from '~~/lib/attribution'
import { COUNTRIES } from '~~/data/countries.gen'
import {
  buildSortedRanking,
  FINAL_STAT_LABELS,
  MINMAX_REVEAL_ROWS,
} from '~~/lib/challenges/final-challenge'
import { countryName } from '~~/lib/country'
import { formatAmount, formatOrdinal } from '~~/lib/number'
import { REGION_LABELS } from '~~/lib/variant'
import type { MaxChallenge, MinChallenge } from '~~/types/challenges/final-challenge.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The min/max scorecard: the extreme end of the board's own ranking for the
 * stat that was asked about, each country landing on its own beat with a
 * shared-scale bar. The dealt answer is marked, the player's pick is
 * highlighted wherever it sits, and a pick off the chart still gets its rank.
 *
 * The ranking comes from the dealer's own `buildSortedRanking` over the same
 * pool, so the chart can never disagree with the question it answers.
 */
const props = defineProps<{
  challenge: MinChallenge | MaxChallenge
  /** The board's playable countries — the ranking the question was dealt from. */
  pool: ISOCountryCode[]
  /** The board being played — names the scope in the subtitle. */
  variant?: Game['variant']
  /** The player's answer, right or wrong. */
  picked?: ISOCountryCode
}>()

const label = computed(() => FINAL_STAT_LABELS[props.challenge.accessorId])

/** Highest-first, as the dealer built it. */
const ranking = computed(() => buildSortedRanking(props.challenge.accessorId, props.pool))

/** The end the question asked about, extreme first. */
const extremeEnd = computed(() => {
  const sorted = ranking.value
  return props.challenge._type === 'max-challenge'
    ? sorted.slice(0, MINMAX_REVEAL_ROWS)
    : sorted.slice(-MINMAX_REVEAL_ROWS).reverse()
})

const source = computed(() =>
  attributionFor(props.challenge.accessorId, extremeEnd.value[0]?.amount)
)

const subtitle = computed(() => {
  const scope = props.variant && props.variant !== 'world' ? REGION_LABELS[props.variant] : 'world'
  const direction = props.challenge._type === 'max-challenge' ? 'highest' : 'lowest'
  return `the ${direction} in the ${scope} · ${ranking.value.length} countries ranked`
})

const rows = computed(() => {
  const shown = extremeEnd.value
  const largest = Math.max(...shown.map(entry => Math.abs(entry.amount.amount)), 1)
  return shown.map((entry, index) => ({
    isoCode: entry.isoCode,
    place: index + 1,
    name: countryName(COUNTRIES[entry.isoCode]),
    isAnswer: entry.isoCode === props.challenge.country,
    width: Math.max(3, (Math.abs(entry.amount.amount) / largest) * 100),
    display: formatAmount(entry.amount),
  }))
})

/**
 * A pick off the chart still teaches: where it actually lands in the ranking,
 * and what it measures.
 *
 * Counted from whichever end it sits nearer. Reporting it from the end the
 * question asked about is technically true and unreadable — Sweden on a
 * lowest-GDP question came out as "173rd lowest of 193" when the fact worth
 * having is that it is 21st highest.
 */
const pickedLine = computed(() => {
  if (!props.picked || rows.value.some(row => row.isoCode === props.picked)) return undefined
  const index = ranking.value.findIndex(entry => entry.isoCode === props.picked)
  const name = countryName(COUNTRIES[props.picked])
  if (index === -1) {
    return `Your pick, ${name}, has no ${label.value.toLowerCase()} figure on record.`
  }
  const total = ranking.value.length
  const fromTop = index + 1
  const nearTop = fromTop <= total / 2
  const place = nearTop ? fromTop : total - index
  const direction = nearTop ? 'highest' : 'lowest'
  return `Your pick, ${name} — ${formatOrdinal(place)} ${direction} of ${total}, at ${formatAmount(ranking.value[index].amount)}.`
})

/** How far the board's two ends actually sit apart — the fact the podium hides. */
const spreadLine = computed(() => {
  const sorted = ranking.value
  const top = sorted[0]
  const bottom = sorted.at(-1)
  if (!top || !bottom || top.isoCode === bottom.isoCode) return undefined
  const other = props.challenge._type === 'max-challenge' ? bottom : top
  const otherEnd = props.challenge._type === 'max-challenge' ? 'lowest' : 'highest'
  return `The ${otherEnd}: ${countryName(COUNTRIES[other.isoCode])}, at ${formatAmount(other.amount)}.`
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
// Shell, row stagger and bar choreography come from templates/_ranked-bars.scss
.header {
  gap: 0.3rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;

  .topic {
    width: 3.2rem;
    height: 3.2rem;
  }

  .stat {
    font-size: 1.8rem;
  }

  .subtitle {
    opacity: 0.75;
    font-size: 1.3rem;
  }
}

.row {
  border-radius: 0.6rem;

  &.picked {
    padding: 0.2rem 0.5rem;
    margin: -0.2rem -0.5rem;
    background: hsla(45, 90%, 74%, 0.35);
  }

  &.answer .country {
    font-weight: 700;
  }

  .place {
    width: 1.6rem;
    opacity: 0.6;
    text-align: right;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .row-flag {
    width: 2.2rem;
    height: 1.5rem;
    flex-shrink: 0;
    border-radius: 0.2rem;
  }

  .country {
    width: 10rem;
    overflow: hidden;
    text-align: left;
    flex-shrink: 0;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  // Amounts carry their unit ("1.44b people"), so they must not wrap — a
  // two-line value column doubles the card's height and pushes the credit row
  // out of the scroller. min-width, never width: the column has to be able to
  // grow the card instead of spilling its text over the edge.
  .value {
    min-width: 8.6rem;
    text-align: right;
    flex-shrink: 0;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  // flex-basis 0 would contribute nothing to the card's max-content width and
  // leave the bars a few pixels wide once the value column claims its room
  .bar {
    min-width: 6rem;
  }
}

.bar .fill {
  background: var(--soft-blue);
}

.row.answer .bar .fill {
  background: var(--dark-blue);
}

.picked-line,
.spread-line {
  opacity: 0;
  font-size: 1.3rem;
  animation: row-land 0.4s var(--ease-smooth) forwards;
  animation-delay: calc(var(--i) * 110ms + 250ms);
}

.spread-line {
  font-style: italic;
}

@media (prefers-reduced-motion: reduce) {
  .picked-line,
  .spread-line {
    animation: none;
    opacity: 1;
  }
}

@media screen and (max-width: $phone) {
  .row {
    .country {
      width: 6.5rem;
    }

    .value {
      min-width: 7.4rem;
    }
  }
}
</style>
