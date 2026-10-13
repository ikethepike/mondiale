<template>
  <TransitionGroup
    ref="trail"
    tag="ol"
    name="chain"
    class="atlas-rail country-chip-list"
    :class="{ compact, rail: live }"
    :aria-label="label"
  >
    <!-- A marathon chain shows only its live tail here — the head is what the
         next move plays off; the reveal card tells the whole story. -->
    <!-- After a break: the earlier chains' names are still banned, and the
         rail says so where the live chain begins. -->
    <li v-if="spent" key="spent" class="rail-cell">
      <span
        class="spent map-caption"
        :title="`${spent} countries from earlier chains can't be named again`"
      >
        <span class="spent-swatch" aria-hidden="true" />
        {{ spent }} walked
      </span>
    </li>
    <li v-if="hiddenCount" key="earlier" class="rail-cell">
      <span class="earlier map-caption">+ {{ hiddenCount }} earlier</span>
    </li>
    <!-- One cell per link: a new name lands TOGETHER with the letter that
         ties it to the chain. -->
    <li
      v-for="(isoCode, index) in shownChain"
      :key="isoCode"
      class="rail-cell"
      :class="{ 'at-head': isHead(index) }"
    >
      <span v-if="ties[index]" class="letter-tie" :class="ties[index]!.kind">
        <span aria-hidden="true">{{ ties[index]!.fragment.toUpperCase() }}</span>
        <sup v-if="paysOverlaps && ties[index]!.overlap > 1" class="bonus" aria-hidden="true">
          +{{ ties[index]!.overlap }}
        </sup>
        <span class="visually-hidden">{{ tieWords(ties[index]!) }}</span>
      </span>
      <CountryChip
        tag="span"
        class="linked map-caption"
        :class="{ head: isHead(index) }"
        :style="{ '--stop-color': walkColor(hiddenCount + index, chain.length, isHead(index)) }"
        :country="getCountry(isoCode)"
        :name="spellings?.[isoCode]"
        :compact="compact"
      />
    </li>
    <li v-if="nextOpeners?.length && !finished" key="ghost" class="rail-cell">
      <span class="ghost-chip map-caption">
        <template v-for="(letter, letterIndex) in nextOpeners" :key="letter">
          <span v-if="letterIndex" class="or" aria-hidden="true">/</span>
          <span class="letter">{{ letter.toUpperCase() }}</span>
        </template>
        <span class="rest" aria-hidden="true">…</span>
        <span class="ending">or an ending</span>
        <span v-if="optionsLeft !== undefined" class="left" :class="{ scarce: scarce }">
          {{ optionsLeft }} left
        </span>
      </span>
    </li>
  </TransitionGroup>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import {
  ATLAS_SCARCE_OPTIONS,
  atlasLinkTie,
  type AtlasSpellings,
  type AtlasTie,
} from '~~/lib/atlas-chain'
import { SPENT_CHAIN_FILL, walkColor } from '~~/lib/chain'
import { getCountry } from '~~/lib/country'
import { useChipTrail } from '~~/lib/use-chip-trail'
import type { ISOCountryCode } from '~~/types/geography.types'

/** The atlas chain as chips, seed first, joined by their ties — the gate, the
 *  table round, the tutorial and both reveals draw it. */
const props = defineProps<{
  chain: ISOCountryCode[]
  /** Names played under another spelling. */
  spellings?: AtlasSpellings
  /** Hard gate credit: a shared ending's tie carries its paid length. */
  paysOverlaps?: boolean
  /** The single letters the next name may open with; renders the ghost chip
   *  while playing. */
  nextOpeners?: string[]
  /** How many legal names are still unwalked — the ghost chip counts down,
   *  and warns when the letter is nearly spent. Unset hides the count. */
  optionsLeft?: number
  /** A settled rail (reveals): no live head, no ghost chip. */
  finished?: boolean
  /** Card-sized: compact chips and quieter ties, for reveal ledgers. */
  compact?: boolean
  /** The live trail: one row that follows the head when the footer is
   *  squeezed (a phone, the keyboard up). */
  live?: boolean
  /** Countries walked in earlier chains this round — still banned. */
  spent?: number
  /** Show only the last N links (plus a "+N earlier" pill) — the live rail's
   *  guard against marathon chains eating the stage. Unset shows everything. */
  tail?: number
}>()

const { trail } = useChipTrail(() => (props.live ? props.chain.length : 0), {
  restOn: '.rail-cell.at-head',
})

const hiddenCount = computed(() =>
  props.tail && props.chain.length > props.tail ? props.chain.length - props.tail : 0
)
const shownChain = computed(() => props.chain.slice(hiddenCount.value))

const ties = computed(() =>
  shownChain.value.map((isoCode, index) => {
    const prev = props.chain[hiddenCount.value + index - 1]
    return prev ? atlasLinkTie(prev, isoCode, props.spellings) : undefined
  })
)

const isHead = (index: number) =>
  !props.finished && hiddenCount.value + index === props.chain.length - 1

const tieWords = (tie: AtlasTie) =>
  tie.kind === 'overlap'
    ? `shares the ending ${tie.fragment.toUpperCase()} with`
    : `links on ${tie.fragment.toUpperCase()} to`

const label = computed(() => (props.finished ? 'The chain' : 'The chain so far, newest last'))

const scarce = computed(
  () => props.optionsLeft !== undefined && props.optionsLeft <= ATLAS_SCARCE_OPTIONS
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.atlas-rail {
  --spent-fill: v-bind(SPENT_CHAIN_FILL);
  row-gap: 0.8rem;
}

.rail-cell {
  gap: 0.6rem;
  display: flex;
  align-items: center;
}

// The trail's cut on a squeezed footer: a cell is the unit that snaps and
// never shrinks, so a tie always travels with its name.
.rail .rail-cell {
  flex-shrink: 0;
  white-space: nowrap;
  scroll-snap-align: start;
}

// The reveal-card cut: chips step down (CountryChip's own compact), the ties
// follow, and the rail lines up left like the card's other rows. The card is
// the scroller — a rail never scrolls inside it.
.compact {
  row-gap: 0.5rem;
  max-height: none;
  overflow: visible;
  mask-image: none;
  justify-content: flex-start;

  .rail-cell {
    gap: 0.4rem;
  }

  .letter-tie {
    height: 1.9rem;
    min-width: 1.9rem;
    font-size: 1.05rem;

    &.overlap {
      font-size: 1.2rem;
    }
  }
}

// Chip and list recipes come from templates/_country-chip.scss; only the
// walk's own accents live here.
.linked {
  border-color: var(--stop-color);

  &.head {
    font-weight: bold;
    border-width: 0.15rem;
  }
}

// The junction badge: the letter both names share, circled between them.
.letter-tie {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 2.4rem;
  height: 2.4rem;
  padding: 0 0.5rem;
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--soft-blue);
  border-radius: 1.2rem;
  backdrop-filter: blur(0.5rem);
  background: milk(0.85);
  border: 0.1rem solid ink(0.25);

  &.overlap {
    color: #{ember()};
    border-color: #{ember(0.6)};
    font-size: 1.5rem;
  }

  &.consonant {
    border-style: dashed;
  }
}

.bonus {
  font-size: 0.7em;
  margin-left: 0.3rem;
}

// The folded prologue of a marathon chain — a count, not a control; the
// reveal card carries the full ledger.
.earlier {
  opacity: 0.65;
  font-size: 1.2rem;
  padding: 0.3rem 0.9rem;
  border-radius: 1.2rem;
  border: 0.1rem dashed ink(0.35);
  background: milk(0.6);
  white-space: nowrap;
}

// The earlier chains, folded to a count in the spent fill the map paints them.
.spent {
  gap: 0.5rem;
  display: flex;
  align-items: center;
  font-size: 1.2rem;
  padding: 0.3rem 0.9rem;
  white-space: nowrap;
  border-radius: 1.2rem;
  background: milk(0.85);
  border: 0.1rem solid ink(0.25);
}

.spent-swatch {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 0.2rem;
  background: var(--spent-fill);
}

// The live question: a chip-shaped hole waiting for the next name.
.ghost-chip {
  display: flex;
  align-items: baseline;
  gap: 0.1rem;
  padding: 0.4rem 1.1rem;
  font-size: 1.7rem;
  color: ink(0.55);
  white-space: nowrap;
  border-radius: 1rem;
  border: 0.15rem dashed ink(0.35);
  background: milk(0.6);

  .letter {
    font-weight: 700;
  }
  .or {
    opacity: 0.45;
    margin: 0 0.2rem;
  }
  .rest {
    opacity: 0.55;
  }
  .ending {
    opacity: 0.6;
    font-size: 0.6em;
    margin-left: 0.5rem;
    align-self: center;
  }
  .left {
    margin-left: 0.8rem;
    padding-left: 0.8rem;
    font-size: 0.65em;
    align-self: center;
    white-space: nowrap;
    word-spacing: 0.2em;
    opacity: 0.75;
    border-left: 0.1rem solid ink(0.2);
  }
  .scarce {
    opacity: 1;
    font-weight: 700;
    color: var(--hior-ange);
  }
}
</style>
