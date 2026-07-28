<template>
  <div ref="root" class="intro-overlay gauntlet-intro" @click="skip">
    <div class="beam left" aria-hidden="true" />
    <div class="beam right" aria-hidden="true" />
    <div class="content">
      <span data-intro class="kicker">The Final Gauntlet</span>
      <h1 data-intro>
        {{ questions }} {{ questions === 1 ? 'question' : 'questions' }} between you and victory
      </h1>
      <hr data-intro />
      <p data-intro class="stakes">
        <span class="hearts" aria-label="lives">
          <span v-for="index in lives" :key="index" class="heart">♥</span>
        </span>
        {{ lives === 1 ? 'One life absorbs a miss' : `${lives} lives absorb your misses` }} — run
        out and you're back in the race.
      </p>
      <small data-intro class="skip-hint">Tap to continue</small>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import { EASE } from '~~/lib/motion'
import { useIntroBeat } from '~~/lib/use-intro-beat'

/**
 * The gauntlet's opening beat: two premiere spotlights rise from behind the
 * title and swing outward while the copy settles. Players see this every run,
 * so it's one sweep and a hold — no loops, ≤4s. Reduced motion gets static
 * crossed beams and a plain fade.
 */
defineProps<{ questions: number; lives: number }>()

const emit = defineEmits<{ done: [] }>()

const root = ref<HTMLElement>()
const { skip } = useIntroBeat(
  root,
  {
    pieceSelector: '[data-intro]',
    holdFor: () => 1.4,
    // The spotlights lead, so the copy settles a beat later than usual.
    piecesAt: '<0.4',
    decorate: (timeline, shell) => {
      const left = shell.querySelector('.beam.left')
      const right = shell.querySelector('.beam.right')
      // The spotlights rise crossed behind the title, then swing outward
      timeline.fromTo(
        [left, right],
        { opacity: 0, y: 160 },
        { opacity: 1, y: 0, duration: 0.7, ease: EASE.enter },
        '<0.1'
      )
      timeline.fromTo(
        left,
        { rotation: 20 },
        { rotation: -16, duration: 2.4, ease: EASE.cross },
        '<'
      )
      timeline.fromTo(
        right,
        { rotation: -20 },
        { rotation: 16, duration: 2.4, ease: EASE.cross },
        '<'
      )
    },
    reducedMotionHoldMs: 2400,
    onReducedMotion: shell => {
      gsap.set([shell.querySelector('.beam.left'), shell.querySelector('.beam.right')], {
        opacity: 0.5,
      })
      gsap.set(shell.querySelectorAll('[data-intro]'), { opacity: 1 })
    },
  },
  () => emit('done')
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
// Shell geometry comes from templates/_intro-overlay.scss
.gauntlet-intro {
  overflow: hidden;
  background: hsla(216, 58%, 10%, 0.94);
}

.beam {
  left: 50%;
  bottom: -12vh;
  width: 16rem;
  height: 130vh;
  opacity: 0;
  position: absolute;
  pointer-events: none;
  transform-origin: bottom center;
  clip-path: polygon(42% 100%, 58% 100%, 100% 0%, 0% 0%);
  background: linear-gradient(
    to top,
    hsla(45, 96%, 76%, 0.22),
    hsla(45, 96%, 76%, 0.1) 45%,
    transparent 92%
  );
  filter: blur(4px);
}

.beam.left {
  margin-left: -22rem;
}

.beam.right {
  margin-left: 6rem;
}

.kicker {
  color: hsla(45, 96%, 76%, 0.95);
  font-size: 1.4rem;
  font-weight: bold;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

h1 {
  color: hsla(36, 100%, 97%, 0.97);
  text-shadow: 0 0.2rem 2.4rem hsla(216, 58%, 5%, 0.8);
}

hr {
  border-top-color: hsla(45, 96%, 76%, 0.9);
}

.stakes {
  color: hsla(36, 100%, 94%, 0.88);
}

.hearts {
  margin-right: 0.6rem;
}

.heart {
  color: flame(1, 64%);
  margin-right: 0.2rem;
}

.skip-hint {
  opacity: 0.45;
  color: hsla(36, 100%, 94%, 0.88);
}
</style>
