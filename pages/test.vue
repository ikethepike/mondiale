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
    <!-- Pawn-replay repro: the board unmounts for challenge views, and the
         gate resolves while it is gone. These drive that sequence. -->
    <nav class="controls replay-controls">
      <button @click="walkToGate">Walk P1 to gate</button>
      <button @click="dealWalk(4)">Deal new walk</button>
      <button @click="boardVisible = false">Hide board</button>
      <button @click="loseGate">Lose gate (hidden)</button>
      <button @click="winGate">Win gate (hidden)</button>
      <button @click="boardVisible = true">Show board</button>
    </nav>
    <!-- Final-gauntlet climb: drive P1 up the mountain marker stage by stage. -->
    <nav class="controls gauntlet-controls">
      <button @click="startGauntlet">Start gauntlet P1</button>
      <button @click="clearStage">Clear stage</button>
      <button @click="missStage">Miss stage</button>
    </nav>
    <Board3D v-if="boardVisible" :game="mockGame" player-id="mock-player-1" />
  </div>
</template>
<script lang="ts" setup>
import { PLAYER_COLORS } from '~~/data/palette'
import { gateLeapSteps, gatePot } from '~~/lib/scoring'
import { GAUNTLET_LENGTH } from '~~/types/challenges/final-challenge.type'
import type { FinalChallenge, FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
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
  // Every real player is on a dealt walk; leaving this unset would pin the
  // harness to generation 0 and hide the cross-round replay path entirely.
  walkSeq: 1,
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

// A walk dealt PAST the gate, split the way movesForScoredPoints splits it:
// the gate move, then the remainder it only reaches by beating the gate. The
// tail is what a failed gate forfeits — and what the board must never walk.
const walkThroughGate = (board: Tile[]) => {
  const gate = firstGate(board)
  const tail = board[Math.min(gate.position + 5, board.length - 1)]
  return [
    {
      endTile: gate,
      challenge: { _type: 'individual-challenge', id: 'flag', country: 'FR' } as const,
    },
    { endTile: tail },
  ]
}

mockGame.players['mock-player-1'].moves = walkThroughGate(tiles)

const step = (playerId: string, steps: number) => {
  const player = mockGame.players[playerId]
  player.currentPosition = Math.min(player.currentPosition + steps, mockGame.tiles.length - 1)
}

// --- Pawn-replay repro controls -------------------------------------------
// The board unmounts while a challenge view is up, and the gate resolves in
// that window. These reproduce that sequence against the same mock game id,
// so the mover's cross-mount display memory (keyed by game id) survives —
// reseeding instead would clear it and mask what we're testing.
const boardVisible = ref(true)

/** Walk to the tile before the gate, as the server's stepper would. */
const walkToGate = () => {
  const player = mockGame.players['mock-player-1']
  const gate = player.moves[0]?.endTile.position
  if (gate === undefined) return
  player.currentPosition = gate - 1
}

/** Wrong answer: the server clears the moves and leaves the pawn at gate − 1. */
const loseGate = () => {
  const player = mockGame.players['mock-player-1']
  player.moves = []
}

/** Correct answer: the leap advances the pawn and the gate move is consumed. */
const winGate = () => {
  const player = mockGame.players['mock-player-1']
  if (!player.moves.length) return
  player.currentPosition += gateLeapSteps(undefined, undefined, gatePot())
  player.moves.shift()
}

/**
 * A new round deals a fresh walk, as startWalk does — bumping the generation
 * is what retires the previous walk's display memory. Walking after this is
 * the cross-round path; without a generation bump the harness could only ever
 * exercise movement inside a single walk.
 */
const dealWalk = (steps: number) => {
  const player = mockGame.players['mock-player-1']
  const end = mockGame.tiles[Math.min(player.currentPosition + steps, mockGame.tiles.length - 1)]
  player.moves = [{ endTile: end }]
  player.walkSeq = (player.walkSeq ?? 0) + 1
}

// --- Final-gauntlet climb demo --------------------------------------------
// The board only reads _type / answeredCorrect / totalCount / lives off the
// gauntlet, so the question items can stay empty husks.
const GAUNTLET_STAGES = GAUNTLET_LENGTH['normal']

const startGauntlet = () => {
  const player = mockGame.players['mock-player-1']
  const finalTile = mockGame.tiles[mockGame.tiles.length - 1]
  player.currentPosition = finalTile.position - 1
  player.phase = 'final-challenge'
  player.moves = [
    {
      endTile: finalTile,
      challenge: {
        _type: 'final-challenge',
        difficulty: 'normal',
        challenges: Array.from({ length: GAUNTLET_STAGES }, () => ({}) as FinalChallengeItem),
        lives: 2,
        totalCount: GAUNTLET_STAGES,
        answeredCorrect: 0,
      } satisfies FinalChallenge,
    },
  ]
}

const liveGauntlet = () => {
  const challenge = mockGame.players['mock-player-1'].moves[0]?.challenge
  return challenge?._type === 'final-challenge' ? challenge : undefined
}

/** As the server does: bump the numerator, consume the head; empty → victory. */
const clearStage = () => {
  const gauntlet = liveGauntlet()
  if (!gauntlet) return
  gauntlet.answeredCorrect += 1
  gauntlet.challenges.shift()
  if (!gauntlet.challenges.length) {
    const player = mockGame.players['mock-player-1']
    player.phase = 'victory'
    player.completedAtRound = ++winCount
  }
}

/** A miss burns a life; out of lives wipes the moves — the knockout descent. */
const missStage = () => {
  const gauntlet = liveGauntlet()
  if (!gauntlet) return
  gauntlet.lives -= 1
  if (gauntlet.lives < 0) {
    const player = mockGame.players['mock-player-1']
    player.moves = []
    player.phase = 'moving'
  }
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
  mockGame.players['mock-player-1'].moves = walkThroughGate(mockGame.tiles)
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
  flex-wrap: wrap;
  position: absolute;

  button {
    cursor: pointer;
    padding: 0.6rem 1.2rem;
    border-radius: 0.6rem;
    background: var(--background-color);
    border: 0.1rem solid var(--text-color);
  }
}

/* Its own row: overlapping the first nav made those buttons unclickable. */
.replay-controls {
  top: 4.5rem;
}

.gauntlet-controls {
  top: 8rem;
}
</style>
