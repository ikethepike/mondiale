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
    <svg class="handle" viewBox="0 0 28 44" aria-hidden="true">
      <path class="cord" d="M14 0v18" />
      <g class="ring">
        <path class="ring-path" d="M6 20h16a2 2 0 0 1 2 2v4a10 10 0 0 1-20 0v-4a2 2 0 0 1 2-2z" />
      </g>
    </svg>
    <span class="label">{{ pulling ? 'Hold…' : 'Rip cord' }}</span>
  </button>
</template>
<script lang="ts" setup>
/**
 * The rip cord's pull: a D-ring you hold down until the cord gives — the hold
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

.handle {
  width: 2.2rem;
  height: 3.4rem;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.cord {
  transform-origin: 50% 0;
  transition: transform 0.25s var(--ease-out-expressive);
}

.ring {
  transition: transform 0.25s var(--ease-out-expressive);
}

.ring-path {
  fill: currentColor;
  fill-opacity: 0.16;
}

// The hold stretches the cord and draws the ring down; letting go early
// springs it back.
.pulling {
  .cord {
    transform: scaleY(1.45);
    transition: transform var(--hold-ms) linear;
  }
  .ring {
    transform: translateY(0.8rem);
    transition: transform var(--hold-ms) linear;
  }
}

.sprung .ring {
  animation: ring-free 0.5s var(--ease-out-expressive);
}

@keyframes ring-free {
  40% {
    transform: translateY(1.2rem) rotate(-12deg);
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
  .cord,
  .ring,
  .pulling .cord,
  .pulling .ring {
    transition: none;
  }
  .sprung .ring {
    animation: none;
  }
}
</style>
