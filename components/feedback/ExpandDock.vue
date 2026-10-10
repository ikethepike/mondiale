<template>
  <Teleport to="body">
    <Transition name="dock">
      <div v-if="open" class="dock-stage expand-dock">
        <div class="dock-scrim" aria-hidden="true" @click="close" />
        <div
          ref="frame"
          class="dock-frame"
          :class="{ tall, fit }"
          role="dialog"
          aria-modal="true"
          :aria-label="label"
        >
          <!-- Phone dismissal: the shared grab pill rides lib/use-drag-sheet —
               a swipe past the flick threshold settles the frame offscreen and
               closes. The handle alone carries touch-action: none, so the
               dossier's own scroller keeps its pan. -->
          <div v-if="isPhone" class="sheet-handle" aria-hidden="true" @pointerdown="onDragStart" />
          <slot />
          <button
            ref="closeButton"
            type="button"
            class="dock-close"
            :title="closeTitle"
            @click="close"
          >
            <svg class="dock-close-icon" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
<script lang="ts" setup>
/**
 * Any subject, blown up on the dock's stage: scrim behind, framed content,
 * close button on the corner — the same grammar MediaDock gives a photo, for
 * things that aren't photos. Teleported to <body> because hosts live inside
 * clipping panes, where a nested stage would be cropped by an ancestor instead
 * of covering the screen.
 *
 * `tall` buys the taller frame a chart's axes need over a photo's.
 */
import { useDialogKeys } from '~~/lib/use-dialog-keys'
import { useDragSheet } from '~~/lib/use-drag-sheet'
import { useIsPhone } from '~~/lib/use-viewport'

withDefaults(
  defineProps<{
    label?: string
    closeTitle?: string
    tall?: boolean
    /** Size the frame to its content (prose dossiers) instead of the fixed
     *  subject band — the consumer bounds its own height and scroll. */
    fit?: boolean
  }>(),
  { label: 'Expanded view', closeTitle: 'Close', tall: false, fit: false }
)

const open = defineModel<boolean>('open', { default: false })
const closeButton = ref<HTMLButtonElement>()

const close = () => {
  open.value = false
}

useDialogKeys(open, { close, initialFocus: () => closeButton.value })

// Swipe-to-dismiss (phones): two stops — seated, and clear of the viewport's
// bottom edge. On a phone the frame is a bottom sheet, so offscreen is its own
// height. `open` unmounts the frame, so a fresh mount always starts untranslated.
const frame = ref<HTMLElement>()
const isPhone = useIsPhone()
const { onDragStart } = useDragSheet({
  el: () => frame.value,
  enabled: () => isPhone.value,
  stops: () => [0, frame.value?.offsetHeight ?? window.innerHeight],
  momentumEase: 'power1.in',
  onSettle: index => index === 1 && close(),
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// Stage, scrim, frame and close button are templates/_dock.scss. The frame
// centres its subject: a chart fills the width and rides the middle. Column
// flow so the phone grab pill stacks above the subject; with one child the
// centring is unchanged.
.expand-dock .dock-frame {
  display: flex;
  padding: 1.6rem;
  align-items: center;
  justify-content: center;
  flex-flow: column nowrap;
  background: var(--background-color);
  border: 0.1rem solid var(--text-color);
  border-bottom-width: 0.6rem;
  border-top-right-radius: $cardRadius;
  box-shadow:
    0 0.2rem 0.6rem ink(0.12),
    0 1.6rem 4rem ink(0.22);
}

// A cream card over a cream wash had no edge; the ink tint sets it apart.
.expand-dock .dock-scrim {
  background: linear-gradient(ink(0.16), ink(0.16)), milk(0.45);
}

// Phones: a bottom sheet, matching the grab pill and swipe-down dismissal —
// seated on the screen's edge, so the card's bottom rule gives way to the
// home-indicator clearance and it rises rather than scales in.
@media screen and (max-width: $tablet) {
  .expand-dock {
    align-items: flex-end;
  }

  .expand-dock .dock-frame {
    width: 100%;
    border-bottom: none;
    padding-bottom: calc(1.6rem + var(--safe-bottom));
    border-radius: $cardRadius $cardRadius 0 0;
    box-shadow: 0 -1rem 3rem ink(0.2);
  }

  .expand-dock .dock-close {
    top: 0.4rem;
    right: 0.8rem;
  }

  .expand-dock.dock-enter-from,
  .expand-dock.dock-leave-to {
    transform: none;
  }

  .expand-dock.dock-enter-active .dock-frame,
  .expand-dock.dock-leave-active .dock-frame {
    transition: transform var(--motion-base) var(--ease-out-expressive);
  }

  .expand-dock.dock-enter-from .dock-frame,
  .expand-dock.dock-leave-to .dock-frame {
    transform: translateY(100%);
  }
}
</style>
