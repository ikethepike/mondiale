<template>
  <div>Game goes here</div>
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
      gameId: this.game.id,
      event: 'set-name',
      name: 'stinky steve',
    })
  },
  methods: {},
})
</script>
