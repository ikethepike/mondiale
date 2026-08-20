<template>
  <div
    v-if="!watching"
    ref="root"
    class="intro-overlay interstitial"
    :class="[tone, { dressed: !!backdrop }]"
    @click="skip"
  >
    <component :is="backdrop.component" v-if="backdrop" v-bind="backdrop.props" />
    <ContourRipple
      v-if="!backdrop || backdrop.ripple !== 'replace'"
      class="ripple"
      :tone="tone === 'alert' ? 'alert' : 'success'"
      :delay="0.35"
    />
    <div class="content">
      <span v-if="category" data-interstitial class="category-pill">{{ category.label }}</span>
      <span data-interstitial class="kicker map-caption">
        {{ resolvedKicker }}
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
import { backdropFor } from '~~/components/feedback/backdrops'
import { challengeCategory, roundKicker } from '~~/lib/challenge-labels'
import { prefersLightMotion } from '~~/lib/motion'
import { seedFrom } from '~~/lib/random'
import { useIntroBeat } from '~~/lib/use-intro-beat'
import type { RoundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import { useKeyboardSkip } from '~~/lib/use-keyboard-skip'
import { useGameStore } from '~~/store/game.store'
import ContourRipple from './ContourRipple.vue'

/**
 * Full-screen beat announcing what's about to happen — a round starting,
 * pawns moving, a challenge with a win-or-fail state at the end. Auto
 * advances; a tap skips ahead. 'alert' (coral) marks challenges, 'info'
 * (blue) marks everything else.
 */
const props = defineProps({
  /** The round's kind. Give it one and the card names itself — kicker and
   *  category pill both — so a view never spells the mode out by hand. The
   *  board's move card and the gates have no kind and stay bare. */
  kind: {
    type: String as PropType<RoundChallengeKind>,
    default: undefined,
  },
  /** Overrides the derived kicker, for the cards whose sign is not just the
   *  mode's name: a corridor run, the water trio sharing one view. */
  kicker: {
    type: String,
    default: undefined,
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
const roundNumber = computed(() => gameStore.currentRound?.number ?? 1)
const category = computed(() => (props.kind ? challengeCategory(props.kind) : undefined))
// Seeded off the room and the round number: identical on every seat at the
// table (it is shared state, not a local roll), different from game to game,
// and stable across a re-render mid-beat so the wall never reshuffles under
// the words.
const backdropSeed = computed(() =>
  seedFrom(`${gameStore.game?.id ?? 'room'}:${roundNumber.value}`)
)
// A modest device gets the plain card. Not because the motion is heavy — it
// holds 120fps throttled — but because first paint costs up to 2s there, and
// the beat is only 4.5s long.
const backdrop = computed(() =>
  prefersLightMotion() ? undefined : backdropFor(props.kind, backdropSeed.value)
)
const resolvedKicker = computed(
  () => props.kicker ?? (props.kind ? roundKicker(props.kind, roundNumber.value) : 'Challenge!')
)
if (watching.value) onMounted(() => emit('done'))

const root = ref<HTMLElement>()
const { skip } = useIntroBeat(
  root,
  { pieceSelector: '[data-interstitial]', holdFor: () => props.holdFor },
  () => emit('done')
)

useKeyboardSkip(() => !watching.value, skip)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
// Shell geometry comes from templates/_intro-overlay.scss
.interstitial {
  background: milk(0.75);
}

// A dressed card is opaque. The backdrop is a CHILD, so the wash sits behind
// it and the live round reads through the quarter that is left — which is why
// per-backdrop grounds could never fix this from inside.
.interstitial.dressed {
  background: milk(1);
}

.ripple {
  top: 50%;
  left: 50%;
  width: min(46rem, 100vw);
  height: min(46rem, 100vw);
  position: absolute;
  transform: translate(-50%, -50%);
}

// The lobby's own toggle name, so a player can place the round in the menu
// they configured. Quieter than the kicker: it labels, the kicker announces.
.category-pill {
  padding: 0.3rem 1.2rem;
  font-size: 1.2rem;
  border-radius: 100px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: bold;
  background: ink(0.06);
  color: ink(0.65);
}

.alert .category-pill {
  background: flame(0.12);
  color: var(--dark-blue);
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
