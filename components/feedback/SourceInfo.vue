<template>
  <span class="source-info" :class="{ open }">
    <button
      ref="trigger"
      type="button"
      class="source-trigger"
      :aria-expanded="open"
      :aria-label="`Where this comes from: ${summary}`"
      @click.stop="open = !open"
      @mouseenter="onHoverIn"
      @mouseleave="onHoverOut"
    >
      <svg class="source-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9.2" />
        <path d="M12 10.6v6" />
        <circle cx="12" cy="7.4" r="1.15" class="dot" />
      </svg>
    </button>

    <Teleport to="body">
      <Transition name="source-pop">
        <span
          v-if="open"
          ref="panel"
          class="source-panel"
          :style="panelStyle"
          role="dialog"
          :aria-label="label"
          @mouseenter="onHoverIn"
          @mouseleave="onHoverOut"
        >
          <span class="source-eyebrow">{{ label }}</span>

          <span
            v-for="entry in attributions"
            :key="`${entry.sourceId}|${entry.credit}`"
            class="source-entry"
          >
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
    </Teleport>
  </span>
</template>
<script lang="ts" setup>
import { attributionLine, type Attribution } from '~~/lib/attribution'
import { clamp } from '~~/lib/number'
import { useIsCoarsePointer } from '~~/lib/use-viewport'

/**
 * The "where did this come from" affordance: a quiet ⓘ that opens the full
 * provenance for whatever it sits beside.
 *
 * Takes resolved `Attribution` objects rather than ids, so every caller reaches
 * them through the same helpers in lib/attribution.ts — `attributionFor` for a
 * stat, `trendAttribution` for a series, `datasetAttribution` for a whole
 * dataset. Nothing here knows about individual providers, which is what lets
 * one component serve the Factbook, OWID, UCDP, Commons and the rest.
 *
 * The panel teleports to <body> and positions itself fixed off the trigger's
 * rect: hosts live inside panes and photo frames that clip (`overflow:
 * hidden`, backdrop filters, scroll columns), and an in-flow panel WILL get
 * cut off on some viewport. Placement flips to whichever side has room and
 * clamps to the viewport, scrolling internally as the backstop.
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
  }>(),
  { label: 'Source', itemCredit: undefined }
)

const open = ref(false)
const trigger = ref<HTMLElement>()
const panel = ref<HTMLElement>()

/**
 * The panel opens on click/tap — deliberate, and the same gesture on every
 * device. Flip HOVER_OPENS_PANEL to also let mouse users open it on hover
 * (coarse pointers always ignore hover); the close delay then bridges the
 * pointer's hop across the gap between the trigger and the teleported panel.
 */
const HOVER_OPENS_PANEL = false
const HOVER_CLOSE_DELAY_MS = 250

const isCoarsePointer = useIsCoarsePointer()
let hoverCloseTimer: ReturnType<typeof setTimeout> | undefined

const onHoverIn = () => {
  if (!HOVER_OPENS_PANEL || isCoarsePointer.value) return
  clearTimeout(hoverCloseTimer)
  open.value = true
}
const onHoverOut = () => {
  if (!HOVER_OPENS_PANEL || isCoarsePointer.value) return
  clearTimeout(hoverCloseTimer)
  hoverCloseTimer = setTimeout(() => (open.value = false), HOVER_CLOSE_DELAY_MS)
}

/** Breathing room between the panel, its trigger, and the viewport edges. */
const PANEL_GAP_PX = 6
const VIEWPORT_MARGIN_PX = 8

const panelStyle = ref<{ top: string; left: string; visibility?: 'hidden' }>({
  // Measured before shown: the first frame renders off-layout but invisible.
  top: '0px',
  left: '0px',
  visibility: 'hidden',
})

/**
 * Place the open panel against the live viewport: below the trigger when the
 * floor has room, above when the ceiling has more, right edges aligned and
 * clamped inside the screen. Runs on open and again on scroll/resize, so the
 * panel tracks its trigger instead of stranding.
 */
const place = () => {
  const anchor = trigger.value?.getBoundingClientRect()
  const element = panel.value
  if (!anchor || !element) return
  const height = element.offsetHeight
  const width = element.offsetWidth

  const roomBelow = window.innerHeight - anchor.bottom - VIEWPORT_MARGIN_PX
  const roomAbove = anchor.top - VIEWPORT_MARGIN_PX
  const openUp = roomBelow < height + PANEL_GAP_PX && roomAbove > roomBelow
  const top = clamp(
    openUp ? anchor.top - PANEL_GAP_PX - height : anchor.bottom + PANEL_GAP_PX,
    VIEWPORT_MARGIN_PX,
    Math.max(VIEWPORT_MARGIN_PX, window.innerHeight - VIEWPORT_MARGIN_PX - height)
  )
  const left = clamp(
    anchor.right - width,
    VIEWPORT_MARGIN_PX,
    Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - VIEWPORT_MARGIN_PX - width)
  )
  panelStyle.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` }
}

/**
 * The dismiss and tracking listeners exist only while a panel is open — a
 * screen mounts a dozen ⓘs, and idle instances must not run on every
 * scroll. Attached after the opening click has finished dispatching (watch
 * callbacks flush on the microtask queue), so it never dismisses itself.
 */
const attachOpenListeners = () => {
  document.addEventListener('click', dismiss, true)
  document.addEventListener('keydown', onKey)
  document.addEventListener('scroll', onViewportShift, true)
  window.addEventListener('resize', onViewportShift)
}
const detachOpenListeners = () => {
  document.removeEventListener('click', dismiss, true)
  document.removeEventListener('keydown', onKey)
  document.removeEventListener('scroll', onViewportShift, true)
  window.removeEventListener('resize', onViewportShift)
}

watch(open, isOpen => {
  if (!isOpen) {
    detachOpenListeners()
    return
  }
  attachOpenListeners()
  // Hidden until measured — the panel must never flash unplaced.
  panelStyle.value = { ...panelStyle.value, visibility: 'hidden' }
  nextTick(place)
})

/** The trigger moves under the panel when its host scrolls or the viewport
 *  resizes — follow it. Capture catches scrolls inside nested pane columns. */
const onViewportShift = () => {
  if (open.value) place()
}

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

onBeforeUnmount(() => {
  clearTimeout(hoverCloseTimer)
  detachOpenListeners()
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

// Riding a photo: the ⓘ wears the zoom controls' frosted chip language so it
// reads on any image instead of vanishing into it.
.source-info.on-photo .source-trigger {
  color: var(--dark-blue);
  backdrop-filter: blur(0.5rem);
  background: glass(0.55);
  border: 0.1rem solid #{ink(0.2)};
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

// Teleported to <body> and pinned by the placement logic above — never in
// any pane's clipping context, so it cannot be cut off by a card edge.
.source-panel {
  gap: 0.7rem;
  z-index: 60;
  display: flex;
  padding: 1rem 1.2rem;
  position: fixed;
  min-width: 24rem;
  max-width: min(32rem, 86vw);
  // Taller-than-the-screen content scrolls inside the panel — the backstop
  // when neither side of the trigger has the full height.
  // dvh, never vh: on iOS 100vh is the LARGE viewport, and a scroller
  // sized to it hides its last lines under the toolbar.
  max-height: calc(100dvh - 1.6rem);
  overflow-y: auto;
  text-align: left;
  border-radius: 0.8rem;
  flex-flow: column nowrap;
  pointer-events: auto;
  background: #{milk()};
  border: 0.1rem solid #{ink(0.14)};
  box-shadow: 0 0.6rem 2rem #{ink(0.16)};
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
