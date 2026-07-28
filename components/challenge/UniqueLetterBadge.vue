<template>
  <span class="letter-badge">{{ letter }}</span>
</template>
<script lang="ts" setup>
/**
 * Unique or Bust's letter tile: the dealt letter on the brand ink square
 * ('?' while the briefing seals it). One mark across the round header, the
 * tutorial card and the reveal masthead — hosts scale it with `banner`.
 * Straight on purpose: the tilt is The Despot's hat flourish, not ours.
 */
defineProps<{ letter: string }>()
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

.letter-badge {
  width: 4.2rem;
  height: 4.2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 2.6rem;
  font-weight: 700;
  border-radius: 1rem;
  color: var(--sour-milk);
  background: var(--dark-blue);

  &.banner {
    width: 6.4rem;
    height: 6.4rem;
    font-size: 4.2rem;
    border-radius: 1.4rem;
  }

  @media screen and (max-width: $tablet) {
    width: 3.4rem;
    height: 3.4rem;
    font-size: 2.2rem;

    &.banner {
      width: 5.4rem;
      height: 5.4rem;
      font-size: 3.6rem;
    }
  }
}
</style>
