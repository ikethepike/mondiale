<template>
  <component :is="element" class="button">
    <div class="content">
      <slot />
    </div>
  </component>
</template>
<script lang="ts" setup>
import { PropType } from 'vue'

defineProps({
  element: {
    type: String as PropType<'a' | 'button' | 'nuxt-link'>,
    default: 'button',
  },
})
</script>
<style lang="scss" scoped>
.button {
  height: 5rem;
  appearance: none;
  text-align: center;
  border-style: none;
  font-family: inherit;
  border-radius: 0.6rem;
  padding: 1.6rem 1.4rem;
}
</style>
