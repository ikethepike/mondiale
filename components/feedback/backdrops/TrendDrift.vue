<template>
  <div class="trend-drift" aria-hidden="true">
    <div v-for="lane in lanes" :key="lane.key" class="lane" :style="lane.style">
      <span class="rail" />
      <span v-for="tick in lane.ticks" :key="tick.key" class="tick" :style="tick.style" />
      <span
        v-for="mark in lane.marks"
        :key="mark.key"
        class="mark"
        :class="mark.kind"
        :style="mark.style"
      />
    </div>
  </div>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/** Timelines: rails with year ticks, events settling onto the line. */
const props = defineProps<{ seed: number }>()

const LANES = 5
const TICKS = 13

const lanes = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: LANES }, (_, index) => {
    const ticks = Array.from({ length: TICKS }, (_, tick) => ({
      key: `t${tick}`,
      style: {
        left: `${((tick / (TICKS - 1)) * 100).toFixed(2)}%`,
        height: tick % 4 === 0 ? '1.1rem' : '0.55rem',
        opacity: tick % 4 === 0 ? '0.7' : '0.4',
      } as Record<string, string>,
    }))
    const marks = Array.from({ length: 4 + Math.floor(random() * 3) }, (_, mark) => ({
      key: `m${mark}`,
      kind: random() > 0.72 ? 'major' : 'minor',
      style: {
        left: `${(4 + random() * 92).toFixed(1)}%`,
        '--at': `${(0.2 + index * 0.12 + random() * 0.3).toFixed(2)}s`,
      } as Record<string, string>,
    }))
    return {
      key: `lane-${index}`,
      ticks,
      marks,
      style: {
        top: `${6 + index * 21}%`,
        opacity: (0.7 + random() * 0.3).toFixed(2),
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.trend-drift {
  mask-image: radial-gradient(ellipse 52% 46% at 50% 50%, transparent 40%, black 84%);
  inset: 0;
  z-index: 0;
  overflow: hidden;
  position: absolute;
  pointer-events: none;
  opacity: 1;
}

.lane {
  left: -12%;
  width: 124%;
  height: 2.4rem;
  position: absolute;
}

.rail {
  top: 50%;
  left: 0;
  right: 0;
  height: 0.2rem;
  position: absolute;
  background: ink(0.42);
}

.tick {
  top: 50%;
  width: 0.2rem;
  position: absolute;
  background: ink(0.42);
  transform: translateY(-50%);
}

.mark {
  top: 50%;
  position: absolute;
  border-radius: 50%;
  animation: mark-settle 0.55s var(--ease-out-expressive) var(--at, 0s) backwards;
}

.minor {
  width: 0.7rem;
  height: 0.7rem;
  margin: -0.35rem 0 0 -0.35rem;
  background: ink(0.5);
}

.major {
  width: 1.15rem;
  height: 1.15rem;
  margin: -0.575rem 0 0 -0.575rem;
  background: var(--hior-ange);
}

@keyframes mark-settle {
  from {
    opacity: 0;
    translate: 0 -0.7rem;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}
</style>
