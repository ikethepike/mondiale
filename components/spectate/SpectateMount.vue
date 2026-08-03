<template>
  <!-- `inert` is the central interaction kill: clicks, focus, tab order and
       round-start autofocus all die at this boundary, so mounted views need
       no per-view read-only discipline. pointer-events is the belt for
       engines without inert support. -->
  <div class="spectate-mount" inert>
    <component :is="view.component" :key="view.key" />
    <div v-if="veiled" class="spoiler-veil" role="status">
      <p>Answers hidden until the table settles</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { ResolvedView } from '~/components/view/dispatch'

defineProps<{ view: ResolvedView; veiled: boolean }>()
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.spectate-mount {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.spoiler-veil {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  backdrop-filter: blur(1.2rem);
  background: milk(0.55);

  p {
    margin: 0;
    padding: 1rem 1.6rem;
    border-radius: 1.2rem;
    background: milk(0.9);
    border: 0.1rem solid ink(0.15);
    font-size: 1.5rem;
  }
}
</style>
