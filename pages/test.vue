<template>
  <div class="test-page">
    <nav class="controls">
      <button @click="step('mock-player-1', 1)">Hop P1 +1</button>
      <button @click="step('mock-player-1', 3)">Hop P1 +3</button>
      <button @click="step('mock-player-2', 2)">Hop P2 +2</button>
      <button @click="win('mock-player-1')">Win P1</button>
      <button @click="win('mock-player-2')">Win P2</button>
      <button @click="reseed">Reseed terrain</button>
    </nav>
    <Board3D :game="mockGame" player-id="mock-player-1" />
  </div>
</template>
<script lang="ts" setup>
import { PLAYER_COLORS } from '~~/data/palette'
import { generateTiles } from '~~/lib/tiles'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'

// Dev harness for the 3D board: a mock game with a fixed seed so terrain,
// path and tiles can be iterated on without a multiplayer session.
const mockPlayer = (id: string, name: string, color: string, position: number): Player => ({
  id,
  name,
  color: color as Player['color'],
  ready: true,
  phase: 'moving',
  moves: [],
  currentPosition: position,
})

const seed = ref('topo-harness')

const tiles = generateTiles('medium')

const mockGame = reactive<Game>({
  id: seed.value,
  host: 'mock-player-1',
  tiles,
  rounds: [],
  started: true,
  length: 'medium',
  variant: 'world',
  difficulty: 'normal',
  players: {
    'mock-player-1': mockPlayer('mock-player-1', 'Ada', PLAYER_COLORS[3], 3),
    'mock-player-2': mockPlayer('mock-player-2', 'Grace', PLAYER_COLORS[1], 9),
    // Shares a tile with Grace to exercise co-located pawn layout
    'mock-player-3': mockPlayer('mock-player-3', 'Alan', PLAYER_COLORS[6], 9),
  },
})

// Ada is headed into the challenge on tile 5 — hopping her there exercises
// the blocked-pawn display, the knock reaction and the alert ripple
mockGame.players['mock-player-1'].moves = [
  {
    endTile: tiles[5],
    challenge: { _type: 'individual-challenge', id: 'flag', country: 'FR' },
  },
]

const step = (playerId: string, steps: number) => {
  const player = mockGame.players[playerId]
  player.currentPosition = Math.min(player.currentPosition + steps, mockGame.tiles.length - 1)
}

// First win is the champion (gold crown), later wins are finishers (silver)
let winCount = 0
const win = (playerId: string) => {
  const player = mockGame.players[playerId]
  if (player.phase === 'victory') return
  player.phase = 'victory'
  player.completedAtRound = ++winCount
}

let reseedCount = 0
const reseed = () => {
  reseedCount++
  mockGame.id = `topo-harness-${reseedCount}`
  // Changing tile count forces a rebuild; keep count stable, id drives the seed
  mockGame.tiles = [...generateTiles('medium')]
}
</script>
<style lang="scss" scoped>
.test-page {
  z-index: 3000;
  height: var(--viewport-height);
  position: relative;
  background: var(--background-color);
}

.controls {
  top: 1rem;
  left: 1rem;
  gap: 0.6rem;
  z-index: 10;
  display: flex;
  position: absolute;

  button {
    cursor: pointer;
    padding: 0.6rem 1.2rem;
    border-radius: 0.6rem;
    background: var(--background-color);
    border: 0.1rem solid var(--text-color);
  }
}
</style>
