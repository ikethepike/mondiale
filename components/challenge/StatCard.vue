<template>
  <component :is="tag" class="stat-card">
    <StatTopicIcon v-if="topic" class="topic-icon" :topic="topic" />
    <span v-if="label" class="stat-label">{{ label }}</span>
    <slot />
  </component>
</template>
<script lang="ts" setup>
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'

/**
 * The shared stat card: cream surface, hairline border, small-caps label and
 * a thin-outline topic emblem in the corner. Stat Detective's clues and Two
 * Truths' claims are both built on it — behavioural styling (hover lifts,
 * verdict washes, stack positioning) stays with the host view.
 */
withDefaults(defineProps<{ label?: string; topic?: string; tag?: string }>(), {
  label: undefined,
  topic: undefined,
  tag: 'article',
})
</script>
<style lang="scss" scoped>
.stat-card {
  gap: 0.6rem;
  width: 100%;
  display: flex;
  padding: 1.6rem;
  position: relative;
  text-align: center;
  align-items: center;
  font-family: inherit;
  border-radius: 1.2rem;
  flex-flow: column nowrap;
  color: var(--dark-blue);
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.88);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
}

.topic-icon {
  top: 1rem;
  left: 1rem;
  opacity: 0.45;
  position: absolute;
  color: var(--dark-blue);
}

.stat-label {
  opacity: 0.65;
  font-size: 1.3rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  // Clear the corner emblem on both sides so long, wrapping labels stay
  // centred instead of running underneath it.
  padding: 0 2.8rem;
}
</style>
