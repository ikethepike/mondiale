<template>
  <div class="trend-drift" aria-hidden="true">
    <div v-for="lane in lanes" :key="lane.key" class="lane" :style="lane.style">
      <!-- The rail is the century; the ticks are the years on it. -->
      <span class="rail" />
      <span v-for="tick in lane.ticks" :key="tick.key" class="tick" :style="tick.style" />
      <!-- Events sit ON the rail, the way a placed card does in the round.
           Each rises into place on its own delay — the settling motion the
           timeline itself has, slowed to the speed of a background. -->
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

/**
 * The trends card's ground: chronology, drawn as chronology.
 *
 * The first version was a sheaf of random-walk lines — a stack of sparklines,
 * which said "data" but never said "time", and crowded into the top third
 * where it read as a tangle. The group's own centre of gravity is the timeline
 * round: event cards placed along a year axis. So the ground is that axis —
 * rails with ticks marching across them and events seated on the line.
 *
 * The events settle rather than appear. A timeline is the one round where the
 * whole motion is a card finding its slot, and a backdrop that simply exists
 * misses what the category feels like; each mark rises the last few pixels
 * into its place on its own delay, so something is always arriving.
 *
 * Generated, not read from EVENTS: which year a thing happened in is precisely
 * what the round asks, and a real chronology in the background would be a
 * cheat sheet.
 */
const props = defineProps<{ seed: number }>()

const LANES = 5
const TICKS = 13

const lanes = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: LANES }, (_, index) => {
    // Ticks march evenly — a year axis is regular, and jittering it would say
    // "sketch" where the round says "sequence".
    const ticks = Array.from({ length: TICKS }, (_, tick) => ({
      key: `t${tick}`,
      style: {
        left: `${((tick / (TICKS - 1)) * 100).toFixed(2)}%`,
        // Every fourth tick is the era marker, taller than its neighbours.
        height: tick % 4 === 0 ? '1.1rem' : '0.55rem',
        opacity: tick % 4 === 0 ? '0.7' : '0.4',
      } as Record<string, string>,
    }))
    const marks = Array.from({ length: 4 + Math.floor(random() * 3) }, (_, mark) => ({
      key: `m${mark}`,
      // A few events are the big ones — a war, a founding — and read larger.
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
        // Lanes drift at their own pace, so the field never marches in step.
        opacity: (0.7 + random() * 0.3).toFixed(2),
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.trend-drift {
  // Paints its own ground: the shell's backdrop blur is ~90% of the frame
  // budget at 4x throttle, and an opaque field makes it unnecessary.
  background: var(--sour-milk);
  inset: 0;
  z-index: 0;
  overflow: hidden;
  position: absolute;
  pointer-events: none;
  opacity: 1;
}

.trend-drift > * {
  mask-image: radial-gradient(ellipse 52% 46% at 50% 50%, transparent 40%, black 84%);
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
  // Resting state is seated on the rail; the animation only lifts it off and
  // sets it back, so a stopped card still shows a placed timeline.
  opacity: 0;
  animation: mark-settle 0.55s var(--ease-out-expressive) var(--at, 0s) forwards;
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

@keyframes lane-drift {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(-8%, 0, 0);
  }
}

// The settle: up a little, then back down onto the line.
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
