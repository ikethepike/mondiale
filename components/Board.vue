<template>
  <div class="board" :style="{ '--tileSize': tileSize }" ref="board">
    <header class="progress-header" ref="progressHeader">
      <ol>
        <li>Doug 55%</li>
        <li>Macy 35%</li>
        <li>May 32%</li>
        <li>Marlene 12%</li>
      </ol>
    </header>

    <!-- <PlayerNewPawn /> -->
    <section class="board-wrapper">
      <div class="board-tile-wrapper" v-for="i in 100">
        <div class="board-tile pane backboard" :class="{ challenge: i % 5 === 0 }" />
        <div class="plinth" />
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { useClientEvents } from '~~/lib/events/client-side'

const progressHeader = ref<HTMLHeadElement>()
const board = ref<HTMLDivElement>()
const onScroll = (event: Event) => {
  if (!event.target) {
    return console.error('No target')
  }

  if (!progressHeader.value) {
    return console.error('No progress header')
  }

  const { scrollTop, offsetHeight } = event.target as HTMLDivElement
  const scrollThreshold = offsetHeight * 0.15

  const opacity = 1 - scrollTop / scrollThreshold
  progressHeader.value.style.opacity = String(opacity)
  // progressHeader.value.style.transform = `scale(${Math.min(1, opacity * -1)})`
}

onMounted(() => {
  if (!board.value) throw new ReferenceError('Progress header not initialized')
  board.value.addEventListener('scroll', onScroll)
})

onUnmounted(() => {
  if (!board.value) throw new ReferenceError('Progress header not initialized')
  board.value.removeEventListener('scroll', onScroll)
})

const tileSize = `10vw`

const { game } = useClientEvents()
</script>
<style lang="scss" scoped>
@import '~/assets/scss/templates/pane';
@import '~/assets/scss/rules/breakpoints';

.board {
  width: 100%;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  height: min(100vh, 100dvh);
  scroll-snap-type: y proximity;

  --tile-size: 50vw;
}

.board-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  z-index: 2;
  animation: slide-up 0.6s;
}

@keyframes slide-up {
  0% {
    transform: translateY(100vh) scale(0.8);
  }
}

.progress-header {
  top: 0;
  left: 0;
  position: sticky;
  padding: 2rem 4rem;
}

.board-tile {
  width: var(--tile-size);
  height: var(--tile-size);
  margin-bottom: 1px;
  display: flex;
  align-items: center;
  justify-content: center;

  &.challenge::before {
    content: 'Challenge';
  }
  &:first-of-type {
    margin-top: 20vmin;
    border: 0.1rem solid var(--text-color);
    // border-top-right-radius: $paneBorderRadius;
    // border-top-left-radius: $paneBorderRadius;

    &::before {
      content: ' ';
    }
  }
}

@media screen and (min-width: $laptop) {
  .board {
    overflow-x: auto;
    overflow-y: hidden;
    --tile-size: 15vw;
    display: grid;
    grid-template-rows: repeat(3, 1fr);
  }

  .board-wrapper {
    flex-direction: row;
  }
  .board-tile-wrapper {
    display: flex;
    perspective: 30rem;
    flex-direction: column;
    .backboard {
      width: 100%;
      position: relative;
      z-index: 2;
    }
    .backboard.challenge {
      background: tomato;
    }
    &:first-child {
      margin-left: 20vw;
      .backboard {
        border-left: 0.1rem solid var(--text-color);
        border-top-left-radius: $paneBorderRadius;
      }
      .plinth {
        // transform: rotateX(45deg) skewX(-15deg);
        // border-left: none;
      }
    }
    .backboard {
      flex-shrink: 0;
      border-left: none;
      border-right: 0.1rem solid var(--text-color);
      height: calc(var(--tile-size) / 1.5);
      &:first-child {
        margin-top: 0;
        // border-radius: 0;
        // margin-left: 20vmin;
        // border-bottom-left-radius: $paneBorderRadius;
      }
    }
    .plinth {
      display: block;
      position: relative;
      transform: rotateX(45deg) scaleX(1.22) translateY(7.5%);
      top: calc(var(--tile-size) / 4 * -1);
      width: calc(var(--tile-size) * 1.25);
      height: var(--tile-size);
      transform-origin: center;
      border: 0.1rem solid var(--text-color);
      background: var(--background-color);
    }
  }
}
</style>
