<template>
  <header class="challenge-result" :class="status">
    <!-- One stamped document. The verdict is the card's head, the facts are its
         body under a hairline, and the stamp rides the head row as ink beside the
         words. The card is a single block centred by margin, so the verdict, the
         lesson and the ripple all share one axis — the centring is computed on
         the card, never on a padding box the stamp gets to widen. -->
    <div ref="dossier" class="verdict-dossier">
      <div class="head-zone">
        <ContourRipple v-if="status === 'correct'" class="ripple" :delay="0.45" />
        <div class="verdict">
          <h1 ref="verdictLine" class="verdict-line">{{ message }}</h1>
          <VerdictStamp :key="status" class="stamp" :status="status" />
        </div>
      </div>
      <!-- The teachable moment: the actual facts behind the verdict. Gate on
           rendered content, not just slot presence — the slotted reveals are
           themselves v-if'd, so $slots.default is truthy even when it renders
           nothing, which would leave an empty body and a stray divider. -->
      <div v-if="hasLesson" class="lesson">
        <slot />
      </div>
    </div>
  </header>
</template>
<script lang="ts" setup>
import { Comment, Text } from 'vue'
import { gsap } from 'gsap'
import { EASE, prefersReducedMotion } from '~~/lib/motion'
import ContourRipple from './ContourRipple.vue'
import VerdictStamp from './VerdictStamp.vue'

/**
 * Shared correct/incorrect result moment. The choreography around it:
 * t=0 the map wash starts (the parent sets gameStore.map.status just before
 * mounting this), t≈0.15s the dossier rises in, t≈0.3s the reveal card in
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
// v-if) and whitespace-only text, which otherwise leave an empty lesson body.
const slots = useSlots()
const hasLesson = computed(() => {
  const nodes = slots.default?.() ?? []
  return nodes.some(node => {
    if (node.type === Comment) return false
    if (node.type === Text) return String(node.children).trim() !== ''
    return true
  })
})

const dossier = ref<HTMLElement>()
const verdictLine = ref<HTMLElement>()

onMounted(() => {
  if (!dossier.value || prefersReducedMotion()) return

  // The card rises as one unit; the letter-spacing settle is the verdict line's
  // alone. Tweening it on the card would smear the lesson body's text too — the
  // body is inside the animated element now, which it was not before.
  gsap.fromTo(
    dossier.value,
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, delay: 0.15, duration: 0.4, ease: EASE.enter }
  )

  if (!verdictLine.value) return
  gsap.fromTo(
    verdictLine.value,
    { letterSpacing: '0.06em' },
    {
      letterSpacing: '0em',
      delay: 0.15,
      duration: 0.4,
      ease: props.status === 'correct' ? EASE.enter : EASE.cross,
      clearProps: 'letterSpacing',
    }
  )
})

onUnmounted(() => {
  if (dossier.value) gsap.killTweensOf(dossier.value)
  if (verdictLine.value) gsap.killTweensOf(verdictLine.value)
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

// Matches $paneBorderRadius in templates/_pane.scss. Inlined rather than @use'd:
// importing that file into a scoped block would re-emit the whole .pane recipe.
$dossierRadius: 1.9rem;

.challenge-result {
  position: relative;
}

// The document. Centred as a BLOCK via margin, which is the whole fix: the old
// card was an inline-block whose padding box got centred, so the stamp's
// asymmetric reserve pushed the visible verdict 1.2rem off the axis the lesson
// and the ripple were centred on.
.verdict-dossier {
  @include caption-surface($dossierRadius);
  display: block;
  width: max-content;
  // 100% keeps it inside (and centred in) padded ancestors — the host view's
  // header padding also lands on this nested header's border box.
  max-width: min(60rem, 100%, calc(100vw - 3.2rem));
  margin-inline: auto;
  color: var(--dark-blue);
  // Hosts render under .main-board's pointer-events: none — the slotted reveals
  // (sunset/nocturne/made) are scroll containers and need touches.
  pointer-events: auto;
  // A document reads ragged-right. This is the one place the inherited centring
  // from ChallengePrompt is overridden, and it carries the lesson body with it.
  text-align: left;
}

// Exists so the ripple gets a box that is exactly the head's box: the flourish
// belongs to the verdict, not to the middle of a dossier that may be tall.
.head-zone {
  position: relative;
}

// The stamp is an in-flow flex item, not an absolute overlay. That is what keeps
// the ink from ever landing on the words (the old corner stamp did, at phone
// width), removes the need for any clipping ancestor — which the slotted
// scrollers would have had to live inside — and leaves the card free to centre.
.verdict {
  gap: 2rem;
  display: flex;
  align-items: center;
  padding: 1rem 2.2rem;
  justify-content: space-between;
}

.verdict-line {
  margin: 0;
  min-width: 0;
  font-size: var(--caption-display);

  .challenge-result.incorrect & {
    color: var(--hior-ange);
  }
}

// flex: none so a long verdict squeezes the words, never the stamp.
//
// Deliberately no `opacity` here: VerdictStamp's own stamp-thump keyframes end at
// opacity 1 with `both` fill, so a knocked-back value would win only until the
// thump lands — and would then persist under prefers-reduced-motion, where the
// animation is off. The result was a stamp that looked faded in one motion mode
// and solid in the other. Restyle the stamp inside VerdictStamp, not from here.
.stamp {
  flex: none;
  width: 4.8rem;
  height: 4.8rem;
}

// The divider belongs to the body, so a verdict with no lesson is just a head
// with no stray rule under it.
.lesson {
  font-size: 1.7rem;
  line-height: 1.5;
  padding: 0.9rem 2.2rem 1.1rem;
  border-top: 0.1rem solid $hairline;
}

.ripple {
  top: 50%;
  left: 50%;
  width: 22rem;
  height: 22rem;
  position: absolute;
  transform: translate(-50%, -50%);
}
</style>
