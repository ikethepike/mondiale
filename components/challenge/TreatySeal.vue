<template>
  <!-- A span, not a div: this stands in the gauntlet prompt and inside
       ChallengeResult's lesson <p>. -->
  <span class="treaty-seal" :class="{ compact }" :style="{ '--family-hue': family.hue }">
    <span class="wax" aria-hidden="true">
      <StatTopicIcon class="glyph" :topic="family.glyph" />
    </span>
    <span class="family">{{ family.label }}</span>
  </span>
</template>
<script lang="ts" setup>
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import { treatyMeta, TREATY_FAMILIES, type TreatyId } from '~~/types/treaty.type'

/**
 * The counterpart to OrganizationLogo for instruments. A club has an emblem
 * a player might recognise; a treaty has none, so it wears its family's seal
 * — a scalloped wax disc in the family's hue, its glyph struck into it.
 *
 * It does the same two jobs the org logo does: it stops the question being a
 * wall of text, and it tells the player what KIND of instrument this is
 * before they know anything else about it.
 */
const props = defineProps<{
  treaty: TreatyId
  /** Row layout with a smaller disc, for the prompt. Stacked, the seal costs
   *  the question ~65px of header — enough to push a tall reveal card off the
   *  bottom of a phone. The card itself has the room for the full version. */
  compact?: boolean
}>()

const family = computed(() => TREATY_FAMILIES[treatyMeta(props.treaty).family])
</script>
<style lang="scss" scoped>
.treaty-seal {
  gap: 0.4rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;

  &.compact {
    gap: 0.6rem;
    flex-flow: row nowrap;

    .wax {
      width: 2.8rem;
      height: 2.8rem;

      &::after {
        inset: 0.35rem;
      }

      .glyph {
        width: 1.5rem;
        height: 1.5rem;
      }
    }
  }
}

// The scallop is a conic gradient masked to a ring — cheaper than 16 paths,
// and it keeps the disc a single element the layout can size.
.wax {
  width: 4.4rem;
  height: 4.4rem;
  display: grid;
  position: relative;
  place-items: center;
  border-radius: 50%;
  color: hsl(var(--family-hue), 52%, 30%);
  background: hsla(var(--family-hue), 48%, 52%, 0.18);
  box-shadow: inset 0 0 0 0.15rem hsla(var(--family-hue), 45%, 38%, 0.42);

  // The impressed rim: a second, tighter ring reads as pressed wax rather
  // than a flat chip.
  &::after {
    inset: 0.5rem;
    content: '';
    position: absolute;
    border-radius: 50%;
    border: 0.1rem dashed hsla(var(--family-hue), 45%, 34%, 0.3);
  }

  .glyph {
    z-index: 1;
    width: 2.2rem;
    height: 2.2rem;
  }
}

.family {
  opacity: 0.75;
  font-size: 1.2rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
</style>
