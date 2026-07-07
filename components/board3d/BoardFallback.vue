<template>
  <article class="pane tl decorator-bottom board-fallback">
    <div class="pane-content">
      <h1>On the move</h1>
      <ul>
        <li v-for="player in players" :key="player.id">
          <PlayerPawn :player="player" class="pawn" />
          <div class="details">
            <span>{{ player.name }}</span>
            <small>Tile {{ player.currentPosition + 1 }} of {{ game.tiles.length }}</small>
            <div class="progress">
              <div
                class="bar"
                :style="{
                  width: `${((player.currentPosition + 1) / game.tiles.length) * 100}%`,
                  background: player.color,
                }"
              />
            </div>
          </div>
        </li>
      </ul>
    </div>
  </article>
</template>
<script lang="ts" setup>
import type { Game } from '~~/types/game.types'

// Shown when WebGL is unavailable: a plain progress list in the pane style.
const props = defineProps({
  game: {
    type: Object as PropType<Game>,
    required: true,
  },
})

const players = computed(() => Object.values(props.game.players))
</script>
<style lang="scss" scoped>
.board-fallback {
  width: 100%;
  margin: auto;
  max-width: 48rem;
  pointer-events: auto;
}

li {
  gap: 1.6rem;
  display: flex;
  align-items: center;
  margin-bottom: 1.6rem;
}

.pawn {
  width: 3rem;
  flex-shrink: 0;
}

.details {
  flex: 1;
  small {
    opacity: 0.7;
    display: block;
  }
}

.progress {
  height: 0.8rem;
  margin-top: 0.4rem;
  border-radius: 0.4rem;
  border: 0.1rem solid var(--text-color);
  overflow: hidden;
  .bar {
    height: 100%;
    transition: width var(--motion-slow) var(--ease-smooth);
  }
}
</style>
