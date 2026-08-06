<template>
  <h1 class="map-caption">
    {{ processReplacements(details?.phrasing || '', challenge.country) }}
  </h1>
  <div v-if="leaderPortrait || leaderFacts.length" class="leader-hint map-caption">
    <span
      v-if="leaderPortrait"
      class="leader-thumb"
      :style="{ backgroundImage: `url(${leaderPortrait})` }"
      aria-hidden="true"
    />
    <span v-if="leaderFacts.length" class="fact-row">
      <span v-for="fact in leaderFacts" :key="fact" class="fact">{{ fact }}</span>
    </span>
  </div>
  <div v-if="isFlagGate && isPhone" class="flag-frame">
    <CountryFlag class="flag ambient-loop" :country="country" mode="background" fit="contain" />
  </div>
  <span v-if="isFlagGate" class="map-caption sub">Find it on the map — tap twice to lock in</span>
  <span class="hint map-caption" :class="{ visible: showDoubleTapHint }">
    Press again to confirm
  </span>

  <!-- Off-phone the flag rides the side-docked stage (templates/_side-stage.scss
       owns placement and the narrow repark), so the map's high north stays
       visible and tappable. -->
  <Teleport v-if="asideReady && isFlagGate && !isPhone" to="#gate-aside">
    <aside class="side-stage flag-stage">
      <CountryFlag class="flag ambient-loop" :country="country" mode="background" fit="contain" />
    </aside>
  </Teleport>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import { getChallengeDetails } from '~~/lib/challenges'
import { getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { leaderHintFacts, phrasedLeader } from '~~/lib/leaders'
import { useGateChallenge } from '~~/lib/use-gate-challenge'
import { useIsPhone } from '~~/lib/use-viewport'
import { processReplacements } from '~~/lib/values'
import { isMapClickEvent } from '~~/types/events.types'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

const props = defineProps<{ challenge: IndividualChallenge }>()

const { gameStore } = useClientEvents()
const { status, isHard, isEasy, showInterstitial, submitAnswer } = useGateChallenge()
const isPhone = useIsPhone()

const asideReady = ref(false)
const showDoubleTapHint = ref(false)

const details = computed(() => getChallengeDetails(props.challenge.id))
const country = computed(() => getCountry(props.challenge.country))
const isFlagGate = computed(() => props.challenge.id === 'flag')

/** The leadership find gate quotes its leader — below hard, show who. */
const leader = computed(() =>
  isHard.value || props.challenge.id !== 'government.leader'
    ? undefined
    : phrasedLeader(props.challenge.country)
)
// A recognizable face is the strongest clue on the board: easy mode only.
const leaderPortrait = computed(() => (isEasy.value ? leader.value?.image : undefined))
const leaderFacts = computed(() =>
  leader.value ? leaderHintFacts(leader.value, props.challenge.country) : []
)

// The map IS the answer surface here, and only here.
const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return
  if (showInterstitial.value || status.value) return

  const isoCode = event.detail.isoCode as ISOCountryCode
  if (gameStore.map.highlighted.has(isoCode)) {
    // Double click, submit
    submitAnswer(isoCode)
  } else {
    showDoubleTapHint.value = true
    gameStore.map.highlighted.clear()
    gameStore.map.highlighted.add(isoCode)
  }
}

onMounted(() => {
  asideReady.value = true
  document.addEventListener('mapClick', onMapClick)
})
onBeforeUnmount(() => document.removeEventListener('mapClick', onMapClick))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.hint {
  opacity: 0;
  display: inline-block;
  padding: 0.4rem 1.4rem;
  transform: translateY(-0.4rem);
  transition:
    opacity var(--motion-base) var(--ease-out-expressive),
    transform var(--motion-base) var(--ease-out-expressive);

  &.visible {
    opacity: 1;
    transform: none;
  }
}

// The flag is the question — present it as the hero, framed like the caption
// scrim, arriving with a settle and idling on a gentle float.
.flag-frame {
  padding: 1.2rem;
  margin-top: 0.6rem;
  border-radius: 1.2rem;
  backdrop-filter: blur(0.5rem);
  background: milk(0.85);
  border: 0.1rem solid ink(0.2);
  animation: flag-arrive var(--motion-slow) var(--ease-out-expressive) 1;
}

.flag {
  width: 26rem;
  height: 15rem;
  display: block;
  max-width: 70vw;
  filter: drop-shadow(0 0.4rem 0.8rem ink(0.18));
  animation: flag-float calc(var(--motion-ambient) * 0.7) ease-in-out infinite;
}

// Off-phone side stage: only its framed surface and the emblem-study swell are
// bespoke here.
.flag-stage {
  padding: 1.2rem;
  border-radius: 1.2rem;
  backdrop-filter: blur(0.5rem);
  background: milk(0.85);
  border: 0.1rem solid ink(0.2);
  animation: flag-arrive var(--motion-slow) var(--ease-out-expressive) 1;

  .flag {
    display: block;
    width: clamp(18rem, 22vw, 26rem);
    height: auto;
    aspect-ratio: 26 / 15;
    transition: width var(--motion-base) var(--ease-out-expressive);
  }

  // The stage swells under the cursor for studying the emblem, then shrinks
  // out of the map's way on leave — width, not scale, so the SVG stays sharp.
  @media (hover: hover) and (min-width: #{$tablet-wide + 1}) {
    &:hover .flag {
      width: clamp(28rem, 36vw, 44rem);
    }
  }
}

.leader-hint {
  display: grid;
  grid-template-areas: 'thumb' 'facts';
  justify-items: center;
  row-gap: 0.6rem;
  padding: 1rem 1.6rem;

  .leader-thumb {
    grid-area: thumb;
    width: 6rem;
    height: 6rem;
  }

  .fact-row {
    grid-area: facts;
  }
}

@keyframes flag-arrive {
  0% {
    opacity: 0;
    transform: translateY(1.6rem) scale(0.88);
  }
}

@keyframes flag-float {
  50% {
    transform: translateY(-0.5rem) rotate(0.6deg);
  }
}

@media (max-width: $tablet) {
  .flag {
    width: min(26rem, 78vw);
    height: auto;
    aspect-ratio: 26 / 15;
  }
}
</style>
