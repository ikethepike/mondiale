<template>
  <div class="layout" :class="[`phase-${player?.phase}`]">
    <pre class="phase-indicator">{{ player?.phase }}</pre>
    <LazyGameMap class="game-map" :highlighted="highlighted" />
    <slot />
  </div>
</template>
<script lang="ts" setup>
import { isFunction } from '@babel/types'
import { useClientEvents } from '~~/lib/events/client-side'
import { ISOCountryCode } from '~~/types/geography.types'
const { player, game, currentRound } = useClientEvents()

const highlighted = computed<ISOCountryCode[]>(() => {
  if (!game.value) return []
  if (!player.value) return []
  if (game.value.difficulty !== 'easy') return []
  if (player.value.phase !== 'group-challenge') return []

  const countries = currentRound.value?.round.groupChallenge.countriesPerPlayer[player.value.id]
  if (!countries) return []
  return countries
})
</script>

<style lang="scss" scoped>
.layout {
  max-width: 100%;
  overflow: hidden;
  position: relative;
}
// temp!
.phase-indicator {
  top: 0;
  color: #fff;
  z-index: 3000;
  position: absolute;
  mix-blend-mode: difference;
}

.game-map {
  top: 0;
  left: 0;
  width: 100%;
  transition: 0.3s;

  position: absolute;
  transform: scale(0.8);
  scrollbar-width: none;
  transform-origin: center;

  &::-webkit-scrollbar {
    display: none;
  }
}

.phase-undefined .game-map,
.phase-naming .game-map {
  animation: scale 10s;
  &:deep(svg path) {
    fill: none;
    stroke-width: 0.01rem;
    color: rgb(91, 91, 91);
  }
}

.phase-group-scores .game-map,
.phase-group-challenge .game-map,
.phase-individual-challenge .game-map {
  transform: scale(1);
}

.phase-group-scores .game-map {
  overflow: hidden;
}

@keyframes scale {
  0% {
    transform: scale(10) translate(50%, 50%);
  }
}

@media (prefers-color-scheme: dark) {
}
</style>
