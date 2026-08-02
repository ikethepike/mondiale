<template>
  <span class="source-info" :class="{ open }">
    <button
      ref="trigger"
      type="button"
      class="source-trigger"
      :aria-expanded="open"
      :aria-label="`Where this comes from: ${summary}`"
      @click.stop="open = !open"
    >
      <svg class="source-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9.2" />
        <path d="M12 10.6v6" />
        <circle cx="12" cy="7.4" r="1.15" class="dot" />
      </svg>
    </button>

    <Transition name="source-pop">
      <span
        v-if="open"
        ref="panel"
        class="source-panel"
        :class="{ 'drop-up': drop === 'up', 'align-start': align === 'start' }"
        role="dialog"
        :aria-label="label"
      >
        <span class="source-eyebrow">{{ label }}</span>

        <span v-for="entry in attributions" :key="entry.sourceId" class="source-entry">
          <a
            v-if="entry.url"
            class="source-name"
            :href="entry.url"
            target="_blank"
            rel="noopener noreferrer"
            >{{ entry.credit }}</a
          >
          <span v-else class="source-name">{{ entry.credit }}</span>

          <span class="source-meta">
            <span v-if="entry.dataset">{{ entry.dataset }}</span>
            <span v-if="entry.source.edition">{{ entry.source.edition }}</span>
            <span v-if="entry.year">{{ entry.year }}</span>
            <span v-if="entry.license" class="source-licence">{{ entry.license }}</span>
          </span>
        </span>

        <!-- Per-item credit, where a single photo or clip carries its own
             author on top of the dataset's licence. -->
        <span v-if="itemCredit" class="source-entry item">
          <span class="source-name">{{ itemCredit }}</span>
        </span>
      </span>
    </Transition>
  </span>
</template>
<script lang="ts" setup>
import { attributionLine, type Attribution } from '~~/lib/attribution'

/**
 * The "where did this come from" affordance: a quiet ⓘ that opens the full
 * provenance for whatever it sits beside.
 *
 * Takes resolved `Attribution` objects rather than ids, so every caller reaches
 * them through the same helpers in lib/attribution.ts — `attributionFor` for a
 * stat, `trendAttribution` for a series, `datasetAttribution` for a whole
 * dataset. Nothing here knows about individual providers, which is what lets
 * one component serve the Factbook, OWID, UCDP, Commons and the rest.
 */
const props = withDefaults(
  defineProps<{
    /** Resolved credits, primary first. */
    attributions: Attribution[]
    /** Panel heading — "Source", "Sources", "Photo" … */
    label?: string
    /** A single item's own credit line, e.g. a photographer, when the dataset
     *  licence alone does not name them. */
    itemCredit?: string
    /** Open the panel above the trigger — for rows near a card's bottom edge,
     *  where downward would run off the card or the screen. */
    drop?: 'down' | 'up'
    /** Anchor the panel's left edge to the trigger instead of its right —
     *  for triggers sitting at a frame's left corner. */
    align?: 'end' | 'start'
  }>(),
  { label: 'Source', itemCredit: undefined, drop: 'down', align: 'end' }
)

const open = ref(false)
const trigger = ref<HTMLElement>()
const panel = ref<HTMLElement>()

/** Read out by the trigger's own label, so the credit is available without
 *  opening anything. */
const summary = computed(() => props.attributions.map(attributionLine).join('; '))

/** Click-away and Escape: the panel is transient, and on a phone there is no
 *  hover to fall back on. */
const dismiss = (event: Event) => {
  if (!open.value) return
  const target = event.target as Node | null
  if (trigger.value?.contains(target ?? null) || panel.value?.contains(target ?? null)) return
  open.value = false
}
const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('click', dismiss, true)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', dismiss, true)
  document.removeEventListener('keydown', onKey)
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.source-info {
  display: inline-flex;
  position: relative;
  vertical-align: middle;
  // Self-contained interactive affordance: opts back in wherever a
  // passthrough shell (`.challenge-shell`) has killed pointer events.
  pointer-events: auto;
}

.source-trigger {
  border: 0;
  padding: 0;
  width: 2.2rem;
  height: 2.2rem;
  display: grid;
  cursor: pointer;
  border-radius: 50%;
  place-items: center;
  background: transparent;
  color: #{ink(0.42)};
  transition: color var(--motion-quick) var(--ease-smooth);

  @media (hover: hover) {
    &:hover {
      color: #{ink(0.75)};
    }
  }
}

.open .source-trigger {
  color: #{ink()};
}

.source-icon {
  width: 1.5rem;
  height: 1.5rem;
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.6;
  stroke-linecap: round;

  .dot {
    fill: currentcolor;
    stroke: none;
  }
}

// Anchored to the trigger, flipped to stay on screen at the right edge.
.source-panel {
  gap: 0.7rem;
  top: calc(100% + 0.6rem);
  right: 0;
  z-index: 20;
  display: flex;
  padding: 1rem 1.2rem;
  position: absolute;
  min-width: 24rem;
  max-width: min(32rem, 86vw);
  text-align: left;
  border-radius: 0.8rem;
  flex-flow: column nowrap;
  background: #{milk()};
  border: 0.1rem solid #{ink(0.14)};
  box-shadow: 0 0.6rem 2rem #{ink(0.16)};

  &.drop-up {
    top: auto;
    bottom: calc(100% + 0.6rem);
  }

  &.align-start {
    right: auto;
    left: 0;
  }
}

.source-eyebrow {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--soft-blue);
}

.source-entry {
  gap: 0.2rem;
  display: flex;
  flex-flow: column nowrap;

  &.item {
    padding-top: 0.6rem;
    border-top: 0.1rem solid #{ink(0.1)};
  }
}

.source-name {
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--dark-blue);
  text-underline-offset: 0.2em;
}

a.source-name {
  text-decoration: underline;
}

// The supporting facts read as one quiet line, separated rather than stacked.
.source-meta {
  gap: 0.5rem;
  display: flex;
  font-size: 1.15rem;
  flex-flow: row wrap;
  color: #{ink(0.5)};

  > span + span::before {
    margin-right: 0.5rem;
    content: '·';
  }
}

.source-licence {
  font-variant: small-caps;
}

.source-pop-enter-active,
.source-pop-leave-active {
  transition:
    opacity var(--motion-quick) var(--ease-smooth),
    transform var(--motion-quick) var(--ease-out-expressive);
}

.source-pop-enter-from,
.source-pop-leave-to {
  opacity: 0;
  transform: translateY(-0.4rem);
}
</style>
