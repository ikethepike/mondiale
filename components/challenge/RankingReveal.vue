<template>
  <div class="ranking-reveal">
    <span v-if="markers" class="pole pole-top">
      <svg class="pole-arrow" viewBox="0 0 16 40" aria-hidden="true">
        <path
          d="M8 39V2M8 2l-5 6M8 2l5 6"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="pole-label">{{ markers.most }}</span>
    </span>

    <ol class="rows">
      <li
        v-for="row in rows"
        :key="row.isoCode"
        class="row"
        :class="{ exact: row.points === MAXIMUM_SCORE_PER_COUNTRY, blank: row.points === 0 }"
      >
        <span class="place">{{ row.tieStart }}</span>
        <div v-if="row.country" class="flag-stage">
          <CountryFlag v-if="isPhone" class="flag" :country="row.country" />
          <CountryTileFlag v-else class="flag" :country="row.country" />
        </div>
        <div class="identity">
          <strong class="name">{{ row.name }}</strong>
          <div v-if="row.amount" class="measure">
            <span class="amount">{{ formatAmount(row.amount) }}</span>
            <!-- Without this a "1" repeated five times reads as a bug -->
            <span v-if="row.tied" class="tied">tied ×{{ row.tiedCount }}</span>
            <span class="scale" aria-hidden="true">
              <span class="fill" :style="{ width: `${row.share * 100}%` }" />
            </span>
          </div>
        </div>
        <div class="verdict">
          <span class="placement chip" :class="{ missing: !row.submittedPosition }">
            <template v-if="row.points === MAXIMUM_SCORE_PER_COUNTRY">
              <svg class="check" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M2.5 8.5l4 4 7-9"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Spot on</span>
            </template>
            <template v-else-if="row.submittedPosition">
              <span>You said {{ formatOrdinal(row.submittedPosition) }} · {{ row.offBy }} off</span>
            </template>
            <template v-else>
              <span>Left out</span>
            </template>
          </span>
          <span class="points-earned">
            <span class="pips">
              <span
                v-for="pip in MAXIMUM_SCORE_PER_COUNTRY"
                :key="pip"
                class="pip"
                :class="{ filled: row.points >= pip }"
              />
            </span>
            <strong class="points">+{{ row.points }}</strong>
          </span>
        </div>
      </li>
    </ol>

    <span v-if="markers" class="pole pole-bottom">
      <svg class="pole-arrow" viewBox="0 0 16 40" aria-hidden="true">
        <path
          d="M8 1v37M8 38l-5-6M8 38l5-6"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="pole-label">{{ markers.least }}</span>
    </span>

    <span v-if="sourceLine" class="source-line reveal-source">
      {{ sourceLine }}
      <SourceInfo v-if="sourceAttribution" :attributions="[sourceAttribution]" />
    </span>
  </div>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import CountryTileFlag from '~/components/country/CountryTileFlag.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { attributionFor, statSourceLine } from '~~/lib/attribution'
import { getChallengeDetails, MAXIMUM_SCORE_PER_COUNTRY, rankingBreakdown } from '~~/lib/challenges'
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { useIsPhone } from '~~/lib/use-viewport'
import { formatAmount, formatOrdinal } from '~~/lib/number'
import { getValueByAccessorID } from '~~/lib/values'
import { rankingAccessorId } from '~~/lib/rounds'
import type { ISOCountryCode } from '~~/types/geography.types'

const { currentRound } = useClientEvents()
const isPhone = useIsPhone()

const props = defineProps({
  submitted: {
    type: Array as PropType<ISOCountryCode[]>,
    required: true,
  },
  correct: {
    type: Array as PropType<ISOCountryCode[]>,
    required: true,
  },
})

const accessorId = computed(() => rankingAccessorId(currentRound.value?.round.groupChallenge))

const markers = computed(() =>
  accessorId.value ? getChallengeDetails(accessorId.value).markers : undefined
)

const rows = computed(() => {
  const breakdown = rankingBreakdown({
    submitted: props.submitted,
    correct: props.correct,
    groupChallengeAccessorId: accessorId.value,
  })
  const amounts = breakdown.map(({ isoCode }) =>
    accessorId.value ? getValueByAccessorID(isoCode, accessorId.value) : undefined
  )
  // The correct order is descending, but a data hiccup shouldn't break the bars
  const largest = Math.max(...amounts.map(amount => amount?.amount ?? 0), 0)

  return breakdown.map((row, index) => {
    const country = getCountry(row.isoCode)
    const amount = amounts[index]
    return {
      ...row,
      country,
      name: country ? countryName(country) : row.isoCode,
      amount,
      share: largest > 0 && amount ? amount.amount / largest : 0,
    }
  })
})

// The numbers' provenance: one line for the whole ledger, dated by the values.
const sourceLine = computed(() => {
  if (!accessorId.value) return undefined
  return statSourceLine(accessorId.value, rows.value.find(row => row.amount)?.amount)
})
const sourceAttribution = computed(() => {
  if (!accessorId.value) return undefined
  return attributionFor(accessorId.value, rows.value.find(row => row.amount)?.amount)
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.ranking-reveal {
  display: flex;
  flex-flow: column nowrap;
}

// The poles frame the true order the way they framed the guessing round:
// small-caps label, drifting-free arrow, most on top and least at the bottom.
.pole {
  gap: 0.8rem;
  display: inline-flex;
  align-items: center;
  color: var(--soft-blue);
}

.pole-top {
  margin-bottom: 0.6rem;
}
.pole-bottom {
  margin-top: 0.6rem;
}

.reveal-source {
  margin-top: 0.8rem;
}

.pole-label {
  font-weight: bold;
  font-size: 1.2rem;
  line-height: 1;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--dark-blue);
}

.pole-arrow {
  width: 1rem;
  height: 2rem;
  flex-shrink: 0;
  display: block;
  overflow: visible;
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  gap: 0.4rem 1.4rem;
  display: grid;
  align-items: center;
  padding: 0.9rem 0;
  grid-template-areas: 'place flag identity verdict';
  grid-template-columns: 2.2rem 7.2rem minmax(0, 1fr) max-content;

  & + .row {
    border-top: 0.1rem solid $hairline;
  }
}

.place {
  opacity: 0.45;
  font-size: 1.6rem;
  font-weight: bold;
  text-align: right;
  grid-area: place;
  color: var(--dark-blue);
}

.row.exact .place {
  opacity: 1;
}

// Same framed 3:1 stage as the score tiles, at row scale.
.flag-stage {
  width: 7.2rem;
  overflow: hidden;
  grid-area: flag;
  aspect-ratio: 3 / 1;
  border: 0.1rem solid var(--text-color);
  background: hsla(36, 30%, 90%, 1);
}

.flag {
  width: 100%;
  height: 100%;
}

.identity {
  min-width: 0;
  grid-area: identity;

  .name {
    display: block;
    font-size: 1.5rem;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

// The stat and its magnitude: the bar teaches the gaps the numbers alone hide
// (a 20× spread reads instantly when the runner-up's bar is a sliver).
.measure {
  gap: 1rem;
  display: flex;
  align-items: center;

  .amount {
    opacity: 0.6;
    // A shared floor keeps every bar starting from the same origin — bars only
    // teach magnitude when their left edges line up.
    min-width: 8rem;
    font-size: 1.3rem;
    white-space: nowrap;
  }

  .tied {
    opacity: 0.6;
    flex-shrink: 0;
    font-size: 1.1rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--soft-blue);
  }

  .scale {
    flex: 1;
    height: 0.4rem;
    max-width: 16rem;
    border-radius: 999px;
    background: hsla(197.6, 51.2%, 41.8%, 0.15);
  }

  .fill {
    display: block;
    height: 100%;
    min-width: 0.4rem;
    border-radius: 999px;
    background: var(--soft-blue);
  }
}

.verdict {
  gap: 1.2rem;
  display: flex;
  grid-area: verdict;
  align-items: center;
  justify-content: flex-end;
}

.placement {
  font-size: 1.2rem;
  white-space: nowrap;

  &.missing {
    border-style: dashed;
  }

  .check {
    width: 1.1rem;
    height: 1.1rem;
    flex-shrink: 0;
  }
}

.row.exact .placement {
  color: #fff;
  border-color: transparent;
  background: var(--soft-blue);
}

// The pip ladder from the step track: one pip per possible point, filled for
// each point this slot paid.
.points-earned {
  gap: 0.8rem;
  display: flex;
  align-items: center;
}

.pips {
  gap: 0.4rem;
  display: flex;
  align-items: center;
}

.pip {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 50%;
  border: 1px solid var(--soft-blue);

  &.filled {
    background: var(--soft-blue);
  }
}

.points {
  width: 2.6rem;
  font-size: 1.5rem;
  text-align: right;
  color: var(--dark-blue);
}

.row.blank {
  .points {
    opacity: 0.45;
  }
  .flag-stage {
    opacity: 0.75;
  }
}

// Phone: the verdict cluster tucks under the identity, flag and place spanning
// both rows; the bar keeps its lane but loses its cap. The poles read
// label-then-arrow and get extra clearance from the list.
@media screen and (max-width: $tablet) {
  .pole {
    gap: 0.6rem;
  }
  .pole-top {
    margin-bottom: 1.4rem;
  }
  .pole-bottom {
    margin-top: 1.4rem;
  }
  .pole .pole-arrow {
    order: 2;
  }

  .row {
    grid-template-areas:
      'place flag identity'
      'place flag verdict';
    grid-template-columns: 1.8rem 5rem minmax(0, 1fr);
  }

  // The normal flag replaces the wide tile here, so the stage shrinks to the
  // ~3:2 a real flag wants and hands the freed width to the identity column.
  .flag-stage {
    width: 5rem;
    aspect-ratio: 3 / 2;
  }

  .verdict {
    justify-content: space-between;
  }

  .measure .scale {
    max-width: none;
  }
}
</style>
