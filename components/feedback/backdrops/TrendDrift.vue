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
      <span class="playhead ambient-loop" :style="lane.playhead" />
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
      playhead: {
        animationDuration: `${(13 + random() * 9).toFixed(2)}s`,
        animationDelay: `${(-random() * 14).toFixed(2)}s`,
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/backdrop' as *;
@use '~/assets/scss/rules/ink' as *;

.trend-drift {
  @include backdrop-field(1, 1.04);
  overflow: hidden;
}

.lane {
  left: -12%;
  width: 124%;
  height: 2.4rem;
  position: absolute;
}

.playhead {
  top: 50%;
  left: 0;
  width: 0.3rem;
  height: 2.2rem;
  position: absolute;
  border-radius: 999px;
  background: var(--hior-ange);
  box-shadow: 0 0 0.9rem 0.3rem color-mix(in srgb, var(--hior-ange) 35%, transparent);
  animation: playhead-sweep 16s linear infinite;
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

// translate, not `left`: `left` relayouts the lane every frame.
@keyframes playhead-sweep {
  from {
    opacity: 0;
    translate: 0 -50%;
  }
  6%,
  94% {
    opacity: 1;
  }
  to {
    opacity: 0;
    translate: calc(100vw + 12%) -50%;
  }
}
</style>
