<template>
  <svg
    viewBox="0 0 68 105"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :class="`player-pawn-${player?.id}`"
  >
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M24.3614 3.46005C13.4175 10.3189 11.6327 24.9318 20.5098 35.0122C23.0885 37.9424 22.311 45.5862 17.9516 60.1241C12.4776 78.3814 9.89058 84.2631 7.33383 84.2631C2.62903 84.2631 0.152093 89.0219 0.606198 97.1903L1.02728 104.769H34.0531H67.0789L67.5 97.1903C67.9541 89.0219 65.4772 84.2631 60.7724 84.2631C59.088 84.2631 57.4959 81.9622 55.6355 76.8386C51.0476 64.2041 47.2634 50.6561 46.3538 43.6091C45.6149 37.8788 45.9176 36.4618 48.3753 34.1778C52.5145 30.327 54.441 21.88 52.6989 15.229C49.483 2.95661 34.8567 -3.11738 24.3614 3.46005Z"
      :fill="player?.color || 'currentColor'"
    />
  </svg>
</template>
<script lang="ts" setup>
/// <reference types=".vue-global-types/vue_3.5_false.d.ts" />
import type { Player } from '~~/types/player.type'

defineProps({
  player: {
    type: Object as PropType<Player>,
  },
})
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
