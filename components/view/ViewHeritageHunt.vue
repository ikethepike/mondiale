<template>
  <div v-if="challenge && site" class="heritage-hunt challenge-shell passthrough">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Heritage Hunt`"
      title="Pin the World Heritage Sites"
      :stakes="`${challenge.slugs.length} sites, one pin each. The closer you land, the more you score — and the sharpest pin of each photo takes a bonus off the table.`"
      @done="begin()"
    />

    <ChallengePrompt :hint="hint" :attributions="photoSources" attribution-label="Photo">
      <h1 class="map-caption">
        {{ headline }}
      </h1>
      <span class="map-caption sub beat-line">
        <span>Photo {{ state!.beat + 1 }} of {{ challenge.slugs.length }}</span>
        <ChallengeTimerRadial
          v-if="!state!.revealing && !state!.finished"
          class="beat-clock"
          :value="secondsOnClock"
          :total="challenge.beatSeconds"
        />
      </span>
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </ChallengePrompt>

    <Transition name="dossier">
      <article v-if="state!.revealing || state!.finished" class="pane dossier tr decorator-bottom">
        <div class="pane-content">
          <HeritageReveal :site="site" />
          <PlacementList :rows="beatStandings" :players="gameStore.game?.players ?? {}" />
        </div>
      </article>
    </Transition>

    <aside v-if="showPhoto && !isPhone" class="photo-stage">
      <ZoomableImage :src="site.image" alt="A World Heritage Site, somewhere on Earth" />
    </aside>
    <MediaDock
      v-if="showPhoto && isPhone"
      v-model:expanded="photoExpanded"
      class="photo-dock"
      :src="site.image"
      alt="A World Heritage Site, somewhere on Earth"
      :attributions="photoSources"
    />

    <footer v-if="canPin">
      <ButtonFilled :disabled="!pin || locked || !started" @click="lockIn">
        {{ locked ? 'Locked in' : 'Lock in my pin' }}
      </ButtonFilled>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import MediaDock from '~/components/challenge/MediaDock.vue'
import PlacementList from '~/components/challenge/PlacementList.vue'
import ZoomableImage from '~/components/challenge/ZoomableImage.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import HeritageReveal from '~/components/feedback/HeritageReveal.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { HERITAGE } from '~~/data/heritage.gen'
import { datasetAttribution } from '~~/lib/attribution'
import { formatKm } from '~~/lib/number'
import { useDeadlineClock } from '~~/lib/use-deadline-clock'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { usePinDrop } from '~~/lib/use-pin-drop'
import { useIsPhone } from '~~/lib/use-viewport'
import { seatLabel } from '~~/lib/player'

const photoSources = datasetAttribution('heritage')

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  begin,
  hint,
  announce,
  entries,
  registerCleanup,
  gameStore,
  update,
} = useGroupChallenge('heritage-hunt-challenge', { solo: false })

const state = computed(() => challenge.value?.state)
const site = computed(() =>
  challenge.value ? HERITAGE[challenge.value.slugs[state.value?.beat ?? 0]] : undefined
)
const canPin = computed(() => !!state.value && !state.value.revealing && !state.value.finished)
const showPhoto = computed(() => canPin.value)

const isPhone = useIsPhone()
const locked = computed(
  () => !!state.value && !!state.value.pins[gameStore.seatId]?.[state.value.beat]
)

const headline = computed(() => {
  if (state.value?.finished) return 'All pins are down'
  if (state.value?.revealing) return 'The pins are in'
  return 'Where in the world is this?'
})

/** This beat's pins ranked best-first, for the reveal card. */
const beatStandings = computed(() => {
  const current = state.value
  if (!current) return []
  return (
    current.order
      .map(playerId => {
        const entry = current.pins[playerId]?.[current.beat]
        return {
          playerId,
          name: seatLabel(gameStore.game?.players, playerId, gameStore.seatId),
          distanceKm: entry?.distanceKm,
          tail: entry?.distanceKm !== undefined ? formatKm(entry.distanceKm) : 'no pin',
        }
      })
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      // The closest pin wears the crown — through the shared fate slot.
      .map((row, index, rows) =>
        index === 0 && rows.length > 1 ? { ...row, fate: 'nails it' } : row
      )
  )
})

const { secondsOnClock } = useDeadlineClock(() => state.value?.deadline)

// --- Pinning ------------------------------------------------------------------
const { pin, photoExpanded, resetPin } = usePinDrop({
  canDrop: () =>
    !showInterstitial.value && started.value && !locked.value && canPin.value,
  announce,
  registerCleanup,
})

const lockIn = () => {
  const current = state.value
  if (!current || !pin.value || locked.value || !canPin.value) return
  update({ event: 'submit-heritage-pin', beat: current.beat, pin: pin.value })
}

// A new beat: fresh pin, fresh photo, clean map.
watch(() => state.value?.beat, resetPin)

// The reveal: the truth appears, the dashed line measures the local miss.
// Immediate, so arriving mid-reveal (reconnect, harness) still shows it.
watch(
  () => state.value?.revealing || state.value?.finished,
  revealed => {
    if (revealed && site.value) gameStore.map.pinAnswer = site.value.coordinates
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  gameStore.map.pin = undefined
  gameStore.map.pinAnswer = undefined
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

.beat-line {
  gap: 0.8rem;
  display: inline-flex;
  align-items: center;

  // The shared radial dial at subline scale — no bespoke text clocks.
  .beat-clock {
    --clock-size: 2.8rem;
    --clock-seconds-size: 1.1rem;
  }
}

.photo-stage {
  top: 50%;
  left: 3rem;
  z-index: 2;
  position: absolute;
  transform: translateY(-50%);
  pointer-events: auto;
  overflow: hidden;
  border-radius: 0.6rem;
  width: clamp(18rem, 24vw, 24rem);
  height: clamp(13rem, 22vh, 18rem);

  transition:
    width var(--motion-base) var(--ease-out-expressive),
    height var(--motion-base) var(--ease-out-expressive);

  // Desktop: the stage swells under the cursor for studying detail, then
  // shrinks out of the map's way on leave — pin-landmark's recipe. Width/
  // height, not scale — the photo re-lays out and stays sharp.
  @media (hover: hover) and (min-width: #{$tablet-wide + 1}) {
    &:hover {
      z-index: 3;
      width: clamp(28rem, 44vw, 52rem);
      height: clamp(20rem, 44vh, 38rem);
    }
  }
}

.dossier {
  left: 3rem;
  bottom: 3rem;
  z-index: 3;
  position: absolute;
  width: min(42rem, 92vw);

  .pane-content {
    gap: 1.2rem;
    display: flex;
    padding: 1.6rem;
    flex-flow: column nowrap;
  }
}

.dossier-enter-active {
  transition: all var(--motion-slow) var(--ease-out-expressive);
}
.dossier-enter-from {
  opacity: 0;
  transform: translateY(1.5rem);
}

footer {
  display: flex;
  align-items: center;
  flex-direction: column;
  pointer-events: auto;
}

@media (max-width: $tablet-wide) {
  .photo-stage {
    top: auto;
    left: 50%;
    bottom: 12rem;
    transform: translateX(-50%);
    width: min(80vw, 24rem);
    height: min(22vh, 18rem);
  }

  .dossier {
    left: 0;
    right: 0;
    bottom: 2rem;
    margin: 0 auto;
    width: min(92vw, 42rem);
    max-width: none;
    transform: none;
  }
}

@media (max-width: $tablet) {
  .photo-dock {
    left: 1.2rem;
    z-index: 2;
    position: absolute;
    bottom: calc(12rem + var(--safe-bottom));
  }

  footer {
    :deep(.button) {
      width: 100%;
    }
  }

  .dossier .pane-content {
    max-height: min(46rem, 55dvh);
    overflow-y: auto;
  }
}
</style>
