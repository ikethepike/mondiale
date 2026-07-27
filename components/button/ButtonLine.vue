<template>
  <ButtonBase class="line" :element="element" :to="to" :disabled="disabled">
    <slot />
  </ButtonBase>
</template>
<script lang="ts" setup>
import type { PropType } from 'vue'

defineProps({
  element: {
    type: String as PropType<'a' | 'button' | 'NuxtLink'>,
    default: 'button',
  },
  to: {
    type: String,
    default: undefined,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})
</script>
<style lang="scss" scoped>
// .button.line: outrank ButtonBase's `.button { border-style: none }` — see
// ButtonFilled for the stylesheet-order trap.
.button.line {
  background-color: transparent;
  border: 0.1rem solid var(--black);
}
</style>
