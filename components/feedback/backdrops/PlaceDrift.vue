<template>
  <svg
    class="place-drift"
    viewBox="0 0 400 260"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <!-- A real map pin: a teardrop with a hole, standing on its point, with the
         ground shadow that tells you it is stuck INTO something. Drawn once and
         instanced, so the shape is defined in exactly one place. -->
    <defs>
      <g id="place-pin">
        <path d="M 0,0 C -3.6,-5.2 -8,-8.6 -8,-13.6 A 8,8 0 1 1 8,-13.6 C 8,-8.6 3.6,-5.2 0,0 z" />
        <circle class="bore" cx="0" cy="-13.6" r="3.1" />
      </g>
    </defs>
    <g
      v-for="pin in pins"
      :key="pin.key"
      class="pin ambient-loop"
      :style="pin.style"
      :transform="pin.transform"
    >
      <ellipse class="shadow" cx="0" cy="1.4" rx="4.6" ry="1.5" />
      <use href="#place-pin" />
    </g>
  </svg>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/**
 * The places card's ground: pins, dropped.
 *
 * The temptation is landmark photographs, and they are the one thing this
 * cannot use — 330KB apiece, and every photo is a subject the round deals. A
 * scatter of map pins says "a place, located" while being no place at all,
 * which is the whole job. They hover rather than bob: this is the ground
 * under a card, and a field of bouncing pins would pull the eye off the words.
 */
const props = defineProps<{ seed: number }>()

const PINS = 15

const pins = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: PINS }, (_, index) => {
    const scale = 0.75 + random() * 1.5
    return {
      key: `pin-${index}`,
      // Scale about the pin's own point, so a big pin stands on the same
      // ground a small one does rather than floating off it.
      transform: `translate(${(random() * 400).toFixed(1)} ${(random() * 260).toFixed(1)}) scale(${scale.toFixed(2)})`,
      style: {
        '--at': `${(index * 0.05 + random() * 0.25).toFixed(2)}s`,
        opacity: (0.35 + random() * 0.4).toFixed(2),
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.place-drift {
  // Paints its own ground: the shell's backdrop blur is ~90% of the frame
  // budget at 4x throttle, and an opaque field makes it unnecessary.
  background: var(--sour-milk);
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 0.8;
}

.place-drift > * {
  mask-image: radial-gradient(ellipse 50% 44% at 50% 50%, transparent 34%, black 80%);
}

.pin {
  fill: ink(0.34);
  opacity: 0;
  animation: pin-drop 0.6s var(--ease-out-expressive) var(--at, 0s) forwards;
}

.bore {
  // Punches the hole through the head, so it reads as a pin rather than a
  // balloon — the shape is one path, and this is what gives it its eye.
  fill: var(--sour-milk);
}

.shadow {
  fill: ink(0.12);
}

// Resting state is planted; the hover only lifts a little off it.
@keyframes pin-drop {
  from {
    opacity: 0;
    translate: 0 -1.2rem;
    scale: 0.7;
  }
  to {
    opacity: 1;
    translate: 0 0;
    scale: 1;
  }
}
</style>
