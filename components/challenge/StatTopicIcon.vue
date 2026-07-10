<template>
  <svg class="stat-topic-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path v-for="(d, index) in paths" :key="index" :d="d" />
    <circle v-for="(c, index) in circles" :key="`c${index}`" :cx="c[0]" :cy="c[1]" :r="c[2]" />
  </svg>
</template>
<script lang="ts" setup>
/**
 * Thin-outline emblem for a stat topic (the `topic` field on challenge
 * details), drawn in the same stroke language as the pole arrows and zoom
 * controls. Unknown topics fall back to a small bar chart.
 */
const props = defineProps<{ topic: string }>()

interface Glyph {
  paths?: string[]
  circles?: [number, number, number][]
}

const GLYPHS: Record<string, Glyph> = {
  economics: {
    paths: ['M3.5 7.5h17v10h-17z', 'M6.5 7.5v-2'],
    circles: [[12, 12.5, 2.6]],
  },
  education: {
    paths: [
      'M12 6.5C10 4.8 6.5 4.5 4 5.4v13c2.5-.9 6-.6 8 1.1 2-1.7 5.5-2 8-1.1v-13c-2.5-.9-6-.6-8 1.1z',
      'M12 6.5v13',
    ],
  },
  energy: {
    paths: ['M13 3 6.5 13.5h5L10.5 21l7-10.5h-5z'],
  },
  environment: {
    paths: ['M5 19C5 10.5 10.5 5 19.5 4.5 19.5 13.5 14 19 5.5 19z', 'M5 19c3-5 6-8 10-10'],
  },
  gender: {
    paths: [
      'M4.5 18c0-3 1.5-4.5 4-4.5 1.1 0 2 .3 2.7.8',
      'M19.5 18c0-3-1.5-4.5-4-4.5-1.1 0-2 .3-2.7.8',
    ],
    circles: [
      [8.5, 8, 2.5],
      [15.5, 8, 2.5],
    ],
  },
  geography: {
    paths: ['M3 18 8.5 8l4 6.5', 'M10.5 18 15 10.5 21 18', 'M3 18h18'],
  },
  health: {
    paths: [
      'M12 19.5C7 15.5 4 12.5 4 9.5 4 7 6 5.5 8 5.5c1.6 0 3.2.9 4 2.5.8-1.6 2.4-2.5 4-2.5 2 0 4 1.5 4 4 0 3-3 6-8 10z',
    ],
  },
  infrastructure: {
    paths: ['M3 17h18', 'M6 17v-6', 'M18 17v-6', 'M4 11c3.5-4 12.5-4 16 0'],
  },
  people: {
    paths: ['M5.5 19.5c0-4 2.5-6 6.5-6s6.5 2 6.5 6'],
    circles: [[12, 7.5, 3]],
  },
  religion: {
    paths: ['M12 3l1.8 7.2L21 12l-7.2 1.8L12 21l-1.8-7.2L3 12l7.2-1.8z'],
  },
  unemployment: {
    paths: ['M4 8.5h16v10H4z', 'M9 8.5V7c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2v1.5', 'M4 13h16'],
  },
  photo: {
    paths: ['M3.5 7.5h17v11h-17z', 'M8.5 7.5 10 5h4l1.5 2.5'],
    circles: [[12, 13, 3.2]],
  },
}

const FALLBACK: Glyph = { paths: ['M5 19v-7', 'M10 19V7', 'M15 19v-5', 'M20 19V9'] }

const glyph = computed(() => GLYPHS[props.topic] ?? FALLBACK)
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
