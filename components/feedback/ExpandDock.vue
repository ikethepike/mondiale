<template>
  <Teleport to="body">
    <Transition name="dock">
      <div v-if="open" class="dock-stage expand-dock">
        <div class="dock-scrim" aria-hidden="true" @click="close" />
        <div
          class="dock-frame"
          :class="{ tall, fit }"
          role="dialog"
          aria-modal="true"
          :aria-label="label"
        >
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
</script>
<style lang="scss" scoped>
// Stage, scrim, frame and close button are templates/_dock.scss. The frame
// centres its subject: a chart fills the width and rides the middle.
.expand-dock .dock-frame {
  display: flex;
  padding: 1.6rem;
  align-items: center;
  border-radius: 1.2rem;
  justify-content: center;
  background: var(--background-color);
}
</style>
