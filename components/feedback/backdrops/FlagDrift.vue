<template>
  <div class="flag-drift" aria-hidden="true">
    <div v-for="sketch in sketches" :key="sketch.key" class="sheet" :style="sketch.style">
      <FlagSketch :flag="sketch.flag" :draw-seconds="sketch.seconds" />
    </div>
  </div>
</template>
<script lang="ts" setup>
import FlagSketch from '~~/components/challenge/FlagSketch.vue'
import { forgeFlag } from '~~/lib/flags/forge'
import { seededRandom } from '~~/lib/random'

/** Forged flags drawn on as ink lines, the way the sketch round draws a real
 *  one. Generated rather than real: a wall of real flags is a wall of answers. */
const props = defineProps<{ seed: number }>()

const SHEETS = 5

const sketches = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: SHEETS }, (_, index) => ({
    key: `sheet-${index}`,
    flag: forgeFlag(`flags-${props.seed}-${index}`).svg,
    seconds: 2.6 + random() * 1.8,
    style: {
      left: `${(index % 2 === 0 ? 2 + random() * 16 : 58 + random() * 18).toFixed(1)}%`,
      top: `${(4 + Math.floor(index / 2) * 34 + random() * 8).toFixed(1)}%`,
      width: `${(19 + random() * 11).toFixed(1)}%`,
      transform: `rotate(${(random() * 10 - 5).toFixed(1)}deg)`,
      opacity: (0.5 + random() * 0.4).toFixed(2),
    } as Record<string, string>,
  }))
})
</script>
<style lang="scss" scoped>
.flag-drift {
  inset: 0;
  z-index: 0;
  overflow: hidden;
  position: absolute;
  pointer-events: none;
  opacity: 0.8;
  mask-image: radial-gradient(ellipse 52% 46% at 50% 50%, transparent 40%, black 84%);
}

.sheet {
  position: absolute;
  aspect-ratio: 3 / 2;
}
</style>
