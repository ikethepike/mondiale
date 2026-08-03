<template>
  <div v-if="!watching" ref="root" class="intro-overlay interstitial" :class="tone" @click="skip">
    <ContourRipple class="ripple" :tone="tone === 'alert' ? 'alert' : 'success'" :delay="0.35" />
    <div class="content">
      <span data-interstitial class="kicker map-caption">
        {{ kicker }}
        <!-- A mode may toss its emblem onto the sign's corner. -->
        <span v-if="$slots.emblem" class="kicker-emblem"><slot name="emblem" /></span>
      </span>
      <h1 data-interstitial>{{ title }}</h1>
      <hr data-interstitial />
      <p data-interstitial class="stakes">{{ stakes }}</p>
      <small data-interstitial class="skip-hint">Tap to continue</small>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { useIntroBeat } from '~~/lib/use-intro-beat'
import { useGameStore } from '~~/store/game.store'
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

// Watch mode: the booth's inert wrapper would make "tap to continue"
// unskippable and every director cut would replay the beat — so the one
// interstitial home skips itself and fires `done` immediately, letting every
// view's state machine proceed exactly as if the beat had played.
const gameStore = useGameStore()
const watching = computed(() => gameStore.watching)
if (watching.value) onMounted(() => emit('done'))

const root = ref<HTMLElement>()
const { skip } = useIntroBeat(
  root,
  { pieceSelector: '[data-interstitial]', holdFor: () => props.holdFor },
  () => emit('done')
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
// Shell geometry comes from templates/_intro-overlay.scss
.interstitial {
  background: milk(0.75);
}

.ripple {
  top: 50%;
  left: 50%;
  width: min(46rem, 100vw);
  height: min(46rem, 100vw);
  position: absolute;
  transform: translate(-50%, -50%);
}

.kicker {
  position: relative;
}

.kicker-emblem {
  top: -2.4rem;
  right: -2rem;
  position: absolute;
  // Tossed onto the sign's corner — a tilt keeps the silhouette readable
  // where a full 45° hang dissolved it.
  transform: rotate(14deg);

  :deep(svg) {
    width: 4.6rem;
  }
}

.kicker {
  padding: 0.4rem 1.6rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: bold;
}

.alert .kicker {
  color: var(--hior-ange);
  border-color: flame(0.35);
}

.info .kicker {
  color: var(--soft-blue);
  border-color: hsla(197.6, 51.2%, 41.8%, 0.35);
}

h1 {
  color: var(--dark-blue);
}

hr {
  border-top-color: var(--hior-ange);
}

.info hr {
  border-top-color: var(--soft-blue);
}

.stakes {
  color: var(--dark-blue);
}

.skip-hint {
  opacity: 0.55;
}
</style>
