<template>
  <ButtonBase class="line" :element="element">
    <slot />
  </ButtonBase>
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
.line {
  background-color: transparent;
  border: 0.1rem solid var(--black);
}
</style>
