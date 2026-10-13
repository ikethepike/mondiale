<template>
  <button
    type="button"
    class="rip-cord-handle"
    :class="{ pulling, sprung }"
    :style="{ '--hold-ms': `${HOLD_MS}ms` }"
    :disabled="disabled"
    :aria-label="`Pull the rip cord — swap ${headName} for a fresh country`"
    @pointerdown="startHold"
    @pointerup="cancelHold"
    @pointerleave="cancelHold"
    @pointercancel="cancelHold"
    @click="pullFromKeyboard"
    @contextmenu.prevent
  >
    <ParachuteGlyph class="chute" @animationend="sprung = false" />
    <span class="label">{{ pulling ? 'Hold…' : 'Rip cord' }}</span>
  </button>
</template>
<script lang="ts" setup>
import ParachuteGlyph from '~/components/challenge/ParachuteGlyph.vue'

/**
 * The rip cord's pull: a packed parachute you hold until it opens — the hold
 * is the confirmation for a once-a-round lifeline. A keyboard press pulls at
 * once (Enter/Space has no pointer to hold).
 */
defineProps<{ headName: string; disabled?: boolean }>()
const emit = defineEmits<{ pull: [] }>()

const HOLD_MS = 450

const pulling = ref(false)
const sprung = ref(false)
let holdTimer: ReturnType<typeof setTimeout> | undefined

const clearHold = () => {
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = undefined
}

const startHold = (event: PointerEvent) => {
  if (event.button !== 0) return
  clearHold()
  pulling.value = true
  holdTimer = setTimeout(() => {
    pulling.value = false
    sprung.value = true
    holdTimer = undefined
    emit('pull')
  }, HOLD_MS)
}

const cancelHold = () => {
  clearHold()
  pulling.value = false
}

// A pointer's click lands after its hold already fired (or was abandoned) —
// only a keyboard activation (detail 0) pulls here.
const pullFromKeyboard = (event: MouseEvent) => {
  if (event.detail === 0) emit('pull')
}

onBeforeUnmount(clearHold)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.rip-cord-handle {
  gap: 0.2rem;
  flex: none;
  display: flex;
  cursor: pointer;
  align-items: center;
  flex-flow: column nowrap;
  padding: 0 0.6rem;
  border: none;
  background: none;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  -webkit-touch-callout: none;
  color: #{ember()};

  &:disabled {
    cursor: default;
    color: ink(0.35);
  }
}

.chute {
  width: 3rem;
  height: 3rem;
  overflow: visible;
  transform-origin: 50% 80%;
  transition: transform 0.25s var(--ease-out-expressive);
}

.chute :deep(.canopy) {
  transition: fill-opacity 0.25s var(--ease-out-expressive);
}

// The hold fills the canopy with air over exactly the hold's length — it
// swells and lifts; letting go early lets it sag back.
.pulling .chute {
  transform: translateY(-0.3rem) scale(1.18);
  transition: transform var(--hold-ms) var(--ease-smooth);
}
.pulling .chute :deep(.canopy),
.sprung .chute :deep(.canopy) {
  fill-opacity: 0.85;
  transition: fill-opacity var(--hold-ms) var(--ease-smooth);
}

.sprung .chute {
  animation: chute-open 0.5s var(--ease-out-expressive);
}

@keyframes chute-open {
  0% {
    transform: translateY(-0.3rem) scale(1.18);
  }
  40% {
    transform: translateY(-0.7rem) scale(1.3);
  }
}

.label {
  font-size: 1rem;
  font-weight: 700;
  white-space: nowrap;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

@media (prefers-reduced-motion: reduce) {
  .chute,
  .pulling .chute,
  .chute :deep(.canopy),
  .pulling .chute :deep(.canopy) {
    transition: none;
  }
  .sprung .chute {
    animation: none;
  }
}
</style>
