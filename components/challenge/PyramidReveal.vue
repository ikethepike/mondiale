<template>
  <div v-if="facts" class="pyramid-reveal">
    <div v-if="withShapes" class="then-now">
      <PopulationPyramid
        :iso-code="challenge.country"
        :frame="0"
        :scars="scars"
        :caption="String(PYRAMID_YEARS[0])"
      />
      <PopulationPyramid
        :iso-code="challenge.country"
        :frame="PYRAMID_YEARS.length - 1"
        :scars="scars"
        :caption="String(PYRAMID_YEARS.at(-1))"
      />
    </div>

    <div class="told">
      <CountryChip
        v-if="withShapes"
        tag="span"
        compact
        class="who"
        :country="getCountry(challenge.country)"
      />
      <p v-if="family" class="lesson">
        <span class="eyebrow">{{ PYRAMID_FAMILY_LABELS[family] }}</span>
        {{ PYRAMID_FAMILY_LESSONS[family] }}
      </p>

      <ul v-if="scars.length" class="scars">
        <li v-for="scar in scars" :key="scar.bornFrom">{{ scar.note }}</li>
      </ul>

      <ul class="stats">
        <li v-for="row in rows" :key="row.label">
          <span class="stat-label">{{ row.label }}</span>
          <strong>{{ row.now }}</strong>
          <span class="was">from {{ row.then }} in {{ PYRAMID_YEARS[0] }}</span>
        </li>
      </ul>

      <p v-if="facts.twin" class="aside">
        Its closest match today is {{ countryName(facts.twin) }} — two countries, one shape.
      </p>
    </div>

    <section class="lineup">
      <span class="eyebrow">Every option in {{ PYRAMID_YEARS.at(-1) }}</span>
      <ol>
        <li
          v-for="option in lineup"
          :key="option.isoCode"
          class="option"
          :class="{ answer: option.isAnswer, picked: option.picked }"
        >
          <PopulationPyramid
            :iso-code="option.isoCode"
            :frame="PYRAMID_YEARS.length - 1"
            :peak="peak"
          />
          <span class="name">
            {{ countryName(option.isoCode) }}
            <span v-if="option.isAnswer" class="mark">✓</span>
            <span v-else-if="option.picked" class="mark miss">✗</span>
          </span>
          <span v-if="option.aged" class="aged">{{ pyramidAgedLabel(option.aged) }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>

<script lang="ts" setup>
/** What one Pyramid Scheme round teaches: the subject's numbers, its scars and
 *  family, and the other options' shapes beside it. */
import PopulationPyramid from '~/components/challenge/PopulationPyramid.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import { countryName, getCountry } from '~~/lib/country'
import {
  PYRAMID_FAMILY_LABELS,
  PYRAMID_FAMILY_LESSONS,
  PYRAMID_YEARS,
  pyramidAgedAt,
  pyramidAgedLabel,
  pyramidFactRows,
  pyramidFacts,
  pyramidFamily,
  pyramidPeakShare,
  pyramidScars,
} from '~~/lib/pyramids'
import type { PyramidSchemeChallenge } from '~~/types/challenges/group-modes.type'
import type { ISOCountryCode } from '~~/types/geography.types'

const props = defineProps({
  challenge: { type: Object as PropType<PyramidSchemeChallenge>, required: true },
  /** The player's picks in the order they were made. */
  submitted: { type: Array as PropType<ISOCountryCode[]>, default: () => [] },
  /** The subject's then-and-now pyramids — off where the round's own chart is
   *  already on screen. */
  withShapes: { type: Boolean, default: true },
})

const facts = computed(() => pyramidFacts(props.challenge.country))
const rows = computed(() => (facts.value ? pyramidFactRows(facts.value) : []))
const family = computed(() => pyramidFamily(props.challenge.country))
const scars = computed(() => pyramidScars(props.challenge.country))
const peak = computed(() => pyramidPeakShare(props.challenge.options))

const lineup = computed(() =>
  props.challenge.options.map(isoCode => ({
    isoCode,
    aged: pyramidAgedAt(isoCode),
    isAnswer: isoCode === props.challenge.country,
    picked: props.submitted.includes(isoCode),
  }))
)
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.pyramid-reveal {
  display: grid;
  gap: 1.4rem;
  grid-template-columns: auto 1fr;
  align-items: start;
}

.then-now {
  display: flex;
  gap: 0.8rem;

  :deep(.population-pyramid) {
    width: 10rem;
  }
}

.told {
  display: grid;
  gap: 0.7rem;
  min-width: 0;
}

.who {
  justify-self: start;
}

.lesson {
  margin: 0;
  line-height: 1.45;
  color: #{ink(0.85)};

  .eyebrow {
    display: block;
    margin-bottom: 0.2rem;
  }
}

.scars {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.6rem;
  line-height: 1.45;
  color: #{ink(0.85)};

  li {
    padding-left: 1.2rem;
    border-left: 0.3rem solid var(--hior-ange);
  }
}

.stats {
  margin: 0.4rem 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));

  li {
    display: grid;
    gap: 0.1rem;
    padding: 0.9rem 1.2rem;
    border-radius: 1.2rem;
    background: #{ink(0.04)};
  }

  strong {
    font-size: 2.6rem;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
}

.stat-label {
  font-size: 1.05rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #{ink(0.55)};
}

.was {
  font-size: 1.2rem;
  color: #{ink(0.6)};
  font-variant-numeric: tabular-nums;
}

.aside {
  margin: 0;
  line-height: 1.45;
  color: #{ink(0.65)};
}

.lineup {
  grid-column: 1 / -1;
  display: grid;
  gap: 0.6rem;

  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.option {
  display: grid;
  gap: 0.3rem;
  justify-items: center;
  text-align: center;
  padding: 0.6rem;
  border-radius: 1.2rem;
  border: 0.1rem solid transparent;

  :deep(.population-pyramid) {
    width: 100%;
    max-width: 8rem;
  }

  &.answer {
    border-color: hsla(170.5, 34.7%, 45%, 0.6);
    background: hsla(170.5, 34.7%, 55.1%, 0.12);
  }
  &.picked:not(.answer) {
    border-color: #{flame(0.4)};
  }
}

.name {
  font-weight: 700;
  font-size: 1.3rem;
}

.aged {
  font-size: 1.1rem;
  color: #{ink(0.6)};
  font-variant-numeric: tabular-nums;
}

.mark {
  color: hsl(150, 46%, 34%);
  &.miss {
    color: var(--hior-ange);
  }
}

@media screen and (max-width: $tablet) {
  .pyramid-reveal {
    grid-template-columns: 1fr;
  }
  .then-now {
    justify-content: center;
  }
  .lineup ol {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .stats {
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));

    li {
      padding: 0.7rem 0.9rem;
    }
    strong {
      font-size: 2rem;
    }
  }
  .stat-label {
    font-size: 0.9rem;
  }
  .was {
    font-size: 1.05rem;
  }
}
</style>
