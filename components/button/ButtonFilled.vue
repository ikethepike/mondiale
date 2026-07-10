<template>
  <ButtonBase class="filled" :element="element" :to="to">
    <slot />
  </ButtonBase>
</template>
<script lang="ts" setup>
defineProps({
  element: {
    type: String as PropType<'a' | 'button' | 'NuxtLink'>,
    default: 'button',
  },
  to: {
    type: String,
    default: undefined,
  },
})
</script>
<style lang="scss" scoped>
// .button.filled: must outrank ButtonBase's `.button { color: inherit }` —
// equal specificity leaves the winner to stylesheet order, which varies
// per build (black-on-black submit buttons in prod).
.button.filled {
  color: #fff;
  background: var(--black);
  &:disabled {
    opacity: 0.5;
  }
}
</style>
