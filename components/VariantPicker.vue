<template>
  <div class="variant-picker">
    <div class="variant-slider">
      <div class="observer" ref="observer" />

      <ul>
        <li v-for="variant in gameVariants">
          <pre>{{ variant }}</pre>
        </li>
      </ul>
    </div>

    <input type="hidden" name="variant" :value="variant" />
  </div>
</template>
<script lang="ts" setup>
import { GameVariant, gameVariants } from '~~/types/game.types'

const variant = ref<GameVariant>('world')
</script>
