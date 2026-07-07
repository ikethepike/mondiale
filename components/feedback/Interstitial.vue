<template>
  <div ref="root" class="interstitial" :class="tone" @click="skip">
    <ContourRipple class="ripple" :tone="tone === 'alert' ? 'alert' : 'success'" :delay="0.35" />
    <div class="content">
      <span data-interstitial class="kicker map-caption">{{ kicker }}</span>
      <h1 data-interstitial>{{ title }}</h1>
      <hr data-interstitial />
      <p data-interstitial class="stakes">{{ stakes }}</p>
      <small data-interstitial class="skip-hint">Tap to continue</small>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import { EASE, prefersReducedMotion } from '~~/lib/motion'
import ContourRipple from './ContourRipple.vue'

/**
 * Full-screen beat announcing what's about to happen — a round starting,
 * pawns moving, a challenge with a win-or-fail state at the end. Auto
 * advances; a tap skips ahead. 'alert' (coral) marks challenges, 'info'
 * (blue) marks everything else.
 */
const props = defineProps({
  kicker: {
    type: String,
    default: 'Challenge!',
  },
  title: {
    type: String,
    required: true,
  },
  stakes: {
    type: String,
    required: true,
  },
  tone: {
    type: String as PropType<'alert' | 'info'>,
    default: 'alert',
  },
  /** Seconds before auto-advancing. */
  holdFor: {
    type: Number,
    default: 3.2,
  },
})

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
  if (!root.value || prefersReducedMotion()) {
    setTimeout(finish, prefersReducedMotion() ? 1200 : 0)
    return
  }

  const pieces = root.value.querySelectorAll('[data-interstitial]')
  timeline = gsap.timeline({ onComplete: finish })
  timeline.fromTo(root.value, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: EASE.cross })
  timeline.fromTo(
    pieces,
    { opacity: 0, y: 22, scale: 0.96 },
    { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: EASE.enter, stagger: 0.1 },
    '<0.1'
  )
  timeline.fromTo(
    root.value.querySelector('hr'),
    { scaleX: 0 },
    { scaleX: 1, duration: 0.45, ease: EASE.cross },
    '<0.25'
  )
  timeline.to(root.value, {
    opacity: 0,
    duration: 0.35,
    ease: EASE.exit,
    delay: props.holdFor,
  })
})

onUnmounted(() => {
  timeline?.kill()
  if (root.value) gsap.killTweensOf(root.value)
})
</script>
<style lang="scss" scoped>
.interstitial {
  top: 0;
  left: 0;
  z-index: 20;
  width: 100%;
  height: 100vh;
  display: flex;
  position: absolute;
  align-items: center;
  pointer-events: auto;
  justify-content: center;
  backdrop-filter: blur(0.8rem);
  background: hsla(36, 100%, 98%, 0.75);
}

.ripple {
  top: 50%;
  left: 50%;
  width: 46rem;
  height: 46rem;
  position: absolute;
  transform: translate(-50%, -50%);
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
  padding: 0.4rem 1.6rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: bold;
}

.alert .kicker {
  color: var(--hior-ange);
  border-color: hsla(9.8, 81.3%, 60.2%, 0.35);
}

.info .kicker {
  color: var(--soft-blue);
  border-color: hsla(197.6, 51.2%, 41.8%, 0.35);
}

h1 {
  margin: 0;
  font-size: 4.2rem;
  color: var(--dark-blue);
}

hr {
  width: 12rem;
  border: none;
  margin: 0;
  border-top: 0.2rem solid var(--hior-ange);
}

.info hr {
  border-top-color: var(--soft-blue);
}

.stakes {
  margin: 0;
  font-size: 1.9rem;
  color: var(--dark-blue);
}

.skip-hint {
  opacity: 0.55;
}
</style>
