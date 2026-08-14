<template>
  <div class="pyramid-reveal">
    <ol class="rows">
      <li v-for="row in rows" :key="row.isoCode" class="row" :class="{ missed: !row.matched }">
        <!-- The shape the sentence is about, then and now. A claim about a
             country's century should be visible, not just asserted. -->
        <div class="then-now">
          <PopulationPyramid
            :iso-code="row.isoCode"
            :frame="0"
            :caption="String(PYRAMID_YEARS[0])"
          />
          <PopulationPyramid
            :iso-code="row.isoCode"
            :frame="PYRAMID_YEARS.length - 1"
            :scar="row.scar"
            :caption="String(PYRAMID_YEARS.at(-1))"
          />
        </div>

        <div class="told">
          <p class="who">
            <CountryChip tag="span" compact :country="getCountry(row.isoCode)" />
            <span class="verdict" :class="{ hit: row.matched }">
              {{ row.matched ? '✓ matched' : `✗ was ${row.letter}` }}
            </span>
          </p>
          <p class="note">{{ row.note }}</p>
          <span class="family">{{ row.family }}</span>
        </div>
      </li>
    </ol>

    <p class="coda">
      Every dent is a piece of history. A war, a policy, an epidemic or a boom leaves the same mark
      — one thin cohort, carried upward year after year for the rest of the century.
    </p>
  </div>
</template>

<script lang="ts" setup>
import PopulationPyramid from '~/components/challenge/PopulationPyramid.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import { getCountry } from '~~/lib/country'
import {
  latestPyramid,
  PYRAMID_FAMILY_LABELS,
  PYRAMID_YEARS,
  pyramidFamily,
  pyramidFrameAt,
  pyramidScar,
  shareOver65,
  shareUnder15,
} from '~~/lib/pyramids'
import type { PyramidSchemeChallenge } from '~~/types/challenges/group-modes.type'
import type { ISOCountryCode } from '~~/types/geography.types'

const SLOT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

const props = defineProps({
  challenge: { type: Object as PropType<PyramidSchemeChallenge>, required: true },
  /** What this player put in each slot — index i is their pick for pyramid i. */
  submitted: { type: Array as PropType<ISOCountryCode[]>, default: () => [] },
})

/**
 * The lesson when a country carries no hand-written scar. It switches on the
 * SAME family the chip prints — a generic "middle of its transition" under an
 * EXPANSIVE TRIANGLE label makes the card argue with itself.
 */
const lessonFor = (isoCode: ISOCountryCode): string => {
  const now = latestPyramid(isoCode)
  const then = pyramidFrameAt(isoCode, 0)
  if (!now || !then) return ''
  const young = Math.round(shareUnder15(now))
  const old = Math.round(shareOver65(now))
  const wasYoung = Math.round(shareUnder15(then))

  switch (pyramidFamily(isoCode)) {
    case 'expansive':
      return `Still widest at the base: ${young}% of the country is under fifteen, against ${wasYoung}% in ${PYRAMID_YEARS[0]}. Every cohort outnumbers the one above it.`
    case 'narrowing':
      return `Under-fifteens have fallen from ${wasYoung}% to ${young}% — a base still broad, but no longer growing.`
    case 'coffin':
      return `More pensioners than children: ${old}% is over sixty-five against ${young}% under fifteen. The base has pulled in beneath a heavy middle.`
    case 'migrant-slab':
      return `Imported working-age men fill the middle; both the base and the top stay thin.`
    default:
      return `Near balance from bottom to middle — under-fifteens ${young}%, over-sixty-fives ${old}%.`
  }
}

const rows = computed(() =>
  props.challenge.countries.map((isoCode, slot) => {
    const scar = pyramidScar(isoCode)
    const family = pyramidFamily(isoCode)
    return {
      isoCode,
      letter: SLOT_LETTERS[slot] ?? String(slot + 1),
      matched: props.submitted[slot] === isoCode,
      scar,
      note: scar?.note ?? lessonFor(isoCode),
      family: family ? PYRAMID_FAMILY_LABELS[family] : '',
    }
  })
)
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1.1rem;
}

.row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1.6rem;
  align-items: center;
  padding: 1.2rem 1.4rem;
  border-radius: 1.6rem;
  background: #{milk(0.9)};
  border: 0.1rem solid #{ink(0.12)};

  &.missed {
    border-color: #{flame(0.4)};
  }
}

.then-now {
  display: flex;
  gap: 0.7rem;

  :deep(.population-pyramid) {
    width: 8.8rem;
  }
}

.who {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin: 0 0 0.2rem;
  font-weight: 700;
  flex-wrap: wrap;
}

.verdict {
  font-weight: 400;
  font-size: 1.3rem;
  color: var(--hior-ange);

  &.hit {
    color: hsl(150, 46%, 34%);
  }
}

.note {
  margin: 0;
  line-height: 1.45;
  color: #{ink(0.8)};
}

.family {
  display: inline-block;
  margin-top: 0.5rem;
  font-size: 1.05rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #{ink(0.55)};
  border: 0.1rem solid #{ink(0.12)};
  border-radius: 999px;
  padding: 0.2rem 0.9rem;
  background: #{ink(0.06)};
}

.coda {
  margin: 1.6rem 0 0;
  color: #{ink(0.55)};
  line-height: 1.5;
}

@media screen and (max-width: $tablet) {
  .row {
    grid-template-columns: 1fr;
  }
  .then-now {
    justify-content: center;
  }
}
</style>
