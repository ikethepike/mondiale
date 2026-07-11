<template>
  <svg class="stat-topic-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path v-for="(d, index) in paths" :key="index" :d="d" />
    <circle v-for="(c, index) in circles" :key="`c${index}`" :cx="c[0]" :cy="c[1]" :r="c[2]" />
  </svg>
</template>
<script lang="ts" setup>
/**
 * Thin-outline emblem for a stat, drawn in the same stroke language as the
 * pole arrows and zoom controls. `accessor` picks the stat's bespoke glyph;
 * `topic` is the fallback for topic emblems and the photo/reveal/question
 * utility glyphs. Unknown keys fall back to a small bar chart.
 */
import { resolveGlyph } from '~~/lib/stat-glyphs'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'

const props = defineProps<{ topic?: string; accessor?: GroupChallengeAccessorId }>()

const glyph = computed(() => resolveGlyph(props.accessor, props.topic))
const paths = computed(() => glyph.value.paths ?? [])
const circles = computed(() => glyph.value.circles ?? [])
</script>
<style lang="scss" scoped>
.stat-topic-icon {
  width: 1.8rem;
  height: 1.8rem;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
