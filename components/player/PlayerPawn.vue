<template>
  <!-- A brain-played seat wears a machined pawn: the same body and colour, a
       squared head and collar, antenna up. The viewBox is the pawn's own —
       consumers size the two axes independently (PlacementList pins
       1.2×1.85rem), so a taller box would squash every pawn on the board. -->
  <svg
    viewBox="0 0 68 105"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :class="[`player-pawn-${player?.id}`, { 'is-bot': isBot }]"
    :aria-label="isBot ? 'Computer player' : undefined"
    :role="isBot ? 'img' : undefined"
  >
    <template v-if="isBot">
      <defs>
        <!-- Everything from the neck down; the round head is cropped away. -->
        <clipPath :id="clipId"><rect x="0" y="58" width="68" height="47" /></clipPath>
      </defs>
      <!-- The pawn's OWN body, clipped below the neck, so the skirt and base
           match a human seat exactly; only the head is re-cut square. -->
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M24.3614 3.46005C13.4175 10.3189 11.6327 24.9318 20.5098 35.0122C23.0885 37.9424 22.311 45.5862 17.9516 60.1241C12.4776 78.3814 9.89058 84.2631 7.33383 84.2631C2.62903 84.2631 0.152093 89.0219 0.606198 97.1903L1.02728 104.769H34.0531H67.0789L67.5 97.1903C67.9541 89.0219 65.4772 84.2631 60.7724 84.2631C59.088 84.2631 57.4959 81.9622 55.6355 76.8386C51.0476 64.2041 47.2634 50.6561 46.3538 43.6091C45.6149 37.8788 45.9176 36.4618 48.3753 34.1778C52.5145 30.327 54.441 21.88 52.6989 15.229C49.483 2.95661 34.8567 -3.11738 24.3614 3.46005Z"
        :fill="fill"
        :clip-path="`url(#${clipId})`"
      />
      <circle cx="34" cy="6.5" r="5.5" :fill="fill" />
      <rect x="31.6" y="8.5" width="4.8" height="12" rx="2.4" :fill="fill" />
      <rect x="12" y="18" width="44" height="32" rx="7" :fill="fill" />
      <rect x="18.5" y="53" width="31" height="8.5" rx="3.2" :fill="fill" />
    </template>
    <path
      v-else
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M24.3614 3.46005C13.4175 10.3189 11.6327 24.9318 20.5098 35.0122C23.0885 37.9424 22.311 45.5862 17.9516 60.1241C12.4776 78.3814 9.89058 84.2631 7.33383 84.2631C2.62903 84.2631 0.152093 89.0219 0.606198 97.1903L1.02728 104.769H34.0531H67.0789L67.5 97.1903C67.9541 89.0219 65.4772 84.2631 60.7724 84.2631C59.088 84.2631 57.4959 81.9622 55.6355 76.8386C51.0476 64.2041 47.2634 50.6561 46.3538 43.6091C45.6149 37.8788 45.9176 36.4618 48.3753 34.1778C52.5145 30.327 54.441 21.88 52.6989 15.229C49.483 2.95661 34.8567 -3.11738 24.3614 3.46005Z"
      :fill="fill"
    />
  </svg>
</template>
<script lang="ts" setup>
import { isBrainSeat } from '~~/lib/bots'
import type { Player } from '~~/types/player.type'

const props = defineProps({
  player: {
    type: Object as PropType<Player>,
    default: undefined,
  },
})

// The same seat test the server brain plays by — a lobby bot OR an autopiloted
// human, so a vacated seat looks machine-played while it is.
const isBot = computed(() => !!props.player && isBrainSeat(props.player))
const fill = computed(() => props.player?.color || 'currentColor')

// Many pawns share a page, and a duplicated clipPath id would have every bot
// crop against the first one's. `useId` is SSR-stable, so hydration matches.
const clipId = `pawn-neck-${useId()}`
</script>
<style lang="scss">
.player {
  width: 3rem;
  height: 3rem;
  display: block;
  border-radius: 50%;
  border: 0.1rem solid;
}
</style>
