<template>
  <aside class="pane tr status-panel" aria-label="Player activity">
    <p class="panel-title">Who's doing what</p>
    <TransitionGroup tag="ul" name="row" class="rows">
      <li
        v-for="entry in entries"
        :key="entry.player.id"
        class="row"
        :class="{ you: entry.you, busy: entry.status.busy, done: entry.status.done }"
        :style="`--player-color: ${entry.player.color}`"
      >
        <PlayerPawn class="pawn" :player="entry.player" />
        <span class="who">
          <span class="name"
            >{{ entry.player.name || 'Player' }}<span v-if="entry.you" class="tag">you</span></span
          >
          <span class="status">
            <span v-if="entry.status.busy" class="pulse" aria-hidden="true" />
            {{ entry.status.label }}
          </span>
        </span>
      </li>
    </TransitionGroup>
  </aside>
</template>
<script lang="ts" setup>
import { getPlayerStatus } from '~~/lib/player-status'
import type { Player } from '~~/types/player.type'

const props = defineProps<{
  players: Player[]
  currentPlayerId: string
}>()

// You first, then the busy players (so "what's holding us up" is at the top),
// then everyone else. Kicked players drop out entirely.
const entries = computed(() =>
  props.players
    .map(player => ({
      player,
      you: player.id === props.currentPlayerId,
      status: getPlayerStatus(player),
    }))
    .filter(entry => !entry.status.gone)
    .sort((a, b) => {
      if (a.you !== b.you) return a.you ? -1 : 1
      if (a.status.busy !== b.status.busy) return a.status.busy ? -1 : 1
      return 0
    })
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

.status-panel {
  position: fixed;
  left: 0;
  // Sit below the diagnostics bar when it's present; otherwise near the top,
  // clear of any notch.
  top: calc(1.5rem + var(--safe-top));
  // Behind view content and modals (which sit at z-index >= 2) — this is an
  // ambient backdrop for the board, not something to fight the foreground.
  z-index: 1;
  width: min(24rem, 60vw);
  max-height: calc(var(--viewport-height) - 3rem);
  overflow-y: auto;
  padding: 1.3rem 1.3rem 1.1rem;
  // Round only the outer (right) corners; the flush-left edge stays square.
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.panel-title {
  margin: 0 0 1rem;
  font-size: 1.2rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.55;
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.9rem;
}

.row {
  display: grid;
  grid-template-columns: 2.4rem 1fr;
  align-items: center;
  gap: 0.9rem;
  padding: 0.55rem 0.7rem;
  border-radius: 0.9rem;
  background: hsla(0, 0%, 100%, 0.5);
  border: 1px solid hsla(215.7, 76.4%, 21.6%, 0.08);
  border-left: 0.3rem solid var(--player-color);

  &.you {
    background: hsla(29.7, 79.9%, 72.7%, 0.22); // warm-sand wash
  }
  &.done {
    opacity: 0.75;
  }
}

.pawn {
  width: 2.4rem;
  height: 2.4rem;
}

.who {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.name {
  font-size: 1.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag {
  margin-left: 0.5rem;
  font-size: 1rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.5;
}

.status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.25rem;
  color: var(--dark-blue);
  opacity: 0.75;
}

// .pulse lives in assets/scss/templates/_pulse.scss — shared with LoadingRoom.

// Rows glide when the sort reorders (a player finishes / starts walking).
.row-move {
  transition: transform 0.4s var(--ease-smooth, ease);
}
.row-enter-active,
.row-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.row-enter-from,
.row-leave-to {
  opacity: 0;
  transform: translateX(-1rem);
}

@media (max-width: $tablet) {
  .status-panel {
    width: min(20rem, 70vw);
    padding: 1rem;
    font-size: 0.9em;
  }
}
</style>
