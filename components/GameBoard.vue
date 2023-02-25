<template>
  <div class="game-board" ref="board">
    <div class="desktop-board">
      <template v-for="(row, index) in boardRows.desktop" :key="`desktop-row-${index}`">
        <BoardRow :row="row" :reverse="Boolean(index % 2)" :columns="5" />
      </template>
    </div>
    <div class="mobile-board">
      <template v-for="(row, index) in boardRows.mobile" :key="`mobile-row-${index}`">
        <BoardRow :row="row" :reverse="Boolean(index % 2)" :columns="3" />
      </template>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'
import { Tile } from '~~/types/game.types'

const { game, playerId } = useClientEvents()

type MobileRow = [Tile, Tile, Tile]
type DesktopRow = [Tile, Tile, Tile, Tile, Tile]

interface BoardRows {
  mobile: MobileRow[]
  desktop: DesktopRow[]
}

const board = ref<HTMLDivElement>()

// Watch current position
const playerPosition = computed(() => game.value?.position[playerId.value]?.currentPosition)

watch(
  () => game.value?.position,
  () => {
    if (!process.client) return
    if (!board.value) throw new ReferenceError('Board not initalized')

    const pawn = document.querySelector(`.player-pawn-${playerId.value}`)
    pawn?.scrollIntoView({ behavior: 'smooth' })
  }
)

// const move = async () => {
//   if (!currentMove.value) return
//   for (const _ of [...Array(currentMove.value.steps).keys()]) {
//     await wait(500)
//     if (!gameStore.game) break
//     gameStore.game.position[playerId.value].currentPosition += 1
//   }

//   if (currentMove.value.challenge) {
//     await wait(500)
//     gameStore.phase = 'individual-challenge'
//   } else {
//     update({ event: 'ready-for-round' })
//   }
// }

// onMounted(move)

// watch(() => currentMove, move)

const boardRows = computed<BoardRows>(() => {
  const output: BoardRows = {
    desktop: [],
    mobile: [],
  }

  if (!game.value) return output

  const mobileTiles: Tile[] = [...JSON.parse(JSON.stringify(game.value.tiles))]
  const desktopTiles: Tile[] = [...JSON.parse(JSON.stringify(game.value.tiles))]

  while (desktopTiles.length) {
    const row = desktopTiles.splice(0, 5)
    output.desktop.push(row as DesktopRow)
  }

  while (mobileTiles.length) {
    const row = mobileTiles.splice(0, 3)
    output.mobile.push(row as MobileRow)
  }

  return output
})
</script>
<style lang="scss" scoped>
.game-board {
  width: 100%;
  height: 100vh;
  overflow-y: auto;
  pointer-events: auto;
  z-index: 2;
  color: #fff;
  display: grid;
  overflow-y: auto;
  position: relative;
  height: min(100vh, 100dvh);
  scroll-snap-type: y proximity;
}

.mobile-board {
  display: none;
}
.desktop-board {
  padding: 2rem;
  display: grid;
  grid-row-gap: 3rem;
  grid-template-rows: auto;
}

@media screen and (min-width: 1024px) {
  .desktop-board {
    display: grid;
  }
  .mobile-board {
    display: none !important;
  }
}
</style>
