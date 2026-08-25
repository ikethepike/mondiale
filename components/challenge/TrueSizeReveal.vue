<template>
  <section
    class="ranked-bars true-size-reveal"
    tabindex="0"
    aria-label="Mercator's area stretch by latitude"
  >
    <span class="header">
      <strong class="stat">{{ headline }}</strong>
      <span class="subtitle">{{ accuracy }}</span>
      <span class="figures">
        <span v-for="figure in figures" :key="figure.name" class="figure">
          <b>{{ figure.name }}</b>
          {{ figure.area }}
        </span>
      </span>
    </span>

    <!-- The mechanism, not a restatement of the answer: area is stretched by
         sec²(latitude), so the ladder runs away as it climbs. The two countries
         are placed on it at the latitude their MEASURED inflation corresponds
         to, which is why the subject can sit above its own centroid. -->
    <span class="rows">
      <span
        v-for="(row, index) in ladder"
        :key="row.key"
        class="row"
        :class="{ marked: !!row.isoCode }"
        :style="{ '--i': index }"
      >
        <CountryFlag
          v-if="row.isoCode"
          class="row-flag"
          :country="COUNTRIES[row.isoCode]"
          mode="background"
        />
        <span v-else class="row-flag" aria-hidden="true" />
        <span class="place">{{ row.latitude }}</span>
        <span class="country">{{ row.label }}</span>
        <span class="bar">
          <span class="fill" :style="{ width: `${row.width}%` }" />
        </span>
        <span class="value">×{{ row.stretch }}</span>
      </span>
    </span>

    <span class="yardstick" :style="{ '--i': ladder.length }">{{ yardstick }}</span>

    <span v-if="sources?.length" class="credit-row">
      <SourceInfo :attributions="sources" />
      <span class="credit">{{ sources[0].credit }}</span>
    </span>
  </section>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import type { Attribution } from '~~/lib/attribution'
import { mercatorLatitude, trueSizeScene } from '~~/lib/challenges/final-challenge'
import { rankedBarWidths } from '~~/lib/charts'
import { countryName } from '~~/lib/country'
import { formatLatitude, mercatorAreaStretch } from '~~/lib/geo'
import { formatAmount } from '~~/lib/number'
import type { TrueSizeChallenge } from '~~/types/challenges/final-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The True Size scorecard: how far the committed size landed from true, and
 * then the reason — the ladder of Mercator's area stretch by latitude, with
 * both countries standing on the rung the projection actually charged them.
 *
 * The stage has already settled the ghost and captioned both areas, so this
 * card deliberately teaches the MECHANISM rather than repeating the answer.
 */
const props = defineProps<{
  challenge: TrueSizeChallenge
  /** What the player locked in, as a multiple of the size the map drew. Absent
   *  for a watcher, and for a question the question cap burned unanswered. */
  committed?: number
  /** Handed down from the reveal registry, which is where this item's card and
   *  its provenance are declared together. */
  sources?: Attribution[]
}>()

/** The rungs the ladder is drawn at. Past 75° Mercator runs away far enough to
 *  flatten every other bar to nothing, which teaches less than it looks. */
const LATITUDE_RUNGS = [0, 30, 45, 60, 75]
/** Inside this the call is dead on rather than a percentage. */
const DEAD_ON = 0.03

const scene = computed(() => trueSizeScene(props.challenge.subject, props.challenge.anchor))

const subjectName = computed(() => countryName(COUNTRIES[props.challenge.subject]))
const anchorName = computed(() => countryName(COUNTRIES[props.challenge.anchor]))

/** The punchline the round exists for, stated once. */
const headline = computed(() =>
  scene.value
    ? `${subjectName.value} is drawn ${scene.value.exaggeration.toFixed(1)}× its true area`
    : ''
)

interface Rung {
  key: string
  latitude: string
  label: string
  stretch: string
  width: number
  isoCode?: ISOCountryCode
}

const ladder = computed((): Rung[] => {
  const rows: { latitude: number; isoCode?: ISOCountryCode }[] = LATITUDE_RUNGS.map(latitude => ({
    latitude,
  }))
  for (const isoCode of [props.challenge.subject, props.challenge.anchor]) {
    const latitude = mercatorLatitude(isoCode)
    if (latitude !== undefined) rows.push({ latitude, isoCode })
  }
  rows.sort((a, b) => Math.abs(a.latitude) - Math.abs(b.latitude))

  const stretches = rows.map(row => mercatorAreaStretch(row.latitude))
  const widths = rankedBarWidths(stretches)

  return rows.map((row, index) => ({
    key: row.isoCode ?? `rung-${row.latitude}`,
    latitude: formatLatitude(row.latitude),
    label: row.isoCode ? countryName(COUNTRIES[row.isoCode]) : '',
    stretch: stretches[index].toFixed(stretches[index] < 10 ? 1 : 0),
    width: widths[index],
    isoCode: row.isoCode,
  }))
})

/** The two areas the whole round is a comparison of. They live here rather
 *  than on the stage's chips, which have to fit a name like "Democratic
 *  Republic of the Congo" into the width of the pair they are labelling. */
const figures = computed(() =>
  [props.challenge.subject, props.challenge.anchor].map(isoCode => {
    const area = COUNTRIES[isoCode].geography.area.total
    return {
      name: countryName(COUNTRIES[isoCode]),
      area: area ? formatAmount(area) : '',
    }
  })
)

/** How far the locked-in size landed from true, on AREA — the thing the round
 *  judged, and the thing the eye is worst at. */
const accuracy = computed(() => {
  const honest = scene.value?.trueScale
  const tolerance = `the round allowed ±${Math.round(props.challenge.tolerance * 100)}%`
  // No committed size: a watcher's card, or a question the cap burned
  if (!honest || !props.committed) return `Scaled honestly, it lands here — ${tolerance}.`

  const ratio = (props.committed / honest) ** 2
  if (Math.abs(ratio - 1) <= DEAD_ON) {
    return `Dead on — your call was within ${Math.round(DEAD_ON * 100)}% of its true area.`
  }

  const off = ratio > 1 ? ratio : 1 / ratio
  const size = off >= 1.5 ? `${off.toFixed(1)}× ` : `${Math.round((off - 1) * 100)}% `
  return ratio > 1
    ? `You left it ${size}too big — ${tolerance}.`
    : `You took it ${size}too small — ${tolerance}.`
})

/** Why the anchor could be trusted as a yardstick in the first place. */
const yardstick = computed(() => {
  const anchor = scene.value?.anchor
  if (!anchor) return ''
  const latitude = mercatorLatitude(props.challenge.anchor) ?? 0
  const off = Math.round(Math.abs(mercatorAreaStretch(latitude) - 1) * 100)
  return `Down at ${formatLatitude(latitude)}, ${anchorName.value} is drawn within ${Math.max(off, 1)}% of its true area — which is what made it a fair thing to measure against.`
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// One hue, because every bar is the same measure at a different latitude — a
// second colour here would claim these rows are different KINDS of thing.
.true-size-reveal {
  .header {
    gap: 0.3rem;
    display: flex;
    flex-flow: column nowrap;
  }

  .stat {
    font-size: 1.6rem;
  }

  .subtitle {
    opacity: 0.75;
    font-size: 1.3rem;
  }

  .figures {
    gap: 0.4rem 1.6rem;
    display: flex;
    flex-wrap: wrap;
    font-size: 1.3rem;
    padding-top: 0.2rem;
    font-variant-numeric: tabular-nums;
  }

  .figure b {
    opacity: 0.7;
    font-weight: 400;
    margin-right: 0.4rem;
  }

  .place {
    width: 4.2rem;
    opacity: 0.6;
    flex: none;
    font-size: 1.2rem;
    font-variant-numeric: tabular-nums;
  }

  .country {
    flex: none;
    max-width: 12rem;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  // The reference rungs keep a flag-sized gutter so every row's bar starts on
  // the same line — a ladder whose rungs are ragged is hard to read along.
  .row-flag {
    flex: none;
    width: 2rem;
    height: 1.4rem;
    border-radius: 0.2rem;
  }

  .row {
    opacity: 0.55;
  }

  // The two countries are the point of the ladder: they carry the ink, the
  // reference rungs recede behind them.
  .row.marked {
    opacity: 1;
    font-weight: 600;
  }

  .fill {
    background: flame(0.45);
  }

  .row.marked .fill {
    background: flame(0.85);
  }

  .value {
    width: 4.4rem;
    flex: none;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .yardstick {
    opacity: 0;
    font-size: 1.3rem;
    line-height: 1.45;
    padding-top: 0.7rem;
    border-top: 0.1rem solid $hairline;
    animation: row-land 0.4s var(--ease-smooth) forwards;
    animation-delay: calc(var(--i) * 110ms);
  }

  .credit-row {
    gap: 0.6rem;
    display: flex;
    opacity: 0.6;
    font-size: 1.1rem;
    align-items: center;
  }

  @media screen and (max-width: $tablet) {
    .place {
      width: 3.4rem;
    }

    // The bar gives way before the name does — a rung labelled "Democratic …"
    // has lost the half that identifies it
    .country {
      max-width: 13rem;
    }

    .bar {
      min-width: 3rem;
    }

    .value {
      width: 3.6rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .yardstick {
      animation: none;
      opacity: 1;
    }
  }
}
</style>
