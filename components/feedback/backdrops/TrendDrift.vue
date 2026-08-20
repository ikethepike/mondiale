<template>
  <div class="trend-drift" aria-hidden="true">
    <div v-for="lane in lanes" :key="lane.key" class="lane" :style="lane.style">
      <div class="strip ambient-loop" :style="lane.strip">
        <!-- Twice through, so the pan closes on itself with no seam. -->
        <template v-for="pass in 2" :key="pass">
          <span class="rail" :style="{ left: `${(pass - 1) * 50}%` }" />
          <span
            v-for="tick in lane.ticks"
            :key="`t${pass}-${tick.key}`"
            class="tick"
            :style="{ ...tick.style, left: `${(pass - 1) * 50 + tick.at}%` }"
          />
          <span
            v-for="mark in lane.marks"
            :key="`m${pass}-${mark.key}`"
            class="mark"
            :class="mark.kind"
            :style="{ left: `${(pass - 1) * 50 + mark.at}%` }"
          />
        </template>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/** Timelines panning past, each at its own pace. */
const props = defineProps<{ seed: number }>()

const LANES = 5
const TICKS = 15

const lanes = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: LANES }, (_, index) => {
    const ticks = Array.from({ length: TICKS }, (_, tick) => ({
      key: `t${tick}`,
      at: (tick / TICKS) * 50,
      style: {
        height: tick % 4 === 0 ? '1.1rem' : '0.55rem',
        opacity: tick % 4 === 0 ? '0.7' : '0.4',
      } as Record<string, string>,
    }))
    const marks = Array.from({ length: 5 + Math.floor(random() * 3) }, (_, mark) => ({
      key: `m${mark}`,
      at: 1 + random() * 47,
      kind: random() > 0.72 ? 'major' : 'minor',
    }))
    return {
      key: `lane-${index}`,
      ticks,
      marks,
      style: {
        top: `${6 + index * 21}%`,
        opacity: (0.7 + random() * 0.3).toFixed(2),
      } as Record<string, string>,
      strip: {
        animationDuration: `${(38 + random() * 30).toFixed(2)}s`,
        animationDelay: `${(-random() * 40).toFixed(2)}s`,
        animationDirection: index % 2 ? 'reverse' : 'normal',
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
  left: 0;
  right: 0;
  height: 2.4rem;
  position: absolute;
}

.strip {
  inset: 0;
  width: 200%;
  position: absolute;
  animation: strip-pan 50s linear infinite;
}

.rail {
  top: 50%;
  width: 50%;
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
  translate: -50% -50%;
}

.minor {
  width: 0.7rem;
  height: 0.7rem;
  background: ink(0.5);
}

.major {
  width: 1.15rem;
  height: 1.15rem;
  background: var(--hior-ange);
}

// Half, because the strip is drawn twice.
@keyframes strip-pan {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(-50%, 0, 0);
  }
}
</style>
