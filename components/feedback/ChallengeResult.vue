<template>
  <header class="challenge-result" :class="status">
    <ContourRipple v-if="status === 'correct'" class="ripple" :delay="0.45" />
    <h1 ref="heading" class="map-caption">{{ message }}</h1>
    <!-- The teachable moment: the actual facts behind the verdict. Gate on
         rendered content, not just slot presence — the slotted reveals are
         themselves v-if'd, so $slots.default is truthy even when it renders
         nothing, which would leave an empty pill behind. -->
    <p v-if="hasLesson" class="lesson map-caption">
      <slot />
    </p>
  </header>
</template>
<script lang="ts" setup>
import { Comment, Text } from 'vue'
import { gsap } from 'gsap'
import { EASE, prefersReducedMotion } from '~~/lib/motion'
import ContourRipple from './ContourRipple.vue'

/**
 * Shared correct/incorrect result moment. The choreography around it:
 * t=0 the map wash starts (the parent sets gameStore.map.status just before
 * mounting this), t≈0.15s this heading rises in, t≈0.3s the reveal card in
 * layouts/default.vue slides up (CSS delay), t≈0.45s the ripple plays.
 */
const props = defineProps({
  status: {
    type: String as PropType<'correct' | 'incorrect'>,
    required: true,
  },
  incorrectMessage: {
    type: String,
    default: 'Not quite.',
  },
  correctMessage: {
    type: String,
    default: 'Correct!',
  },
})

const message = computed(() =>
  props.status === 'correct' ? props.correctMessage : props.incorrectMessage
)

// Whether the slot renders any real content. $slots.default is always truthy
// when the parent supplies slot markup, but the slotted reveals are v-if'd —
// so we inspect the produced VNodes and ignore comment placeholders (from
// v-if) and whitespace-only text, which otherwise leave an empty lesson pill.
const slots = useSlots()
const hasLesson = computed(() => {
  const nodes = slots.default?.() ?? []
  return nodes.some(node => {
    if (node.type === Comment) return false
    if (node.type === Text) return String(node.children).trim() !== ''
    return true
  })
})

const heading = ref<HTMLElement>()

onMounted(() => {
  if (!heading.value || prefersReducedMotion()) return

  gsap.fromTo(
    heading.value,
    { opacity: 0, y: 16, letterSpacing: '0.06em' },
    {
      opacity: 1,
      y: 0,
      letterSpacing: '0em',
      delay: 0.15,
      duration: 0.4,
      ease: props.status === 'correct' ? EASE.enter : EASE.cross,
      clearProps: 'letterSpacing',
    }
  )
})

onUnmounted(() => {
  if (heading.value) gsap.killTweensOf(heading.value)
})
</script>
<style lang="scss" scoped>
.challenge-result {
  position: relative;
  text-align: center;

  h1 {
    margin: 0;
    position: relative;
  }

  &.incorrect h1 {
    color: var(--hior-ange);
  }

  .lesson {
    // .map-caption is inline-block — without this the lesson pill lands on
    // the SAME line as the "Correct!" pill whenever the two fit side by side
    display: block;
    position: relative;
    margin: 1.2rem auto 0;
    width: max-content;
    // 100% keeps it inside (and centered in) padded ancestors — the host
    // view's header padding also lands on this nested header's border box.
    max-width: min(60rem, 100%, calc(100vw - 3.2rem));
    font-size: 1.7rem;
    line-height: 1.5;
    padding: 0.6rem 1.6rem;
  }

  .ripple {
    top: 50%;
    left: 50%;
    width: 22rem;
    height: 22rem;
    position: absolute;
    transform: translate(-50%, -50%);
  }
}
</style>
