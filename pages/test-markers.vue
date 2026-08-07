<template>
  <div class="test-page">
    <nav class="controls">
      <div class="row">
        <button
          v-for="option in cameraPresets"
          :key="option"
          :class="{ active: preset === option }"
          @click="preset = option"
        >
          {{ option }}
        </button>
        <button :class="{ active: turntable }" @click="turntable = !turntable">turntable</button>
        <label>
          outline {{ widthRatio.toFixed(3) }}
          <input v-model.number="widthRatio" type="range" min="0" max="0.05" step="0.001" />
        </label>
      </div>
      <div v-for="(options, marker) in variantOptions" :key="marker" class="row">
        <span class="row-label">{{ marker }}</span>
        <button
          v-for="option in options"
          :key="option"
          :class="{ active: variants[marker] === option }"
          @click="variants[marker] = option"
        >
          {{ option }}
        </button>
      </div>
      <div class="row">
        <span class="row-label">gauntlet</span>
        <button
          v-for="difficulty in gameDifficulties"
          :key="difficulty"
          :class="{ active: gauntletDifficulty === difficulty }"
          @click="gauntletDifficulty = difficulty"
        >
          {{ difficulty }} · {{ GAUNTLET_LENGTH[difficulty] }} steps
        </button>
      </div>
    </nav>
    <Board3dMarkerLab
      :outline-width-ratio="widthRatio"
      :camera-preset="preset"
      :turntable="turntable"
      :variants="variants"
      :final-stages="GAUNTLET_LENGTH[gauntletDifficulty]"
    />
  </div>
</template>
<script lang="ts" setup>
import { MARKER_VARIANTS, type MarkerType } from '~~/lib/board3d/board-builder'
import { OUTLINE_WIDTH_RATIO } from '~~/lib/board3d/ink-outline'
import { GAUNTLET_LENGTH } from '~~/types/challenges/final-challenge.type'
import { type GameDifficulty, gameDifficulties } from '~~/types/game.types'

// Dev harness for the challenge markers: every gate marker under the real
// scene's lighting and camera language, with live outline tuning and the
// candidate sculpts side by side. Pick a winner here, then bake it into
// MARKER_VARIANTS' first slot (and eventually collapse the map).
const cameraPresets = ['board', 'path', 'free'] as const

const preset = ref<(typeof cameraPresets)[number]>('board')
const turntable = ref(false)
const widthRatio = ref(OUTLINE_WIDTH_RATIO)
const gauntletDifficulty = ref<GameDifficulty>('normal')

const variantOptions = Object.fromEntries(
  Object.entries(MARKER_VARIANTS).map(([marker, recipes]) => [marker, Object.keys(recipes)])
) as Record<keyof typeof MARKER_VARIANTS, string[]>

const variants = reactive<Partial<Record<MarkerType, string>>>(
  Object.fromEntries(
    Object.entries(variantOptions).map(([marker, options]) => [marker, options[0]])
  )
)
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
  gap: 0.5rem;
  z-index: 10;
  display: flex;
  flex-direction: column;
  position: absolute;

  .row {
    gap: 0.6rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
  }

  .row-label {
    width: 7.5rem;
    font-size: 0.85rem;
    font-weight: 600;
  }

  button {
    cursor: pointer;
    padding: 0.5rem 1rem;
    border-radius: 0.6rem;
    background: var(--background-color);
    border: 0.1rem solid var(--text-color);

    &.active {
      color: var(--background-color);
      background: var(--text-color);
    }
  }

  label {
    gap: 0.5rem;
    display: flex;
    align-items: center;
    font-size: 0.85rem;
  }
}
</style>
