<template>
  <Transition name="vhs">
    <div v-if="active" class="vhs-rewind" aria-hidden="true">
      <div class="tape-tint" />
      <div class="scanlines" />
      <div class="band band-a" />
      <div class="band band-b" />
      <div class="osd"><RewindGlyph class="osd-glyph" /> REW</div>
    </div>
  </Transition>
</template>
<script lang="ts" setup>
import RewindGlyph from '~/components/challenge/RewindGlyph.vue'

/** The tape running backward: a VCR's rewind beat laid over the map. */
defineProps<{ active: boolean }>()
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/ink' as *;

.vhs-rewind {
  position: fixed;
  inset: 0;
  z-index: 4;
  overflow: hidden;
  pointer-events: none;
}

.tape-tint {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 55%, ink(0.1) 100%);
}

.scanlines {
  position: absolute;
  inset: -6px 0 0;
  background: repeating-linear-gradient(to bottom, ink(0.07) 0 1px, transparent 1px 3px);
  animation: scan-roll 0.24s steps(3) infinite;
}

.band {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 9vh;
  background: linear-gradient(
    to bottom,
    transparent,
    color-mix(in srgb, var(--background-color) 70%, transparent) 40%,
    ink(0.08) 55%,
    transparent
  );
  will-change: transform;
}

.band-a {
  animation: band-roll 1.1s linear infinite;
}

.band-b {
  height: 4vh;
  opacity: 0.7;
  animation: band-roll 0.7s linear infinite;
  animation-delay: -0.35s;
}

.osd {
  position: absolute;
  top: calc(var(--safe-top) + 2rem);
  left: 2.4rem;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 2.6rem;
  letter-spacing: 0.14em;
  color: ink(0.9);
  text-shadow:
    -1.5px 0 hsla(352, 70%, 55%, 0.45),
    1.5px 0 hsla(214, 70%, 55%, 0.45);
  animation: osd-flicker 1.2s ease-in-out infinite;
}

.osd-glyph {
  font-size: 1em;
}

// The title owns a phone's top edge; the console is lowered for the beat.
@media (max-width: $tablet) {
  .osd {
    top: auto;
    bottom: calc(var(--bottom-clearance, 0px) + 3rem);
    font-size: 2.2rem;
  }
}

@keyframes scan-roll {
  to {
    transform: translateY(3px);
  }
}

@keyframes band-roll {
  from {
    transform: translateY(110vh);
  }
  to {
    transform: translateY(-15vh);
  }
}

@keyframes osd-flicker {
  50% {
    opacity: 0.72;
  }
}

.vhs-enter-active {
  transition: opacity var(--motion-slow) var(--ease-smooth);
}
.vhs-leave-active {
  transition: opacity calc(var(--motion-slow) * 1.5) var(--ease-smooth);
}
.vhs-enter-from,
.vhs-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .scanlines,
  .band,
  .osd {
    animation: none;
  }

  .band {
    display: none;
  }
}
</style>
