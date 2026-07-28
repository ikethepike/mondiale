<template>
  <div class="test-page">
    <nav class="controls">
      <button @click="step('mock-player-1', 1)">Hop P1 +1</button>
      <button @click="step('mock-player-1', 3)">Hop P1 +3</button>
      <button @click="step('mock-player-2', 2)">Hop P2 +2</button>
      <button @click="win('mock-player-1')">Win P1</button>
      <button @click="win('mock-player-2')">Win P2</button>
      <button @click="reseed">Reseed terrain</button>
      <select v-model="length" @change="regenerate">
        <option v-for="option in gameLengths" :key="option" :value="option">{{ option }}</option>
      </select>
    </nav>
    <Board3D :game="mockGame" player-id="mock-player-1" />
  </div>
</template>
<script lang="ts" setup>
import { PLAYER_COLORS } from '~~/data/palette'
import { generateTiles } from '~~/lib/tiles'
import { gameLengths, type Game, type GameLength, type Tile } from '~~/types/game.types'
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
const length = ref<GameLength>('medium')

const tiles = generateTiles(length.value, seed.value)

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

// Ada is headed into the first gate — hopping her there exercises the
// blocked-pawn display, the knock reaction and the alert ripple. Gate
// positions are seeded, so the gate is found rather than assumed.
const firstGate = (board: Tile[]) =>
  board.find(tile => !['start', 'normal', 'final'].includes(tile.type))!

mockGame.players['mock-player-1'].moves = [
  {
    endTile: firstGate(tiles),
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
const regenerate = () => {
  mockGame.length = length.value
  mockGame.tiles = generateTiles(length.value, mockGame.id)
  mockGame.players['mock-player-1'].moves = [
    {
      endTile: firstGate(mockGame.tiles),
      challenge: { _type: 'individual-challenge', id: 'flag', country: 'FR' },
    },
  ]
}

const reseed = () => {
  reseedCount++
  mockGame.id = `topo-harness-${reseedCount}`
  regenerate()
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
