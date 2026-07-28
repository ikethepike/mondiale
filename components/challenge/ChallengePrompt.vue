<template>
  <header class="challenge-prompt">
    <div class="prompt">
      <slot />
      <Transition name="caption">
        <span v-if="hint" class="map-caption hint">{{ hint }}</span>
      </Transition>
    </div>
  </header>
</template>
<script lang="ts" setup>
/**
 * The round's header: a centred prompt column (title, subs, whatever the mode
 * stacks) with the shared miss-hint channel floating beneath it. Every
 * challenge view renders its header through this — 23 views used to carry the
 * same 30 lines of header CSS each. Pass `hint` for the standard floating
 * miss hint; modes with a bespoke hint treatment (Manhunt's dispatch card)
 * leave it unset and put their own in the slot.
 */
defineProps<{ hint?: string }>()
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

header {
  z-index: 2;
  width: 100%;
  text-align: center;
  padding: 2rem 4rem;
}

.prompt {
  gap: 1rem;
  display: flex;
  position: relative;
  align-items: center;
  flex-flow: column nowrap;
}

:slotted(h1),
:slotted(h2) {
  margin: 0;
}

:slotted(.sub) {
  padding: 0.4rem 1.4rem;
}

// The miss hint floats below the prompt instead of joining its flex flow —
// popping in and out must not reflow the header (or the view under it).
.hint {
  top: 100%;
  left: 0;
  right: 0;
  z-index: 3;
  width: max-content;
  max-width: 100%;
  position: absolute;
  margin: 0.4rem auto 0;
  padding: 0.4rem 1.4rem;
  color: var(--hior-ange);
}

@media screen and (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }
}
</style>
