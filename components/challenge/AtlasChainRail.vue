<template>
  <TransitionGroup tag="ol" name="chain" class="atlas-rail country-chip-list">
    <!-- One cell per link: a new name lands TOGETHER with the letter that
         ties it to the chain. -->
    <li v-for="(isoCode, index) in chain" :key="isoCode" class="rail-cell">
      <span
        v-if="index > 0"
        class="letter-tie"
        :class="{ deep: tieOverlap(index) > 1 }"
        aria-hidden="true"
      >
        {{ tieFragment(index) }}
        <sup v-if="tieOverlap(index) > 1" class="bonus">+{{ tieOverlap(index) }}</sup>
      </span>
      <CountryChip
        tag="span"
        class="linked map-caption"
        :class="{ head: !finished && index === chain.length - 1 }"
        :style="{ '--stop-color': walkColor(index, chain.length) }"
        :country="getCountry(isoCode)"
      />
    </li>
    <li v-if="nextLetter && !finished" key="ghost" class="rail-cell">
      <span class="ghost-chip map-caption">
        <span v-if="overlaps && ghostLead" class="lead">{{ ghostLead }}</span>
        <span class="letter">{{ nextLetter.toUpperCase() }}</span>
        <span class="rest">…</span>
      </span>
    </li>
  </TransitionGroup>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import { atlasKey, atlasLinkOverlap } from '~~/lib/atlas-chain'
import { walkColor } from '~~/lib/chain'
import { getCountry } from '~~/lib/country'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The atlas chain as chips — seed first, joined by their shared letters. One
 * rail for the gate, the group round and both reveals, so a junction never
 * computes its fragment two ways: everything reads lib/atlas-chain.
 *
 * The tie badge carries the whole overlap ("PAL") when the hard rule paid for
 * more than one letter — landing a long overlap should read like a trick shot.
 * The trailing ghost chip is the live question: the next required letter, and
 * under the overlap rule the head's tail fades in behind it to signal that any
 * ending chains.
 */
const props = defineProps<{
  chain: ISOCountryCode[]
  /** Hard's rule — ties show their full shared fragment and pay their length. */
  overlaps?: boolean
  /** The required opening letter; renders the ghost chip while playing. */
  nextLetter?: string
  /** A settled rail (reveals): no live head, no ghost chip. */
  finished?: boolean
}>()

const tieOverlap = (index: number): number => {
  const overlap = atlasLinkOverlap(props.chain[index - 1], props.chain[index])
  return props.overlaps ? overlap : Math.min(overlap, 1)
}

const tieFragment = (index: number): string =>
  atlasKey(props.chain[index]).slice(0, Math.max(1, tieOverlap(index))).toUpperCase()

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

  // A multi-letter overlap is the trick shot — it burns ember.
  &.deep {
    color: #{ember()};
    border-color: #{ember(0.6)};
    font-size: 1.5rem;
  }
}

.bonus {
  font-size: 0.7em;
  margin-left: 0.3rem;
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
  .rest {
    opacity: 0.55;
  }
}
</style>
