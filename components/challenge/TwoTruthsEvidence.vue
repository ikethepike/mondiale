<template>
  <div class="two-truths-evidence">
    <span class="evidence-label">{{ evidence.label }}</span>
    <ul v-if="evidence.kind === 'countries'" class="country-chip-list evidence-chips">
      <CountryChip
        v-for="isoCode in shownCountries"
        :key="isoCode"
        :country="getCountry(isoCode)"
        compact
        :class="{ named: highlight.includes(isoCode) }"
      />
      <li v-if="hiddenCount" class="more">+{{ hiddenCount }}</li>
    </ul>
    <div v-else class="ranked-bars evidence-bars">
      <span class="rows">
        <span
          v-for="(row, index) in bars"
          :key="row.name"
          class="row"
          :class="{ named: !!row.isoCode && highlight.includes(row.isoCode) }"
          :style="{ '--i': index }"
        >
          <CountryFlag
            v-if="row.isoCode"
            class="row-flag"
            :country="getCountry(row.isoCode)"
            mode="background"
          />
          <span class="rank">{{ row.rank }}</span>
          <span class="name">{{ row.name }}</span>
          <span class="bar"><span class="fill" :style="{ width: `${row.width}%` }" /></span>
          <span class="value">{{ row.display }}</span>
        </span>
      </span>
    </div>
  </div>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import { getCountry } from '~~/lib/country'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { ClaimEvidence } from '~~/types/two-truths.types'

/** A Two Truths receipt's proof: the countries a fact covers, or the figures behind it. */
const props = defineProps<{
  evidence: ClaimEvidence
  highlight: ISOCountryCode[]
}>()

const CHIP_LIMIT = 8

const shownCountries = computed(() => {
  if (props.evidence.kind !== 'countries') return []
  const named = props.evidence.countries.filter(isoCode => props.highlight.includes(isoCode))
  const rest = props.evidence.countries.filter(isoCode => !props.highlight.includes(isoCode))
  return [...named, ...rest].slice(0, CHIP_LIMIT)
})
const hiddenCount = computed(() =>
  props.evidence.kind === 'countries'
    ? props.evidence.countries.length - shownCountries.value.length
    : 0
)

const BAR_WINDOW = 5

/** At most BAR_WINDOW rows, centred on the country the claim names — a lie
 *  about twelfth place needs the cut-off beside it, not the podium. */
const bars = computed(() => {
  if (props.evidence.kind !== 'bars') return []
  const rows = props.evidence.rows
  const top = Math.max(...rows.map(row => row.value)) || 1
  const named = rows.findIndex(row => !!row.isoCode && props.highlight.includes(row.isoCode))
  const start = Math.max(
    0,
    Math.min(rows.length - BAR_WINDOW, (named < 0 ? 0 : named) - Math.floor(BAR_WINDOW / 2))
  )
  return rows
    .slice(start, start + BAR_WINDOW)
    .map(row => ({ ...row, rank: rows.indexOf(row) + 1, width: (row.value / top) * 100 }))
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.two-truths-evidence {
  gap: 0.5rem;
  display: flex;
  flex-flow: column nowrap;
}

.evidence-label {
  font-size: 1.1rem;
  font-weight: bold;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.65;
}

.evidence-chips {
  gap: 0.4rem;
  max-height: none;
  justify-content: flex-start;

  .country-chip {
    font-size: 1.2rem;
    border-radius: 99rem;
    background: milk(0.8);
    border: 0.1rem solid ink(0.12);

    &.named {
      font-weight: bold;
      border-color: var(--dark-blue);
    }
  }

  .more {
    font-size: 1.2rem;
    opacity: 0.7;
  }
}

.evidence-bars {
  padding: 0;
  min-width: 0;
  max-height: none;
  overflow: visible;

  .row {
    font-size: 1.2rem;

    &.named {
      font-weight: bold;
    }
  }

  .rank {
    width: 1.8rem;
    flex-shrink: 0;
    opacity: 0.6;
    text-align: right;
  }

  .row-flag {
    width: 2rem;
    height: 1.35rem;
    flex-shrink: 0;
    border-radius: 0.2rem;
  }

  .name {
    width: 9rem;
    flex-shrink: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .fill {
    background: ink(0.45);
  }

  .named .fill {
    background: var(--dark-blue);
  }

  .value {
    min-width: 7rem;
    text-align: right;
    white-space: nowrap;
  }
}
</style>
