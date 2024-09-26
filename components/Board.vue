<template>
  <div class="board" :style="{ '--tileSize': tileSize }" ref="board">
    <header class="progress-header" ref="progressHeader">
      <div class="logo" />
      <ol>
        <li>Doug 55%</li>
        <li>Macy 35%</li>
        <li>May 32%</li>
        <li>Marlene 12%</li>
      </ol>
    </header>

    <section class="board-wrapper">
      <div
        class="board-tile"
        :data-mod="Number(i % 5 > 0)"
        :id="`tile-${i}`"
        v-for="i in 100"
        :class="{
          wide: i % 5 === 0 && ![25, 50, 70].includes(i),
          challenge: i % 5 === 0,
          'final-tile': i === 100,
        }"
      >
        <span class="tile-number">{{ i }}</span>
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

.logo {
  top: 0;
  width: 100%;
  height: 4rem;
  display: block;
  position: sticky;
  background: black;
  margin-bottom: 1rem;
  mask: url(~/assets/logos/mondiale.svg) no-repeat center/contain;
}

.progress-header {
  width: 100%;
  display: flex;
  min-height: 30vh;
  align-items: center;
  flex-direction: column;
  justify-content: flex-end;

  ol {
    width: 100%;
    display: flex;
    padding: 2.5rem 0;
    justify-content: space-around;
  }
}
.board-wrapper {
  gap: 0.1rem;
  display: flex;
  margin: 0 2.5vw;
  overflow: hidden;
  position: relative;
  margin-bottom: 5rem;
  flex-flow: row wrap;
  // grid-auto-rows: 20vw;
  // grid-template-columns: repeat(5, 1fr);
  border-top-left-radius: 3.5rem;
  border-top-right-radius: 3.5rem;
  border: 0.1rem solid var(--text-color);
  &::before {
    content: '';
    width: 100%;
    height: 100%;
    display: block;
    position: absolute;
    background: var(--text-color);
    border: 10rem solid transparent;
    // border-top-left-radius: 3.5rem;
    // border-top-right-radius: 3.5rem;
  }
}
.board-tile {
  z-index: 2;
  width: calc(20% - 0.1rem);
  height: 20vw;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  background-color: var(--background-color);

  .tile-number {
    right: 1rem;
    bottom: 1rem;
    position: absolute;
  }
  &.wide {
    width: 40%;
  }
  &#tile-1 {
    width: 40%;
    // grid-area: 1 / 1 / 2 / 3;
    border-top-left-radius: 3.5rem;
    &::before {
      content: 'Start';
    }
  }

  &.challenge::before {
    content: '';
    display: block;
    position: absolute;
    width: 100%;
    height: 100%;
    background: rgba(0, 130, 0, 0.1);
  }

  &.final-tile {
    &::after {
      content: 'Final Challenge';
    }
  }
}

.board-tile.challenge::before {
  top: 0;
  content: '';
  display: block;
  position: absolute;
  width: 100%;
  height: 100%;
}
</style>
