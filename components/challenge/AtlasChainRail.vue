<template>
  <TransitionGroup
    ref="rail"
    tag="ol"
    name="chain"
    class="atlas-rail country-chip-list"
    :class="{ compact, 'fade-top': scrollableUp, 'fade-bottom': scrollableDown }"
    @scroll.passive="syncScrollEdges"
  >
    <!-- A marathon chain shows only its live tail here — the head is what the
         next move plays off; the reveal card tells the whole story. -->
    <li v-if="hiddenCount" key="earlier" class="rail-cell">
      <span class="earlier map-caption">+ {{ hiddenCount }} earlier</span>
    </li>
    <!-- One cell per link: a new name lands TOGETHER with the letter that
         ties it to the chain. -->
    <li v-for="(isoCode, index) in shownChain" :key="isoCode" class="rail-cell">
      <span
        v-if="hiddenCount + index > 0"
        class="letter-tie"
        :class="ties[hiddenCount + index]?.kind"
        aria-hidden="true"
      >
        {{ ties[hiddenCount + index]?.fragment.toUpperCase() }}
        <sup v-if="paysOverlaps && (ties[hiddenCount + index]?.overlap ?? 0) > 1" class="bonus">
          +{{ ties[hiddenCount + index]?.overlap }}
        </sup>
      </span>
      <CountryChip
        tag="span"
        class="linked map-caption"
        :class="{ head: !finished && hiddenCount + index === chain.length - 1 }"
        :style="{ '--stop-color': walkColor(hiddenCount + index, chain.length) }"
        :country="getCountry(isoCode)"
        :compact="compact"
      />
    </li>
    <li v-if="nextOpeners?.length && !finished" key="ghost" class="rail-cell">
      <span class="ghost-chip map-caption">
        <span v-if="ghostLead && nextOpeners.length === 1" class="lead">{{ ghostLead }}</span>
        <template v-for="(letter, letterIndex) in nextOpeners" :key="letter">
          <span v-if="letterIndex" class="or">/</span>
          <span class="letter">{{ letter.toUpperCase() }}</span>
        </template>
        <span class="rest">…</span>
        <span v-if="optionsLeft !== undefined" class="left" :class="{ scarce: scarce }">
          {{ optionsLeft }} left
        </span>
      </span>
    </li>
  </TransitionGroup>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import { ATLAS_SCARCE_OPTIONS, atlasKey, atlasLinkTie } from '~~/lib/atlas-chain'
import { walkColor } from '~~/lib/chain'
import { getCountry } from '~~/lib/country'
import { useScrollEdges } from '~~/lib/use-scroll-edges'
import type { ISOCountryCode } from '~~/types/geography.types'

/** The atlas chain as chips, seed first, joined by their ties — the gate, the
 *  table round and both reveals draw it. */
const props = defineProps<{
  chain: ISOCountryCode[]
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
  /** Show only the last N links (plus a "+N earlier" pill) — the live rail's
   *  guard against marathon chains eating the stage. Unset shows everything. */
  tail?: number
}>()

// The chip list's cap bites on a phone, where a long chain wraps to more rows
// than 22dvh holds (templates/_country-chip.scss). TransitionGroup's ref is the
// component; its $el is the <ol>.
const rail = ref<{ $el?: HTMLElement } | null>(null)
const { scrollableUp, scrollableDown, syncScrollEdges } = useScrollEdges(() => rail.value?.$el)

const hiddenCount = computed(() =>
  props.tail && props.chain.length > props.tail ? props.chain.length - props.tail : 0
)
const shownChain = computed(() => props.chain.slice(hiddenCount.value))

const ties = computed(() =>
  props.chain.map((isoCode, index) =>
    index ? atlasLinkTie(props.chain[index - 1], isoCode) : undefined
  )
)

const scarce = computed(
  () => props.optionsLeft !== undefined && props.optionsLeft <= ATLAS_SCARCE_OPTIONS
)

/** The two letters before the head's tail, faded into the ghost chip. */
const ghostLead = computed(() => {
  const head = props.chain.at(-1)
  return head ? atlasKey(head).slice(-3, -1) : ''
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.atlas-rail {
  row-gap: 0.8rem;
}

.rail-cell {
  gap: 0.6rem;
  display: flex;
  align-items: center;
}

// The reveal-card cut: chips step down (CountryChip's own compact), the ties
// follow, and the rail lines up left like the card's other rows.
.compact {
  row-gap: 0.5rem;
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
// walk's own accents live here (ViewBorderChain's posture).
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

// The live question: a chip-shaped hole waiting for the next name.
.ghost-chip {
  display: flex;
  align-items: baseline;
  gap: 0.1rem;
  padding: 0.4rem 1.1rem;
  font-size: 1.7rem;
  color: ink(0.55);
  border-radius: 1rem;
  border: 0.15rem dashed ink(0.35);
  background: milk(0.6);

  .lead {
    opacity: 0.4;
    font-size: 0.8em;
  }
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
