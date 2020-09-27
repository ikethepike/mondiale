<template>
  <div class="main-board">
    <div v-if="game" class="player-progress">
      <PlayerProgress
        v-for="player in game.players"
        :key="player.id"
        :progress="player.progress"
        :color="player.color"
      />
    </div>

    <WorldMap />
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'
import { Command, Game } from '~/types/game'

const update = async (cmd: Command) => {
  const response = await fetch(location.origin + '/api/commands', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(cmd),
  })

  return await response.json()
}

interface GameData {
  game?: Game
}

export default defineComponent({
  data: (): GameData => ({
    game: undefined,
  }),
  async mounted() {
    const game: Game = await update({
      gameId: 'test',
      event: 'connect',
    })

    this.game = game
    const player = game.players[0]

    update({
      playerId: player.id,
      gameId: game.id,
      event: 'set-name',
      name: 'stinky steve',
    })
  },
})
</script>
<style scoped>
.grid-overlay {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: grid;
  position: absolute;
  background: rgba(255, 255, 255, 0.5);
}
.tile {
  width: 5rem;
  height: 5rem;
  border-radius: 5px;
  background: tomato;
}
.player-progress {
  width: 100%;
  position: absolute;
}
</style>
