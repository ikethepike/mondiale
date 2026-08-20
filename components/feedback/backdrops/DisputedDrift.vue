<template>
  <svg
    class="disputed-drift"
    viewBox="0 0 400 240"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <defs>
      <pattern
        id="disputed-hatch"
        width="6"
        height="6"
        patternTransform="rotate(45)"
        patternUnits="userSpaceOnUse"
      >
        <line x1="0" y1="0" x2="0" y2="6" />
      </pattern>
    </defs>
    <g v-for="claim in claims" :key="claim.key" :transform="claim.transform">
      <!-- The arrows come first so the ground sits on top of their points:
           they press against it rather than crossing it. -->
      <path
        v-for="(arrow, index) in claim.arrows"
        :key="index"
        class="arrow ambient-loop"
        :d="arrow.d"
        :style="arrow.style"
      />
      <circle class="ground" :r="claim.radius" />
      <circle class="edge ambient-loop" :r="claim.radius" :style="claim.style" />
    </g>
  </svg>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/**
 * The disputed card's ground: one piece of ground, several arrows pointing at
 * it, none of them arriving.
 *
 * The first version scattered the real territory outlines, and it was nearly
 * blank — the median disputed place is 3x2 units on a 2000-unit map and three
 * of them (Rockall, Serranilla Bank, Isla del Perejil) are bare rocks with
 * zero-sized bounds. Blowing each up individually made a few big ones legible
 * and left the rest invisible.
 *
 * What the roster does carry is the argument: seventeen territories have
 * exactly two claimants, four have three or more. So the motif is the CLAIM
 * rather than the coastline — arrows converging on a hatched patch and holding
 * short of it, which is the one thing every disputed place has in common and
 * which no outline could show.
 */
const props = defineProps<{ seed: number }>()

const PATCHES = 7
/** Claimants per patch, matching the roster's own spread (mostly two). */
const CLAIMANT_WEIGHTS = [2, 2, 2, 2, 2, 3, 4]

const claims = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: PATCHES }, (_, index) => {
    const radius = 7 + random() * 9
    const count = CLAIMANT_WEIGHTS[Math.floor(random() * CLAIMANT_WEIGHTS.length)] ?? 2
    const spin = random() * Math.PI * 2
    const arrows = Array.from({ length: count }, (_, arrow) => {
      // Spread the claimants around the patch, jittered so a four-way dispute
      // never reads as a compass rose.
      const angle = spin + (arrow / count) * Math.PI * 2 + (random() - 0.5) * 0.5
      const reach = radius + 16 + random() * 22
      // Stops short of the ground on purpose — a claim that lands is a border.
      const stop = radius + 4
      const [dx, dy] = [Math.cos(angle), Math.sin(angle)]
      const head = 4.5
      // Shaft, then two barbs at the inner end.
      return {
        d:
          `M ${(dx * reach).toFixed(1)},${(dy * reach).toFixed(1)} L ${(dx * stop).toFixed(1)},${(dy * stop).toFixed(1)} ` +
          `M ${(dx * (stop + head) + dy * head * 0.6).toFixed(1)},${(dy * (stop + head) - dx * head * 0.6).toFixed(1)} ` +
          `L ${(dx * stop).toFixed(1)},${(dy * stop).toFixed(1)} ` +
          `L ${(dx * (stop + head) - dy * head * 0.6).toFixed(1)},${(dy * (stop + head) + dx * head * 0.6).toFixed(1)}`,
        style: {
          animationDelay: `${(-random() * 9).toFixed(2)}s`,
          animationDuration: `${(7 + random() * 5).toFixed(2)}s`,
        } as Record<string, string>,
      }
    })
    return {
      key: `claim-${index}`,
      radius,
      transform: `translate(${(30 + random() * 340).toFixed(1)} ${(24 + random() * 192).toFixed(1)})`,
      arrows,
      style: {
        animationDelay: `${(-random() * 12).toFixed(2)}s`,
        animationDuration: `${(11 + random() * 6).toFixed(2)}s`,
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
  opacity: 0.55;
  mask-image: radial-gradient(ellipse 56% 50% at 50% 50%, transparent 44%, black 88%);
}

#disputed-hatch line {
  stroke: ink(0.34);
  stroke-width: 2.2;
}

.ground {
  fill: url(#disputed-hatch);
}

// The dashed edge is what says "not settled" — a solid outline would be
// taking a side, which is exactly what nobody has managed here.
.edge {
  fill: none;
  stroke: ink(0.42);
  stroke-width: 1.4;
  stroke-dasharray: 4 3;
  animation: claim-waver 14s linear infinite;
}

.arrow {
  fill: none;
  stroke: var(--hior-ange);
  stroke-width: 1.3;
  stroke-linecap: round;
  stroke-linejoin: round;
  // Resting state is a full-strength arrow; the push only leans on it.
  opacity: 0.6;
  animation: claim-press 9s ease-in-out infinite;
}

@keyframes claim-waver {
  to {
    stroke-dashoffset: -14;
  }
}

// Each claimant presses in and eases back, never reaching. Scale, not opacity,
// so a stopped animation leaves the arrow where it is.
@keyframes claim-press {
  0%,
  100% {
    transform: scale(1.06);
  }
  50% {
    transform: scale(0.97);
  }
}
</style>
