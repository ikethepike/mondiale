<template>
  <section class="player-listing pane-content">
    <header class="listing-header">
      <span class="eyebrow">Round Standings</span>
    </header>
    <div
      v-for="({ player, score }, index) in scorecards"
      :key="player.id"
      class="score-row"
      :class="{
        'own-player': player.id === seatId,
        selected: player.id === selectedPlayer,
      }"
      role="button"
      tabindex="0"
      :aria-pressed="player.id === selectedPlayer"
      @click="emit('select', player.id)"
      @keydown.enter.prevent="emit('select', player.id)"
      @keydown.space.prevent="emit('select', player.id)"
    >
      <span class="rank">{{ index + 1 }}</span>
      <PlayerTile :player="player">
        <div class="score-status">
          <strong v-if="score?.points">
            {{ score.points.scored }}<span class="muted">/{{ score.points.maximum }}</span>
          </strong>
          <span v-else class="muted">…</span>
        </div>
      </PlayerTile>
    </div>
  </section>
</template>
<script lang="ts" setup>
import PlayerTile from '~/components/player/PlayerTile.vue'
import type { Scorecard } from '~~/store/game.store'

defineProps<{
  scorecards: Scorecard[]
  /** The seat this screen belongs to — its row wears the own-player edge. */
  seatId: string
  /** The row the scorecard beside this list is currently showing. */
  selectedPlayer: string
}>()

const emit = defineEmits<{ select: [playerId: string] }>()
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// Sidebar: ranked standings
.player-listing {
  border-left: 0.1rem solid var(--text-color);

  // Phone portrait: the 73/27 split becomes a stack, so the standings sit
  // BENEATH the scorecard under a top rule instead of a left one.
  @media screen and (max-width: $tablet) {
    border-left: none;
    border-top: 0.1rem solid var(--text-color);
  }
}

.listing-header {
  margin-bottom: 1.6rem;
  padding-bottom: 1.2rem;
  border-bottom: 0.1rem solid $hairline;

  .eyebrow {
    margin-bottom: 0;
  }
}

.score-row {
  gap: 1rem;
  display: flex;
  cursor: pointer;
  align-items: center;

  .rank {
    width: 2rem;
    opacity: 0.45;
    flex-shrink: 0;
    font-size: 1.4rem;
    text-align: right;
    font-weight: bold;
  }

  :deep(.player-tile) {
    flex: 1;
    min-width: 0;
  }

  &.selected :deep(.player-tile) {
    border-right-width: 0.6rem;
  }

  &.own-player .rank {
    opacity: 1;
    color: var(--dark-blue);
  }
  &.own-player :deep(.player-tile) {
    outline: 0.2rem solid var(--warm-sand);
    outline-offset: 0.2rem;
  }
}

.score-status {
  margin-left: auto;
  font-size: 1.7rem;

  .muted {
    opacity: 0.55;
    font-weight: normal;
    font-size: 1.3rem;
  }
}
</style>
