<template>
  <span v-if="rows.length" class="chronicle-reveal">
    <ol class="record">
      <li
        v-for="(row, index) in rows"
        :key="row.slug"
        class="record-row"
        :style="{ '--row-index': index }"
        :class="{ missed: !row.placedRight }"
      >
        <img
          v-if="row.event.image"
          class="row-photo"
          :src="row.event.image"
          :alt="row.event.name"
        />
        <span v-else class="row-photo blank" aria-hidden="true" />
        <span class="row-year">{{ formatEventYear(row.event.year) }}</span>
        <span class="row-body">
          <span class="row-name">{{ row.event.name }}</span>
          <span class="row-story">{{ row.event.description }}</span>
        </span>
        <span class="row-verdict" aria-hidden="true">{{ row.placedRight ? '✓' : '✗' }}</span>
      </li>
    </ol>
    <span class="span-line">
      {{ formatNumber(spanYears) }} years of {{ countryName(challenge.country) }}, in order.
      <SourceInfo :attributions="sources" label="Sources" />
    </span>
  </span>
</template>
<script lang="ts" setup>
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { EVENTS } from '~~/data/events.gen'
import { datasetAttribution } from '~~/lib/attribution'
import { chronicleSolution, chronicleSpanYears } from '~~/lib/chronicle'
import { countryName } from '~~/lib/country'
import { formatNumber } from '~~/lib/number'
import { formatEventYear } from '~~/lib/timeline'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

const props = defineProps<{
  challenge: IndividualChallenge
  /** The order the player locked in, from the gate's shared ledger. */
  order: string[]
}>()

// The truth comes from the SAME module that graded the submit — the record
// shown and the verdict scored cannot disagree.
const rows = computed(() => {
  const dealt = props.challenge.chronicle?.events ?? []
  return chronicleSolution(dealt)
    .map((slug, index) => ({
      slug,
      event: EVENTS[slug],
      placedRight: props.order[index] === slug,
    }))
    .filter((row): row is typeof row & { event: NonNullable<typeof row.event> } => !!row.event)
})
const spanYears = computed(() => chronicleSpanYears(props.challenge.chronicle?.events ?? []))
const sources = datasetAttribution('events')
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.chronicle-reveal {
  gap: 1rem;
  display: flex;
  align-items: stretch;
  flex-flow: column nowrap;
  // Four storied rows outgrow a small phone: the record scrolls inside its
  // own card (the verdict head above stays put), never past the viewport.
  overflow-y: auto;
  overscroll-behavior: contain;
  max-height: calc(var(--viewport-height) - 18rem);
}

.record {
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  display: flex;
  list-style: none;
  flex-flow: column nowrap;
}

// Cards land into their true slots one after another — the correction IS the
// lesson, so the stagger gives each row a beat to read.
.record-row {
  gap: 1rem;
  display: flex;
  align-items: baseline;
  animation: row-land 0.5s backwards;
  animation-delay: calc(var(--row-index) * 0.35s);
}

.row-photo {
  flex: none;
  width: 5.2rem;
  height: 3.8rem;
  object-fit: cover;
  border-radius: 0.4rem;
  align-self: flex-start;

  &.blank {
    display: block;
    background: ink(0.08);
  }
}

.row-year {
  flex: none;
  min-width: 6.4rem;
  text-align: right;
  font-weight: 700;
  font-size: 1.4rem;
  font-variant-numeric: tabular-nums;
  color: var(--soft-blue);
}

.row-body {
  gap: 0.15rem;
  display: flex;
  flex-flow: column nowrap;
}

.row-name {
  font-size: 1.5rem;
  color: var(--dark-blue);
}

.row-story {
  font-size: 1.25rem;
  line-height: 1.4;
  color: ink(0.72);
}

.row-verdict {
  flex: none;
  margin-left: auto;
  font-weight: 700;
  font-size: 1.4rem;
  color: var(--soft-blue);
}

.missed .row-verdict {
  color: var(--hior-ange);
}

.span-line {
  font-size: 1.3rem;
  text-align: center;
  color: var(--soft-blue);
}
</style>
