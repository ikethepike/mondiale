<template>
  <svg
    class="place-drift"
    viewBox="0 0 400 260"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
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

/** Map pins, dropped. */
const props = defineProps<{ seed: number }>()

const PINS = 15

const pins = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: PINS }, (_, index) => {
    const scale = 0.75 + random() * 1.5
    return {
      key: `pin-${index}`,
      transform: `translate(${(random() * 400).toFixed(1)} ${(random() * 260).toFixed(1)}) scale(${scale.toFixed(2)})`,
      style: {
        animationDelay: `${(-random() * 11).toFixed(2)}s`,
        animationDuration: `${(8 + random() * 7).toFixed(2)}s`,
        opacity: (0.22 + random() * 0.34).toFixed(2),
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/backdrop' as *;
@use '~/assets/scss/rules/ink' as *;

.place-drift {
  @include backdrop-field(0.8);
}

.pin {
  fill: ink(0.34);
  animation: pin-hover 12s ease-in-out infinite;
}

.bore {
  fill: var(--sour-milk);
}

.shadow {
  fill: ink(0.12);
}

@keyframes pin-hover {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -2px;
  }
}
</style>
