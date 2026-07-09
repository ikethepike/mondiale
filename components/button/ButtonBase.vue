<template>
  <component
    :is="tag"
    :to="to"
    :disabled="element === 'button' && disabled ? true : undefined"
    class="button"
  >
    <slot />
  </component>
</template>
<script lang="ts" setup>
const props = defineProps({
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
    default: undefined,
  },
})

// NuxtLink is auto-imported, NOT globally registered — handing the bare
// string to <component :is> renders an inert <nuxtlink> element that looks
// like a link and navigates nowhere. It must be resolved to the component.
const NuxtLink = resolveComponent('NuxtLink')
const tag = computed(() => (props.element === 'NuxtLink' ? NuxtLink : props.element))
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

  // Rendering as a real <a> (NuxtLink) brings the user agent's link look
  // with it — a button is a button regardless of the element underneath
  color: inherit;
  text-decoration: none;
}
</style>
