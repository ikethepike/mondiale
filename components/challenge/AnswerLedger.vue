<template>
  <!-- Variant "ledger": the two lists merged into one, the way ranking rounds
       already reveal (RankingReveal). Nothing to cross-reference — every row
       of the truth carries its own verdict, and the names that weren't in it
       sit below the rule. -->
  <section class="pane-content ranking">
    <span class="eyebrow">
      {{ truthLabel }}
      <span class="count">{{ breakdown.tally.found }} of {{ breakdown.tally.total }}</span>
    </span>

    <ol
      ref="list"
      class="rows"
      :class="{ 'fade-top': scrollableUp, 'fade-bottom': scrollableDown }"
      @scroll.passive="syncScrollEdges"
    >
      <li
        v-for="row in rows"
        :key="row.isoCode"
        class="row"
        :class="row.verdict"
        :style="{ '--row-index': row.index }"
      >
        <div class="flag-stage">
          <CountryFlag v-if="isPhone" class="flag" :country="row.country" />
          <CountryTileFlag v-else class="flag" :country="row.country" />
        </div>
        <strong class="name">{{ row.name }}</strong>
        <span class="verdict chip">
          <svg v-if="row.verdict === 'found'" class="check" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2.5 8.5l4 4 7-9"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span>{{ row.verdict === 'found' ? 'Found' : 'Missed' }}</span>
        </span>
      </li>
    </ol>

    <template v-if="strays.length">
      <span class="eyebrow tail-head">
        {{ strayLabel }}
        <span v-if="cost" class="count">−{{ cost }}</span>
      </span>
      <ul class="country-chip-list rail strays">
        <CountryChip
          v-for="stray in strays"
          :key="stray.isoCode"
          compact
          class="stray"
          :country="stray.country"
        />
      </ul>
    </template>
  </section>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import CountryTileFlag from '~/components/country/CountryTileFlag.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useScrollEdges } from '~~/lib/use-scroll-edges'
import { useIsPhone } from '~~/lib/use-viewport'
import type { AnswerBreakdown } from '~~/lib/challenges'

const props = defineProps({
  breakdown: {
    type: Object as PropType<AnswerBreakdown>,
    required: true,
  },
  truthLabel: {
    type: String,
    required: true,
  },
  strayLabel: {
    type: String,
    required: true,
  },
  // Only set where the scorer really charges per wrong name (the blitz family).
  cost: {
    type: Number,
    default: undefined,
  },
})

const isPhone = useIsPhone()

// A long set (Russia's fourteen) scrolls inside the card, so the edges have to
// say so — a list cut clean at the fold reads as a list that ended there.
const list = ref<HTMLElement>()
const { scrollableUp, scrollableDown, syncScrollEdges } = useScrollEdges(() => list.value)

const rows = computed(() =>
  props.breakdown.truth.flatMap((row, index) => {
    const country = getCountry(row.isoCode)
    return country ? [{ ...row, index, country, name: countryName(country) }] : []
  })
)

const strays = computed(() =>
  props.breakdown.yours.flatMap(row => {
    const country = getCountry(row.isoCode)
    return row.verdict === 'stray' && country ? [{ isoCode: row.isoCode, country }] : []
  })
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/scroll-fade' as *;

.eyebrow {
  gap: 0.8rem;
  display: flex;
  align-items: baseline;
}

.count {
  opacity: 0.7;
  letter-spacing: 0;
  text-transform: none;
  color: var(--dark-blue);
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
  // Long sets (Russia's fourteen) stay a card, not a page. Sized to whole
  // rows: nine full rows (3.8rem + 8 × 3.9rem = 35rem) plus a 1.7rem peek of
  // the tenth, so the fade covers only the last full row's padding and the
  // faded sliver reads as "more below" — never a complete row cut through
  // its flag.
  max-height: 36.8rem;
  overflow-y: auto;
  scrollbar-width: thin;
  // The section gives its right padding up to `.ranking`, so the verdict chips
  // would otherwise sit against the pane edge and under the scrollbar.
  padding-right: 2rem;

  // Edge fades from the shared recipe (rules/_scroll-fade.scss) — each shows
  // only when content really continues past that edge, so a short set never
  // wears a dimmed first or last row.
  @include scroll-fade;
}

.row {
  gap: 1.4rem;
  display: grid;
  align-items: center;
  padding: 0.7rem 0;
  grid-template-columns: 7.2rem minmax(0, 1fr) max-content;
  animation: row-land 0.4s both;
  animation-delay: calc(var(--row-index) * 0.04s);

  & + .row {
    border-top: 0.1rem solid $hairline;
  }
}

// The same framed 3:1 stage the score tiles and the ranking ledger use.
.flag-stage {
  width: 7.2rem;
  overflow: hidden;
  aspect-ratio: 3 / 1;
  border: 0.1rem solid var(--text-color);
  background: hsla(36, 30%, 90%, 1);
}

.flag {
  width: 100%;
  height: 100%;
}

.name {
  min-width: 0;
  overflow: hidden;
  font-size: 1.5rem;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.verdict {
  font-size: 1.2rem;
  white-space: nowrap;

  .check {
    width: 1.1rem;
    height: 1.1rem;
    flex-shrink: 0;
  }
}

.row.found .verdict {
  color: #fff;
  border-color: transparent;
  background: var(--soft-blue);
}

.row.missed {
  .flag-stage {
    opacity: 0.45;
    border-style: dashed;
  }
  .name {
    opacity: 0.6;
  }
  .verdict {
    border-style: dashed;
  }
}

// The severed tail: what you named that wasn't on the list.
.tail-head {
  margin-top: 1.8rem;
  padding-top: 1.6rem;
  border-top: 0.1rem solid ink(0.25);

  .count {
    color: flame(0.9);
  }
}

.strays {
  justify-content: flex-start;

  // `.country-chip.stray` only sets a border COLOUR — over the map the chip
  // takes its border from `.map-caption`. In a pane there is no such host, so
  // the flame edge needs a width here or the miss reads as a plain label.
  :deep(.country-chip) {
    border: 0.1rem solid ink(0.15);
    border-radius: 999px;
  }
}

@media screen and (max-width: $tablet) {
  .row {
    gap: 1rem;
    grid-template-columns: 5rem minmax(0, 1fr) max-content;
  }

  // The normal flag replaces the wide tile here, so the stage takes the ~3:2 a
  // real flag wants and hands the freed width to the name.
  .flag-stage {
    width: 5rem;
    aspect-ratio: 3 / 2;
  }
}
</style>
