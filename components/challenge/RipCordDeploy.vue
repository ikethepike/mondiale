<template>
  <div ref="root" class="rip-cord-deploy" aria-hidden="true">
    <svg class="cord" viewBox="0 0 200 8" preserveAspectRatio="none">
      <path class="cord-half left" d="M100 4H2" />
      <path class="cord-half right" d="M100 4h98" />
    </svg>
    <ol class="falling country-chip-list">
      <CountryChip
        v-for="isoCode in falling"
        :key="isoCode"
        class="falling-chip map-caption"
        compact
        :country="getCountry(isoCode)"
        :name="spellings?.[isoCode]"
      />
    </ol>
    <div class="drop">
      <svg class="canopy" viewBox="0 0 64 40">
        <path
          class="canopy-cloth"
          d="M4 22C4 10 17 2 32 2s28 8 28 20c-4-3-9-3-14 0-4-3-10-3-14 0-4-3-10-3-14 0-5-3-10-3-14 0z"
        />
        <path class="canopy-seams" d="M18 22C18 12 24 4 32 2M46 22C46 12 40 4 32 2M32 2v20" />
        <path class="shrouds" d="M4 22l26 18M60 22L34 40M18 22l13 18M46 22L33 40" />
      </svg>
      <CountryChip
        class="landing-chip map-caption"
        tag="span"
        :country="getCountry(parachute.seed)"
      />
    </div>
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import CountryChip from '~/components/country/CountryChip.vue'
import { getCountry } from '~~/lib/country'
import { EASE, prefersReducedMotion } from '~~/lib/motion'
import type { ChainParachute } from '~~/lib/use-chain-turn-view'
import type { AtlasSpellings } from '~~/lib/atlas-chain'

/** The rip cord deploying: the cord snaps, the stuck chain tumbles away, and
 *  the fresh seed floats down under its canopy onto the rail. Plays for the
 *  whole table, the booth included, over the rail's own spot. */
const props = defineProps<{ parachute: ChainParachute; spellings?: AtlasSpellings }>()
const emit = defineEmits<{ done: [] }>()

const FALLING_CHIPS = 4
const falling = computed(() => props.parachute.retired.slice(-FALLING_CHIPS))

const root = ref<HTMLElement>()
let timeline: gsap.core.Timeline | undefined

onMounted(() => {
  const shell = root.value
  if (!shell) return
  const chips = shell.querySelectorAll('.falling-chip')
  const drop = shell.querySelector('.drop')
  const canopy = shell.querySelector('.canopy')
  const landing = shell.querySelector('.landing-chip')

  if (prefersReducedMotion()) {
    gsap.set([shell.querySelector('.cord'), chips, canopy], { opacity: 0 })
    timeline = gsap
      .timeline({ onComplete: () => emit('done') })
      .fromTo(drop, { opacity: 0 }, { opacity: 1, duration: 0.3 })
      .to({}, { duration: 0.3 })
    return
  }

  timeline = gsap.timeline({ onComplete: () => emit('done') })
  timeline
    .fromTo(
      shell.querySelectorAll('.cord-half'),
      { scaleX: 1, opacity: 1 },
      {
        scaleX: 0,
        opacity: 0,
        rotate: (index: number) => (index ? 8 : -8),
        duration: 0.28,
        ease: EASE.exit,
        svgOrigin: '100 4',
      }
    )
    .fromTo(
      chips,
      { y: 0, rotate: 0, opacity: 1 },
      {
        y: 90,
        opacity: 0,
        rotate: () => gsap.utils.random(-28, 28),
        duration: 0.7,
        ease: 'power2.in',
        stagger: 0.07,
      },
      0.12
    )
    .fromTo(
      drop,
      { y: -110, opacity: 0 },
      { y: 0, opacity: 1, duration: 1.1, ease: 'sine.out' },
      0.35
    )
    .fromTo(
      canopy,
      { rotate: -9 },
      {
        rotate: 7,
        duration: 0.55,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: 1,
        transformOrigin: '50% 100%',
      },
      0.35
    )
    .to(canopy, {
      scaleY: 0,
      y: -8,
      opacity: 0,
      duration: 0.32,
      ease: EASE.exit,
      transformOrigin: '50% 100%',
    })
    .fromTo(landing, { scale: 1.08 }, { scale: 1, duration: 0.25, ease: EASE.enter }, '<')
})

onBeforeUnmount(() => timeline?.kill())
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.rip-cord-deploy {
  inset: 0;
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 3;
}

.cord {
  left: 10%;
  right: 10%;
  top: 50%;
  height: 0.8rem;
  position: absolute;
  overflow: visible;
  fill: none;
  stroke: #{ember()};
  stroke-width: 2;
  stroke-linecap: round;

  path {
    vector-effect: non-scaling-stroke;
  }
}

.falling {
  inset: 0;
  position: absolute;
  flex-wrap: nowrap;
}

.drop {
  gap: 0.1rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
  position: relative;
}

.canopy {
  width: 6.4rem;
  height: 4rem;
  overflow: visible;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.canopy-cloth {
  fill: #{ember(0.85)};
  stroke: #{ember()};
  stroke-width: 1.5;
}

.canopy-seams {
  fill: none;
  stroke: #{milk(0.7)};
  stroke-width: 1.2;
}

.shrouds {
  fill: none;
  stroke: ink(0.55);
  stroke-width: 1;
}

.landing-chip {
  font-weight: bold;
  border-width: 0.15rem;
  border-color: #{ember()};
}
</style>
