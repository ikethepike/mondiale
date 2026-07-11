<template>
  <div ref="root" class="gauntlet-intro" @click="skip">
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
import { EASE, prefersReducedMotion } from '~~/lib/motion'

/**
 * The gauntlet's opening beat: two premiere spotlights rise from behind the
 * title and swing outward while the copy settles. Players see this every run,
 * so it's one sweep and a hold — no loops, ≤4s. Reduced motion gets static
 * crossed beams and a plain fade.
 */
defineProps<{ questions: number; lives: number }>()

const emit = defineEmits<{ done: [] }>()

const root = ref<HTMLElement>()
let timeline: gsap.core.Timeline | undefined
let finished = false

const finish = () => {
  if (finished) return
  finished = true
  emit('done')
}

const skip = () => {
  timeline?.progress(1)
  finish()
}

onMounted(() => {
  if (!root.value) return finish()
  const left = root.value.querySelector('.beam.left')
  const right = root.value.querySelector('.beam.right')
  const pieces = root.value.querySelectorAll('[data-intro]')

  if (prefersReducedMotion()) {
    gsap.set([left, right], { opacity: 0.5 })
    gsap.set(pieces, { opacity: 1 })
    setTimeout(finish, 2400)
    return
  }

  timeline = gsap.timeline({ onComplete: finish })
  timeline.fromTo(root.value, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: EASE.cross })
  // The spotlights rise crossed behind the title, then swing outward
  timeline.fromTo(
    [left, right],
    { opacity: 0, y: 160 },
    { opacity: 1, y: 0, duration: 0.7, ease: EASE.enter },
    '<0.1'
  )
  timeline.fromTo(left, { rotation: 20 }, { rotation: -16, duration: 2.4, ease: EASE.cross }, '<')
  timeline.fromTo(right, { rotation: -20 }, { rotation: 16, duration: 2.4, ease: EASE.cross }, '<')
  timeline.fromTo(
    pieces,
    { opacity: 0, y: 22, scale: 0.96 },
    { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: EASE.enter, stagger: 0.1 },
    '<0.4'
  )
  timeline.fromTo(
    root.value.querySelector('hr'),
    { scaleX: 0 },
    { scaleX: 1, duration: 0.45, ease: EASE.cross },
    '<0.25'
  )
  timeline.to(root.value, { opacity: 0, duration: 0.35, ease: EASE.exit, delay: 1.4 })
})

onUnmounted(() => {
  timeline?.kill()
  if (root.value) gsap.killTweensOf(root.value)
})
</script>
<style lang="scss" scoped>
.gauntlet-intro {
  top: 0;
  left: 0;
  z-index: 20;
  width: 100%;
  height: var(--viewport-height);
  display: flex;
  position: absolute;
  overflow: hidden;
  align-items: center;
  pointer-events: auto;
  justify-content: center;
  backdrop-filter: blur(0.8rem);
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

.content {
  gap: 1.6rem;
  display: flex;
  position: relative;
  text-align: center;
  align-items: center;
  flex-flow: column nowrap;
  max-width: 64rem;
  padding: 0 3rem;
}

.kicker {
  color: hsla(45, 96%, 76%, 0.95);
  font-size: 1.4rem;
  font-weight: bold;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(2.6rem, 7vw, 4.2rem);
  color: hsla(36, 100%, 97%, 0.97);
  text-shadow: 0 0.2rem 2.4rem hsla(216, 58%, 5%, 0.8);
}

hr {
  width: 12rem;
  border: none;
  margin: 0;
  border-top: 0.2rem solid hsla(45, 96%, 76%, 0.9);
}

.stakes {
  margin: 0;
  font-size: 1.9rem;
  color: hsla(36, 100%, 94%, 0.88);
}

.hearts {
  margin-right: 0.6rem;
}

.heart {
  color: hsla(9.8, 81.3%, 64%, 1);
  margin-right: 0.2rem;
}

.skip-hint {
  opacity: 0.45;
  color: hsla(36, 100%, 94%, 0.88);
}
</style>
