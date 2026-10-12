<template>
  <div class="country-backdrop" :class="{ receded }" aria-hidden="true">
    <svg
      v-if="outline"
      :key="country"
      class="silhouette"
      :viewBox="outline.viewBox"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <clipPath :id="clipId">
          <path :d="outline.d" />
        </clipPath>
      </defs>
      <path class="echo far" :d="outline.d" />
      <path class="echo near" :d="outline.d" />
      <image
        v-if="flag"
        class="flag-fill"
        :href="flag"
        :clip-path="`url(#${clipId})`"
        :x="frame[0]"
        :y="frame[1]"
        :width="frame[2]"
        :height="frame[3]"
        preserveAspectRatio="xMidYMid slice"
      />
      <path class="edge" :d="outline.d" />
    </svg>
  </div>
</template>
<script lang="ts" setup>
import { flagDataUri, getCountry, loadFlags } from '~~/lib/country'
import { mainlandOutline } from '~~/lib/outline'
import type { ISOCountryCode } from '~~/types/geography.types'

/** A round's subject as scenery: its outline drawn large behind the stage, washed with its own flag. */
const props = defineProps<{
  country: ISOCountryCode
  /** Steps further back while the foreground carries dense content. */
  receded?: boolean
}>()

const clipId = `country-backdrop-${useId()}`
const outline = ref<Awaited<ReturnType<typeof mainlandOutline>>>()
const flagsReady = ref(false)

loadFlags().then(() => (flagsReady.value = true))

watch(
  () => props.country,
  async isoCode => {
    const resolved = await mainlandOutline(isoCode)
    if (props.country === isoCode) outline.value = resolved
  },
  { immediate: true }
)

const flag = computed(() => (flagsReady.value ? flagDataUri(getCountry(props.country)) : null))
const frame = computed(() => outline.value?.viewBox.split(' ').map(Number) ?? [0, 0, 0, 0])
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.country-backdrop {
  inset: 0;
  z-index: -1;
  overflow: hidden;
  position: absolute;
  pointer-events: none;
  transition: opacity var(--motion-slow) var(--ease-smooth);

  &.receded {
    opacity: 0.45;
  }
}

.silhouette {
  inset: 0;
  margin: auto;
  width: 92%;
  height: 84%;
  overflow: visible;
  position: absolute;
  mask-image: radial-gradient(closest-side, #000 60%, transparent 100%);
}

.edge,
.echo {
  fill: none;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  transform-box: fill-box;
  transform-origin: center;
}

.edge {
  opacity: 0;
  stroke: ink(0.45);
  stroke-width: 1.6;
  animation: backdrop-settle 1.2s var(--ease-smooth) forwards;
}

.flag-fill {
  opacity: 0;
  mix-blend-mode: multiply;
  animation: backdrop-wash 1.4s var(--ease-smooth) 0.3s forwards;
}

.echo {
  opacity: 0;
  stroke: ink(0.16);
  stroke-width: 1;
  animation:
    backdrop-echo 1.2s var(--ease-smooth) 0.8s forwards,
    backdrop-breathe var(--motion-ambient) ease-in-out 2.5s infinite alternate;

  &.near {
    --echo-scale: 1.07;
  }
  &.far {
    --echo-scale: 1.15;
    stroke: ink(0.08);
  }
  scale: var(--echo-scale);
}

@keyframes backdrop-settle {
  from {
    scale: 1.04;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}

@keyframes backdrop-wash {
  to {
    opacity: 0.2;
  }
}

@keyframes backdrop-echo {
  to {
    opacity: 1;
  }
}

@keyframes backdrop-breathe {
  to {
    scale: calc(var(--echo-scale) + 0.025);
  }
}

@media (prefers-reduced-motion: reduce) {
  .edge,
  .flag-fill,
  .echo {
    animation: none;
  }
  .edge {
    opacity: 1;
  }
  .flag-fill {
    opacity: 0.2;
  }
  .echo {
    opacity: 1;
  }
}
</style>
