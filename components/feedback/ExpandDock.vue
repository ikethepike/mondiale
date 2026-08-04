<template>
  <Teleport to="body">
    <Transition name="dock">
      <div v-if="open" class="dock-stage expand-dock">
        <div class="dock-scrim" aria-hidden="true" @click="close" />
        <div class="dock-frame" :class="{ tall }" role="dialog" aria-modal="true" :aria-label="label">
          <slot />
          <button ref="closeButton" type="button" class="dock-close" :title="closeTitle" @click="close">
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
 * clipping panes and paragraphs (ChallengeResult's lesson is a <p>, which
 * would hoist a nested stage right out of the layout).
 *
 * `tall` buys the taller frame a chart's axes need over a photo's.
 */
withDefaults(
  defineProps<{
    label?: string
    closeTitle?: string
    tall?: boolean
  }>(),
  { label: 'Expanded view', closeTitle: 'Close', tall: false }
)

const open = defineModel<boolean>('open', { default: false })
const closeButton = ref<HTMLButtonElement>()

const close = () => {
  open.value = false
}

// Escape closes, and focus lands on the close button so the dialog is
// keyboard-reachable the moment it opens.
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && open.value) close()
}

watch(open, async isOpen => {
  if (!isOpen) return
  await nextTick()
  closeButton.value?.focus()
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
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
