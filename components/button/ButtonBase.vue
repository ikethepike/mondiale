<template>
  <component :is="element" :to="to" class="button">
    <slot />
  </component>
</template>
<script lang="ts" setup>
defineProps({
  element: {
    type: String as PropType<'a' | 'button' | 'NuxtLink'>,
    default: 'button',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  to: {
    type: String,
  },
})
</script>
<style lang="scss" scoped>
.button {
  height: 5rem;

  cursor: pointer;
  appearance: none;
  padding: 0 1.4rem;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  text-align: center;
  border-style: none;
  font-family: inherit;
  border-radius: 0.6rem;
  justify-content: center;
}
</style>
