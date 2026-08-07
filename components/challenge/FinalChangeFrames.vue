<template>
  <article class="frame-stage">
    <!-- Both frames are stacked and identically framed; only the later one
         animates, so the pair never blinks through to the page mid-cross. -->
    <img class="frame" :src="challenge.frames[0]" :alt="EARLIER_ALT" />
    <img
      ref="laterFrame"
      class="frame later"
      :class="{ still: paused || reducedMotion, shown: manualLater }"
      :src="challenge.frames[1]"
      :alt="LATER_ALT"
      :style="{ animationDuration: `${challenge.crossfadeSeconds * 2}s` }"
    />
    <span v-if="challenge.frameYears" class="years" aria-hidden="true">
      <em :class="{ lit: !showingLater }">{{ challenge.frameYears[0] }}</em>
      <i>→</i>
      <em :class="{ lit: showingLater }">{{ challenge.frameYears[1] }}</em>
    </span>
    <!-- Reduced motion swaps the loop for a control the player drives -->
    <button
      v-if="reducedMotion && !paused"
      type="button"
      class="swap map-caption"
      @click="manualLater = !manualLater"
    >
      {{ manualLater ? 'Show the earlier frame' : 'Show the later frame' }}
    </button>
  </article>
</template>
<script lang="ts" setup>
import { prefersReducedMotion } from '~~/lib/motion'
import type { ChangeChallenge } from '~~/types/challenges/final-challenge.type'

/**
 * The crossfading pair itself, with its year chips and its reduced-motion
 * control — everything that is the subject, and nothing about where it
 * stands. Split out of FinalChangeStage so the same frames can hang on the
 * desktop side rail or inside the phone's dock without the animation
 * bookkeeping being written twice.
 *
 * Fills its host: the side stage and the dock frame each size it.
 */
const props = defineProps<{ challenge: ChangeChallenge; paused: boolean }>()

const EARLIER_ALT = 'Satellite view of a place, the earlier of two frames'
const LATER_ALT = 'The same place years later, the second of two frames'

const reducedMotion = prefersReducedMotion()
const manualLater = ref(false)
const laterFrame = ref<HTMLImageElement>()

/**
 * Which frame the year chips light. Read from the fading element itself rather
 * than a timer beside it: a `setInterval` at half the period drifts against
 * the compositor, and even in phase it disagreed with the picture for the
 * tail of every cycle, since the frame starts fading back at 88% while a
 * half-period tick only flips at 100%.
 */
const showingLater = ref(false)
let raf: number | undefined

const trackFrame = () => {
  const el = laterFrame.value
  if (el) {
    const [animation] = el.getAnimations()
    const period = props.challenge.crossfadeSeconds * 2 * 1000
    const t = Number(animation?.currentTime ?? 0) % period
    // The later frame is opaque across the keyframe's 50%–88% hold
    showingLater.value = t / period >= 0.5 && t / period < 0.88
  }
  raf = requestAnimationFrame(trackFrame)
}

watch(
  [() => props.paused, () => props.challenge.slug],
  () => {
    if (raf) cancelAnimationFrame(raf)
    raf = undefined
    showingLater.value = false
    if (props.paused || reducedMotion) return
    raf = requestAnimationFrame(trackFrame)
  },
  { immediate: true }
)

watch(manualLater, value => {
  if (reducedMotion) showingLater.value = value
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.frame-stage {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  border-radius: 0.6rem;
  background: ink(0.08);
  border: 0.1rem solid ink(0.25);
  box-shadow: 0 0.4rem 2.4rem ink(0.18);
}

.frame {
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  position: absolute;
}

// Only the later frame moves; `frame-cross` lives in rules/_animations.scss.
// The period is the round's own crossfadeSeconds, bound inline.
.frame.later {
  opacity: 0;
  animation: frame-cross 5s var(--ease-smooth) infinite;

  &.still {
    animation: none;
  }

  &.shown {
    opacity: 1;
  }
}

.years {
  gap: 0.6rem;
  left: 50%;
  bottom: 0.8rem;
  display: flex;
  position: absolute;
  padding: 0.3rem 1rem;
  align-items: center;
  border-radius: 0.6rem;
  background: milk(0.88);
  color: var(--dark-blue);
  transform: translateX(-50%);
  font-variant-numeric: tabular-nums;

  em {
    opacity: 0.4;
    font-style: normal;
    font-size: 1.4rem;
    transition: opacity var(--motion-base) var(--ease-smooth);

    &.lit {
      opacity: 1;
      font-weight: bold;
    }
  }

  i {
    opacity: 0.5;
    font-style: normal;
  }
}

.swap {
  top: 0.8rem;
  right: 0.8rem;
  cursor: pointer;
  position: absolute;
  padding: 0.4rem 0.9rem;
  border-radius: 0.6rem;
  background: milk(0.9);
  color: var(--dark-blue);
  border: 0.1rem solid ink(0.2);
}
</style>
