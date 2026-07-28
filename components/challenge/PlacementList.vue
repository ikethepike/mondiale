<template>
  <ol class="placements">
    <li v-for="row in rows" :key="row.playerId" class="placement">
      <PlayerPawn class="pawn" :player="players[row.playerId]" />
      <span class="name">{{ row.name }}</span>
      <span v-if="row.fate" class="fate">{{ row.fate }}</span>
      <span class="tail">{{ row.tail }}</span>
    </li>
  </ol>
</template>
<script lang="ts" setup>
/**
 * The reveal scorecard's placement rows — pawn, seat name, fate line, and a
 * numeric tail (points, links) — shared by every turn-based mode's reveal so
 * the row anatomy can't drift between them.
 */
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import type { Player } from '~~/types/player.type'

defineProps<{
  rows: { playerId: string; name: string; fate?: string; tail: string }[]
  players: { [playerId: string]: Player }
}>()
</script>
<style lang="scss" scoped>
.placements {
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  display: flex;
  list-style: none;
  flex-flow: column nowrap;
}

.placement {
  gap: 0.8rem;
  display: flex;
  align-items: center;
  font-size: 1.3rem;

  .pawn {
    width: 1.2rem;
    height: 1.85rem;
    flex: none;
  }

  .name {
    font-weight: bold;
  }

  .fate {
    opacity: 0.75;
  }

  .tail {
    opacity: 0.75;
    margin-left: auto;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
}
</style>
