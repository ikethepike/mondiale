<template>
  <svg
    class="disputed-drift"
    viewBox="0 0 2000 1001"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <defs>
      <pattern
        id="disputed-hatch"
        width="8"
        height="8"
        patternTransform="rotate(45)"
        patternUnits="userSpaceOnUse"
      >
        <line x1="0" y1="0" x2="0" y2="8" />
      </pattern>
    </defs>
    <path
      v-for="claim in claims"
      :key="claim.key"
      class="claim ambient-loop"
      :d="claim.d"
      :style="claim.style"
    />
  </svg>
</template>
<script lang="ts" setup>
import { RECOGNITION_TERRITORIES } from '~~/data/recognition.gen'
import { sampleMany } from '~~/lib/arrays'
import { seededRandom } from '~~/lib/random'

/**
 * The disputed card's ground: contested ground, hatched.
 *
 * Real territories at their real places, drawn the way a cartographer marks a
 * claim nobody agrees on — hatch fill and a dashed edge, because a solid line
 * would be taking a side. They are scattered small and unlabelled; the round
 * is what names one.
 */
const props = defineProps<{ seed: number }>()

const CLAIMS = 9

const claims = computed(() => {
  const random = seededRandom(props.seed)
  const territories = Object.values(RECOGNITION_TERRITORIES).filter(territory => !!territory?.d)
  return sampleMany(territories, CLAIMS, random).map((territory, index) => {
    const box = territory.bounds
    // Every one of these is small on a world map — Abkhazia is eleven units
    // wide — so blow each up around its own centre or the card shows nothing.
    const scale = 5 + random() * 4
    const cx = box ? box[0] + box[2] / 2 : 1000
    const cy = box ? box[1] + box[3] / 2 : 500
    const x = 200 + random() * 1600
    const y = 150 + random() * 700
    return {
      key: territory.id ?? `claim-${index}`,
      d: territory.d,
      style: {
        transform: `translate(${(x - cx).toFixed(1)}px, ${(y - cy).toFixed(1)}px) translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) scale(${scale.toFixed(2)}) translate(${(-cx).toFixed(1)}px, ${(-cy).toFixed(1)}px)`,
        animationDelay: `${(-random() * 16).toFixed(2)}s`,
        animationDuration: `${(12 + random() * 9).toFixed(2)}s`,
        opacity: (0.5 + random() * 0.4).toFixed(2),
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.disputed-drift {
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 0.95;
  mask-image: radial-gradient(ellipse 48% 42% at 50% 50%, transparent 32%, black 78%);
}

#disputed-hatch line {
  stroke: ink(0.3);
  stroke-width: 2.5;
}

.claim {
  fill: url(#disputed-hatch);
  stroke: ink(0.4);
  stroke-width: 0.6;
  stroke-dasharray: 3 2.5;
  animation: claim-waver 14s ease-in-out infinite;
}

// Never resolves: a claim that settles is a claim decided.
@keyframes claim-waver {
  0%,
  100% {
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dashoffset: 12;
  }
}
</style>
