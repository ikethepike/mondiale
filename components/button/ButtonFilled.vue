<template>
  <ButtonBase class="filled" :element="element" :to="to">
    <slot />
  </ButtonBase>
</template>
<script lang="ts" setup>
import { PropType } from 'vue'

defineProps({
  element: {
    type: String as PropType<'a' | 'button' | 'NuxtLink'>,
    default: 'button',
  },
  to: {
    type: String,
  },
})
</script>
<style lang="scss" scoped>
.filled {
  color: #fff;
  background: var(--black);
  &:disabled {
    opacity: 0.5;
  }
}
</style>
