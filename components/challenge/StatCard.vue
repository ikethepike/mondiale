<template>
  <component :is="tag" class="stat-card">
    <StatTopicIcon
      v-if="topic || accessor"
      class="topic-icon"
      :topic="topic"
      :accessor="accessor"
    />
    <SourceInfo v-if="sources.length" class="source-corner" :attributions="sources" />
    <span v-if="label" class="stat-label">{{ label }}</span>
    <slot />
  </component>
</template>
<script lang="ts" setup>
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { attributionFor, type Attribution } from '~~/lib/attribution'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import type { Amount } from '~~/types/geography.types'

/**
 * The shared stat card: cream surface, hairline border, small-caps label and
 * a thin-outline stat emblem in the corner. Stat Detective's clues and Two
 * Truths' claims are both built on it — behavioural styling (hover lifts,
 * verdict washes, stack positioning) stays with the host view.
 *
 * A card with an `accessor` credits itself: the opposite corner wears the
 * SourceInfo ⓘ resolved through `attributionFor`. Pass `sourceValue` (the
 * `Amount` behind the figure) so the year and any fallback source are exact,
 * or `attributions` to override the resolution entirely. Interactive hosts
 * (`tag="button"`) opt out by construction — a nested button is invalid.
 */
const props = withDefaults(
  defineProps<{
    label?: string
    topic?: string
    accessor?: GroupChallengeAccessorId
    /** The figure the card shows — carries its year and winning source. */
    sourceValue?: Pick<Amount<unknown>, 'year' | 'source'>
    /** Override when the card's data isn't a ranked stat (photos, trends). */
    attributions?: Attribution[]
    tag?: string
  }>(),
  {
    label: undefined,
    topic: undefined,
    accessor: undefined,
    sourceValue: undefined,
    attributions: undefined,
    tag: 'article',
  }
)

const sources = computed<Attribution[]>(() => {
  if (props.tag === 'button') return []
  if (props.attributions) return props.attributions
  return props.accessor ? [attributionFor(props.accessor, props.sourceValue)] : []
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
.stat-card {
  gap: 0.6rem;
  width: 100%;
  display: flex;
  padding: 1.6rem;
  position: relative;
  text-align: center;
  align-items: center;
  font-family: inherit;
  border-radius: 1.2rem;
  flex-flow: column nowrap;
  color: var(--dark-blue);
  backdrop-filter: blur(0.5rem);
  background: milk(0.88);
  border: 0.1rem solid ink(0.25);
}

.topic-icon {
  top: 1rem;
  left: 1rem;
  opacity: 0.45;
  position: absolute;
  color: var(--dark-blue);
}

// Mirrors the topic emblem in the opposite corner — .stat-label already
// clears 2.8rem on both sides for exactly this symmetry. Doubled selector:
// SourceInfo's own `.source-info` positioning must not win.
.stat-card .source-corner {
  top: 0.6rem;
  right: 0.6rem;
  position: absolute;
}

.stat-label {
  opacity: 0.65;
  font-size: 1.3rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  // Clear the corner emblem on both sides so long, wrapping labels stay
  // centred instead of running underneath it.
  padding: 0 2.8rem;
}
</style>
