<template>
  <div v-if="target" class="pane spectate-hud" :style="`--player-color: ${target.color}`">
    <PlayerPawn class="pawn" :player="target" />
    <span class="who">
      <span class="name">Watching {{ target.name || 'Player' }}</span>
      <span class="status">{{ status?.label }}</span>
    </span>
    <button class="close" type="button" aria-label="Stop watching" @click="release">×</button>
  </div>
</template>
<script lang="ts" setup>
import { getPlayerStatus } from '~~/lib/player-status'
import { useGameStore } from '~~/store/game.store'
import type { Game } from '~~/types/game.types'

// `game` comes in as a prop (not the store) so the /test harness's mock game
// drives the HUD too. Reads only phase/position-derived status — never the
// target's `moves[*].challenge` payload, which contains answers.
const props = defineProps<{ game: Game }>()

const gameStore = useGameStore()

const target = computed(() => {
  const id = gameStore.board.spectateTargetId
  return id ? props.game.players[id] : undefined
})

const status = computed(() => (target.value ? getPlayerStatus(target.value) : undefined))

const release = () => {
  gameStore.board.spectateTargetId = undefined
}
</script>
<style lang="scss" scoped>
.spectate-hud {
  position: absolute;
  left: 50%;
  bottom: calc(1rem + var(--safe-bottom));
  transform: translateX(-50%);
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.6rem 0.8rem;
  max-width: min(36rem, calc(100vw - 2rem));
  border-left: 0.3rem solid var(--player-color);
}

.pawn {
  width: 2.4rem;
  height: 2.4rem;
  flex-shrink: 0;
}

.who {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.name {
  font-size: 1.4rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status {
  font-size: 1.2rem;
  color: var(--dark-blue);
  opacity: 0.75;
  white-space: nowrap;
}

.close {
  flex-shrink: 0;
  width: 2.4rem;
  height: 2.4rem;
  padding: 0 0 0.25rem;
  border: none;
  border-radius: 50%;
  background: hsla(215.7, 76.4%, 21.6%, 0.08);
  color: inherit;
  font-size: 1.8rem;
  line-height: 1;
  cursor: pointer;
  // Grid-centre + a hair of bottom padding — the serif × rides high
  display: grid;
  place-items: center;
}
</style>
